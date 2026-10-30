import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { RUBRIC_TYPES, type AnswerResponse, type AttemptQuestion, type AttemptResult } from '@/services/studentAttempt.service';
import {
  CHECKABLE_TYPES,
  INSTANT_CHECK_TYPES,
  checkParts,
  studentPracticeExamService,
  type AnswerCheck,
  type CheckOutcome,
} from '@/services/studentPracticeExam.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText } from './QuestionAnswerInput';
import { PracticeCheck, checkProgress } from './PracticeCheck';

const CHOICE_TYPES: ReadonlySet<string> = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);

/**
 * Key of a question from the attempt's SA-05 result, as a "Check answer" reveal.
 * PQ-04 never sends a key, so the check is done here; null when the result has none.
 */
function keyOf(result: AttemptResult, q: AttemptQuestion): Omit<AnswerCheck, 'isCorrect'> | null {
  if (!CHECKABLE_TYPES.has(q.questionType)) return null;
  const rq = result.questions.find(x => x.questionId === q.questionId);
  if (!rq) return null;
  const explanation = rq.explanation?.text ?? null;
  if (CHOICE_TYPES.has(q.questionType)) {
    const correctOptionIds = (rq.options ?? []).filter(o => o.isCorrectAnswer === true).map(o => o.optionId);
    return correctOptionIds.length > 0 ? { supported: true, correctOptionIds, correctAnswer: null, explanation, demo: false } : null;
  }
  const key = rq.correctAnswer;
  const has =
    q.questionType === 'ORDERING' ? key?.orderedOptionIds?.length : q.questionType === 'MATCHING' ? key?.pairs?.length : key?.blanks && Object.keys(key.blanks).length;
  return has ? { supported: true, correctOptionIds: [], correctAnswer: key, explanation, demo: false } : null;
}

/**
 * "Retry wrong questions" of the result page: the wrong answers of the attempt (PQ-04) are
 * answered again one at a time, each checked on the spot against the key of the attempt's
 * result, then a summary. Nothing is sent back — it is self-practice, the attempt's score stays.
 * Essay / code / diagram answers are AI-graded against a rubric, so they are only listed.
 */
