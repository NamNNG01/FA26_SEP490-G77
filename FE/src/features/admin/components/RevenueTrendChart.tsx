import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Granularity, RevenuePoint } from '../data/adminDashboardDemo';
import { formatCompact, formatPeriod, formatVnd } from '../utils/dashboardFormat';

const HEIGHT = 240;
const PAD = { top: 12, right: 24, bottom: 28, left: 52 };

export const REVENUE_SERIES = [
  { key: 'courseSales', label: 'Course sales', color: 'var(--chart-1)' },
  { key: 'aiSubscription', label: 'AI subscription', color: 'var(--chart-2)' },
] as const;

/** Rounds the axis maximum up to a 1/2/2.5/5 × 10^n step so ticks read cleanly. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  return (steps.find((s) => s * exp >= value) ?? 10) * exp;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Two-line revenue trend (course sales vs AI subscription) on one VND axis,
 * with a crosshair tooltip showing both values for the hovered period.
 */
export function RevenueTrendChart({ data, granularity }: { data: RevenuePoint[]; granularity: Granularity }) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(260);
  useLayoutEffect(() => {
    if (tooltipRef.current) setTooltipWidth(tooltipRef.current.offsetWidth);
  }, [hover]);

  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const max = useMemo(
    () => niceMax(Math.max(0, ...data.flatMap((p) => [p.courseSales, p.aiSubscription]))),
    [data],
  );

  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 64))));

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD.left;
    const i = data.length === 1 ? 0 : Math.round((px / plotW) * (data.length - 1));
    setHover(Math.min(Math.max(i, 0), data.length - 1));
  };

  const hovered = hover !== null ? data[hover] : null;
  // Sit right of the crosshair; flip to the left side when it would overflow.
  let tooltipLeft = 0;
  if (hover !== null) {
    const right = x(hover) + 14;
    tooltipLeft = right + tooltipWidth <= width ? right : Math.max(x(hover) - 14 - tooltipWidth, 0);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Revenue over time by source"
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-none"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-content-subtle text-[11px]">
              {formatCompact(t)}
            </text>
          </g>
        ))}

        {data.map((p, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={p.period} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-content-subtle text-[11px]">
              {formatPeriod(p.period, granularity, true)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--color-line-strong)" strokeWidth={1} />
        )}

        {REVENUE_SERIES.map((s) => (
          <polyline
            key={s.key}
            points={data.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {(data.length <= 31 ? data.map((_, i) => i) : hover !== null ? [hover] : []).map((i) =>
          REVENUE_SERIES.map((s) => (
            <circle
              key={`${s.key}-${i}`}
              cx={x(i)}
              cy={y(data[i][s.key])}
              r={hover === i ? 5 : 3}
              fill={s.color}
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          )),
        )}
      </svg>

      {hovered && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute top-2 z-10 w-max min-w-[240px] whitespace-nowrap rounded-[10px] border border-line bg-surface px-3.5 py-2.5 shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <p className="text-xs font-semibold text-content mb-1.5">{formatPeriod(hovered.period, granularity)}</p>
          {REVENUE_SERIES.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-6 text-xs">
              <span className="flex items-center gap-1.5 text-content-soft">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium text-content tabular-nums">{formatVnd(hovered[s.key])}</span>
            </div>
          ))}
          <div className="mt-1.5 pt-1.5 border-t border-line-soft flex justify-between text-xs">
            <span className="text-content-soft">Total</span>
            <span className="font-semibold text-content tabular-nums">
              {formatVnd(hovered.courseSales + hovered.aiSubscription)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
