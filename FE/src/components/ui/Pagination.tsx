import React, { useState } from 'react';
import { Icon } from '@/assets/icons';

export const DEFAULT_PAGE_SIZE = 7;

export interface UsePaginationOptions {
  /** Items per page. Defaults to DEFAULT_PAGE_SIZE (7). */
  perPage?: number;
  /** Change this value (e.g. joined search/filter state) to reset back to page 1. */
  resetKey?: string | number;
  /** Initial page (used when restoring saved state, e.g. coming back from a detail page). */
  initialPage?: number;
  /** Notifies the parent of page changes so state can be preserved/restored. */
  onPageChange?: (page: number) => void;
}

export interface PaginationState<T> {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  pageItems: T[];
  setPage: (p: number) => void;
}

/**
 * Centralized client-side pagination state shared by every table and list in the app.
 * - Starts on page 1, `perPage` items per page (default 7).
 * - Resets to page 1 whenever `resetKey` changes (search / filter updates).
 * - Clamps the page when the dataset shrinks (e.g. after deleting the last item of
 *   the last page), automatically moving the user to the previous valid page.
 * - Purely client-side: changing pages never reloads the page.
 */
export function usePagination<T>(items: T[], { perPage = DEFAULT_PAGE_SIZE, resetKey, initialPage, onPageChange }: UsePaginationOptions = {}): PaginationState<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const [page, setPage] = useState(() => Math.min(Math.max(1, initialPage ?? 1), totalPages));
  const [prevResetKey, setPrevResetKey] = useState(resetKey);

  const changePage = (p: number) => {
    setPage(p);
    onPageChange?.(p);
  };

  // Adjust state during render (React's "derive state from props" pattern) so
  // filter/search changes and data shrinkage apply immediately, without effects.
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    changePage(1);
  }
  const safePage = Math.min(Math.max(1, page), totalPages);
  if (safePage !== page) {
    changePage(safePage);
  }

  const start = (safePage - 1) * perPage;
  const end = Math.min(start + perPage, total);

  return {
    page: safePage,
    totalPages,
    total,
    perPage,
    pageItems: items.slice(start, end),
    setPage,
  };
}

/** Page numbers with ellipsis gaps: always shows first, last, current and their neighbors. */
function buildPageList(page: number, totalPages: number): { key: string; page: number | null }[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => ({ key: `p${i + 1}`, page: i + 1 }));
  }
  const wanted = new Set<number>([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  const sorted = [...wanted].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const list: { key: string; page: number | null }[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) list.push({ key: `gap-${prev}`, page: null });
    list.push({ key: `p${p}`, page: p });
    prev = p;
  }
  return list;
}

export interface PaginationProps {
  page: number;
  total: number;
  perPage?: number;
  onChange: (p: number) => void;
  /** Noun for the records, e.g. "questions" or "courses". Defaults to "items". */
  unit?: string;
}

const navButtonClass =
  'flex h-9 w-9 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-[8px] border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-40 transition-colors';
const pageButtonClass =
  'flex h-9 w-9 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[13px] font-medium transition-colors';

export function Pagination({ page, total, perPage = DEFAULT_PAGE_SIZE, onChange, unit = 'items' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-3 py-3 sm:justify-between sm:px-4">
      <p className="order-2 w-full text-center text-[12px] text-[#6B7280] sm:order-1 sm:w-auto sm:text-left sm:text-[13px]">
        Showing <span className="font-medium text-[#374151]">{start}&ndash;{end}</span> of{' '}
        <span className="font-medium text-[#374151]">{total.toLocaleString()}</span> {unit}
      </p>

      {totalPages > 1 && (
        <div className="order-1 flex items-center gap-1 sm:order-2 sm:gap-1.5">
          <button type="button" className={navButtonClass} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <Icon.ChevronLeft className="h-4 w-4" />
          </button>

          {/* Mobile: page numbers collapse into a compact, always-visible indicator */}
          <span className="px-1.5 text-[12.5px] font-medium text-[#374151] sm:hidden">
            Page {page} of {totalPages}
          </span>

          {/* Tablet / desktop: full page number buttons */}
          <div className="hidden items-center gap-1 sm:flex">
            {buildPageList(page, totalPages).map(item =>
              item.page === null ? (
                <span key={item.key} className="select-none px-0.5 text-[#9CA3AF]" aria-hidden="true">&hellip;</span>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.page as number)}
                  aria-current={item.page === page ? 'page' : undefined}
                  aria-label={`Page ${item.page}`}
                  className={`${pageButtonClass} ${item.page === page ? 'bg-[#2563EB] text-white' : 'border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F3F4F6]'}`}
                >
                  {item.page}
                </button>
              )
            )}
          </div>

          <button type="button" className={navButtonClass} onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            <Icon.ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </nav>
  );
}