export function RetryWrongQuestionsModal({ result, onClose }: { result: AttemptResult; onClose: () => void }) {
  const [questions, setQuestions] = useState<AttemptQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerResponse | null>>({});
  const [checks, setChecks] = useState<Record<number, AnswerCheck>>({});
  const [justChecked, setJustChecked] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setQuestions(null);
    studentPracticeExamService
      .getWrongQuestions(result.attemptId)
      .then(items => {
        if (!cancelled) setQuestions([...items].sort((a, b) => a.orderIndex - b.orderIndex));
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the wrong questions.'));
      });
    return () => {
      cancelled = true;
    };
  }, [result.attemptId, reload]);

  /** Number of each question in the review (its palette cell). */
  const numberInExam = useMemo(() => new Map(result.questions.map((x, i) => [x.questionId, i + 1])), [result]);

  const restart = () => {
    setAnswers({});
    setChecks({});
    setJustChecked(null);
    setCurrent(0);
    setFinished(false);
  };

  const body = (() => {
    if (error) {
      return (
        <div className="py-8 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setReload(r => r + 1)}>
            Try again
          </Button>
        </div>
      );
    }
    if (!questions) {
      return (
        <p className="py-10 flex items-center justify-center gap-2 text-sm text-content-soft">
          <Spinner size="sm" /> Loading your wrong questions…
        </p>
      );
    }
    if (questions.length === 0) {
      return (
        <div className="py-10 flex flex-col items-center gap-2 text-center">
          <Icon.CheckCircle className="w-10 h-10 text-success" />
          <p className="text-base font-semibold text-content">No wrong answers</p>
          <p className="text-sm text-content-soft">Every question of this attempt was answered correctly.</p>
        </div>
      );
    }
    if (finished) return <Summary questions={questions} answers={answers} checks={checks} />;

    const q = questions[current];
    const key = keyOf(result, q);
    const check = checks[q.questionId];
    const response = answers[q.questionId] ?? null;
    const progress = checkProgress(q, response);

    const runCheck = (value: AnswerResponse | null) => {
      if (!key || check) return;
      // An untouched ordering is checked as shown.
      const given = q.questionType === 'ORDERING' && !value?.orderedOptionIds?.length ? { orderedOptionIds: (q.options ?? []).map(o => o.optionId) } : value;
      if (given !== value) setAnswers(prev => ({ ...prev, [q.questionId]: given }));
      const parts = checkParts(q, given, { ...key, isCorrect: null });
      setChecks(prev => ({ ...prev, [q.questionId]: { ...key, isCorrect: parts.correct === parts.total } }));
      setJustChecked(q.questionId);
    };
    const change = (next: AnswerResponse) => {
      setAnswers(prev => ({ ...prev, [q.questionId]: next }));
      if (key && !check && INSTANT_CHECK_TYPES.has(q.questionType)) runCheck(next);
    };

    return (
      <div key={q.questionId} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-content uppercase tracking-wide">
            Question {current + 1} of {questions.length}
          </h2>
          <Badge variant="info">{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Badge>
          {numberInExam.has(q.questionId) && <span className="text-xs text-content-subtle">Q{numberInExam.get(q.questionId)} in the exam</span>}
        </div>

        <div className="card p-4">
          <QuestionText content={q.content} className="text-base text-content font-medium leading-relaxed" />
        </div>

        {RUBRIC_TYPES.has(q.questionType) ? (
          <p className="flex items-start gap-2 rounded-[10px] border border-line bg-surface-alt px-4 py-3 text-sm text-content-soft">
            <Icon.Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            Written answers are graded by AI against a rubric, so they can't be checked here. Read the rubric feedback of this question in the review.
          </p>
        ) : (
          <>
            <QuestionAnswerInput question={q} value={response} onChange={change} practice reveal={check ?? null} onEnter={key && !check && progress.ready ? () => runCheck(response) : undefined} />
            {key ? (
              <PracticeCheck
                question={q}
                check={check}
                checking={false}
                progress={progress}
                checkable
                focusNext={justChecked === q.questionId}
                onCheck={() => runCheck(response)}
              />
            ) : (
              <p className="text-xs text-content-subtle">The answer key of this question isn't available, so your answer can't be checked.</p>
            )}
          </>
        )}
      </div>
    );
  })();

  const total = questions?.length ?? 0;
  const footer =
    total === 0 ? (
      <Button onClick={onClose}>Close</Button>
    ) : finished ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={restart}>
          Start over
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    ) : (
      <div className="w-full flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
          Previous
        </Button>
        {current < total - 1 ? (
          <Button data-next-question iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => setCurrent(c => c + 1)}>
            Next question
          </Button>
        ) : (
          <Button data-next-question icon={<Icon.Check className="w-4 h-4" />} onClick={() => setFinished(true)}>
            Finish
          </Button>
        )}
      </div>
    );

  return (
    <Modal open onClose={onClose} title="Retry wrong questions" size="xl" footer={questions ? footer : undefined}>
      {body}
    </Modal>
  );
}

const SUMMARY_TONE: Record<CheckOutcome | 'skipped', string> = {
  correct: 'text-success',
  partial: 'text-warning',
  wrong: 'text-danger',
  skipped: 'text-content-subtle',
};

/** How the retry went: right now / partly / still wrong / not checked. */
function Summary({
  questions,
  answers,
  checks,
}: {
  questions: AttemptQuestion[];
  answers: Record<number, AnswerResponse | null>;
  checks: Record<number, AnswerCheck>;
}) {
  const counts: Record<CheckOutcome | 'skipped', number> = { correct: 0, partial: 0, wrong: 0, skipped: 0 };
  for (const q of questions) {
    const c = checks[q.questionId];
    counts[c ? checkParts(q, answers[q.questionId], c).outcome : 'skipped']++;
  }
  const checked = questions.length - counts.skipped;
  const rows: [CheckOutcome | 'skipped', string][] = [
    ['correct', 'Correct now'],
    ['partial', 'Partly correct'],
    ['wrong', 'Still wrong'],
    ['skipped', 'Not checked'],
  ];
  return (
    <div className="py-4 space-y-5 text-center">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide">Retry finished</p>
        <p className="text-[2.5rem] font-black leading-none text-content">
          {counts.correct}
          <span className="text-lg font-semibold text-content-subtle"> / {checked || questions.length}</span>
        </p>
        <p className="text-sm text-content-soft">{checked > 0 ? 'checked answers are now correct.' : 'No answer was checked.'}</p>
      </div>
      <ul className="mx-auto max-w-xs space-y-1.5 text-sm">
        {rows
          .filter(([k]) => counts[k] > 0)
          .map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3">
              <span className="text-content-secondary">{label}</span>
              <span className={`font-semibold ${SUMMARY_TONE[k]}`}>{counts[k]}</span>
            </li>
          ))}
      </ul>
      <p className="text-xs text-content-subtle">This is practice only — the score of the attempt does not change.</p>
    </div>
  );
}
