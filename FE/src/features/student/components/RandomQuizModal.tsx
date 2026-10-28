import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { studentPracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import type { MyCourse } from '@/services/studentCourse.service';
import {
  PRACTICE_MAX_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  studentPracticeService,
  type PracticeModule,
} from '@/services/studentPractice.service';

const DEFAULT_COUNT = '20';
const DEFAULT_MINUTES = '30';

/**
 * Customize Random Quiz — pick courses, optionally narrow to modules, set the
 * question count and time limit, then generate and start right away.
 * No module picked = every module of the chosen courses.
 */
export function RandomQuizModal({ open, onClose, courses }: { open: boolean; onClose: () => void; courses: MyCourse[] }) {
  const navigate = useNavigate();
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [count, setCount] = useState(DEFAULT_COUNT);
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
    setCourseIds([]);
    setModuleIds([]);
    setCount(DEFAULT_COUNT);
    setMinutes(DEFAULT_MINUTES);
    setTouched(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || courseIds.length === 0) {
      setModules([]);
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
        setModuleIds(ids => ids.filter(id => list.some(m => String(m.moduleId) === id)));
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
  const moduleOptions = useMemo(
    () =>
      modules.map(m => ({
        value: String(m.moduleId),
        label: `${multiCourse ? `${m.courseTitle} · ` : ''}${m.title} (${m.questionCount})`,
      })),
    [modules, multiCourse],
  );

  const pool = moduleIds.length ? modules.filter(m => moduleIds.includes(String(m.moduleId))) : modules;
  const available = pool.reduce((s, m) => s + m.questionCount, 0);
  const maxCount = Math.min(available, PRACTICE_MAX_QUESTIONS);
  const chosenCourses = courses.filter(c => courseIds.includes(String(c.courseId)));

  const countNum = Number(count);
  const minutesNum = Number(minutes);
  const errors = {
    courses: courseIds.length === 0 ? 'Select at least one course.' : undefined,
    count:
      !Number.isInteger(countNum) || countNum < 1
        ? 'Enter a whole number of at least 1.'
        : countNum > PRACTICE_MAX_QUESTIONS
          ? `At most ${PRACTICE_MAX_QUESTIONS} questions.`
          : !loadingModules && modules.length > 0 && countNum > available
            ? `Only ${available} questions are available.`
            : undefined,
    minutes:
      !Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > PRACTICE_MAX_MINUTES
        ? `Enter 1 – ${PRACTICE_MAX_MINUTES} minutes.`
        : undefined,
  };
  const noModules = courseIds.length > 0 && !loadingModules && !modulesError && modules.length === 0;
  const invalid = Boolean(errors.courses || errors.count || errors.minutes) || noModules || loadingModules || Boolean(modulesError);

  const generate = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const quiz = await studentPracticeService.generateRandomQuiz(
        { courseIds: courseIds.map(Number), moduleIds: moduleIds.map(Number), questionCount: countNum, timeLimitMinutes: minutesNum },
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
        <Button loading={busy} disabled={busy || courses.length === 0 || (touched && invalid)} icon={<Icon.Zap className="w-4 h-4" />} onClick={generate}>
          Generate and Start
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-content-soft">
          Build a practice quiz from your enrolled courses. Questions are drawn at random from the modules you pick.
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

            <div className="min-w-0 space-y-1.5">
              <MultiSelect
                label="Modules"
                placeholder={
                  courseIds.length === 0 ? 'Select a course first' : loadingModules ? 'Loading modules…' : 'All modules'
                }
                options={moduleOptions}
                value={moduleIds}
                onChange={setModuleIds}
                disabled={courseIds.length === 0 || loadingModules || modules.length === 0}
              />
              {modulesError ? (
                <p className="text-xs text-danger">{modulesError}</p>
              ) : noModules ? (
                <p className="text-xs text-warning">The selected courses have no module yet.</p>
              ) : (
                pool.length > 0 && (
                  <p className="text-xs text-content-subtle break-words">
                    {pool.map(m => `${m.title}: ${m.questionCount}`).join('; ')}
                    <span className="text-content-soft font-medium"> · {available} questions available</span>
                  </p>
                )
              )}
            </div>

            <Input
              label="Question Count"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxCount || PRACTICE_MAX_QUESTIONS}
              value={count}
              onChange={e => setCount(e.target.value)}
              error={touched ? errors.count : undefined}
              hint={maxCount ? `1 – ${maxCount}` : undefined}
            />

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

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
