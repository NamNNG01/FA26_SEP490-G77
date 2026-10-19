import React, { useState } from 'react';
import { Icon } from '@/assets/icons';
import { Checkbox } from './Checkbox';
import { Pagination, usePagination, DEFAULT_PAGE_SIZE } from './Pagination';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  className?: string;
  /** Don't clip the cell — needed when it renders a Tooltip. */
  overflowVisible?: boolean;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

export function Table({
  columns,
  data,
  selectable,
  onSort,
  sortKey,
  sortDir,
  perPage = DEFAULT_PAGE_SIZE,
  resetKey,
  unit,
  initialPage,
  onPageChange,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  isRowActive,
  serverPagination,
  emptyState,
}: {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  selectable?: boolean;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  /** Page size. Defaults to DEFAULT_PAGE_SIZE (10). */
  perPage?: number;
  /** Changing this value (joined search/filter state) resets pagination to page 1. */
  resetKey?: string | number;
  /** Noun for the records shown in the footer, e.g. "questions". Defaults to "items". */
  unit?: string;
  /** Initial page (used when restoring saved state, e.g. coming back from a detail page). */
  initialPage?: number;
  /** Notifies the parent of page changes so state can be preserved/restored. */
  onPageChange?: (page: number) => void;
  /** Controlled selection (row ids). Omit to let the table track selection itself. */
  selectedKeys?: Set<string>;
  /** Notifies the parent of selection changes, e.g. to drive bulk actions. */
  onSelectionChange?: (keys: Set<string>) => void;
  /** Makes rows clickable (e.g. to filter another panel by the clicked row). */
  onRowClick?: (row: Record<string, unknown>) => void;
  /** Highlights rows for which this returns true, e.g. the current selection. */
  isRowActive?: (row: Record<string, unknown>) => boolean;
  /**
   * Server-side pagination: `data` is already the current page and `total`
   * is the full record count. Pages are 1-based.
   */
  serverPagination?: { page: number; total: number; onChange: (page: number) => void };
  /** Rendered in place of the rows when there is nothing to show. */
  emptyState?: React.ReactNode;
}) {
  const client = usePagination(data, { perPage, resetKey, initialPage, onPageChange });
  const { page, total, pageItems, setPage } = serverPagination
    ? { page: serverPagination.page, total: serverPagination.total, pageItems: data, setPage: serverPagination.onChange }
    : client;
  const start = (page - 1) * perPage;
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selected = selectedKeys ?? internalSelected;
  const setSelected = (update: (prev: Set<string>) => Set<string>) => {
    const next = update(selected);
    if (!selectedKeys) setInternalSelected(next);
    onSelectionChange?.(next);
  };

  // Stable row identity across pages: prefer row.id, fall back to the global index.
  const rowKeyOf = (row: Record<string, unknown>, i: number) => (row.id != null ? String(row.id) : `#${start + i}`);

  const allChecked = pageItems.length > 0 && pageItems.every((row, i) => selected.has(rowKeyOf(row, i)));
  const someChecked = pageItems.some((row, i) => selected.has(rowKeyOf(row, i)));

  const toggleAll = () => {
    setSelected(prev => {
      const n = new Set(prev);
      pageItems.forEach((row, i) => {
        const key = rowKeyOf(row, i);
        if (allChecked) n.delete(key);
        else n.add(key);
      });
      return n;
    });
  };

  const toggleRow = (key: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  return (
    <div className="w-full min-w-0">
      {/* Horizontal scrolling is contained inside the table only; the page never scrolls sideways. */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-soft">
              {selectable && (
                <th className="w-10 px-2.5 sm:px-3 lg:px-4 py-3">
                  <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={toggleAll} />
                </th>
              )}
              {columns.map(col => (
                    <th key={col.key} style={{ width: col.width }} onClick={() => col.sortable && onSort?.(col.key)}
                      className={`px-2.5 sm:px-3 lg:px-4 py-3 text-left text-xs font-semibold text-content-soft uppercase tracking-wide whitespace-nowrap ${col.className ?? ''} ${col.sortable ? 'cursor-pointer hover:text-content-secondary select-none' : ''}`}>
                    <div className="flex items-center gap-1">
                      <span className="max-w-[220px] truncate" title={col.label}>{col.label}</span>
                      {col.sortable && sortKey === col.key && (sortDir === 'asc' ? <Icon.ArrowUp className="w-3 h-3 flex-shrink-0" /> : <Icon.ArrowDown className="w-3 h-3 flex-shrink-0" />)}
                    </div>
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && emptyState != null && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-10 text-center text-sm text-content-soft">
                  {emptyState}
                </td>
              </tr>
            )}
            {pageItems.map((row, i) => {
              const key = rowKeyOf(row, i);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  aria-selected={isRowActive ? isRowActive(row) : undefined}
                  className={`group border-b border-line-faint transition-colors ${isRowActive?.(row) ? 'bg-primary-light' : 'hover:bg-surface-hover'} ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {selectable && (
                    <td className="px-2.5 sm:px-3 lg:px-4 py-3" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(key)} onChange={() => toggleRow(key)} />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className={`px-2.5 sm:px-3 lg:px-4 py-3 text-sm text-content-secondary align-middle max-w-[280px] ${col.className ?? ''}`}>
                      <div className={`min-w-0 ${col.overflowVisible ? '' : 'overflow-hidden'}`}>
                        {col.render ? col.render(row) : <span className="block truncate">{String(row[col.key] ?? '')}</span>}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer on every table: total count always visible; controls hide for a single page. */}
      <div className="border-t border-line-soft">
        <Pagination page={page} total={total} perPage={perPage} onChange={setPage} unit={unit} />
      </div>
    </div>
  );
}
