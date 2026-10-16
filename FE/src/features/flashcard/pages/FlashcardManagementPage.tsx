import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useAuth } from '@/auth/authContext';
import {
  MOCK_FLASHCARD_DECKS,
  FLASHCARD_COURSES,
  DECK_STATUSES,
  courseTitle,
  formatDeckTimestamp,
  type DeckStatus,
  type FlashcardDeck,
} from '../mockFlashcardDecks';

const STATUS_VARIANT: Record<DeckStatus, BadgeVariant> = {
  Published: 'success',
  Draft: 'warning',
  Archived: 'default',
};

type SortKey = 'name' | 'cards' | 'updatedAt';

/** Quotes a CSV cell when it contains a delimiter, quote or newline. */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(decks: FlashcardDeck[]) {
  const header = ['Deck ID', 'Deck Name', 'Course', 'Cards', 'Creator', 'Status', 'Updated'];
  const rows = decks.map(d => [d.id, d.name, courseTitle(d.courseId), d.cards, d.creator, d.status, d.updatedAt]);
  const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
  // BOM so Excel opens UTF-8 names correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flashcard-decks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Flashcard Management — Course Manager only (guarded in AppContent).
 * Runs entirely on mock data until the flashcard API is available.
 */
export function FlashcardManagementPage() {
  const toast = useToast();
  const { user } = useAuth();

  const [decks, setDecks] = useState<FlashcardDeck[]>(MOCK_FLASHCARD_DECKS);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const filtered = decks.filter(d =>
      (!q || d.name.toLowerCase().includes(q)) &&
      (course === 'all' || d.courseId === course) &&
      (status === 'all' || d.status === status));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'cards') return dir * (a.cards - b.cards);
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
      return dir * a.updatedAt.localeCompare(b.updatedAt);
    });
  }, [decks, q, course, status, sortKey, sortDir]);

  // Bulk actions only ever touch decks the user can currently see.
  const selectedVisible = visible.filter(d => selected.has(d.id));

  const updateStatus = (ids: string[], next: DeckStatus) => {
    const now = new Date().toISOString().slice(0, 19);
    setDecks(prev => prev.map(d => (ids.includes(d.id) ? { ...d, status: next, updatedAt: now } : d)));
  };

  const bulkSetStatus = (next: DeckStatus) => {
    const ids = selectedVisible.map(d => d.id);
    updateStatus(ids, next);
    setSelected(new Set());
    toast.success(`${ids.length} deck${ids.length > 1 ? 's' : ''} moved to ${next}.`);
  };

  const handleExport = () => {
    const rows = selectedVisible.length > 0 ? selectedVisible : visible;
    if (rows.length === 0) {
      toast.warning('There are no decks to export.');
      return;
    }
    downloadCsv(rows);
    toast.success(`Exported ${rows.length} flashcard deck${rows.length > 1 ? 's' : ''}.`);
  };

  const duplicateDeck = (d: FlashcardDeck) => {
    const copy: FlashcardDeck = {
      ...d,
      id: `FD-${Date.now().toString().slice(-6)}`,
      name: `${d.name} (Copy)`,
      status: 'Draft',
      creator: user?.fullName ?? d.creator,
      updatedAt: new Date().toISOString().slice(0, 19),
    };
    setDecks(prev => [copy, ...prev]);
    toast.success(`"${d.name}" duplicated as a draft.`);
  };

  const columns = [
    {
      key: 'name', label: 'Deck Name', sortable: true,
      render: (r: Record<string, unknown>) => (
        <div className="min-w-0">
          <p className="font-semibold text-[#111827] text-[13.5px] truncate" title={r.name as string}>{r.name as string}</p>
          <p className="text-[11px] text-[#9CA3AF]">{r.id as string}</p>
        </div>
      ),
    },
    { key: 'courseId', label: 'Course', render: (r: Record<string, unknown>) => <span className="block truncate text-[13px] text-[#374151]" title={courseTitle(r.courseId as string)}>{courseTitle(r.courseId as string)}</span> },
    { key: 'cards', label: 'Cards', sortable: true, render: (r: Record<string, unknown>) => <span className="font-semibold text-[#111827]">{r.cards as number}</span> },
    { key: 'creator', label: 'Creator', render: (r: Record<string, unknown>) => <span className="block truncate text-[13px] text-[#374151]">{r.creator as string}</span> },
    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => <Badge variant={STATUS_VARIANT[r.status as DeckStatus]}>{r.status as string}</Badge> },
    { key: 'updatedAt', label: 'Updated', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280] whitespace-nowrap">{formatDeckTimestamp(r.updatedAt as string)}</span> },
    {
      key: 'actions', label: '', width: '48px',
      render: (r: Record<string, unknown>) => {
        const d = r as unknown as FlashcardDeck;
        return (
          <Dropdown
            trigger={<button aria-label={`Actions for ${d.name}`} className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
            items={[
              { label: 'View', icon: <Icon.Eye />, onClick: () => toast.info(`Deck detail for "${d.name}" is coming soon.`) },
              { label: 'Edit', icon: <Icon.Edit />, onClick: () => toast.info(`Deck editor for "${d.name}" is coming soon.`) },
              { label: 'Preview', icon: <Icon.Layers />, onClick: () => toast.info(`Preview for "${d.name}" is coming soon.`) },
              { label: 'Duplicate', icon: <Icon.Copy />, onClick: () => duplicateDeck(d) },
              d.status === 'Published'
                ? { label: 'Unpublish', icon: <Icon.EyeOff />, onClick: () => { updateStatus([d.id], 'Draft'); toast.success(`"${d.name}" moved to Draft.`); } }
                : { label: 'Publish', icon: <Icon.CheckCircle />, onClick: () => { updateStatus([d.id], 'Published'); toast.success(`"${d.name}" published.`); } },
              { divider: true } as { label: string; divider: true },
              d.status === 'Archived'
                ? { label: 'Restore', icon: <Icon.RefreshCw />, onClick: () => { updateStatus([d.id], 'Draft'); toast.success(`"${d.name}" restored to Draft.`); } }
                : { label: 'Deactivate', icon: <Icon.X />, danger: true, onClick: () => { updateStatus([d.id], 'Archived'); toast.success(`"${d.name}" archived.`); } },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Flashcard Management</h2>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Manage flashcard decks across your courses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />} onClick={handleExport}>
            Export{selectedVisible.length > 0 ? ` (${selectedVisible.length})` : ''}
          </Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New Flashcard</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
          <SearchInput className="w-full sm:w-64" placeholder="Search flashcard decks…" value={query} onChange={e => setQuery(e.target.value)} />
          <Select aria-label="Filter by course" value={course} onChange={setCourse}
            options={[{ label: 'All Courses', value: 'all' }, ...FLASHCARD_COURSES.map(c => ({ label: c.title, value: c.id }))]}
            className="w-full sm:w-56" />
          <Select aria-label="Filter by status" value={status} onChange={setStatus}
            options={[{ label: 'All Status', value: 'all' }, ...DECK_STATUSES.map(s => ({ label: s, value: s }))]}
            className="w-full sm:w-36" />
        </div>

        {selectedVisible.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#EFF6FF] border-b border-[#BFDBFE] dark:bg-[#172554] dark:border-[#1E3A8A]">
            <span className="text-[13px] font-medium text-[#1D4ED8] dark:text-[#93C5FD] mr-2">{selectedVisible.length} selected</span>
            <Button size="sm" variant="outline" icon={<Icon.CheckCircle className="w-3.5 h-3.5" />} onClick={() => bulkSetStatus('Published')}>Publish</Button>
            <Button size="sm" variant="outline" icon={<Icon.EyeOff className="w-3.5 h-3.5" />} onClick={() => bulkSetStatus('Draft')}>Move to Draft</Button>
            <Button size="sm" variant="outline" icon={<Icon.X className="w-3.5 h-3.5" />} onClick={() => bulkSetStatus('Archived')}>Deactivate</Button>
            <div className="flex-1" />
            <button onClick={() => setSelected(new Set())} className="text-[13px] text-[#2563EB] hover:underline dark:text-[#93C5FD]">Clear selection</button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Icon.Layers className="w-10 h-10 mx-auto text-[#D1D5DB]" />
            <p className="mt-3 text-[14px] font-medium text-[#374151]">No flashcard decks found</p>
            <p className="text-[13px] text-[#9CA3AF]">Try a different keyword or clear the filters.</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={visible as unknown as Record<string, unknown>[]}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
            unit="flashcard decks"
            resetKey={[q, course, status].join('|')}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={k => {
              if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
              else { setSortKey(k as SortKey); setSortDir(k === 'name' ? 'asc' : 'desc'); }
            }}
          />
        )}
      </div>

      <CreateDeckModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={deck => {
          const created: FlashcardDeck = {
            ...deck,
            id: `FD-${Date.now().toString().slice(-6)}`,
            cards: 0,
            creator: user?.fullName ?? 'You',
            updatedAt: new Date().toISOString().slice(0, 19),
          };
          setDecks(prev => [created, ...prev]);
          setCreateOpen(false);
          toast.success(`Deck "${created.name}" created.`);
        }}
      />
    </div>
  );
}

function CreateDeckModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (deck: Pick<FlashcardDeck, 'name' | 'courseId' | 'status'>) => void;
}) {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState(FLASHCARD_COURSES[0]?.id ?? '');
  const [status, setStatus] = useState<DeckStatus>('Draft');
  const [error, setError] = useState('');

  const reset = () => { setName(''); setCourseId(FLASHCARD_COURSES[0]?.id ?? ''); setStatus('Draft'); setError(''); };
  const close = () => { reset(); onClose(); };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Deck name is required.'); return; }
    if (trimmed.length > 120) { setError('Deck name must be 120 characters or fewer.'); return; }
    onCreate({ name: trimmed, courseId, status });
    reset();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New Flashcard Deck"
      footer={
        <>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={() => submit()}>Create Deck</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Deck name" placeholder="e.g. Gradient Descent Essentials" value={name} autoFocus
          onChange={e => { setName(e.target.value); if (error) setError(''); }} error={error} />
        <Select label="Course" value={courseId} onChange={setCourseId} options={FLASHCARD_COURSES.map(c => ({ label: c.title, value: c.id }))} />
        <Select label="Status" value={status} onChange={v => setStatus(v as DeckStatus)} options={(['Draft', 'Published'] as DeckStatus[]).map(s => ({ label: s, value: s }))} />
        <p className="text-[12px] text-[#9CA3AF]">You can add cards after the deck is created.</p>
      </form>
    </Modal>
  );
}
