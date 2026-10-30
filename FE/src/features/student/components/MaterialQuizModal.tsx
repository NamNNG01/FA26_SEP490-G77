import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
  MATERIAL_MAX_FILES,
  MATERIAL_QUESTIONS,
  errorStatus,
  fileSha256,
  isJobRunning,
  materialService,
  type MaterialDifficulty,
  type MaterialItem,
  type MaterialJobState,
} from '@/services/studentMaterial.service';
import { AiErrorAlert } from './aiUi';
import { formatDate } from './studentUi';

const DEFAULT_POLL_MS = 2000;
const FILE_LIMIT_MESSAGE = `You already have ${MATERIAL_MAX_FILES} files. Delete one in My Materials to upload a new file — files you uploaded before can still be used.`;
const EXTENSIONS = MATERIAL_ACCEPT.split(',');

/** Value of the "+ Upload new file" entry in the material dropdown. */
const UPLOAD_NEW = '';

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
 * The modal cannot be closed while the file uploads or the quiz is being generated. A file uploaded before
 * is reused silently (lookup by SHA-256).
 * `initialCourseId` / `initialDocumentId` preselect a material (the "Generate quiz" button of My Materials).
 */
export function MaterialQuizModal({
  open,
  onClose,
  courses,
  initialCourseId = null,
  initialDocumentId = null,
}: {
  open: boolean;
  onClose: () => void;
  courses: MyCourse[];
  initialCourseId?: number | null;
  initialDocumentId?: number | null;
}) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [courseId, setCourseId] = useState('');
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
  /** The BE links one material to several courses (see studentMaterial.service). */
  const [linked, setLinked] = useState(false);
  /** The picked file turned out to be a material uploaded before (reused silently, no "will also be added" hint). */
  const [reused, setReused] = useState(false);
  const [checkingFile, setCheckingFile] = useState(false);
  /** Latest picked file; a hash check for an older pick is dropped. */
  const pickedFile = useRef<File | null>(null);

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
    const preset = initialCourseId != null && courses.some(c => c.courseId === initialCourseId) ? initialCourseId : courses[0]?.courseId;
    setCourseId(preset != null ? String(preset) : '');
    setFile(null);
    setFileError(null);
    setTitle('');
    setReused(false);
    setCheckingFile(false);
    pickedFile.current = null;
    setDocumentId(preset === initialCourseId ? initialDocumentId : null);
    setQuestionCount(String(MATERIAL_QUESTIONS.default));
    setDifficulty('MEDIUM');
    setTouched(false);
    setPhase('form');
    setBusy(false);
    setError(null);
    setJob(null);
    setStarting(false);
  }, [open, courses, initialCourseId, initialDocumentId]);

  useEffect(() => stopPolling, []);

  // Every material of the student with its courses (MQ-02), newest first. A reload keeps the picked material.
  useEffect(() => {
    setMaterialsError(null);
    if (!open) {
      setMaterials([]);
      return;
    }
    let cancelled = false;
    setLoadingMaterials(true);
    materialService
      .listWithCourses(courses.map(c => ({ courseId: c.courseId, title: c.title })))
      .then(res => {
        if (cancelled) return;
        setMaterials(res.items);
        setLinked(res.linked);
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
  }, [open, courses, materialsReload]);

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

  // MATERIAL_MAX_FILES per account: a new file is refused once the list is full; a file uploaded before
  // (found by the hash check) is reused and does not count.
  const atFileLimit = !loadingMaterials && !materialsError && materials.length >= MATERIAL_MAX_FILES;

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
    setReused(false);
    setFile(f);
    pickedFile.current = f;
    checkDuplicate(f);
  };

  /** Same content uploaded before → reuse that material instead of storing the file again. */
  const checkDuplicate = async (f: File) => {
    setCheckingFile(true);
    try {
      const hash = await fileSha256(f);
      const found = hash ? await materialService.lookup(hash) : null;
      if (pickedFile.current !== f) return;
      if (!found) {
        if (atFileLimit) {
          pickedFile.current = null;
          setFile(null);
          setFileError(FILE_LIMIT_MESSAGE);
        }
        return;
      }
      pickedFile.current = null;
      setFile(null);
      setTitle('');
      setDocumentId(found.documentId);
      setReused(true);
      if (!materials.some(m => m.documentId === found.documentId)) setMaterialsReload(r => r + 1);
    } finally {
      if (pickedFile.current === f || pickedFile.current === null) setCheckingFile(false);
    }
  };

  const inCourse = (m: MaterialItem) => (m.courses ?? []).some(c => String(c.courseId) === courseId);

  const changeCourse = (value: string) => {
    setCourseId(value);
    setReused(false);
    // A material can only be added to another course when the BE links materials to several courses.
    if (!linked) setDocumentId(null);
  };

  const countNum = Number(questionCount);
  const errors = {
    course: courseId ? undefined : 'Select a course.',
    material: documentId != null || file ? undefined : 'Upload a PDF or DOCX file, or pick one of your materials.',
    count:
      Number.isInteger(countNum) && countNum >= MATERIAL_QUESTIONS.min && countNum <= MATERIAL_QUESTIONS.max
        ? undefined
        : `Enter ${MATERIAL_QUESTIONS.min} – ${MATERIAL_QUESTIONS.max} questions.`,
  };
  const invalid = Boolean(errors.course || errors.material || errors.count);

  const selected = materials.find(m => m.documentId === documentId) ?? null;
  // Materials of the course first; with linked courses the others follow and get added on Generate.
  const pickable = linked ? [...materials.filter(inCourse), ...materials.filter(m => !inCourse(m))] : materials.filter(inCourse);
  const materialOptions = [
    { value: UPLOAD_NEW, label: '+ Upload new file' },
    ...pickable.map(m => {
      const where = inCourse(m) ? '' : ` · in ${(m.courses ?? []).map(c => c.title).join(', ')}`;
      const running = m.jobs.some(j => isJobRunning(j.status)) ? ' (generating…)' : '';
      return { value: String(m.documentId), label: `${m.title}${where}${running}` };
    }),
  ];
  const needsAttach = linked && selected != null && !inCourse(selected);
  const runningJob = selected?.jobs.find(j => isJobRunning(j.status)) ?? null;

  const generate = async () => {
    setTouched(true);
    if (invalid || checkingFile) return;
    if (documentId == null && file && atFileLimit) {
      setFileError(FILE_LIMIT_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    let docId = documentId;
    try {
      if (docId == null && file) {
        const uploaded = await materialService.upload(file, Number(courseId), title);
        docId = uploaded.documentId;
        if (uploaded.duplicate) setReused(true);
        // A retry after this point reuses the uploaded material instead of uploading again.
        setFile(null);
        setTitle('');
        setDocumentId(docId);
        setMaterialsReload(r => r + 1);
      }
      if (docId == null) return;
      if (needsAttach && docId === selected?.documentId) {
        await materialService.attachCourse(docId, Number(courseId));
        setMaterialsReload(r => r + 1);
      }
      const accepted = await materialService.generateQuiz(docId, {
        questionCount: countNum,
        difficulty,
        courseId: Number(courseId),
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
      const { items: list } = await materialService.listWithCourses(courses.map(c => ({ courseId: c.courseId, title: c.title })));
      setMaterials(list);
      return list.find(m => m.documentId === docId)?.jobs.find(j => isJobRunning(j.status)) ?? null;
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
          disabled={busy || checkingFile || courses.length === 0 || (touched && invalid)}
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
            navigate(ROUTES.studentMaterials);
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
      <Button variant="outline" loading disabled>
        Generating…
      </Button>
    );

  // No closing while the file uploads, the quiz is being generated or the quiz is starting.
  const locked = busy || starting || phase === 'processing';

  return (
    <Modal open={open} onClose={onClose} dismissible={!locked} title="Material to Quiz Creator" size="lg" footer={footer}>
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
                  onChange={changeCourse}
                  error={touched ? errors.course : undefined}
                />

                <div className="space-y-3">
                  <Select
                    label="Material"
                    options={materialOptions}
                    value={documentId == null ? UPLOAD_NEW : String(documentId)}
                    onChange={v => {
                      setDocumentId(v === UPLOAD_NEW ? null : Number(v));
                      setReused(false);
                    }}
                    disabled={loadingMaterials}
                    maxVisibleOptions={8}
                  />
                  {materialsError && (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs text-danger">{materialsError}</p>
                      <Button size="sm" variant="outline" onClick={() => setMaterialsReload(r => r + 1)}>
                        Retry
                      </Button>
                    </div>
                  )}

                  {!reused && needsAttach && (
                    <p className="text-xs text-content-subtle">
                      This material will also be added to {courses.find(c => String(c.courseId) === courseId)?.title}.
                    </p>
                  )}
                  {checkingFile && <p className="text-xs text-content-subtle">Checking whether you uploaded this file before…</p>}
                  {documentId == null && atFileLimit && !fileError && <Alert type="warning" message={FILE_LIMIT_MESSAGE} />}
                  {documentId == null ? (
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
                              onClick={() => {
                                pickedFile.current = null;
                                setFile(null);
                              }}
                              className="p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content"
                            >
                              <Icon.X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <Icon.Upload className="w-6 h-6 mx-auto text-content-subtle" />
                            <p className="mt-2 text-sm text-content-secondary">Drag &amp; Drop PDF or DOCX</p>
                            <p className="text-xs text-content-subtle">
                              Up to {formatSize(MATERIAL_MAX_BYTES)} · {Math.min(materials.length, MATERIAL_MAX_FILES)}/{MATERIAL_MAX_FILES} files used
                            </p>
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
                  ) : selected ? (
                    <div className="flex items-center gap-3 rounded-[12px] border border-line px-4 py-3">
                      <Icon.FileText className="w-8 h-8 text-primary flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-content truncate" title={selected.fileName}>
                          {selected.fileName}
                        </p>
                        <p className="flex flex-wrap gap-x-3 text-xs text-content-subtle">
                          {selected.pageCount != null && (
                            <span>
                              {selected.pageCount} page{selected.pageCount === 1 ? '' : 's'}
                            </span>
                          )}
                          <span>Uploaded {formatDate(selected.uploadedAt)}</span>
                          <span>
                            {completedCount(selected)} quiz{completedCount(selected) === 1 ? '' : 'zes'} generated
                          </span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    loadingMaterials && (
                      <div className="flex justify-center py-4">
                        <Spinner />
                      </div>
                    )
                  )}
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
                {job.questionCount} questions · Please keep this window open until the quiz is ready.
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
              Answers are checked when you submit. You can take the quiz again any time from My Materials or Exam History.
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

const completedCount = (m: MaterialItem) => m.jobs.filter(j => j.status === 'COMPLETED').length;
