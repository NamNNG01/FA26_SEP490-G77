import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { Icon } from '@/assets/icons';
import { FlashcardImportModal } from '@/features/student/components/flashcards/FlashcardImportModal';
import { ROUTES } from '@/app/routes';
import { deckService, type Deck, type DeckUpdateRequest } from '@/services/deck.service';
import {
  CardEditorPanel,
  CardList,
  DUPLICATE_TITLE_MESSAGE,
  DeckInfoFields,
  hasDuplicateTitle,
  toEditableCard,
  useCardEditor,
  NO_COURSE,
  errorMessage,
  useManagedCourses,
  validateDeckInfo,
  type DeckInfo,
  type DeckInfoErrors,
} from '../components/DeckEditor';

const toInfo = (d: Deck): DeckInfo => ({
  title: d.title,
  courseId: d.courseId == null ? NO_COURSE : String(d.courseId),
  isPublic: d.isPublic,
  description: d.description ?? '',
});

/** Only the fields that changed — F-04 leaves omitted fields untouched. */
function diff(saved: DeckInfo, draft: DeckInfo): DeckUpdateRequest {
  const patch: DeckUpdateRequest = {};
  if (draft.title.trim() !== saved.title) patch.title = draft.title.trim();
  if (draft.courseId !== saved.courseId && draft.courseId !== NO_COURSE) patch.courseId = Number(draft.courseId);
  if (draft.isPublic !== saved.isPublic) patch.isPublic = draft.isPublic;
  if (draft.description.trim() !== saved.description) patch.description = draft.description.trim();
  return patch;
}

/**
 * Flashcard Detail — Course Manager only (guarded in AppContent).
 *
 * Loads the deck and its cards (F-03). Deck info edits stay in a local draft
 * until Save Changes sends the changed fields (F-04); Delete removes the deck
 * (F-05). Cards are read-only until the API has per-card endpoints.
 */
