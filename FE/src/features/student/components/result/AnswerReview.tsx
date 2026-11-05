import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import type { ResultQuestion } from '@/services/studentAttempt.service';
import { useDrawioSnapshot } from '@/features/question/components/useDrawioSnapshot';
import { isAnswered, optionLetter } from '../QuestionAnswerInput';

/**
 * The student's answer to one question set against its key, shared by the exam result (SA-05)
 * and the module practice result (MP-08): picked options filled green / red with the right one
 * outlined, ordering / matching / blank rows each with their own verdict, a written answer for
 * reading, or the submitted diagram.
 */
export function AnswerReview({ question: q }: { question: ResultQuestion }) {
  const r = q.yourResponse;
  const answered = isAnswered(r);

  if (q.options && (q.questionType === 'SINGLE_CHOICE' || q.questionType === 'MULTIPLE_CHOICE' || q.questionType === 'TRUE_FALSE')) {
    // Only what the student picked gets a filled row (green = right, red = wrong); a correct
    // option they did not pick is just outlined, so an unanswered question never looks answered.
    const picked = new Set(r?.selectedOptionIds ?? []);
    const multi = q.questionType === 'MULTIPLE_CHOICE';
    return (
      <div className="space-y-2">
        {!answered && (
          <p role="note" className="flex items-start gap-2 rounded-[10px] border border-warning-line bg-warning-light px-3 py-2 text-sm text-warning">
            <Icon.AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            You didn't answer this question — the correct answer is marked below.
          </p>
        )}
        <ul className="space-y-2">
          {q.options.map((opt, i) => {
            const mine = picked.has(opt.optionId);
            const right = opt.isCorrectAnswer === true;
            const cls = mine
              ? right
                ? 'border-success-solid bg-success-light'
                : 'border-danger-solid bg-danger-light'
              : right
                ? 'border-dashed border-success-solid bg-surface'
                : 'border-line bg-surface';
            return (
              <li key={opt.optionId} className={`flex items-start gap-3 p-3 rounded-[10px] border ${cls}`}>
                <SelectionMark multi={multi} checked={mine} />
                <span className="w-6 h-6 rounded-full bg-surface-muted text-xs font-bold text-content-secondary flex items-center justify-center flex-shrink-0">
                  {optionLetter(i)}
                </span>
                <span className="flex-1 text-sm text-content-secondary break-words">{opt.optionText}</span>
                <span className="flex flex-wrap justify-end gap-1 flex-shrink-0">
                  {mine &&
                    (right ? (
                      <Badge size="sm" variant="success">
                        <Icon.Check className="w-3 h-3" /> Your answer
                      </Badge>
                    ) : (
                      <Badge size="sm" variant="danger">
                        <Icon.X className="w-3 h-3" /> Your answer
                      </Badge>
                    ))}
                  {right && !mine && <span className="text-xs font-medium text-success">Correct answer</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (q.questionType === 'ORDERING') return <OrderingReview question={q} />;
  if (q.questionType === 'MATCHING') return <MatchingReview question={q} />;
  if (q.questionType === 'FILL_BLANK') return <FillBlankReview question={q} />;

  if (answered && q.questionType !== 'DIAGRAM') return <WrittenAnswer text={r?.text ?? ''} code={q.questionType === 'CODE'} />;

  return (
    <div>
      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1">Your answer</p>
      {!answered ? (
        <p className="rounded-[10px] border border-dashed border-line px-3 py-6 text-center text-sm text-content-subtle">
          You did not answer this question.
        </p>
      ) : (
        <DiagramReview xml={r?.drawioXml ?? ''} />
      )}
    </div>
  );
}

/** Past this many lines a written answer folds, with "Show full answer". */
const FOLD_LINES = 18;
const FOLD_CHARS = 1500;

/**
 * Essay / code answer for reading: an essay in a relaxed sans paragraph with
 * its word count; code monospaced with line numbers and a copy button.
 * A long answer is folded behind a fade until expanded.
 */
function WrittenAnswer({ text, code }: { text: string; code: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = text.replace(/\n+$/, '').split('\n');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const long = lines.length > FOLD_LINES || text.length > FOLD_CHARS;
  const folded = long && !expanded;

  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide">Your answer</p>
        <span className="flex items-center gap-2 text-xs text-content-subtle">
          {code ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : `${words.toLocaleString('en-US')} word${words === 1 ? '' : 's'}`}
          {code && (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-[6px] border border-line px-2 py-0.5 text-content-soft hover:bg-accent"
            >
              {copied ? <Icon.Check className="w-3.5 h-3.5 text-success" /> : <Icon.Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </span>
      </div>

      <div className={`relative rounded-[10px] border border-line bg-surface-alt ${folded ? 'max-h-[22rem] overflow-hidden' : ''}`}>
        {code ? (
          <pre className="overflow-x-auto py-3 text-[13px] leading-6 font-mono text-content-secondary">
            <code className="grid grid-cols-[auto_minmax(0,1fr)]">
              {lines.map((line, i) => (
                <React.Fragment key={i}>
                  <span className="select-none text-right pl-3 pr-3 text-content-subtle border-r border-line" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pl-3 pr-4 whitespace-pre">{line || ' '}</span>
                </React.Fragment>
              ))}
            </code>
          </pre>
        ) : (
          <p className="px-4 py-3.5 text-[15px] leading-7 text-content whitespace-pre-wrap break-words">{text}</p>
        )}
        {folded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-[10px] bg-gradient-to-t from-surface-alt to-transparent" />
        )}
      </div>

      {long && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          {expanded ? 'Collapse answer' : 'Show full answer'}
          <Icon.ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

/** The submitted diagram, rendered to a picture by a hidden draw.io (the BE keeps only the XML). */
function DiagramReview({ xml }: { xml: string }) {
  const snapshot = useDrawioSnapshot(xml);
  return (
    <div className="rounded-[10px] border border-line bg-white p-3 flex items-center justify-center min-h-[140px]">
      {snapshot.svg ? (
        <img src={snapshot.svg} alt="Your diagram" className="max-h-[420px] max-w-full object-contain" />
      ) : snapshot.status === 'loading' ? (
        <span className="flex items-center gap-2 text-sm text-content-soft">
          <Spinner size="sm" /> Rendering your diagram…
        </span>
      ) : (
        <span className="text-sm text-content-soft">
          Diagram submitted ({xml.length.toLocaleString()} characters of XML) — couldn’t render a preview.
        </span>
      )}
      {snapshot.frame}
    </div>
  );
}

/** Radio (single / true-false) or checkbox (multiple) showing what the student ticked, as on the take screen. */
function SelectionMark({ multi, checked }: { multi: boolean; checked: boolean }) {
  return (
    <span
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      aria-disabled="true"
      aria-label={checked ? 'Selected' : 'Not selected'}
      className={`w-[18px] h-[18px] mt-[3px] flex items-center justify-center flex-shrink-0 border-2 ${
        multi ? 'rounded-[4px]' : 'rounded-full'
      } ${checked ? 'border-content-secondary bg-content-secondary' : 'border-content-subtle'}`}
    >
      {checked &&
        (multi ? (
          <Icon.Check className="w-3 h-3 text-surface" />
        ) : (
          <span className="block w-2 h-2 rounded-full bg-surface" />
        ))}
    </span>
  );
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * One line of a multi-part answer with its own verdict: ✓ / ✗, my value, and
 * the expected value next to it when wrong. `ok` null = no key to compare
 * (BE without `correctAnswer`), so the line is shown unmarked.
 */
function MarkedRow({
  ok,
  prefix,
  children,
  expected,
}: {
  ok: boolean | null;
  prefix: React.ReactNode;
  children: React.ReactNode;
  expected?: React.ReactNode;
}) {
  const cls = ok === true ? 'border-success-solid bg-success-light' : ok === false ? 'border-danger-solid bg-danger-light' : 'border-line bg-surface';
  return (
    <li className={`flex flex-wrap items-start gap-x-3 gap-y-1 p-3 rounded-[10px] border ${cls}`}>
      <span className="flex-shrink-0 mt-0.5" aria-label={ok === true ? 'Correct' : ok === false ? 'Incorrect' : undefined}>
        {ok === true ? (
          <Icon.CheckCircle className="w-4 h-4 text-success" />
        ) : ok === false ? (
          <Icon.XCircle className="w-4 h-4 text-danger" />
        ) : (
          <span className="block w-4 h-4" />
        )}
      </span>
      <span className="text-xs font-semibold text-content-subtle mt-0.5 flex-shrink-0">{prefix}</span>
      <span className="flex-1 min-w-[8rem] text-sm text-content-secondary break-words">{children}</span>
      {ok === false && expected != null && (
        <span className="w-full sm:w-auto pl-7 sm:pl-0 text-sm text-success-strong break-words">
          <span className="text-xs font-semibold uppercase tracking-wide text-content-subtle mr-1">Correct:</span>
          {expected}
        </span>
      )}
    </li>
  );
}

function ReviewHeading() {
  return <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Your answer</p>;
}

const Missing = () => <span className="italic text-content-subtle">No answer</span>;

function OrderingReview({ question: q }: { question: ResultQuestion }) {
  const textOf = (id: number) => q.options?.find(o => o.optionId === id)?.optionText ?? `#${id}`;
  const mine = q.yourResponse?.orderedOptionIds ?? [];
  const key = q.correctAnswer?.orderedOptionIds ?? null;
  const rows = Math.max(mine.length, key?.length ?? 0);
  if (rows === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ol className="space-y-2">
        {Array.from({ length: rows }, (_, i) => {
          const given = mine[i];
          const expected = key?.[i];
          return (
            <MarkedRow
              key={i}
              ok={key ? given != null && given === expected : null}
              prefix={`${i + 1}.`}
              expected={expected != null ? textOf(expected) : undefined}
            >
              {given != null ? textOf(given) : <Missing />}
            </MarkedRow>
          );
        })}
      </ol>
    </div>
  );
}

function MatchingReview({ question: q }: { question: ResultQuestion }) {
  const given = new Map((q.yourResponse?.matches ?? []).map(m => [m.left.trim(), m.right]));
  const pairs = q.correctAnswer?.pairs ?? null;
  // With a key, list every left of the key (unmatched ones too); without one, only what was answered.
  const lefts = pairs ? pairs.map(p => p.left) : [...given.keys()];
  if (lefts.length === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ul className="space-y-2">
        {lefts.map(left => {
          const mine = given.get(left.trim());
          const expected = pairs?.find(p => same(p.left, left))?.right;
          return (
            <MarkedRow
              key={left}
              ok={pairs ? mine != null && same(mine, expected) : null}
              prefix={<span className="text-sm font-medium text-content normal-case">{left} →</span>}
              expected={expected}
            >
              {mine ?? <Missing />}
            </MarkedRow>
          );
        })}
      </ul>
    </div>
  );
}

function FillBlankReview({ question: q }: { question: ResultQuestion }) {
  const given = q.yourResponse?.blanks ?? {};
  const key = q.correctAnswer?.blanks ?? null;
  const indices = [...new Set([...Object.keys(key ?? {}), ...Object.keys(given)])].sort((a, b) => Number(a) - Number(b));
  if (indices.length === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ul className="space-y-2">
        {indices.map(n => {
          const mine = given[n];
          const accepted = key?.[n] ?? [];
          // Case-insensitive like the grader's default; a case-sensitive blank still gets the right
          // verdict when the whole question is correct.
          const ok = key ? q.isCorrect === true || (!!mine?.trim() && accepted.some(a => same(a, mine))) : null;
          return (
            <MarkedRow key={n} ok={ok} prefix={`(${n})`} expected={accepted.length ? accepted.join(' / ') : undefined}>
              {mine?.trim() ? mine : <Missing />}
            </MarkedRow>
          );
        })}
      </ul>
    </div>
  );
}
