import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DEFAULT_PRACTICE_SIZE,
  PRACTICE_SIZES,
  modulePracticeService,
  type ModulePracticeOverview,
  type PracticeDifficulty,
  type PracticeMode,
} from '@/services/modulePractice.service';
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
    description: 'Questions you have not finished or never practiced.',
    icon: <Icon.BookOpen className="w-5 h-5" />,
    tile: 'bg-primary-light text-primary',
  },
  {
    mode: 'WRONG',
    title: 'Review mistakes',
    description: 'Only the questions you have answered wrong.',
    icon: <Icon.RefreshCw className="w-5 h-5" />,
    tile: 'bg-danger-light text-danger',
  },
  {
    mode: 'BOOKMARKED',
    title: 'Bookmarked questions',
    description: 'Practice again the questions you bookmarked.',
    icon: <Icon.Bookmark className="w-5 h-5" />,
    tile: 'bg-warning-light text-warning',
  },
  {
    mode: 'RANDOM',
    title: 'Random practice',
    description: 'Shuffled questions, so you do not learn the order by heart.',
    icon: <Icon.Shuffle className="w-5 h-5" />,
    tile: 'bg-purple-light text-purple',
  },
  {
    mode: 'TARGET',
    title: 'Targeted practice',
    description: 'Pick the number, difficulty and type of questions.',
    icon: <Icon.Target className="w-5 h-5" />,
    tile: 'bg-success-light text-success',
  },
];

const DIFFICULTY_OPTIONS: { label: string; value: '' | PracticeDifficulty }[] = [
  { label: 'Any difficulty', value: '' },
  { label: 'Easy', value: 'EASY' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Hard', value: 'HARD' },
];

const TYPE_OPTIONS = Object.entries(QUESTION_TYPE_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Picks a practice mode and a session size for one module, then starts the session. `overview` is
 * optional: without it nothing is disabled and no session in progress is shown.
 */
export function ModulePracticeModal({
  open,
  onClose,
  moduleId,
  moduleTitle,
  overview,
}: {
  open: boolean;
  onClose: () => void;
  moduleId: number;
  moduleTitle: string;
  overview?: ModulePracticeOverview | null;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<PracticeMode>('ALL');
  const [size, setSize] = useState<number | null>(DEFAULT_PRACTICE_SIZE);
  const [difficulty, setDifficulty] = useState<'' | PracticeDifficulty>('');
  const [types, setTypes] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('ALL');
    setSize(DEFAULT_PRACTICE_SIZE);
    setDifficulty('');
    setTypes([]);
    setError(null);
  }, [open, moduleId]);

  const noMistakes = overview != null && overview.questionsNeedReview === 0;
  const noQuestions = overview != null && overview.totalQuestions === 0;
  const active = overview?.activeSession?.status === 'IN_PROGRESS' ? overview.activeSession : null;

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await modulePracticeService.startSession(moduleId, {
        questionCount: size,
        mode,
        ...(mode === 'TARGET' ? { difficulty: difficulty || undefined, questionTypes: types.length > 0 ? types : undefined } : {}),
      });
      toast.success(
        session.answeredCount > 0
          ? `Practice session resumed — ${session.answeredCount}/${session.questionCount} answered`
          : `Practice session ready — ${session.questionCount} questions`,
      );
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not start the practice session.'));
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !starting && onClose()}
      title={`Practice · ${moduleTitle}`}
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
            message={`You have answered ${active.answeredCount} of ${active.questionCount} questions. Starting again continues that session.`}
          />
        )}

        <div role="radiogroup" aria-label="Practice mode" className="rounded-[12px] border border-line divide-y divide-line overflow-hidden">
          {MODES.map(m => {
            const disabled = m.mode === 'WRONG' && noMistakes;
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

        <div className="space-y-2">
          <p className="text-sm font-medium text-content">Number of questions</p>
          <div role="radiogroup" aria-label="Number of questions" className="flex flex-wrap gap-2">
            {PRACTICE_SIZES.map(n => {
              const selected = size === n;
              return (
                <button
                  key={n ?? 'all'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSize(n)}
                  className={`min-w-16 px-4 py-2 rounded-[8px] border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    selected ? 'border-primary bg-primary-light text-primary' : 'border-line text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {n ?? `All${overview ? ` (${overview.totalQuestions})` : ''}`}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'TARGET' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Difficulty"
              options={DIFFICULTY_OPTIONS}
              value={difficulty}
              onChange={v => setDifficulty(v as '' | PracticeDifficulty)}
            />
            <MultiSelect label="Question types" options={TYPE_OPTIONS} value={types} onChange={setTypes} placeholder="Any type" />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
