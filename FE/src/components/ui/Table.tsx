import React, { useState } from 'react';
import { Icon } from '@/assets/icons';
import { Checkbox } from './Checkbox';

export function Table({ columns, data, selectable, onSort, sortKey, sortDir }: {
  columns: { key: string; label: string; sortable?: boolean; width?: string; render?: (row: Record<string, unknown>) => React.ReactNode }[];
  data: Record<string, unknown>[];
  selectable?: boolean;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggleAll = () => setSelected(selected.size === data.length ? new Set() : new Set(data.map((_, i) => i)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#F3F4F6]">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <Checkbox checked={selected.size === data.length && data.length > 0} indeterminate={selected.size > 0 && selected.size < data.length} onChange={toggleAll} />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key} style={{ width: col.width }} onClick={() => col.sortable && onSort?.(col.key)}
                className={`px-4 py-3 text-left text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide ${col.sortable ? 'cursor-pointer hover:text-[#374151] select-none' : ''}`}>
                <div className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (sortDir === 'asc' ? <Icon.ArrowUp className="w-3 h-3" /> : <Icon.ArrowDown className="w-3 h-3" />)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB] transition-colors">
              {selectable && (
                <td className="px-4 py-3">
                  <Checkbox checked={selected.has(i)} onChange={() => {
                    const n = new Set(selected);
                    n.has(i) ? n.delete(i) : n.add(i);
                    setSelected(n);
                  }} />
                </td>
              )}
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-[13.5px] text-[#374151]">
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
