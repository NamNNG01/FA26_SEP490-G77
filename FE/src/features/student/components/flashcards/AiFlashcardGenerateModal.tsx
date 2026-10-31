import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  AI_CARDS_DEFAULT,
  AI_CARDS_MAX,
  AI_CARDS_MIN,
  AI_FILE_EXTENSIONS,
  AI_FILE_MAX_BYTES,
  AI_FOCUS_TOPIC_MAX,
  AI_POLL_INTERVAL_MS,
  AI_POLL_TIMEOUT_MS,
  AI_TEXT_MAX,
  aiErrorCode,
  aiErrorText,
  aiFlashcardService,
  type AiCardStyle,
  type AiLanguage,
  type AiUsage,
} from '@/services/aiFlashcard.service';
import { FLASHCARD_TEXT_MAX, flashcardImportService } from '@/services/flashcardImport.service';
import { studentDeckService, type DeckListItem } from '@/services/studentDeck.service';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';

type Step = 'form' | 'generating' | 'review' | 'done';
type InputMode = 'text' | 'file';
type Destination = 'existing' | 'new';
type ReviewCard = { tempId: string; frontText: string; backText: string; selected: boolean };

const LANGUAGE_OPTIONS = [
  { value: 'AUTO', label: 'Same as the content' },
  { value: 'VI', label: 'Vietnamese' },
  { value: 'EN', label: 'English' },
];
const STYLE_OPTIONS = [
  { value: 'QA', label: 'Question – answer' },
  { value: 'TERM_DEFINITION', label: 'Term – definition' },
];

const fmt = (n: number) => n.toLocaleString('en-US');
/** The free quota is daily on the BE, so the reset time matters as much as the date. */
const dateTimeLabel = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

