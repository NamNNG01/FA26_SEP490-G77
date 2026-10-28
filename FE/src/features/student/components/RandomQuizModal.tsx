import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { studentPracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { TypeCountSelect, type TypeCounts } from '@/features/question/components/TypeCountSelect';
import type { MyCourse } from '@/services/studentCourse.service';
import {
  EXAM_KIND_LABEL,
  PRACTICE_MAX_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  studentPracticeService,
  type PracticeExamKind,
  type PracticeModule,
} from '@/services/studentPractice.service';

const DEFAULT_MINUTES = '30';
const DEFAULT_PER_MODULE = 5;
const EXAM_KINDS: PracticeExamKind[] = ['QUIZ', 'ESSAY'];

/**
 * Customize Random Quiz — pick the exam type and courses, then in the module
 * dropdown tick modules and type how many questions to draw from each. The
 * question count is the sum of those; set the time limit and start right away.
 */
export function RandomQuizModal({ open, onClose, courses }: { open: boolean; onClose: () => void; courses: MyCourse[] }) {
  const navigate = useNavigate();
  const [examKind, setExamKind] = useState<PracticeExamKind>('QUIZ');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [moduleCounts, setModuleCounts] = useState<TypeCounts<string>>({});
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [touched, setTouched] = useState(false);

  const [modules, setModules] = useState<PracticeModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setExamKind('QUIZ');
    setCourseIds([]);
    setModuleCounts({});
    setMinutes(DEFAULT_MINUTES);
    setTouched(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || courseIds.length === 0) {
      setModules([]);
      setModuleCounts({});
      setModulesError(null);
      return;
    }
    let cancelled = false;
    setLoadingModules(true);
    setModulesError(null);
    const picked = courses.filter(c => courseIds.includes(String(c.courseId))).map(c => ({ courseId: c.courseId, title: c.title }));
    studentPracticeService
      .getModules(picked)
      .then(list => {
        if (cancelled) return;
        setModules(list);
        // Drop modules of courses that were unselected.
        const ids = new Set(list.map(m => String(m.moduleId)));
        setModuleCounts(c => Object.fromEntries(Object.entries(c).filter(([id]) => ids.has(id))));
      })
      .catch(err => {
        if (!cancelled) setModulesError(getApiErrorMessage(err, 'Failed to load the modules.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingModules(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, courseIds, courses]);

  const courseOptions = useMemo(() => courses.map(c => ({ value: String(c.courseId), label: c.title })), [courses]);
  const multiCourse = courseIds.length > 1;
  // Modules with no question of this exam type can't be picked, so they are left out.
  const moduleOptions = useMemo(
    () =>
      modules
        .filter(m => m.questionCounts[examKind] > 0)
        .map(m => ({
          value: String(m.moduleId),
          label: `${multiCourse ? `${m.courseTitle} · ` : ''}${m.title}`,
          max: m.questionCounts[examKind],
          hint: `/ ${m.questionCounts[examKind]}`,
        })),
    [modules, multiCourse, examKind],
  );

  const changeKind = (kind: PracticeExamKind) => {
    setExamKind(kind);
    // Keep picked modules that still have questions of the new type, capped at what they hold.
    setModuleCounts(c =>
      Object.fromEntries(
        Object.entries(c).flatMap(([id, v]) => {
          const available = modules.find(m => String(m.moduleId) === id)?.questionCounts[kind] ?? 0;
          if (!available) return [];
          const n = Number(v);
          return [[id, Number.isInteger(n) && n > available ? String(available) : v]];
        }),
      ),
    );
  };

  const picked = Object.entries(moduleCounts).map(([id, v]) => ({ module: modules.find(m => String(m.moduleId) === id), count: Number(v) }));
  const badCount = picked.some(p => !p.module || !Number.isInteger(p.count) || p.count < 1 || p.count > p.module.questionCounts[examKind]);
  const total = picked.reduce((s, p) => s + (Number.isInteger(p.count) && p.count > 0 ? p.count : 0), 0);
  const chosenCourses = courses.filter(c => courseIds.includes(String(c.courseId)));

  const minutesNum = Number(minutes);
  const errors = {
    courses: courseIds.length === 0 ? 'Select at least one course.' : undefined,
    modules:
      courseIds.length === 0 || loadingModules || modulesError
        ? undefined
        : picked.length === 0
          ? 'Choose at least one module and how many questions to take from it.'
          : badCount
            ? 'Each module needs a count between 1 and the questions it holds.'
            : total > PRACTICE_MAX_QUESTIONS
              ? `At most ${PRACTICE_MAX_QUESTIONS} questions in total.`
              : undefined,
    minutes:
      !Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > PRACTICE_MAX_MINUTES
        ? `Enter 1 – ${PRACTICE_MAX_MINUTES} minutes.`
        : undefined,
  };
  const noModules = courseIds.length > 0 && !loadingModules && !modulesError && moduleOptions.length === 0;
  const invalid =
    Boolean(errors.courses || errors.modules || errors.minutes) || noModules || loadingModules || Boolean(modulesError) || picked.length === 0;

  const generate = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const quiz = await studentPracticeService.generateRandomQuiz(
        {
          examKind,
          moduleCounts: picked.map(p => ({ moduleId: p.module!.moduleId, count: p.count })),
          timeLimitMinutes: minutesNum,
        },
        modules,
      );
      onClose();
      navigate(studentPracticePath(quiz.quizId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to generate the quiz.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Customize Random Quiz"
      size="lg"
      footer={
        <Button
          loading={busy}
          disabled={busy || courses.length === 0 || (touched && invalid)}
          icon={<Icon.Zap className="w-4 h-4" />}
          onClick={generate}
        >
          Generate and Start
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-content-soft">
          Build a practice quiz from your enrolled courses. Pick the modules and how many questions to draw at random from each.
        </p>

        <Alert
          type="info"
          title="Demo questions"
          message="Question counts and questions are sample data until the backend supports random quizzes. Your result is not saved."
        />

        {courses.length === 0 ? (
          <p className="text-sm text-content-soft">Enroll in a course first to build a random quiz from it.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Select
                label="Exam Type"
                options={EXAM_KINDS.map(k => ({ value: k, label: EXAM_KIND_LABEL[k] }))}
                value={examKind}
                onChange={v => changeKind(v as PracticeExamKind)}
              />
              <p className="text-xs text-content-subtle">
                {examKind === 'QUIZ'
                  ? 'Auto-graded questions: choice, true/false, fill in the blank, matching, ordering.'
                  : 'Written answers. Not graded — you compare yours with a sample answer.'}
              </p>
            </div>

            <div className="min-w-0 space-y-1.5">
              <MultiSelect
                label="Courses"
                placeholder="Select courses…"
                options={courseOptions}
                value={courseIds}
                onChange={setCourseIds}
                error={touched ? errors.courses : undefined}
              />
              {chosenCourses.length > 0 && (
                <p className="text-xs text-content-subtle break-words">{chosenCourses.map(c => c.title).join(', ')}</p>
              )}
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <TypeCountSelect
                label="Modules"
                placeholder={
                  courseIds.length === 0 ? 'Select a course first' : loadingModules ? 'Loading modules…' : 'Choose modules and question counts…'
                }
                header="Questions to draw / available"
                options={moduleOptions}
                value={moduleCounts}
                onChange={setModuleCounts}
                min={1}
                max={PRACTICE_MAX_QUESTIONS}
                defaultCount={DEFAULT_PER_MODULE}
                disabled={courseIds.length === 0 || loadingModules || moduleOptions.length === 0}
                error={touched ? errors.modules : undefined}
              />
              {modulesError ? (
                <p className="text-xs text-danger">{modulesError}</p>
              ) : noModules ? (
                <p className="text-xs text-warning">
                  The selected courses have no module with {EXAM_KIND_LABEL[examKind].toLowerCase()} questions.
                </p>
              ) : (
                moduleOptions.length > 0 && (
                  <p className="text-xs text-content-subtle break-words">
                    Available: {moduleOptions.map(o => `${o.label}: ${o.max}`).join('; ')}
                  </p>
                )
              )}
            </div>

            <Input label="Question Count" value={String(total)} readOnly tabIndex={-1} hint="Sum of the questions picked per module." className="[&_input]:bg-surface-alt" />

            <Input
              label="Time Limit (minutes)"
              type="number"
              inputMode="numeric"
              min={1}
              max={PRACTICE_MAX_MINUTES}
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              error={touched ? errors.minutes : undefined}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
