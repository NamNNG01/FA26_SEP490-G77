import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
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
import { downloadDecksXlsx, fileSlug, type XlsxDeck } from '@/utils/flashcardXlsx';
import { getApiErrorMessage } from '@/utils/apiError';

const ALL = 'all';

const asDeck = (r: Record<string, unknown>) => r as unknown as Deck;

/** Reads every deck with its cards (F-03), a few at a time. */
async function loadDecksWithCards(decks: Deck[], onProgress: (done: number) => void): Promise<XlsxDeck[]> {
  const out: XlsxDeck[] = new Array(decks.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < decks.length) {
      const i = next++;
      const d = await deckService.getDeck(decks[i].deckId);
      out[i] = {
        title: d.title,
        courseName: d.courseName,
        ownerName: d.ownerName,
        visibility: d.isPublic ? 'Public' : 'Private',
        description: d.description,
        cards: d.cards ?? [],
      };
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, decks.length) }, worker));
  return out;
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
  /** Export in progress: decks read so far / to read. */
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

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

  /** Exports one deck, or every deck matching the filters, with all their cards as XLSX. */
  const handleExport = async (only?: Deck) => {
    if (exporting) return;
    setExporting({ done: 0, total: 0 });
    try {
      const list = only ? [only] : await deckService.getAllDecks(filters);
      if (list.length === 0) {
        toast.warning('There are no decks to export.');
        return;
      }
      setExporting({ done: 0, total: list.length });
      const decksWithCards = await loadDecksWithCards(list, done => setExporting({ done, total: list.length }));
      const date = new Date().toISOString().slice(0, 10);
      await downloadDecksXlsx(decksWithCards, only ? `${fileSlug(only.title)}-${date}` : `flashcard-decks-${date}`);
      toast.success(`Exported ${list.length} flashcard deck${list.length > 1 ? 's' : ''}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export flashcard decks.'));
    } finally {
      setExporting(null);
    }
  };

  /** One deck as a PDF, rendered by the BE. */
  const handleExportPdf = async (d: Deck) => {
    if (exporting) return;
    setExporting({ done: 0, total: 1 });
    try {
      await deckService.exportPdf(d.deckId, `${fileSlug(d.title)}.pdf`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not export the deck as PDF.'));
    } finally {
      setExporting(null);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'title',
      label: 'Deck',
      width: '36%',
      render: r => {
        const d = asDeck(r);
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium text-content line-clamp-2 whitespace-normal" title={d.title}>{d.title}</p>
            {d.description?.trim() && <p className="text-2xs text-content-subtle mt-0.5 truncate" title={d.description}>{d.description}</p>}
          </div>
        );
      },
    },
    {
      key: 'courseName',
      label: 'Course',
      render: r => {
        const name = asDeck(r).courseName;
        return name
          ? <span title={name}><Badge variant="info" className="max-w-[220px] truncate">{name}</Badge></span>
          : <span className="text-content-subtle">—</span>;
      },
    },
    {
      key: 'cardCount',
      label: 'Cards',
      render: r => {
        const n = asDeck(r).cardCount;
        return <Badge variant={n > 0 ? 'default' : 'warning'} className="whitespace-nowrap">{n} card{n === 1 ? '' : 's'}</Badge>;
      },
    },
    { key: 'ownerName', label: 'Owner', render: r => <span className="block truncate text-sm text-content-soft">{asDeck(r).ownerName}</span> },
    { key: 'isPublic', label: 'Visibility', render: r => <VisibilityBadge isPublic={asDeck(r).isPublic} /> },
    {
      key: 'actions',
      label: '',
      width: '48px',
      render: r => {
        const d = asDeck(r);
        return (
          // The menu is portalled, but React events still bubble to the row's onClick.
          <div onClick={e => e.stopPropagation()}>
            <Dropdown
              trigger={
                <button type="button" aria-label={`Actions for ${d.title}`} className="p-1.5 hover:bg-accent rounded-[6px]">
                  <Icon.MoreHorizontal className="w-4 h-4 text-content-soft" />
                </button>
              }
              items={[
                { label: 'Detail', icon: <Icon.Eye />, onClick: () => navigate(flashcardDeckPath(String(d.deckId))) },
                { label: 'Export (.xlsx)', icon: <Icon.Download />, onClick: () => handleExport(d) },
                { label: 'Export (.pdf)', icon: <Icon.FileText />, onClick: () => handleExportPdf(d) },
                d.isPublic
                  ? { label: 'Make private', icon: <Icon.Lock />, onClick: () => setPublic(d, false) }
                  : { label: 'Make public', icon: <Icon.Users />, onClick: () => setPublic(d, true) },
                { label: 'Delete', icon: <Icon.Trash />, danger: true, onClick: () => setToDelete(d) },
              ]}
            />
          </div>
        );
      },
    },
  ];

  const decks = result?.content ?? [];
  const filtersActive = query !== '' || course !== ALL || visibility !== ALL;
  const clearFilters = () => {
    setQuery('');
    setCourse(ALL);
    setVisibility(ALL);
    setPage(1);
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-content">Flashcard Management</h2>
          <p className="text-sm text-content-soft mt-0.5">Manage flashcard decks across your courses.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            onClick={() => handleExport()}
            disabled={exporting != null}
            title="Download the decks matching the filters, with all their cards, as an Excel file"
          >
            {exporting ? (exporting.total > 1 ? `Exporting ${exporting.done}/${exporting.total}…` : 'Exporting…') : 'Export (.xlsx)'}
          </Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreateOpen(true)}>New deck</Button>
        </div>
      </div>

      <div className="card px-4 py-3 flex flex-wrap lg:flex-nowrap items-center gap-3">
        <SearchInput
          className="w-full sm:w-60 lg:w-auto lg:min-w-0 lg:flex-[1.5]"
          placeholder="Search flashcard decks…"
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          aria-label="Search flashcard decks"
        />
        <Select aria-label="Filter by course" value={course} onChange={filterSetter(setCourse)}
          options={[{ label: 'All Courses', value: ALL }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))]}
          className="w-full sm:w-48 lg:w-auto lg:min-w-0 lg:flex-[1.25]" />
        <Select aria-label="Filter by visibility" value={visibility} onChange={filterSetter(setVisibility)}
          options={[{ label: 'All Visibility', value: ALL }, { label: 'Public', value: 'public' }, { label: 'Private', value: 'private' }]}
          className="w-full sm:w-40 lg:w-auto lg:min-w-0 lg:flex-1" />
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="shrink-0 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {loadError && (
        <div className="space-y-2">
          <Alert type="error" title="Could not load flashcard decks" message={loadError} />
          <Button variant="secondary" size="sm" onClick={reload}>Try again</Button>
        </div>
      )}

      <div className={`card overflow-hidden transition-opacity ${loading && result ? 'opacity-60' : ''}`} aria-busy={loading}>
        <Table
          columns={columns}
          data={decks as unknown as Record<string, unknown>[]}
          unit="flashcard decks"
          perPage={DEFAULT_PAGE_SIZE}
          serverPagination={{ page, total: result?.totalElements ?? 0, onChange: setPage }}
          onRowClick={r => navigate(flashcardDeckPath(String(asDeck(r).deckId)))}
          emptyState={
            loading ? 'Loading flashcard decks…'
              : loadError ? null
              : filtersActive ? 'No flashcard decks match your filters.'
              : 'No flashcard decks yet. Click “New deck” to create one.'
          }
        />
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
