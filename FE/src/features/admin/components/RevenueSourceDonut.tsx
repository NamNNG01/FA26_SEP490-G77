import React, { useState } from 'react';
import type { CourseRevenue, PlanRevenue } from '../data/adminDashboardDemo';
import { formatCompact, formatVnd } from '../utils/dashboardFormat';

const SIZE = 168;
const STROKE = 26;
/** Extra stroke on the hovered arc; the radius leaves room so it never clips. */
const HOVER_GROW = 6;
const R = (SIZE - STROKE - HOVER_GROW) / 2;
const C = 2 * Math.PI * R;
/** Surface-coloured gap between the two arcs, in px along the ring. */
const GAP = 2;

type SliceId = 'course' | 'ai';

/**
 * Revenue share by source. Hovering (or focusing) a slice or its legend row
 * opens a floating breakdown above that row: the 3 best-selling courses for
 * course sales, revenue per plan for AI subscription. The popover overlays
 * the card instead of taking space in it, so the layout never shifts.
 */
export function RevenueSourceDonut({
  courseSales,
  aiSubscription,
  aiPlans,
  topSellingCourses,
}: {
  courseSales: number;
  aiSubscription: number;
  aiPlans: PlanRevenue[];
  topSellingCourses: CourseRevenue[];
}) {
  const [active, setActive] = useState<SliceId | null>(null);
  const total = courseSales + aiSubscription;
  const pct = (v: number) => String(total ? Math.round((v / total) * 1000) / 10 : 0).replace('.', ',');

  const slices = [
    {
      id: 'course' as const,
      label: 'Course sales',
      value: courseSales,
      color: 'var(--chart-1)',
      breakdownTitle: 'Top 3 best-selling courses',
      breakdown: topSellingCourses.map((c) => ({ name: c.title, value: c.revenue })),
    },
    {
      id: 'ai' as const,
      label: 'AI subscription',
      value: aiSubscription,
      color: 'var(--chart-2)',
      breakdownTitle: 'Revenue by plan',
      breakdown: aiPlans.map((p) => ({ name: p.plan, value: p.revenue })),
    },
  ];

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = total ? (s.value / total) * C : 0;
    const arc = { ...s, dash: Math.max(len - GAP, 0), offset };
    offset += len;
    return arc;
  });

  const hoverHandlers = (id: SliceId) => ({
    onPointerEnter: () => setActive(id),
    onPointerLeave: () => setActive(null),
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Revenue share by source" className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-surface-muted)" strokeWidth={STROKE} />
          {total > 0 &&
            arcs.map((a) => (
              <circle
                key={a.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={active === a.id ? STROKE + HOVER_GROW : STROKE}
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={-a.offset}
                className="cursor-pointer transition-[stroke-width]"
                {...hoverHandlers(a.id)}
              />
            ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xs text-content-subtle">Total</span>
          <span className="text-lg font-bold text-content tabular-nums">{formatCompact(total)} ₫</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5 min-w-0">
        {slices.map((s) => (
          <li
            key={s.id}
            tabIndex={0}
            {...hoverHandlers(s.id)}
            onFocus={() => setActive(s.id)}
            onBlur={() => setActive(null)}
            aria-describedby={`source-breakdown-${s.id}`}
            className={`relative rounded-[10px] px-3 py-2 outline-none cursor-default transition-colors ${active === s.id ? 'bg-surface-muted' : ''} focus-visible:ring-2 focus-visible:ring-brand-600/30`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <span className="text-sm text-content-secondary flex-1 truncate">{s.label}</span>
              <span className="text-sm font-semibold text-content tabular-nums">{pct(s.value)}%</span>
            </div>
            <p className="text-xs text-content-soft tabular-nums pl-[18px]">{formatVnd(s.value)}</p>

            <div
              id={`source-breakdown-${s.id}`}
              role="tooltip"
              className={`pointer-events-none absolute inset-x-0 bottom-full mb-1.5 z-20 rounded-[10px] border border-line bg-surface p-3 shadow-lg transition-opacity ${active === s.id ? 'opacity-100' : 'opacity-0 invisible'}`}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-content mb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.breakdownTitle}
              </p>
              {s.breakdown.length === 0 ? (
                <p className="text-xs text-content-soft">No sales in this period.</p>
              ) : (
                <ol className="space-y-1.5">
                  {s.breakdown.map((row, i) => (
                    <li key={row.name} className="flex items-baseline gap-2 text-xs">
                      <span className="text-content-subtle tabular-nums w-3">{i + 1}</span>
                      <span className="text-content-secondary flex-1 min-w-0 truncate" title={row.name}>
                        {row.name}
                      </span>
                      <span className="text-content font-medium tabular-nums whitespace-nowrap">{formatVnd(row.value)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </li>
        ))}
        <li className="text-2xs text-content-subtle px-3 pt-1">Hover a source to see its breakdown.</li>
      </ul>
    </div>
  );
}
