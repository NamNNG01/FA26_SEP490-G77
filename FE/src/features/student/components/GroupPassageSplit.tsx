import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/assets/icons';
import { QuestionText } from './QuestionAnswerInput';

export interface GroupPassage {
  groupId: number;
  title: string | null;
  passageText: string | null;
}

/**
 * A question of a question group (reading passage): the passage on the left (40%, or 30% when
 * `narrow`) and the question on the right (60% / 70%), each scrolling on its own — like the CODE workspace.
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

  // A new group starts expanded again.
  useEffect(() => setOpen(true), [passage?.groupId]);

  if (!passage) return <main className={`flex-1 overflow-y-auto ${mainClassName}`}>{children}</main>;

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      <section
        aria-label="Reading passage"
        className={`flex-shrink-0 ${narrow ? 'md:w-[30%]' : 'md:w-2/5'} md:min-h-0 md:flex md:flex-col bg-surface border-b md:border-b-0 md:border-r border-line-soft`}
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
      <main className={`flex-1 min-h-0 overflow-y-auto ${mainClassName}`}>{children}</main>
    </div>
  );
}
