import { Suspense, lazy, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  SOURCE_CODE_MAX_BYTES,
  studentCodeExamService,
  type CodeLanguage,
  type CodeLanguageInfo,
  type CodeQuestion,
  type CodeRunResult,
  type CodeSubmitAnswer,
} from '@/services/studentCodeExam.service';
import type { AnswerResponse, AttemptQuestion } from '@/services/studentAttempt.service';
import { QuestionText } from '../QuestionAnswerInput';
import { CodeTerminal, type TerminalTab } from './CodeTerminal';
import { byteLength } from './codeSize';

const CodeEditor = lazy(() => import('./CodeEditor'));

const TERMINAL_MIN = 80;
const TERMINAL_COLLAPSED = 32;
const TERMINAL_MAX_RATIO = 0.7;
const TERMINAL_DEFAULT = 180;
const TERMINAL_HEIGHT_KEY = 'code-terminal-height';

/**
 * The one language the manager set for the question (CD-03); one stored with several uses its
 * first. Falls back to the first CD-06 language, '' while neither has loaded.
 */
function questionLanguage(meta: CodeQuestion | null, languages: CodeLanguageInfo[]): CodeLanguage {
  return meta?.languages?.[0] ?? languages[0]?.id ?? '';
}

function storedTerminalHeight(): number {
  try {
    const n = Number(localStorage.getItem(TERMINAL_HEIGHT_KEY));
    return Number.isFinite(n) && n >= TERMINAL_MIN ? n : TERMINAL_DEFAULT;
  } catch {
    return TERMINAL_DEFAULT;
  }
}

/**
 * What CD-05 grades for one CODE question: the code in the attempt draft (`text`) in the
 * question's language. Null when there is no code.
 */
export function currentCodeAnswer(
  questionId: number,
  meta: CodeQuestion | null,
  languages: CodeLanguageInfo[],
  text: string | undefined,
): CodeSubmitAnswer | null {
  if (!text?.trim()) return null;
  const language = questionLanguage(meta, languages);
  return language ? { questionId, language, sourceCode: text } : null;
}

/**
 * A CODE question while taking the exam: the question on the left (20%), a VS Code–style
 * editor with Run and a resizable terminal on the right (80%). Stacked on narrow screens.
 * The language is fixed by the question; the code goes to the attempt draft through `onChange({ text })`.
 */
export function CodeQuestionWorkspace({
  question,
  meta,
  languages,
  value,
  onChange,
}: {
  question: AttemptQuestion;
  meta: CodeQuestion | null;
  languages: CodeLanguageInfo[];
  value: AnswerResponse | null;
  onChange: (response: AnswerResponse) => void;
}) {
  const language = questionLanguage(meta, languages);
  const languageName = languages.find(l => l.id === language)?.name ?? language;

  // Code the student typed; until then the editor shows the template, which is not an answer.
  const [typed, setTyped] = useState<string | null>(() => value?.text ?? null);
  const source = typed ?? meta?.codeTemplate ?? '';

  const changeSource = (text: string) => {
    setTyped(text);
    onChange({ text });
  };

  // Run (CD-04)
  const [stdin, setStdin] = useState(meta?.sampleInput ?? '');
  const stdinTouched = useRef(false);
  useEffect(() => {
    if (!stdinTouched.current) setStdin(meta?.sampleInput ?? '');
  }, [meta?.sampleInput]);
  const [tab, setTab] = useState<TerminalTab>('Output');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const tooLarge = byteLength(source) > SOURCE_CODE_MAX_BYTES;
  const canRun = !running && !tooLarge && source.trim() !== '' && language !== '';

  const run = useCallback(async () => {
    if (!canRun) return;
    setRunning(true);
    setTab('Output');
    setRunError(null);
    setCollapsed(false);
    try {
      setResult(await studentCodeExamService.run({ questionId: question.questionId, language, sourceCode: source, stdin }));
    } catch (err) {
      setResult(null);
      setRunError(getApiErrorMessage(err, 'Failed to run your code.'));
    } finally {
      setRunning(false);
    }
  }, [canRun, question.questionId, language, source, stdin]);

  // Terminal splitter
  const columnRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(storedTerminalHeight);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const col = columnRef.current;
    if (!dragging.current || !col) return;
    const rect = col.getBoundingClientRect();
    const max = Math.max(TERMINAL_MIN, rect.height * TERMINAL_MAX_RATIO);
    setHeight(Math.min(max, Math.max(TERMINAL_MIN, rect.bottom - e.clientY)));
    setCollapsed(false);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    try {
      localStorage.setItem(TERMINAL_HEIGHT_KEY, String(Math.round(height)));
    } catch {
      // Not remembered — fine.
    }
  };
  const onSplitterKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setCollapsed(false);
    setHeight(h => Math.max(TERMINAL_MIN, h + (e.key === 'ArrowUp' ? 20 : -20)));
  };

  return (
    <div className="grid gap-3 md:h-full md:min-h-0 md:grid-cols-[1fr_4fr]">
      {/* Question */}
      <section className="card min-h-0 overflow-auto p-4 space-y-4">
        <QuestionText content={question.content} className="text-sm leading-relaxed text-content" />
        <SampleBlock label="Sample input" text={meta?.sampleInput ?? null} />
        <SampleBlock label="Sample output" text={meta?.sampleOutput ?? null} />
      </section>

      {/* Editor + terminal */}
      <section ref={columnRef} className="card flex h-[75vh] min-h-0 flex-col overflow-hidden p-0 md:h-auto">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-line-soft px-3 py-2">
          {language ? (
            <span className="inline-flex h-8 items-center rounded-[8px] border border-line-soft bg-surface-alt px-3 text-xs text-content-soft">
              Language:&nbsp;<span className="font-semibold text-content">{languageName}</span>
            </span>
          ) : (
            <Skeleton className="h-8 w-32" />
          )}
          {tooLarge && <span className="text-xs text-danger">Code is larger than 100 KB.</span>}
          <Button
            size="sm"
            className="ml-auto"
            title="Run (Ctrl+Enter)"
            disabled={!canRun}
            loading={running}
            icon={<Icon.Play className="h-3.5 w-3.5" />}
            onClick={() => void run()}
          >
            Run
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            {language ? (
              <CodeEditor key={language} language={language} value={source} onChange={changeSource} onRun={() => void run()} />
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </Suspense>
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal"
          tabIndex={0}
          title="Drag to resize, double-click to collapse"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={() => setCollapsed(c => !c)}
          onKeyDown={onSplitterKey}
          className="h-1.5 flex-shrink-0 cursor-row-resize touch-none border-t border-line-soft bg-surface-alt hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none"
        />
        <div className="flex-shrink-0 overflow-hidden" style={{ height: collapsed ? TERMINAL_COLLAPSED : height }}>
          <CodeTerminal
            tab={tab}
            onTabChange={t => {
              setTab(t);
              setCollapsed(false);
            }}
            result={result}
            error={runError}
            running={running}
            stdin={stdin}
            sampleInput={meta?.sampleInput ?? null}
            onStdinChange={v => {
              stdinTouched.current = true;
              setStdin(v);
            }}
          />
        </div>
      </section>
    </div>
  );
}

function SampleBlock({ label, text }: { label: string; text: string | null }) {
  const [copied, setCopied] = useState(false);
  if (text == null) return null;
  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">{label}</h3>
        <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="text-content-subtle hover:text-content">
          {copied ? <Icon.Check className="h-3.5 w-3.5" /> : <Icon.Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-[6px] border border-line-soft bg-surface-alt p-2 font-mono text-xs text-content">{text}</pre>
    </div>
  );
}
