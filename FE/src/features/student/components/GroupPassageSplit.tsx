import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Icon } from '@/assets/icons';
import { QuestionText } from './QuestionAnswerInput';

export interface GroupPassage {
  groupId: number;
  title: string | null;
  passageText: string | null;
}

/** Passage column width (md+), in % of the row: default, bounds and the keyboard step. */
const PASSAGE_WIDTH = { default: 30, narrowDefault: 20, min: 15, max: 70, step: 5 };
const widthKey = (narrow: boolean) => `examprep.passageWidth.${narrow ? 'practice' : 'exam'}`;

function readWidth(narrow: boolean): number {
  const fallback = narrow ? PASSAGE_WIDTH.narrowDefault : PASSAGE_WIDTH.default;
  try {
    const stored = Number(localStorage.getItem(widthKey(narrow)));
    return stored >= PASSAGE_WIDTH.min && stored <= PASSAGE_WIDTH.max ? stored : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A question of a question group (reading passage): the passage on the left (30%, or 20% when
 * `narrow`) and the question on the right, each scrolling on its own — like the CODE workspace.
 * The divider between them drags (or takes ←/→) to resize the passage; the width is remembered.
 * Below `md` they stack: the passage on top, at most 40% of the screen, and it can be collapsed.
 * Without a passage only `children` is rendered, inside the same scrolling `main`.
 */
export function GroupPassageSplit({
  group,
  mainClassName = '',
  narrow = false,
  children,
}: {
  group: GroupPassage | null | undefined;
  mainClassName?: string;
  /** Passage 30% / question 70% instead of 40 / 60 (Module Practice). */
  narrow?: boolean;
  children: ReactNode;
}) {
  const passage = group?.passageText?.trim() ? group : null;
  const [open, setOpen] = useState(true);

  const [width, setWidth] = useState(() => readWidth(narrow));
  const [dragging, setDragging] = useState(false);
  const row = useRef<HTMLDivElement>(null);

  // A new group starts expanded again.
  useEffect(() => setOpen(true), [passage?.groupId]);

  // Takes the new width, or a step from the current one (so quick key repeats don't read a stale width).
  const resize = (next: number | ((current: number) => number)) =>
    setWidth(current => {
      const raw = typeof next === 'function' ? next(current) : next;
      const w = Math.round(Math.min(PASSAGE_WIDTH.max, Math.max(PASSAGE_WIDTH.min, raw)) * 10) / 10;
      try {
        localStorage.setItem(widthKey(narrow), String(w));
      } catch {
        /* not remembered — still resized */
      }
      return w;
    });

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = row.current;
    if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const { left, width: total } = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => resize(((ev.clientX - left) / total) * 100);
    const stop = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  if (!passage) return <main className={`flex-1 overflow-y-auto ${mainClassName}`}>{children}</main>;

  return (
    <div
      ref={row}
      style={{ '--passage-w': `${width}%` } as CSSProperties}
      className={`flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden ${dragging ? 'select-none cursor-col-resize' : ''}`}
    >
      <section
        aria-label="Reading passage"
        id="reading-passage"
        className="flex-shrink-0 md:w-[var(--passage-w)] md:min-h-0 md:flex md:flex-col bg-surface border-b md:border-b-0 border-line-soft"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="md:hidden w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <Icon.BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="truncate">{passage.title || 'Reading passage'}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-content-soft flex-shrink-0">
            {open ? 'Hide' : 'Show'}
            <Icon.ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
        <div
          className={`${open ? 'block' : 'hidden'} md:block max-h-[40vh] md:max-h-none md:flex-1 overflow-y-auto px-4 pb-4 md:p-[clamp(1rem,2.5vw,1.5rem)]`}
        >
          <p className="hidden md:flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-subtle mb-3">
            <Icon.BookOpen className="w-4 h-4 text-primary" /> Reading passage
          </p>
          {passage.title && <h3 className="hidden md:block text-base font-semibold text-content mb-2">{passage.title}</h3>}
          <QuestionText content={passage.passageText ?? ''} className="text-sm text-content-secondary leading-relaxed" />
        </div>
      </section>
      {/* Drag (or ←/→, Home resets) to resize the passage; desktop only — stacked on a phone. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-controls="reading-passage"
        aria-label="Resize reading passage"
        aria-valuenow={width}
        aria-valuemin={PASSAGE_WIDTH.min}
        aria-valuemax={PASSAGE_WIDTH.max}
        tabIndex={0}
        title="Drag to resize the passage (double-click to reset)"
        onPointerDown={startDrag}
        onDoubleClick={() => resize(narrow ? PASSAGE_WIDTH.narrowDefault : PASSAGE_WIDTH.default)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') resize(w => w - PASSAGE_WIDTH.step);
          else if (e.key === 'ArrowRight') resize(w => w + PASSAGE_WIDTH.step);
          else if (e.key === 'Home') resize(narrow ? PASSAGE_WIDTH.narrowDefault : PASSAGE_WIDTH.default);
          else return;
          e.preventDefault();
        }}
        className={`group hidden md:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center border-l border-line-soft touch-none transition-colors hover:bg-primary-light focus-visible:bg-primary-light focus-visible:outline-none ${
          dragging ? 'bg-primary-light' : ''
        }`}
      >
        <span className={`h-10 w-0.5 rounded-full transition-colors group-hover:bg-primary group-focus-visible:bg-primary ${dragging ? 'bg-primary' : 'bg-line'}`} />
      </div>
      <main className={`flex-1 min-h-0 overflow-y-auto ${mainClassName}`}>{children}</main>
    </div>
  );
}
