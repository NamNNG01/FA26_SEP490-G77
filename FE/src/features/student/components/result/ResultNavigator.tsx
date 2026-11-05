import { useEffect, useState } from 'react';
import { Icon } from '@/assets/icons';

/** Label and palette cell (solid fill, so the status reads at a glance in both themes) of one outcome. */
export type OutcomeMeta<O extends string> = Record<O, { label: string; cell: string }>;

/** Typing in a field (or a picker) keeps its arrow keys. */
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.getAttribute('role') === 'combobox');

/** ← → call the current Previous / Next (read from the ref on every key, so it may change each render). */
export function useArrowKeyNav(navRef: React.RefObject<{ prev?: () => void; next?: () => void }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTypingTarget(e.target)) return;
      // A dialog on top owns the keyboard.
      if (document.querySelector('[role="dialog"]')) return;
      const go = e.key === 'ArrowLeft' ? navRef.current?.prev : e.key === 'ArrowRight' ? navRef.current?.next : undefined;
      if (!go) return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navRef]);
}

/** "Question 3 of 40" with compact Previous / Next, above the question card. */
export function QuestionNav({
  current,
  total,
  onPrev,
  onNext,
}: {
  current: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const arrow = 'w-9 h-9 rounded-[8px] border border-line flex items-center justify-center text-content-secondary hover:bg-accent disabled:opacity-40 disabled:pointer-events-none';
  return (
    <div className="flex items-center gap-3">
      <p className="flex-1 min-w-0 text-sm text-content-soft" aria-live="polite">
        <span className="font-semibold text-content">Question {current + 1}</span> of {total}
      </p>
      <span className="hidden sm:inline text-xs text-content-subtle">Use ← → to move</span>
      <div className="flex gap-1.5">
        <button type="button" className={arrow} aria-label="Previous question" disabled={!onPrev} onClick={onPrev}>
          <Icon.ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" className={arrow} aria-label="Next question" disabled={!onNext} onClick={onNext}>
          <Icon.ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Every question as a numbered cell filled with its outcome's colour (legend
 * with counts below); a click opens it. On small screens the grid folds
 * behind a "Questions 3 / 40" toggle.
 */
export function ResultPalette<O extends string>({
  outcomes,
  meta,
  current,
  onSelect,
}: {
  outcomes: O[];
  /** Also the legend's order. */
  meta: OutcomeMeta<O>;
  current: number;
  onSelect: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const counts = new Map<O, number>();
  outcomes.forEach(o => counts.set(o, (counts.get(o) ?? 0) + 1));
  const present = (Object.keys(meta) as O[]).filter(o => counts.has(o));
  return (
    <div className="card p-4 space-y-3 min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="result-palette"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-2 text-left lg:pointer-events-none"
      >
        <span className="text-sm font-semibold text-content">Questions</span>
        <span className="flex items-center gap-1 text-xs text-content-subtle">
          {current + 1} / {outcomes.length}
          <Icon.ChevronDown className={`w-4 h-4 lg:hidden transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <div id="result-palette" className={`${expanded ? 'block' : 'hidden'} lg:block space-y-3`}>
        {/* p-1.5: room for the current cell's ring (2px + 2px offset) inside the scroll box, which
            would clip it. No negative margin here — Tailwind v4's space-y sets margin-bottom, so one
            would pull the legend up over the last row. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] auto-rows-[2.5rem] gap-2 max-h-[min(45vh,20rem)] overflow-y-auto p-1.5">
          {outcomes.map((o, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(i);
                setExpanded(false);
              }}
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Question ${i + 1}, ${meta[o].label.toLowerCase()}`}
              title={`Question ${i + 1} · ${meta[o].label}`}
              className={`h-full rounded-[8px] text-sm font-semibold transition-all ${meta[o].cell} ${
                i === current ? 'ring-2 ring-content ring-offset-2 ring-offset-surface' : 'hover:brightness-110'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {present.map(o => (
            <li key={o} className="flex items-center gap-1.5 text-xs text-content-soft">
              <span className={`w-3 h-3 rounded-[3px] ${meta[o].cell}`} aria-hidden="true" />
              {meta[o].label} <span className="text-content-subtle">({counts.get(o)})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
