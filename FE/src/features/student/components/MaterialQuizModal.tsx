import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { ROUTES, studentResumeAttemptPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import type { MyCourse } from '@/services/studentCourse.service';
import { getAiError, type AiError } from '@/services/studentAi.service';
import {
  MATERIAL_ACCEPT,
  MATERIAL_MAX_BYTES,
  MATERIAL_QUESTIONS,
  errorStatus,
  isJobRunning,
  materialService,
  type MaterialDifficulty,
  type MaterialItem,
  type MaterialJobState,
} from '@/services/studentMaterial.service';
import { AiErrorAlert } from './aiUi';
import { formatDate } from './studentUi';

const DEFAULT_POLL_MS = 2000;
const EXTENSIONS = MATERIAL_ACCEPT.split(',');
const MATERIALS_FETCH_SIZE = 50;

type Source = 'UPLOAD' | 'EXISTING';
const SOURCE_TABS: Record<Source, string> = { UPLOAD: 'Upload new file', EXISTING: 'My materials' };
const SOURCE_BY_TAB: Record<string, Source> = { 'Upload new file': 'UPLOAD', 'My materials': 'EXISTING' };

const DIFFICULTY_OPTIONS: { value: MaterialDifficulty; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

type Phase = 'form' | 'processing' | 'completed' | 'failed';

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Material to Quiz Creator — upload a PDF / DOCX (MQ-01) or pick one uploaded before (MQ-02),
 * let the AI write the multiple-choice questions (MQ-03, polled with MQ-04), then start the quiz
 * (MQ-05) on the take-exam screen. Generated quizzes are listed in Exam History (MQ-06).
 * A job keeps running on the BE when the modal closes; it shows up again under "My materials".
 */
export function MaterialQuizModal({ open, onClose, courses }: { open: boolean; onClose: () => void; courses: MyCourse[] }) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [courseId, setCourseId] = useState('');
  const [source, setSource] = useState<Source>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState('');
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [questionCount, setQuestionCount] = useState(String(MATERIAL_QUESTIONS.default));
  const [difficulty, setDifficulty] = useState<MaterialDifficulty>('MEDIUM');
  const [touched, setTouched] = useState(false);

  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialsReload, setMaterialsReload] = useState(0);

  const [phase, setPhase] = useState<Phase>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [job, setJob] = useState<MaterialJobState | null>(null);
  const [starting, setStarting] = useState(false);
  const pollTimer = useRef<number | null>(null);
  /** Job being polled; a reply for any other job (or after close) is dropped. */
  const activeJob = useRef<number | null>(null);

  const stopPolling = () => {
    activeJob.current = null;
    if (pollTimer.current != null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };

  // Fresh form each time the modal opens; stop polling when it closes.
  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    setCourseId(courses[0] ? String(courses[0].courseId) : '');
    setSource('UPLOAD');
    setFile(null);
    setFileError(null);
    setTitle('');
    setDocumentId(null);
    setQuestionCount(String(MATERIAL_QUESTIONS.default));
    setDifficulty('MEDIUM');
    setTouched(false);
    setPhase('form');
    setBusy(false);
    setError(null);
    setJob(null);
    setStarting(false);
  }, [open, courses]);

  useEffect(() => stopPolling, []);

  // A material belongs to one course.
  useEffect(() => setDocumentId(null), [courseId]);

  // Materials of the course (MQ-02), newest first. A reload keeps the picked material.
  useEffect(() => {
    setMaterialsError(null);
    if (!open || !courseId) {
      setMaterials([]);
      return;
    }
    let cancelled = false;
    setLoadingMaterials(true);
    materialService
      .list(Number(courseId), 0, MATERIALS_FETCH_SIZE)
      .then(res => {
        if (!cancelled) setMaterials(res.content);
      })
      .catch(err => {
        if (!cancelled) setMaterialsError(getApiErrorMessage(err, 'Failed to load your materials.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingMaterials(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, courseId, materialsReload]);

  const poll = (jobId: number) => {
    materialService
      .getJob(jobId)
      .then(({ job: state, retryAfterMs }) => {
        if (activeJob.current !== jobId) return;
        setJob(state);
        if (state.status === 'COMPLETED' && state.quizId != null) setPhase('completed');
        else if (state.status === 'FAILED') setPhase('failed');
        else pollTimer.current = window.setTimeout(() => poll(jobId), retryAfterMs ?? DEFAULT_POLL_MS);
      })
      .catch(err => {
        if (activeJob.current !== jobId) return;
        setError(getAiError(err, 'Lost track of the quiz generation.'));
        setPhase('failed');
      });
  };

  const track = (jobId: number, questionCountOfJob: number) => {
    stopPolling();
    setJob({ jobId, status: 'PENDING', progress: 0, questionCount: questionCountOfJob, errorMessage: null, quizId: null });
    setError(null);
    setPhase('processing');
    activeJob.current = jobId;
    poll(jobId);
  };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONS.includes(ext)) {
      setFileError('Only PDF or DOCX files are supported.');
      return;
    }
    if (f.size > MATERIAL_MAX_BYTES) {
      setFileError(`The file is larger than ${formatSize(MATERIAL_MAX_BYTES)}.`);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const countNum = Number(questionCount);
  const errors = {
    course: courseId ? undefined : 'Select a course.',
    material:
      source === 'UPLOAD'
        ? file
          ? undefined
          : 'Upload a PDF or DOCX file.'
        : documentId != null
          ? undefined
          : 'Pick one of your materials.',
    count:
      Number.isInteger(countNum) && countNum >= MATERIAL_QUESTIONS.min && countNum <= MATERIAL_QUESTIONS.max
        ? undefined
        : `Enter ${MATERIAL_QUESTIONS.min} – ${MATERIAL_QUESTIONS.max} questions.`,
  };
  const invalid = Boolean(errors.course || errors.material || errors.count);

  const selected = materials.find(m => m.documentId === documentId) ?? null;
  const runningJob = selected?.jobs.find(j => isJobRunning(j.status)) ?? null;

  const generate = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    let docId = source === 'EXISTING' ? documentId : null;
    try {
      if (docId == null && file) {
        const uploaded = await materialService.upload(file, Number(courseId), title);
        docId = uploaded.documentId;
        // A retry after this point reuses the uploaded material instead of uploading again.
        setFile(null);
        setTitle('');
        setSource('EXISTING');
        setDocumentId(docId);
        setMaterialsReload(r => r + 1);
      }
      if (docId == null) return;
      const accepted = await materialService.generateQuiz(docId, {
        questionCount: countNum,
        difficulty,
      });
      track(accepted.jobId, accepted.questionCount);
    } catch (err) {
      // 409 DUPLICATE_REQUEST: a job of this material is still running — follow it instead.
      if (errorStatus(err) === 409 && docId != null) {
        const running = await findRunningJob(docId);
        if (running) {
          track(running.jobId, running.questionCount);
          return;
        }
      }
      setError(getAiError(err, 'Failed to start the quiz generation.'));
    } finally {
      setBusy(false);
    }
  };

  const findRunningJob = async (docId: number) => {
    try {
      const res = await materialService.list(Number(courseId), 0, MATERIALS_FETCH_SIZE);
      setMaterials(res.content);
      return res.content.find(m => m.documentId === docId)?.jobs.find(j => isJobRunning(j.status)) ?? null;
    } catch {
      return null;
    }
  };

  const backToForm = () => {
    stopPolling();
    setPhase('form');
    setError(null);
    setJob(null);
    setTouched(false);
    setMaterialsReload(r => r + 1);
  };

  const startQuiz = async () => {
    if (!job) return;
    setStarting(true);
    setError(null);
    try {
      const started = await materialService.start(job.jobId);
      onClose();
      navigate(studentResumeAttemptPath(started.attemptId));
    } catch (err) {
      setError(getAiError(err, 'Failed to start the quiz.'));
      setStarting(false);
    }
  };

  const footer =
    phase === 'form' ? (
      <>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={busy}
          disabled={busy || courses.length === 0 || (touched && invalid)}
          icon={<Icon.Zap className="w-4 h-4" />}
          onClick={generate}
        >
          Generate
        </Button>
      </>
    ) : phase === 'completed' ? (
      <>
        <Button
          variant="outline"
          disabled={starting}
          onClick={() => {
            onClose();
            navigate(ROUTES.studentExams);
          }}
        >
          Later
        </Button>
        <Button loading={starting} disabled={starting} icon={<Icon.ChevronRight className="w-4 h-4" />} onClick={startQuiz}>
          Start quiz
        </Button>
      </>
    ) : phase === 'failed' ? (
      <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={backToForm}>
        Try again
      </Button>
    ) : (
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
    );

  return (
    <Modal open={open} onClose={() => !busy && !starting && onClose()} title="Material to Quiz Creator" size="lg" footer={footer}>
      <div className="space-y-5">
        {phase === 'form' && (
          <>
            <p className="text-sm text-content-soft">
              Upload your lecture notes or slides as PDF / DOCX and the AI writes multiple-choice questions from them. Longer files
              use more of your AI quota.
            </p>
            {courses.length === 0 ? (
              <p className="text-sm text-content-soft">Enroll in a course first to create a quiz from your materials.</p>
            ) : (
              <>
                <Select
                  label="Course"
                  options={courses.map(c => ({ value: String(c.courseId), label: c.title }))}
                  value={courseId}
                  onChange={setCourseId}
                  error={touched ? errors.course : undefined}
                />

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Tabs
                      tabs={Object.values(SOURCE_TABS)}
                      active={SOURCE_TABS[source]}
                      onChange={t => {
                        setSource(SOURCE_BY_TAB[t]);
                        setTouched(false);
                      }}
                    />
                  </div>

                  {source === 'UPLOAD' ? (
                    <>
                      <div
                        onDragOver={e => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOver(false);
                          pickFile(e.dataTransfer.files?.[0]);
                        }}
                        className={`rounded-[12px] border-2 border-dashed px-4 py-5 text-center transition-colors ${
                          dragOver ? 'border-brand-600 bg-primary-light' : touched && errors.material ? 'border-danger-solid' : 'border-line'
                        }`}
                      >
                        {file ? (
                          <div className="flex items-center gap-3 text-left">
                            <Icon.FileText className="w-8 h-8 text-primary flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-content truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-xs text-content-subtle">{formatSize(file.size)}</p>
                            </div>
                            <button
                              type="button"
                              aria-label="Remove file"
                              onClick={() => setFile(null)}
                              className="p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content"
                            >
                              <Icon.X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Icon.Upload className="w-6 h-6 mx-auto text-content-subtle" />
                            <p className="mt-2 text-sm text-content-secondary">Drag &amp; Drop PDF or DOCX</p>
                            <p className="text-xs text-content-subtle">Up to {formatSize(MATERIAL_MAX_BYTES)}</p>
                            <Button size="sm" variant="outline" className="mt-3" onClick={() => fileInput.current?.click()}>
                              Browse File
                            </Button>
                          </>
                        )}
                        <input
                          ref={fileInput}
                          type="file"
                          accept={MATERIAL_ACCEPT}
                          className="hidden"
                          onChange={e => {
                            pickFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      {fileError && <p className="text-xs text-danger">{fileError}</p>}
                      {touched && !fileError && errors.material && <p className="text-xs text-danger">{errors.material}</p>}
                      <Input
                        label="Title (optional)"
                        placeholder={file ? file.name.replace(/\.[^.]+$/, '') : 'Defaults to the file name'}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        maxLength={255}
                      />
                    </>
                  ) : (
                    <MaterialPicker
                      materials={materials}
                      loading={loadingMaterials}
                      error={materialsError}
                      selectedId={documentId}
                      onSelect={setDocumentId}
                      onRetry={() => setMaterialsReload(r => r + 1)}
                      invalid={touched && Boolean(errors.material)}
                    />
                  )}
                  {source === 'EXISTING' && touched && errors.material && <p className="text-xs text-danger">{errors.material}</p>}
                </div>

                {runningJob ? (
                  <Alert
                    type="info"
                    message={`A quiz of ${runningJob.questionCount} questions is still being generated from this material.`}
                  />
                ) : null}

                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  <Input
                    label="Question Count"
                    type="number"
                    inputMode="numeric"
                    min={MATERIAL_QUESTIONS.min}
                    max={MATERIAL_QUESTIONS.max}
                    value={questionCount}
                    onChange={e => setQuestionCount(e.target.value)}
                    hint={`${MATERIAL_QUESTIONS.min} – ${MATERIAL_QUESTIONS.max} multiple-choice questions`}
                    error={touched ? errors.count : undefined}
                  />
                  <Select
                    label="Difficulty"
                    options={DIFFICULTY_OPTIONS}
                    value={difficulty}
                    onChange={v => setDifficulty(v as MaterialDifficulty)}
                  />
                </div>

                {runningJob && (
                  <Button variant="outline" icon={<Icon.Eye className="w-4 h-4" />} onClick={() => track(runningJob.jobId, runningJob.questionCount)}>
                    Follow the running generation
                  </Button>
                )}
              </>
            )}
            {error && <AiErrorAlert error={error} />}
          </>
        )}

        {phase === 'processing' && job && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Spinner />
            <div className="space-y-1">
              <p className="text-sm font-medium text-content">
                {job.status === 'PENDING' ? 'Queued…' : 'Reading the material and writing questions…'}
              </p>
              <p className="text-xs text-content-subtle">
                {job.questionCount} questions · You can close this window — the quiz keeps generating and appears in Exam History.
              </p>
            </div>
            <div className="w-full max-w-sm">
              <Progress value={job.progress ?? 0} label="Progress" />
            </div>
          </div>
        )}

        {phase === 'completed' && job && (
          <div className="space-y-4">
            <Alert type="success" title="Your quiz is ready" message={`${job.questionCount} questions were generated from your material.`} />
            <p className="text-sm text-content-soft">
              Answers are checked when you submit. You can take the quiz again any time from Exam History.
            </p>
            {error && <AiErrorAlert error={error} />}
          </div>
        )}

        {phase === 'failed' && (
          <div className="space-y-4">
            {error ? (
              <AiErrorAlert error={error} />
            ) : (
              <Alert
                type="error"
                title="The quiz could not be generated"
                message={`${(job?.errorMessage?.trim() || 'Something went wrong while generating the questions').replace(/[.!]?$/, '.')} Your AI quota was refunded.`}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MaterialPicker({
  materials,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  invalid,
}: {
  materials: MaterialItem[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRetry: () => void;
  invalid: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-danger">{error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (materials.length === 0) {
    return <p className="text-sm text-content-soft">You have not uploaded any material for this course yet.</p>;
  }
  return (
    <ul
      role="radiogroup"
      aria-label="Your materials"
      className={`max-h-64 overflow-y-auto rounded-[12px] border divide-y divide-line ${invalid ? 'border-danger-solid' : 'border-line'}`}
    >
      {materials.map(m => {
        const active = m.documentId === selectedId;
        const running = m.jobs.some(j => j.status === 'PENDING' || j.status === 'PROCESSING');
        const done = m.jobs.filter(j => j.status === 'COMPLETED').length;
        return (
          <li key={m.documentId}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(m.documentId)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? 'bg-primary-light' : 'hover:bg-accent'}`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${active ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_var(--color-surface)]' : 'border-line'}`}
              />
              <Icon.FileText className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-content truncate" title={m.title}>
                  {m.title}
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-content-subtle">
                  <span className="truncate max-w-[14rem]" title={m.fileName}>
                    {m.fileName}
                  </span>
                  {m.pageCount != null && (
                    <span>
                      {m.pageCount} page{m.pageCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <span>Uploaded {formatDate(m.uploadedAt)}</span>
                </span>
              </span>
              {running ? (
                <Badge variant="info" size="sm">
                  Generating
                </Badge>
              ) : done > 0 ? (
                <Badge variant="success" size="sm">
                  {done} quiz{done === 1 ? '' : 'zes'}
                </Badge>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
