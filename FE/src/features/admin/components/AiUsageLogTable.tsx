import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import type { AiUsageLog } from '../data/adminDashboardDemo';
import { formatDateTime, formatInteger } from '../utils/dashboardFormat';
import { SortHeader } from './SortHeader';

const RECENT_LOG_COUNT = 10;
const PAGE_SIZE = 20;

type ResultFilter = 'all' | 'success' | 'failed';
type SortKey = 'time' | 'tokens';

/** Lower-case and strip Vietnamese diacritics so "huy" matches "Vũ Đức Huy". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const inputClass =
  'h-9 px-3 rounded-[10px] border border-line bg-surface text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all';

/**
 * AI usage log with filters to track down problems: by user, by result
 * (failed requests) and by a time window inside the dashboard period.
 *
 * With no filter set it shows the 10 newest requests; "View all" — or any
 * active filter — switches to the full, paginated list.
 */
export function AiUsageLogTable({
  logs,
  dayRange,
}: {
  logs: AiUsageLog[];
  /** First/last day of the dashboard period (YYYY-MM-DD), bounds the time filter. */
  dayRange: { from: string; to: string };
}) {
  const [userQuery, setUserQuery] = useState('');
  const [result, setResult] = useState<ResultFilter>('all');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'time', dir: 'desc' });
  const [showAll, setShowAll] = useState(false);

  /** First click on a column sorts it high→low; clicking it again flips the order. */
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  // A new dashboard period invalidates the time window; user/result still apply.
  useEffect(() => {
    setTimeFrom('');
    setTimeTo('');
    setShowAll(false);
  }, [dayRange.from, dayRange.to]);

  const filtered = useMemo(() => {
    const query = normalize(userQuery);
    const rows = logs.filter((log) => {
      const minute = log.time.slice(0, 16);
      return (
        (!query || normalize(log.user).includes(query)) &&
        (result === 'all' || (result === 'success') === log.success) &&
        (!timeFrom || minute >= timeFrom) &&
        (!timeTo || minute <= timeTo)
      );
    });
    const sign = sort.dir === 'desc' ? -1 : 1;
    return rows.sort((a, b) =>
      sort.key === 'tokens'
        ? sign * (a.tokens - b.tokens) || b.time.localeCompare(a.time)
        : sign * a.time.localeCompare(b.time),
    );
  }, [logs, userQuery, result, timeFrom, timeTo, sort]);

  const hasFilter = !!userQuery.trim() || result !== 'all' || !!timeFrom || !!timeTo;
  const paged = showAll || hasFilter;
  const pages = usePagination(filtered, {
    perPage: PAGE_SIZE,
    resetKey: `${userQuery}|${result}|${timeFrom}|${timeTo}|${sort.key}|${sort.dir}|${paged}|${logs.length}`,
  });
  const rows = paged ? pages.pageItems : filtered.slice(0, RECENT_LOG_COUNT);
  const failedCount = useMemo(() => filtered.filter((l) => !l.success).length, [filtered]);

  const minTime = `${dayRange.from}T00:00`;
  const maxTime = `${dayRange.to}T23:59`;

  const clearFilters = () => {
    setUserQuery('');
    setResult('all');
    setTimeFrom('');
    setTimeTo('');
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-line-soft space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-content">AI Usage Log</h4>
            <p className="text-xs text-content-subtle">
              {hasFilter
                ? `${formatInteger(filtered.length)} of ${formatInteger(logs.length)} requests match`
                : `${formatInteger(logs.length)} requests in this period`}
              {failedCount > 0 && ` · ${formatInteger(failedCount)} failed`}
            </p>
          </div>
          {!hasFilter && logs.length > RECENT_LOG_COUNT && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show recent only' : `View all (${formatInteger(logs.length)})`}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-content-secondary">User</span>
            <SearchInput
              type="search"
              placeholder="Search by name…"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="w-56"
            />
          </label>
          <Select
            label="Result"
            value={result}
            onChange={(v) => setResult(v as ResultFilter)}
            options={[
              { label: 'All results', value: 'all' },
              { label: 'Failed only', value: 'failed' },
              { label: 'Success only', value: 'success' },
            ]}
            className="w-40"
          />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-content-secondary">From</span>
            <input
              type="datetime-local"
              value={timeFrom}
              min={minTime}
              max={timeTo || maxTime}
              onChange={(e) => setTimeFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-content-secondary">To</span>
            <input
              type="datetime-local"
              value={timeTo}
              min={timeFrom || minTime}
              max={maxTime}
              onChange={(e) => setTimeTo(e.target.value)}
              className={inputClass}
            />
          </label>
          {hasFilter && (
            <Button variant="ghost" icon={<Icon.X className="w-4 h-4" />} onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-content-soft">
          {hasFilter ? 'No requests match these filters.' : 'No data for this period.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-content-subtle border-b border-line-soft">
                <th className="px-5 py-2.5 font-medium">User</th>
                <th className="px-5 py-2.5 font-medium">AI feature</th>
                <SortHeader
                  label="Tokens"
                  align="right"
                  active={sort.key === 'tokens'}
                  direction={sort.dir}
                  onClick={() => toggleSort('tokens')}
                />
                <SortHeader
                  label="Time"
                  active={sort.key === 'time'}
                  direction={sort.dir}
                  onClick={() => toggleSort('time')}
                />
                <th className="px-5 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {rows.map((log) => (
                <tr key={log.id} className={log.success ? 'hover:bg-surface-hover' : 'bg-danger-light/40 hover:bg-danger-light'}>
                  <td className="px-5 py-2.5 text-content-secondary whitespace-nowrap">
                    <button
                      type="button"
                      className="hover:text-brand-ink hover:underline cursor-pointer"
                      title="Show only this user"
                      onClick={() => setUserQuery(log.user)}
                    >
                      {log.user}
                    </button>
                  </td>
                  <td className="px-5 py-2.5 text-content-soft whitespace-nowrap">{log.feature}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-content">{formatInteger(log.tokens)}</td>
                  <td className="px-5 py-2.5 text-content-soft tabular-nums whitespace-nowrap">{formatDateTime(log.time)}</td>
                  <td className="px-5 py-2.5">
                    <Badge variant={log.success ? 'success' : 'danger'}>
                      {log.success ? <Icon.CheckCircle className="w-3 h-3" /> : <Icon.XCircle className="w-3 h-3" />}
                      {log.success ? 'Success' : 'Failed'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {paged && (
            <div className="border-t border-line-soft">
              <Pagination page={pages.page} total={pages.total} perPage={PAGE_SIZE} onChange={pages.setPage} unit="requests" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
