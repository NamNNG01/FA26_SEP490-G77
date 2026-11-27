import { Suspense, lazy, useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
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
/** Question panel width, in % of the workspace (md and up). */
const QUESTION_MIN = 15;
const QUESTION_MAX = 60;
const QUESTION_DEFAULT = 25;
const QUESTION_WIDTH_KEY = 'code-question-width';

function storedQuestionWidth(): number {
  try {
    const n = Number(localStorage.getItem(QUESTION_WIDTH_KEY));
    return Number.isFinite(n) && n >= QUESTION_MIN && n <= QUESTION_MAX ? n : QUESTION_DEFAULT;
  } catch {
    return QUESTION_DEFAULT;
  }
}

/**
 * The one language the manager set for the question (CD-03); one stored with several uses its
 * first. A question stored with none falls back to the language saved with the answer. Never a
 * guess: '' while CD-03 has not loaded, so code is not run or graded in the wrong language.
 */
function questionLanguage(
  meta: CodeQuestion | null,
  saved: string | undefined,
  loadingMeta: boolean,
  languages: CodeLanguageInfo[],
): CodeLanguage {
  if (meta) return meta.languages?.[0] ?? saved ?? languages[0]?.id ?? 'JAVA';
  if (loadingMeta) return '';
  return saved || languages[0]?.id || 'JAVA';
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
 * question's language. Null when there is no code; `language` is '' when it is not known yet.
 */
export function currentCodeAnswer(
  questionId: number,
  meta: CodeQuestion | null,
  response: AnswerResponse | null | undefined,
): CodeSubmitAnswer | null {
  const text = response?.text;
  if (!text?.trim()) return null;
  const lang = meta ? (meta.languages?.[0] ?? response?.language ?? '') : (response?.language ?? '');
  return { questionId, language: lang, sourceCode: text };
}

/**
 * A CODE question while taking the exam: the question on the left (resizable), a VS Code–style
 * editor with Run and a resizable terminal on the right. Stacked on narrow screens. When the
 * question is in function mode, the student writes only a function; the BE runs it inside a hidden driver.
 * The language is fixed by the question; the code goes to the attempt draft through `onChange({ text })`.
 */
export function CodeQuestionWorkspace({
  question,
  meta,
  languages,
  value,
  onChange,
  loadingMeta = false,
  readOnly = false,
}: {
  question: AttemptQuestion;
  meta: CodeQuestion | null;
  languages: CodeLanguageInfo[];
  value: AnswerResponse | null;
  onChange: (response: AnswerResponse) => void;
  loadingMeta?: boolean;
  readOnly?: boolean;
}) {
  const language = questionLanguage(meta, value?.language, loadingMeta, languages);
  const languageName = languages.find(l => l.id === language)?.name ?? language;
  /** CD-03 loaded but the question has no language: nothing to run or grade in. */
  const noLanguage = !loadingMeta && language === '';

  // Code the student typed; until then the editor shows the template, which is not an answer.
  // In function mode that is only their function: the BE puts the hidden driver around it.
  const [typed, setTyped] = useState<string | null>(() => value?.text ?? null);
  const source = typed ?? meta?.codeTemplate ?? '';

  // The language goes with the code, so a reload and CD-05 use the one it was written in.
  const changeSource = (text: string) => {
    setTyped(text);
    onChange(language ? { text, language } : { text });
  };

  // Run (CD-04)
  // Starts on the sample input until the student types their own.
  const [stdinTyped, setStdin] = useState<string | null>(null);
  const stdin = stdinTyped ?? meta?.sampleInput ?? '';
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

  // Question / editor splitter
  const rowRef = useRef<HTMLDivElement>(null);
  const [questionWidth, setQuestionWidth] = useState(storedQuestionWidth);
  const draggingWidth = useRef(false);
  // The width the drag ended on; state may not have re-rendered by pointerup.
  const latestWidth = useRef(questionWidth);
  const clampWidth = (n: number) => Math.min(QUESTION_MAX, Math.max(QUESTION_MIN, n));
  const saveWidth = (n: number) => {
    try {
      localStorage.setItem(QUESTION_WIDTH_KEY, String(Math.round(n)));
    } catch {
      // Not remembered — fine.
    }
  };
  const onWidthPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingWidth.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onWidthPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!draggingWidth.current || !row) return;
    const rect = row.getBoundingClientRect();
    latestWidth.current = clampWidth(((e.clientX - rect.left) / rect.width) * 100);
    setQuestionWidth(latestWidth.current);
  };
  const onWidthPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingWidth.current) return;
    draggingWidth.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    saveWidth(latestWidth.current);
  };
  const onWidthKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = clampWidth(questionWidth + (e.key === 'ArrowRight' ? 2 : -2));
    setQuestionWidth(next);
    saveWidth(next);
  };

  return (
    <div
      ref={rowRef}
      className="flex flex-col gap-3 md:h-full md:min-h-0 md:flex-row md:gap-0"
      style={{ '--question-width': `${questionWidth}%` } as CSSProperties}
    >
      {/* Question */}
      <section className="card min-h-0 overflow-auto p-4 space-y-4 md:w-[var(--question-width)] md:flex-shrink-0">
        <QuestionText content={question.content} className="text-sm leading-relaxed text-content" />
        <SampleBlock label="Sample input" text={meta?.sampleInput ?? null} />
        <SampleBlock label="Sample output" text={meta?.sampleOutput ?? null} />
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize question panel"
        aria-valuenow={Math.round(questionWidth)}
        aria-valuemin={QUESTION_MIN}
        aria-valuemax={QUESTION_MAX}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        onPointerDown={onWidthPointerDown}
        onPointerMove={onWidthPointerMove}
        onPointerUp={onWidthPointerUp}
        onDoubleClick={() => {
          setQuestionWidth(QUESTION_DEFAULT);
          saveWidth(QUESTION_DEFAULT);
        }}
        onKeyDown={onWidthKey}
        className="group hidden w-3 flex-shrink-0 cursor-col-resize touch-none items-stretch justify-center focus-visible:outline-none md:flex"
      >
        <span className="my-2 w-1 rounded-full bg-line-soft group-hover:bg-primary/40 group-focus-visible:bg-primary/50" />
      </div>

      {/* Editor + terminal */}
      <section ref={columnRef} className="card flex h-[75vh] min-h-0 min-w-0 flex-col overflow-hidden p-0 md:h-auto md:flex-1">
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-line-soft px-3 py-2">
          {language ? (
            <span className="inline-flex h-8 items-center rounded-[8px] border border-line-soft bg-surface-alt px-3 text-xs text-content-soft">
              Language:&nbsp;<span className="font-semibold text-content">{languageName}</span>
            </span>
          ) : noLanguage ? (
            <span className="text-xs text-danger">This question has no language set, so it cannot be run.</span>
          ) : (
            <Skeleton className="h-8 w-32" />
          )}
          {tooLarge && <span className="text-xs text-danger">Code is larger than 64 KB.</span>}
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

        {meta?.functionMode && (
          <p className="flex-shrink-0 border-b border-line-soft bg-surface-alt px-3 py-1.5 text-xs text-content-soft">
            The input is read for you and passed to your function, and what it returns is printed. Write only the
            function — don&apos;t read the input or print the result yourself.
          </p>
        )}
        <div className="min-h-[260px] flex-1">
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            {language ? (
              <CodeEditor key={language} language={language} value={source} onChange={changeSource} onRun={() => void run()} readOnly={readOnly} />
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
            onStdinChange={setStdin}
          />
        </div>
      </section>
    </div>
  );
}

function SampleBlock({ label, text }: { label: string; text: string | null }) {
  if (text == null) return null;
  return (
    <div>
      <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-content-subtle">{label}</h3>
      {/* Drag the corner to make it taller or shorter. */}
      <pre className="min-h-[2.5rem] max-h-[60vh] resize-y overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-line-soft bg-surface-alt p-2 font-mono text-xs text-content">{text}</pre>
    </div>
  );
}