/** API 31 → poll API 32 → review → API 30 (source = AI). Student "My decks" only. */
export function AiFlashcardGenerateModal({ onClose, onSaved }: {
  onClose: () => void;
  /** A deck got new cards — refresh the list. */
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>('form');
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Form
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [numberOfCards, setNumberOfCards] = useState(String(AI_CARDS_DEFAULT));
  const [language, setLanguage] = useState<AiLanguage>('AUTO');
  const [style, setStyle] = useState<AiCardStyle>('QA');
  const [focusTopic, setFocusTopic] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<MyCourse[]>([]);

  // Job
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [remainingTokens, setRemainingTokens] = useState<number | null>(null);

  // Save
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [destination, setDestination] = useState<Destination>('new');
  const [deckId, setDeckId] = useState('');
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [result, setResult] = useState<{ createdCount: number; skippedDuplicateCount: number; deckTitle: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(() => {
    setUsageError(null);
    aiFlashcardService.getMyUsage()
      .then(setUsage)
      .catch(err => setUsageError(getApiErrorMessage(err, 'Could not load your AI token balance.')));
  }, []);

  useEffect(() => {
    loadUsage();
    // Optional course picker: enrolled courses only.
    studentCourseService.getMyCourses({ status: 'ACTIVE', page: 0, size: 100 })
      .then(res => setCourses(res.content))
      .catch(() => setCourses([]));
  }, [loadUsage]);

  // ── Polling (API 32)
  useEffect(() => {
    if (step !== 'generating' || generationId == null || timedOut) return;
    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const job = await aiFlashcardService.getGeneration(generationId);
        if (cancelled) return;
        if (job.status === 'COMPLETED') {
          const list = job.cards ?? [];
          setCards(list.map(c => ({ ...c, selected: true })));
          setRemainingTokens(job.usage?.remainingTokens ?? null);
          if (job.saved) setError(aiErrorText('GENERATION_ALREADY_SAVED', null, ''));
          setStep('review');
          loadUsage();
          return;
        }
        if (job.status === 'FAILED') {
          setError(aiErrorText(job.errorCode, job.errorMessage, 'The AI could not generate flashcards.'));
          setStep('form');
          setGenerationId(null);
          loadUsage();
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(aiErrorText(aiErrorCode(err), getApiErrorMessage(err, ''), 'Could not check the generation status.'));
        setStep('form');
        setGenerationId(null);
        return;
      }
      if (Date.now() - startedAt >= AI_POLL_TIMEOUT_MS) { setTimedOut(true); return; }
      timer = window.setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [step, generationId, timedOut, loadUsage]);

  // Decks for "Add to an existing deck" — only plain front/back decks.
  useEffect(() => {
    if (step !== 'review' || decks.length) return;
    studentDeckService.listAllDecks({ scope: 'MINE', mode: 'FLASHCARD' })
      .then(list => {
        setDecks(list);
        if (list.length && !deckId) setDeckId(String(list[0].deckId));
      })
      .catch(() => setDecks([]));
  }, [step, decks.length, deckId]);

  const chooseFile = (candidate?: File) => {
    setFileError(null);
    if (!candidate) return;
    const ext = candidate.name.toLowerCase().split('.').pop() ?? '';
    if (!AI_FILE_EXTENSIONS.includes(ext)) { setFile(null); setFileError('Only PDF, Word (.docx) and text (.txt) files are supported.'); return; }
    if (candidate.size === 0) { setFile(null); setFileError('This file is empty.'); return; }
    if (candidate.size > AI_FILE_MAX_BYTES) { setFile(null); setFileError(`This file is ${(candidate.size / 1024 / 1024).toFixed(2)} MB — the limit is 10 MB.`); return; }
    setFile(candidate);
  };

  const cardCount = Number(numberOfCards);
  const cardCountValid = Number.isInteger(cardCount) && cardCount >= AI_CARDS_MIN && cardCount <= AI_CARDS_MAX;
  const hasInput = inputMode === 'text' ? text.trim().length > 0 : file != null;
  const outOfTokens = usage != null && usage.tokenRemaining <= 0;
  const canGenerate = hasInput && cardCountValid && text.length <= AI_TEXT_MAX && focusTopic.length <= AI_FOCUS_TOPIC_MAX && !outOfTokens && !busy;

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = await aiFlashcardService.generate({
        ...(inputMode === 'text' ? { text: text.trim() } : { file: file! }),
        numberOfCards: cardCount,
        language,
        style,
        focusTopic: focusTopic.trim() || undefined,
        courseId: courseId ? Number(courseId) : undefined,
      });
      setGenerationId(accepted.generationId);
      setTimedOut(false);
      setStep('generating');
    } catch (err) {
      setError(aiErrorText(aiErrorCode(err), getApiErrorMessage(err, ''), 'Could not start the generation.'));
      loadUsage();
    } finally { setBusy(false); }
  };

  const updateCard = (tempId: string, patch: Partial<ReviewCard>) =>
    setCards(list => list.map(c => (c.tempId === tempId ? { ...c, ...patch } : c)));
  const removeCard = (tempId: string) => setCards(list => list.filter(c => c.tempId !== tempId));

  const chosen = useMemo(() => cards.filter(c => c.selected), [cards]);
  const invalidChosen = chosen.filter(c => !c.frontText.trim() || !c.backText.trim()).length;
  const saveDisabled = busy || chosen.length === 0 || invalidChosen > 0
    || (destination === 'new' ? !newDeckTitle.trim() : !deckId);

  const save = async () => {
    if (saveDisabled || generationId == null) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await flashcardImportService.save({
        ...(destination === 'existing'
          ? { deckId: Number(deckId) }
          : { newDeck: { title: newDeckTitle.trim(), description: newDeckDescription.trim() || undefined, isPublic: false, courseId: null } }),
        source: 'AI',
        aiGenerationId: generationId,
        skipDuplicates: true,
        cards: chosen.map(c => ({ frontText: c.frontText.trim(), backText: c.backText.trim() })),
      });
      const deckTitle = destination === 'new' ? newDeckTitle.trim() : decks.find(d => String(d.deckId) === deckId)?.title ?? 'your deck';
      setResult({ createdCount: saved.createdCount, skippedDuplicateCount: saved.skippedDuplicateCount, deckTitle });
      setStep('done');
      onSaved();
    } catch (err) {
      setError(aiErrorText(aiErrorCode(err), getApiErrorMessage(err, ''), 'Could not save the flashcards.'));
    } finally { setBusy(false); }
  };

  const startOver = () => {
    setStep('form');
    setGenerationId(null);
    setTimedOut(false);
    setCards([]);
    setError(null);
  };

  const title = step === 'done' ? 'Flashcards saved' : step === 'review' ? 'Review AI flashcards' : 'Generate flashcards with AI';
  const footer = step === 'done' ? <Button onClick={onClose}>Done</Button>
    : step === 'review' ? <>
      <Button variant="outline" onClick={startOver} disabled={busy}>Generate again</Button>
      <Button icon={<Icon.Check className="h-4 w-4" />} onClick={() => void save()} disabled={saveDisabled} loading={busy}>Save {chosen.length} {chosen.length === 1 ? 'card' : 'cards'}</Button>
    </>
    : step === 'generating' ? <Button variant="outline" onClick={onClose}>Close</Button>
    : <>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button icon={<Icon.Zap className="h-4 w-4" />} onClick={() => void generate()} disabled={!canGenerate} loading={busy}>Generate</Button>
    </>;

  return <Modal open onClose={onClose} title={title} size={step === 'review' ? '2xl' : 'lg'} footer={footer} dismissible={!busy}>
    {step === 'done' && result ? <div className="space-y-2">
      <p className="text-sm text-content-secondary">Saved {result.createdCount} flashcards to “{result.deckTitle}”.</p>
      {result.skippedDuplicateCount > 0 && <p className="text-sm text-content-soft">Skipped {result.skippedDuplicateCount} duplicate {result.skippedDuplicateCount === 1 ? 'card' : 'cards'} already in the deck.</p>}
    </div>

    : step === 'generating' ? <div className="flex flex-col items-center gap-3 py-10 text-center">
      {timedOut ? <>
        <Icon.Clock className="h-8 w-8 text-warning" />
        <p className="text-sm font-medium text-content">This is taking longer than usual.</p>
        <p className="max-w-sm text-xs text-content-soft">The AI is still working. Keep waiting, or close this window and try again later.</p>
        <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="h-3.5 w-3.5" />} onClick={() => setTimedOut(false)}>Keep waiting</Button>
      </> : <>
        <Spinner />
        <p className="text-sm font-medium text-content">Generating your flashcards…</p>
        <p className="text-xs text-content-soft">This usually takes under a minute.</p>
      </>}
    </div>

    : step === 'review' ? <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-content-secondary">
        <Badge variant="info">{cards.length} generated</Badge>
        <Badge variant="success">{chosen.length} selected</Badge>
        {invalidChosen > 0 && <Badge variant="danger">{invalidChosen} need both sides</Badge>}
        {remainingTokens != null && <span className="ml-auto text-xs text-content-soft">{fmt(remainingTokens)} tokens left</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
        <Select label="Save cards to" value={destination} onChange={v => setDestination(v as Destination)}
          options={[{ value: 'new', label: 'A new deck' }, ...(decks.length ? [{ value: 'existing', label: 'An existing deck' }] : [])]} />
        {destination === 'new' ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="New deck title" maxLength={255} value={newDeckTitle} onChange={e => setNewDeckTitle(e.target.value)} placeholder="e.g. Biology Chapter 1" />
          <Input label="Description (optional)" maxLength={1000} value={newDeckDescription} onChange={e => setNewDeckDescription(e.target.value)} />
        </div> : <Select label="Deck" value={deckId} onChange={setDeckId} options={decks.map(d => ({ value: String(d.deckId), label: `${d.title} (${d.cardCount} cards)` }))} />}
      </div>
      {cards.length === 0 ? <p className="py-6 text-center text-sm text-content-soft">The AI returned no cards. Try again with more content.</p>
        : <div className="max-h-[45vh] overflow-auto rounded-lg border border-line">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface-alt text-xs uppercase tracking-wide text-content-soft">
              <tr>
                <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all cards" checked={chosen.length === cards.length} onChange={e => setCards(list => list.map(c => ({ ...c, selected: e.target.checked })))} /></th>
                <th className="px-3 py-2">Front</th><th className="px-3 py-2">Back</th><th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>{cards.map((c, i) => {
              const invalid = c.selected && (!c.frontText.trim() || !c.backText.trim());
              return <tr key={c.tempId} className={`border-t border-line-faint align-top ${!c.selected ? 'opacity-50' : invalid ? 'bg-danger-light/30' : ''}`}>
                <td className="px-3 py-3"><input type="checkbox" aria-label={`Select card ${i + 1}`} checked={c.selected} onChange={e => updateCard(c.tempId, { selected: e.target.checked })} /></td>
                <td className="px-3 py-3"><textarea aria-label={`Front text, card ${i + 1}`} maxLength={FLASHCARD_TEXT_MAX} value={c.frontText} onChange={e => updateCard(c.tempId, { frontText: e.target.value })} className="min-h-16 w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" /></td>
                <td className="px-3 py-3"><textarea aria-label={`Back text, card ${i + 1}`} maxLength={FLASHCARD_TEXT_MAX} value={c.backText} onChange={e => updateCard(c.tempId, { backText: e.target.value })} className="min-h-16 w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" /></td>
                <td className="px-3 py-3"><button type="button" onClick={() => removeCard(c.tempId)} aria-label={`Remove card ${i + 1}`} className="p-1 text-content-subtle hover:text-danger"><Icon.Trash className="h-4 w-4" /></button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <p className="text-xs text-content-soft">Only selected cards are saved. Cards already in the chosen deck are skipped.</p>
    </div>

    : <div className="space-y-4">
      <UsageBar usage={usage} error={usageError} onRetry={loadUsage} />
      <div className="inline-flex rounded-[10px] border border-line p-0.5" role="tablist" aria-label="Content source">
        {(['text', 'file'] as InputMode[]).map(m => <button key={m} type="button" role="tab" aria-selected={inputMode === m}
          onClick={() => setInputMode(m)}
          className={`rounded-[8px] px-3 py-1.5 text-sm font-medium ${inputMode === m ? 'bg-primary-light text-brand-ink-strong' : 'text-content-soft hover:text-content'}`}>
          {m === 'text' ? 'Paste text' : 'Upload file'}
        </button>)}
      </div>
      {inputMode === 'text' ? <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
        Content
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={AI_TEXT_MAX} placeholder="Paste lecture notes, an article or a chapter…"
          className="min-h-40 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
        <span className={`self-end text-2xs font-normal ${text.length >= AI_TEXT_MAX ? 'text-danger' : 'text-content-subtle'}`}>{fmt(text.length)} / {fmt(AI_TEXT_MAX)}</span>
      </label> : <div className="space-y-2">
        <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}
          className="card cursor-pointer border-2 border-dashed border-brand-line bg-primary-light p-6 text-center">
          <Icon.Upload className="mx-auto mb-2 h-8 w-8 text-brand-ink" />
          <p className="text-sm font-semibold text-brand-ink-strong">Drag &amp; drop or click to browse</p>
          <p className="mt-1 text-xs text-content-soft">PDF (with selectable text), Word (.docx) or .txt, up to 10 MB</p>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {fileError && <p className="text-xs text-danger">{fileError}</p>}
        {file && <div className="flex items-center gap-3 rounded-[10px] bg-surface-alt p-3">
          <Icon.FileText className="h-5 w-5 flex-shrink-0 text-brand-ink" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-content-secondary">{file.name}</p><p className="text-2xs text-content-subtle">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="p-1 text-content-subtle hover:text-danger"><Icon.X className="h-4 w-4" /></button>
        </div>}
      </div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Number of cards" type="number" min={AI_CARDS_MIN} max={AI_CARDS_MAX} value={numberOfCards} onChange={e => setNumberOfCards(e.target.value)}
          error={numberOfCards && !cardCountValid ? `Enter ${AI_CARDS_MIN}–${AI_CARDS_MAX}.` : undefined} />
        <Select label="Card style" value={style} onChange={v => setStyle(v as AiCardStyle)} options={STYLE_OPTIONS} />
        <Select label="Language" value={language} onChange={v => setLanguage(v as AiLanguage)} options={LANGUAGE_OPTIONS} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Focus topic (optional)" maxLength={AI_FOCUS_TOPIC_MAX} value={focusTopic} onChange={e => setFocusTopic(e.target.value)} placeholder="e.g. Photosynthesis" />
        <Select label="Course (optional)" value={courseId} onChange={setCourseId}
          options={[{ value: '', label: 'No course' }, ...courses.map(c => ({ value: String(c.courseId), label: c.title }))]} />
      </div>
    </div>}

    {error && step !== 'done' && <div className="mt-4"><Alert type="error" title={step === 'review' ? 'Could not save' : 'Could not generate'} message={error} /></div>}
  </Modal>;
}

function UsageBar({ usage, error, onRetry }: { usage: AiUsage | null; error: string | null; onRetry: () => void }) {
  if (error) return <div className="flex items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2 text-xs text-content-soft">
    <span>{error}</span><button type="button" onClick={onRetry} className="font-medium text-brand-ink hover:underline">Retry</button>
  </div>;
  if (!usage) return <div className="h-14 animate-pulse rounded-[10px] bg-surface-alt" />;
  const used = usage.tokenUsed + usage.tokenReserved;
  const pct = usage.tokenLimit > 0 ? Math.min(100, Math.round((used / usage.tokenLimit) * 100)) : 100;
  const low = usage.tokenRemaining <= 0;
  return <div className="space-y-1.5 rounded-[10px] border border-line px-3 py-2.5">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="font-medium text-content-secondary">
        {usage.billingSource === 'SUBSCRIPTION' ? usage.planName ?? 'Your plan' : 'Free quota'} · {fmt(usage.tokenRemaining)} of {fmt(usage.tokenLimit)} AI tokens left
      </span>
      <span className="text-content-subtle">Resets {dateTimeLabel(usage.periodEnd)}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
      <div className={`h-full rounded-full ${low ? 'bg-danger' : pct > 80 ? 'bg-warning' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
    </div>
    {low && <p className="text-xs text-danger">You have no AI tokens left this period.</p>}
  </div>;
}
