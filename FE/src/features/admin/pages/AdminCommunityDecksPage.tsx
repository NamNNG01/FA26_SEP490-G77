import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import { useToast } from '@/components/ui/ToastHost';
import { SearchInput } from '@/components/common/SearchInput';
import { useDebounce } from '@/hooks';
import { adminCommunityDeckService } from '@/services/adminCommunityDeck.service';
import type { PageResponse } from '@/services/course.service';
import type { Deck } from '@/services/deck.service';
import { getApiErrorMessage } from '@/utils/apiError';

const asDeck = (r: Record<string, unknown>) => r as unknown as Deck;

export function AdminCommunityDecksPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search.trim(), 350);

  const [result, setResult] = useState<PageResponse<Deck> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [hideTarget, setHideTarget] = useState<Deck | null>(null);
  const [hideReason, setHideReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Deck | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminCommunityDeckService
      .list({
        visibility,
        search: debouncedSearch || undefined,
        page: page - 1,
        size: DEFAULT_PAGE_SIZE,
      })
      .then(res => {
        if (!cancelled) setResult(res);
      })
      .catch(err => {
        if (!cancelled) toast.error(getApiErrorMessage(err, 'Could not load community decks.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, visibility, page, reloadKey, toast]);

  const reload = () => setReloadKey(k => k + 1);

  const confirmHide = async () => {
    if (!hideTarget) return;
    setBusy(true);
    try {
      await adminCommunityDeckService.hide(hideTarget.deckId, hideReason.trim() || undefined);
      toast.success(`"${hideTarget.title}" removed from Community.`);
      setHideTarget(null);
      setHideReason('');
      reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not remove community deck.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await adminCommunityDeckService.remove(deleteTarget.deckId);
      toast.success(`"${deleteTarget.title}" deleted permanently.`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not delete community deck.'));
    } finally {
      setBusy(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'title',
      label: 'Deck',
      render: (r: Record<string, unknown>) => {
        const d = asDeck(r);
        return (
          <div className="min-w-0">
            <div className="font-medium text-content truncate">{d.title}</div>
            {d.description && <div className="text-xs text-content-subtle truncate">{d.description}</div>}
          </div>
        );
      },
    },
    {
      key: 'ownerName',
      label: 'Author',
      render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{asDeck(r).ownerName}</span>,
    },
    {
      key: 'cardCount',
      label: 'Cards',
      render: (r: Record<string, unknown>) => {
        const count = asDeck(r).cardCount;
        return <Badge variant="default">{count} card{count === 1 ? '' : 's'}</Badge>;
      },
    },
    {
      key: 'isPublic',
      label: 'Status',
      render: (r: Record<string, unknown>) => (
        <Badge variant={asDeck(r).isPublic ? 'success' : 'warning'}>
          {asDeck(r).isPublic ? 'Public' : 'Hidden / Private'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: '200px',
      render: (r: Record<string, unknown>) => {
        const d = asDeck(r);
        return (
          <div className="flex items-center gap-2">
            {d.isPublic && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setHideTarget(d);
                  setHideReason('');
                }}
              >
                Hide
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              onClick={() => setDeleteTarget(d)}
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  const items = result?.content ?? [];

  return (
    <div className="p-8 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-content">Community Flashcard Moderation</h2>
        <p className="text-sm text-content-soft mt-0.5">
          Review and remove inappropriate student-published community flashcard decks.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search community decks…"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm w-full"
        />
        <Select
          className="w-44"
          value={visibility}
          onChange={v => {
            setVisibility(v);
            setPage(1);
          }}
          options={[
            { label: 'Public only', value: 'PUBLIC' },
            { label: 'All decks', value: 'ALL' },
            { label: 'Private / Hidden', value: 'PRIVATE' },
          ]}
        />
      </div>

      <div className={`card overflow-hidden transition-opacity ${loading && result ? 'opacity-60' : ''}`} aria-busy={loading}>
        <Table
          columns={columns}
          data={items as unknown as Record<string, unknown>[]}
          unit="community decks"
          perPage={DEFAULT_PAGE_SIZE}
          serverPagination={{ page, total: result?.totalElements ?? 0, onChange: setPage }}
          emptyState={loading ? 'Loading community decks…' : 'No community decks found.'}
        />
      </div>

      <Modal
        open={Boolean(hideTarget)}
        onClose={busy ? () => {} : () => setHideTarget(null)}
        title="Hide Community Deck"
        description={hideTarget ? `Remove "${hideTarget.title}" from Community? The author will not be able to re-publish it.` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setHideTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={confirmHide} loading={busy} disabled={busy}>Hide Deck</Button>
          </>
        }
      >
        <Input
          label="Reason (optional)"
          placeholder="e.g. Spam or inappropriate content"
          value={hideReason}
          onChange={e => setHideReason(e.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Community Deck?"
        description={deleteTarget ? `Permanently delete "${deleteTarget.title}" and all its cards? This cannot be undone.` : ''}
        confirmLabel="Delete"
        tone="danger"
        loading={busy}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
