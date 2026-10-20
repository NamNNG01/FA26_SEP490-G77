import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useDebounce } from '@/hooks';
import { flashcardDeckPath } from '@/app/routes';
import type { PageResponse } from '@/services/course.service';
import { deckService, type Deck, type DeckListParams } from '@/services/deck.service';
import { VisibilityBadge, errorMessage, useManagedCourses } from '../components/DeckEditor';
import { CreateDeckModal } from '../components/CreateDeckModal';

const ALL = 'all';

/** Quotes a CSV cell when it contains a delimiter, quote or newline. */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(decks: Deck[]) {
  const header = ['Deck ID', 'Deck Name', 'Course', 'Cards', 'Owner', 'Visibility'];
  const rows = decks.map(d => [d.deckId, d.title, d.courseName ?? 'Personal', d.cardCount, d.ownerName, d.isPublic ? 'Public' : 'Private']);
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
 * Lists decks from F-01, which only returns decks in the caller's courses or
 * owned by them; the course filter likewise only offers the caller's courses.
 */
export function FlashcardManagementPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { courses } = useManagedCourses();

  const [query, setQuery] = useState('');
  const [course, setCourse] = useState(ALL);
  const [visibility, setVisibility] = useState(ALL);
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(query.trim(), 400);

  const [result, setResult] = useState<PageResponse<Deck> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Deck | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filters: Omit<DeckListParams, 'page' | 'size'> = {
    search: debouncedQuery || undefined,
    courseId: course === ALL ? undefined : Number(course),
    isPublic: visibility === ALL ? undefined : visibility === 'public',
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    deckService.getDecks({ ...filters, page: page - 1, size: DEFAULT_PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        // Deleting the last deck on a page leaves it empty — step back one.
        if (res.content.length === 0 && page > 1 && res.totalElements > 0) setPage(p => p - 1);
        else setResult(res);
      })
      .catch(err => { if (!cancelled) setLoadError(errorMessage(err, 'Could not load flashcard decks.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `filters` is derived from these values
  }, [debouncedQuery, course, visibility, page, reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  // Any filter change starts back at page 1.
  const filterSetter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const setPublic = async (d: Deck, isPublic: boolean) => {
    try {
      await deckService.updateDeck(d.deckId, { isPublic });
      toast.success(`"${d.title}" is now ${isPublic ? 'public' : 'private'}.`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the deck visibility.'));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deckService.deleteDeck(toDelete.deckId);
      toast.success(`"${toDelete.title}" deleted.`);
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the deck.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await deckService.getAllDecks(filters);
      if (rows.length === 0) {
        toast.warning('There are no decks to export.');
        return;
      }
      downloadCsv(rows);
      toast.success(`Exported ${rows.length} flashcard deck${rows.length > 1 ? 's' : ''}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export flashcard decks.'));
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      key: 'title', label: 'Deck Name',
      render: (r: Record<string, unknown>) => {
        const d = r as unknown as Deck;
        return (
          <div className="min-w-0">
            <button onClick={() => navigate(flashcardDeckPath(String(d.deckId)))} title={d.title}
              className="block max-w-full font-semibold text-content text-sm truncate text-left hover:text-brand-ink hover:underline">
              {d.title}
            </button>
            <p className="text-2xs text-content-subtle">#{d.deckId}</p>
          </div>
        );
      },
    },
    {
      key: 'courseName', label: 'Course',
      render: (r: Record<string, unknown>) => {
        const name = r.courseName as string | null;
        return name
          ? <span className="block truncate text-sm text-content-secondary" title={name}>{name}</span>
          : <span className="text-sm italic text-content-subtle">Personal</span>;
      },
    },
    { key: 'cardCount', label: 'Cards', render: (r: Record<string, unknown>) => <span className="font-semibold text-content">{r.cardCount as number}</span> },
    { key: 'ownerName', label: 'Owner', render: (r: Record<string, unknown>) => <span className="block truncate text-sm text-content-secondary">{r.ownerName as string}</span> },
    { key: 'isPublic', label: 'Visibility', render: (r: Record<string, unknown>) => <VisibilityBadge isPublic={r.isPublic as boolean} /> },
    {
      // Pinned right so the "..." menu stays reachable when the table scrolls sideways.
      key: 'actions', label: '', width: '48px',
      className: 'sticky right-0 z-[1] bg-surface group-hover:bg-surface-hover transition-colors',
      render: (r: Record<string, unknown>) => {
        const d = r as unknown as Deck;
        return (
          <Dropdown
            trigger={<button aria-label={`Actions for ${d.title}`} className="p-1.5 hover:bg-accent rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-content-soft" /></button>}
            items={[
              { label: 'Detail', icon: <Icon.Eye />, onClick: () => navigate(flashcardDeckPath(String(d.deckId))) },
              d.isPublic
                ? { label: 'Make private', icon: <Icon.Lock />, onClick: () => setPublic(d, false) }
                : { label: 'Make public', icon: <Icon.Users />, onClick: () => setPublic(d, true) },
              { label: 'Delete', icon: <Icon.Trash />, danger: true, onClick: () => setToDelete(d) },
            ]}
          />
        );
      },
    },
  ];

  const decks = result?.content ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-content">Flashcard Management</h2>
          <p className="text-sm text-content-soft mt-0.5">Manage flashcard decks across your courses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New deck</Button>
        </div>
      </div>

      {loadError && <Alert type="error" title="Could not load flashcard decks" message={loadError} />}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
          <SearchInput className="w-full sm:w-64" placeholder="Search flashcard decks…" value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }} />
          <Select aria-label="Filter by course" value={course} onChange={filterSetter(setCourse)}
            options={[{ label: 'All my courses', value: ALL }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))]}
            className="w-full sm:w-56" />
          <Select aria-label="Filter by visibility" value={visibility} onChange={filterSetter(setVisibility)}
            options={[{ label: 'All visibility', value: ALL }, { label: 'Public', value: 'public' }, { label: 'Private', value: 'private' }]}
            className="w-full sm:w-40" />
        </div>

        {loading && !result ? (
          <div className="px-4 py-16 text-center text-content-subtle">
            <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading flashcard decks…</p>
          </div>
        ) : decks.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Icon.Layers className="w-10 h-10 mx-auto text-content-faint" />
            <p className="mt-3 text-base font-medium text-content-secondary">No flashcard decks found</p>
            <p className="text-sm text-content-subtle">Try a different keyword or clear the filters.</p>
          </div>
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <Table
              columns={columns}
              data={decks as unknown as Record<string, unknown>[]}
              unit="flashcard decks"
              perPage={DEFAULT_PAGE_SIZE}
              serverPagination={{ page, total: result?.totalElements ?? 0, onChange: setPage }}
            />
          </div>
        )}
      </div>

      {createOpen && (
        <CreateDeckModal
          defaultCourseId={course === ALL ? undefined : course}
          onClose={() => setCreateOpen(false)}
          onCreated={({ deck, cardsCreated, cardError }) => {
            setCreateOpen(false);
            toast.success(`Deck "${deck.title}" created with ${cardsCreated} card${cardsCreated === 1 ? '' : 's'}.`);
            if (cardError) toast.warning(`${cardError} Add the remaining cards on the deck page.`);
            navigate(flashcardDeckPath(String(deck.deckId)));
          }}
        />
      )}

      <Modal open={!!toDelete} onClose={() => !deleting && setToDelete(null)} title="Delete deck?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }>
        <p className="text-base text-content-secondary">
          <span className="font-semibold text-content">"{toDelete?.title}"</span> and its {toDelete?.cardCount ?? 0} card{toDelete?.cardCount === 1 ? '' : 's'} will
          be permanently deleted, together with every learner's progress on them. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