export function FlashcardDeckDetailPage() {
  const { deckId = '' } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { courses, loading: coursesLoading } = useManagedCourses();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DeckInfo | null>(null);
  const [infoErrors, setInfoErrors] = useState<DeckInfoErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    deckService.getDeck(deckId)
      .then(d => { if (!cancelled) { setDeck(d); setDraft(toInfo(d)); } })
      .catch(err => { if (!cancelled) setLoadError(errorMessage(err, 'This flashcard deck does not exist or has been removed.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [deckId]);

  const saved = deck ? toInfo(deck) : null;
  const dirty = !!saved && !!draft && Object.keys(diff(saved, draft)).length > 0;

  // Each card change goes straight to the card API; the deck is then reloaded
  // so the list, order and card count always match the server.
  const cards = (deck?.cards ?? []).map(toEditableCard);
  const refreshDeck = async () => setDeck(await deckService.getDeck(deckId));
  const editor = useCardEditor(cards, {
    add: async (frontText, backText) => { await deckService.createCard(deckId, { frontText, backText }); await refreshDeck(); },
    update: async (card, frontText, backText) => { await deckService.updateCard(card.id, { frontText, backText }); await refreshDeck(); },
    remove: async card => { await deckService.deleteCard(card.id); await refreshDeck(); },
  }, { confirmRemove: true });

  const { blocker, leave } = useUnsavedChangesGuard(dirty || editor.hasInput);

  const backToList = () => navigate(ROUTES.managerFlashcards);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="py-16 text-center text-content-subtle">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading flashcard deck…</p>
        </div>
      </div>
    );
  }

  if (!deck || !saved) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="card mx-auto max-w-md px-6 py-14 text-center">
          <Icon.Layers className="w-10 h-10 mx-auto text-content-faint" />
          <h2 className="mt-4 text-xl font-bold text-content">Deck not available</h2>
          <p className="mt-1 text-sm text-content-soft">{loadError ?? 'This flashcard deck does not exist or has been removed.'}</p>
          <Button className="mt-6" onClick={backToList}>Back to Flashcards</Button>
        </div>
      </div>
    );
  }

  const discardChanges = () => {
    setDraft(saved);
    setInfoErrors({});
    setSaveError(null);
  };

  const updateDraft = (patch: Partial<DeckInfo>) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev));
    setInfoErrors(prev => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof DeckInfoErrors)[]).forEach(k => delete next[k]);
      return next;
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    const errors = validateDeckInfo(draft, { requireCourse: deck.courseId != null });
    setInfoErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setSaveError(null);
    const renamedOrMoved = draft.title.trim().toLowerCase() !== saved.title.trim().toLowerCase() || draft.courseId !== saved.courseId;
    if (renamedOrMoved && await hasDuplicateTitle(draft.title, draft.courseId, deck.deckId)) {
      setInfoErrors({ title: DUPLICATE_TITLE_MESSAGE });
      setSaving(false);
      return;
    }
    try {
      const updated = await deckService.updateDeck(deck.deckId, diff(saved, draft));
      setDeck(updated);
      setDraft(toInfo(updated));
      toast.success(`"${updated.title}" saved.`);
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save the deck. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deckService.deleteDeck(deck.deckId);
      toast.success(`"${deck.title}" deleted.`);
      leave(backToList);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the deck.'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // The deck's current course may not be in the caller's list (e.g. assigned course left out by paging); keep it selectable.
  const courseOptions = courses.map(c => ({ id: String(c.courseId), title: c.title }));
  if (deck.courseId != null && !courseOptions.some(c => c.id === String(deck.courseId))) {
    courseOptions.unshift({ id: String(deck.courseId), title: deck.courseName ?? `Course #${deck.courseId}` });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: 'Flashcards', onClick: backToList }, { label: deck.title }]} />
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-content">Flashcard Detail</h2>
          <p className="text-sm text-content-soft mt-0.5">
            #{deck.deckId} · Owner {deck.ownerName}
            {dirty && <span className="ml-2 font-medium text-warning">· Unsaved changes</span>}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          <section className="card p-5 space-y-4" aria-labelledby="deck-overview-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="deck-overview-title" className="text-lg font-semibold text-content">Deck Information</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" icon={<Icon.Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)} disabled={dirty || editor.hasInput || saving}>Import file</Button>
                {dirty && <Button variant="ghost" size="sm" onClick={discardChanges} disabled={saving}>Discard changes</Button>}
              </div>
            </div>
            {saveError && <Alert type="error" message={saveError} />}
            {/* Always editable — Save sends only the changed fields. */}
            <DeckInfoFields idPrefix="deck" value={draft ?? saved} errors={infoErrors} onChange={updateDraft}
              courses={courseOptions} coursesLoading={coursesLoading}
              // A deck can move between courses but never back to "no course".
              allowNoCourse={deck.courseId == null} />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-4">
              <Button variant="danger" icon={<Icon.Trash className="w-4 h-4" />} onClick={() => setConfirmDelete(true)} disabled={saving}>
                Delete
              </Button>
              {/* Back to the list — unsaved changes are confirmed first (UnsavedChangesModal). */}
              <Button variant="outline" onClick={backToList} disabled={saving}>Cancel</Button>
              <Button icon={<Icon.Check className="w-4 h-4" />} onClick={handleSave} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </section>

          <CardList cards={cards} editor={editor} />
        </div>

        <CardEditorPanel editor={editor} idPrefix="card" className="lg:sticky lg:top-4"
          footnote="Each card is saved as soon as you add, update or delete it." />
      </div>

      <Modal open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} title="Delete deck?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }>
        <p className="text-base text-content-secondary">
          <span className="font-semibold text-content">"{deck.title}"</span> and its {deck.cardCount} card{deck.cardCount === 1 ? '' : 's'} will
          be permanently deleted, together with every learner's progress on them. This cannot be undone.
        </p>
      </Modal>

      {importOpen && <FlashcardImportModal deckId={deck.deckId} deckTitle={deck.title} onClose={() => setImportOpen(false)} onImported={() => { void refreshDeck(); }} />}

      <UnsavedChangesModal blocker={blocker} message="You have unsaved changes to this deck. If you leave now, they will be lost." />
    </div>
  );
}
