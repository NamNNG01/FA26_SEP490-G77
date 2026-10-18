import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * StatCard — one headline metric.
 *
 * Deliberately quiet: a small neutral icon beside the label, the number in
 * the display face, and an optional delta. No per-card colour tile — when
 * every card shouts in a different hue, none of them stands out.
 *
 * `direction` says which way is good news, so the delta is coloured by
 * meaning, not by sign: up (default — revenue, pass rate), down (error
 * rate, refunds, cost: a drop is green) or neutral (e.g. completion time,
 * where a change is neither good nor bad on its own — shown grey).
 */
export function StatCard({ title, value, change, changeLabel, icon, direction = 'up', footer }: {
  /** Usually a string; a node allows e.g. a definition tooltip beside the label. */
  title: React.ReactNode; value: string; change?: number; changeLabel?: string; icon: React.ReactNode;
  direction?: 'up' | 'down' | 'neutral';
  /** Extra line under the value, e.g. a quota bar or a short note. */
  footer?: React.ReactNode;
}) {
  const deltaTone =
    change === undefined || direction === 'neutral'
      ? 'text-content-soft'
      : (direction === 'down' ? change <= 0 : change >= 0)
        ? 'text-success'
        : 'text-danger';

  // Long values (e.g. VND totals) step down a size so they stay inside the card.
  const valueSize = value.length > 16 ? 'text-lg' : value.length > 12 ? 'text-xl' : 'text-2xl';

  return (
    <div className="card p-5 flex flex-col gap-3 h-full min-w-0">
      <div className="flex items-center gap-2 text-content-soft">
        <span className="w-4 h-4 flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4" aria-hidden>{icon}</span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className={`font-[family-name:var(--font-display)] ${valueSize} font-bold text-content leading-tight tracking-tight [overflow-wrap:anywhere]`}>{value}</p>
      {change !== undefined && (
        <div className="flex items-center gap-1.5">
          <div className={`flex items-center gap-0.5 text-sm font-medium ${deltaTone}`}>
            {change >= 0 ? <Icon.ArrowUp className="w-3.5 h-3.5" /> : <Icon.ArrowDown className="w-3.5 h-3.5" />}
            {Math.abs(change)}%
          </div>
          {changeLabel && <span className="text-sm text-content-subtle">{changeLabel}</span>}
        </div>
      )}
      {footer && <div className="mt-auto">{footer}</div>}
    </div>
  );
}
