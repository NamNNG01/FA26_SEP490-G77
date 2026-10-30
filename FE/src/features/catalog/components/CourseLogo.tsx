import React from 'react';

/** Tile colours for courses without a thumbnail — picked by a stable hash of the title. */
const TILE_COLORS = ['#0D7C6C', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#0891B2', '#4F46E5', '#059669'];

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

function colorFor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(h) % TILE_COLORS.length];
}

/**
 * CourseLogo — the course thumbnail as a square tile, or the course initials
 * on a colour tile when the course has none. Background is inline so the
 * dark-mode colour remaps never touch it.
 */
export function CourseLogo({
  title,
  thumbnailUrl,
  size = 40,
  className = '',
}: {
  title: string;
  thumbnailUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const box = `inline-flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-sm ${className}`;
  if (thumbnailUrl) {
    return (
      <span aria-hidden className={box} style={{ width: size, height: size }}>
        <img src={thumbnailUrl} alt="" width={size} height={size} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} font-bold text-white`}
      style={{ width: size, height: size, background: colorFor(title), fontSize: Math.round(size * 0.36) }}
    >
      {initials(title)}
    </span>
  );
}

/** "Free" for 0 / missing, otherwise VND — the amount PayOS charges, e.g. "99.000 ₫". */
export function formatPrice(price: number | null | undefined): string {
  const value = Number(price ?? 0);
  if (!value) return 'Free';
  return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} ₫`;
}
