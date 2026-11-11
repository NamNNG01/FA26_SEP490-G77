import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentModulePracticePath } from '@/app/routes';
import {
  DEFAULT_PRACTICE_SIZE,
  PRACTICE_SIZES,
  modulePracticeService,
  type ModulePracticeOverview,
  type PracticeDifficulty,
  type PracticeMode,
  type PracticeScope,
} from '@/services/modulePractice.service';
import type { QuestionType } from '@/services/studentAttempt.service';
import { QUESTION_TYPE_LABEL } from './QuestionAnswerInput';

interface ModeInfo {
  mode: PracticeMode;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Icon tile colours. */
  tile: string;
}

const MODES: ModeInfo[] = [
  {
    mode: 'ALL',
    title: 'Practice all',
    description: 'Every question of the module, in a random order.',
    icon: <Icon.BookOpen className="w-5 h-5" />,
    tile: 'bg-primary-light text-primary',
  },
  {
    mode: 'REVIEW',
    title: 'Review mistakes',
    description: 'Questions whose latest answer was wrong, or essays scored under 50%.',
    icon: <Icon.RefreshCw className="w-5 h-5" />,
    tile: 'bg-danger-light text-danger',
  },
  {
    mode: 'BOOKMARKED',
    title: 'Bookmarked questions',
    description: 'Only the questions you bookmarked in this module.',
    icon: <Icon.Bookmark className="w-5 h-5" />,
    tile: 'bg-warning-light text-warning',
  },
  {
    mode: 'TARGET',
    title: 'Targeted practice',
    description: 'Pick a difficulty and question types to focus on.',
    icon: <Icon.Target className="w-5 h-5" />,
    tile: 'bg-success-light text-success',
  },
];

const DIFFICULTIES: { value: PracticeDifficulty | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const TARGET_TYPES: QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'MATCHING',
  'FILL_BLANK',
  'ORDERING',
  'ESSAY',
  'CODE',
  'DIAGRAM',
  'DIAGRAM_ESSAY',
];

const CHIP = 'px-3 py-1.5 rounded-[8px] border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary';
const chipTone = (selected: boolean) =>
  selected ? 'border-primary bg-primary-light text-primary' : 'border-line text-content-secondary hover:bg-surface-hover';

/**
 * Picks a practice mode for one module (or a course's General pool) — only Targeted practice also picks a
 * session size, every other mode takes all its questions — then starts the session (MP-02) and opens it on the take-exam screen. A session already open on the module is resumed instead.
 * `overview` is optional: without it nothing is disabled and no session in progress is shown.
 */
export function ModulePracticeModal({
  open,
  onClose,
  scope,
  moduleTitle,
  overview,
}: {
  open: boolean;
  onClose: () => void;
  scope: PracticeScope;
  moduleTitle: string;
  overview?: ModulePracticeOverview | null;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<PracticeMode>('ALL');
  const [size, setSize] = useState<number | null>(DEFAULT_PRACTICE_SIZE);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty | null>(null);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = 'moduleId' in scope ? `module-${scope.moduleId}` : `general-${scope.courseId}`;

  useEffect(() => {
    if (!open) return;
    setMode('ALL');
    setSize(DEFAULT_PRACTICE_SIZE);
    setDifficulty(null);
    setQuestionTypes([]);
    setError(null);
  }, [open, scopeKey]);

  const toggleType = (t: QuestionType) =>
    setQuestionTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));

  const noMistakes = overview != null && overview.questionsNeedingReview === 0;
  const noQuestions = overview != null && overview.totalQuestions === 0;
  const active = overview?.activeSession?.status === 'IN_PROGRESS' ? overview.activeSession : null;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const sessionId = active ? active.sessionId : (await modulePracticeService.startSession(scope, { questionCount: mode === 'TARGET' ? size : null, mode, difficulty, questionTypes })).sessionId;
      navigate(studentModulePracticePath(sessionId));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not start the practice session.'));
      setStarting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !starting && onClose()}
      title={`Practice · ${moduleTitle}`}
      error={error && <Alert type="error" message={error} />}
      size="md"
      footer={
        <>
          <Button variant="outline" disabled={starting} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={starting} disabled={starting || noQuestions} icon={<Icon.Play className="w-4 h-4" />} onClick={start}>
            {active ? 'Continue session' : 'Start practice'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {noQuestions && <Alert type="info" message="This module has no practice questions yet." />}
        {active && (
          <Alert
            type="info"
            title="Session in progress"
            message={`You have answered ${active.answeredCount} of ${active.questionCount} questions. Continue it, or finish it to start a new one.`}
          />
        )}

        {/* MP-02 hands back the open session whatever the mode and size, so nothing to pick then. */}
        {!active && (
          <>
            <div role="radiogroup" aria-label="Practice mode" className="rounded-[12px] border border-line divide-y divide-line overflow-hidden">
              {MODES.map(m => {
                const disabled = m.mode === 'REVIEW' && noMistakes;
                const selected = mode === m.mode;
                return (
                  <button
                    key={m.mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => setMode(m.mode)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected ? 'bg-primary-light' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <span className={`w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 ${m.tile}`}>{m.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-content">{m.title}</span>
                      <span className="block text-xs text-content-soft mt-0.5">
                        {disabled ? 'You have no wrong answers to review in this module.' : m.description}
                      </span>
                    </span>
                    {selected && <Icon.CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {mode === 'TARGET' && (
              <div className="space-y-4 rounded-[12px] border border-line p-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-content">Difficulty</p>
                  <div role="radiogroup" aria-label="Difficulty" className="flex flex-wrap gap-2">
                    {DIFFICULTIES.map(d => (
                      <button
                        key={d.value ?? 'any'}
                        type="button"
                        role="radio"
                        aria-checked={difficulty === d.value}
                        onClick={() => setDifficulty(d.value)}
                        className={`${CHIP} ${chipTone(difficulty === d.value)}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-content">
                    Question types <span className="font-normal text-content-subtle">· none picked = all types</span>
                  </p>
                  <div role="group" aria-label="Question types" className="flex flex-wrap gap-2">
                    {TARGET_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={questionTypes.includes(t)}
                        onClick={() => toggleType(t)}
                        className={`${CHIP} ${chipTone(questionTypes.includes(t))}`}
                      >
                        {QUESTION_TYPE_LABEL[t] ?? t}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Only Targeted practice picks a size; every other mode takes all its questions. */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-content">Number of questions</p>
                  <div role="radiogroup" aria-label="Number of questions" className="flex flex-wrap gap-2">
                    {PRACTICE_SIZES.map(n => (
                      <button
                        key={n ?? 'all'}
                        type="button"
                        role="radio"
                        aria-checked={size === n}
                        onClick={() => setSize(n)}
                        className={`${CHIP} min-w-16 ${chipTone(size === n)}`}
                      >
                        {n ?? `All${overview ? ` (${overview.totalQuestions})` : ''}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </Modal>
  );
}
