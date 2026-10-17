import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * Tab strip.
 *
 * - `pill`      — grey container, white active chip. Segmented controls.
 * - `solid`     — bare buttons, active tab filled with the brand colour.
 * - `underline` — GitHub / Linear / Notion style: a hairline rule across the
 *                 strip with a brand underline on the active label.
 *
 * Style maps are keyed by variant so adding one is a single map entry rather
 * than another nested ternary. `pill` and `solid` classes are unchanged.
 */
export type TabsVariant = 'pill' | 'solid' | 'underline';

const containers: Record<TabsVariant, string> = {
  pill: 'flex gap-0.5 bg-surface-muted p-1 rounded-[10px]',
  solid: 'flex flex-wrap items-center gap-1',
  underline: 'flex items-center gap-1 border-b border-line',
};

const tabBase: Record<TabsVariant, string> = {
  pill: 'px-4 py-1.5 rounded-[8px] text-sm font-medium transition-all',
  solid: 'px-3.5 py-2 rounded-[10px] text-sm font-medium transition-all',
  underline:
    'relative px-3.5 py-2.5 text-sm font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full',
};

const tabActive: Record<TabsVariant, string> = {
  pill: 'bg-surface text-content shadow-sm',
  solid: 'bg-primary text-white shadow-sm',
  underline: 'text-primary after:bg-primary',
};

const tabIdle: Record<TabsVariant, string> = {
  pill: 'text-content-soft hover:text-content-secondary',
  solid: 'text-muted-foreground hover:bg-accent hover:text-foreground',
  underline: 'text-muted-foreground after:bg-transparent hover:text-foreground',
};

export function Tabs({ tabs, active, onChange, variant = 'pill' }: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
  variant?: TabsVariant;
}) {
  return (
    <div role="tablist" className={containers[variant]}>
      {tabs.map(tab => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={`${tabBase[variant]} ${active === tab ? tabActive[variant] : tabIdle[variant]}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
