import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { GROUP_KIND_LABELS, GROUP_KIND_OPTIONS, type GroupKind } from '../model';

export interface NewGroupValues {
  title: string;
  passage: string;
  kind: GroupKind;
}

/**
 * "+ New Group" from a group dropdown: title, kind and shared passage. `onSave`
 * resolves once the group is kept (the caller then selects it); a rejection keeps
 * the modal open so nothing typed is lost. With `fixedKind` the kind can't change
 * (the group is made for one question of that kind).
 */
export function NewGroupModal({ open, onClose, onSave, initial, fixedKind, kindInvalid, saveLabel = 'Save' }: {
  open: boolean;
  onClose: () => void;
  onSave: (values: NewGroupValues) => Promise<void> | void;
  initial?: Partial<NewGroupValues>;
  fixedKind?: GroupKind | null;
  /** The questions already written don't fit the picked kind. */
  kindInvalid?: (kind: GroupKind) => boolean;
  saveLabel?: string;
}) {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [kind, setKind] = useState<GroupKind>('QUIZ');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setPassage(initial?.passage ?? '');
    setKind(fixedKind ?? initial?.kind ?? 'QUIZ');
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the modal opens
  }, [open]);

  const save = async () => {
    setShowErrors(true);
    if (!title.trim() || !passage.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), passage: passage.trim(), kind });
      onClose();
    } catch {
      // The caller reports the error; keep the modal open.
    } finally {
      setSaving(false);
    }
  };

  const titleError = showErrors && !title.trim() ? 'Enter a group title.' : undefined;
  const passageError = showErrors && !passage.trim() ? 'Enter the shared passage.' : undefined;
  const hint = GROUP_KIND_OPTIONS.find(o => o.value === kind)?.hint;

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={initial?.title ? 'Edit New Group' : 'New Question Group'}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} loading={saving} disabled={saving}>{saveLabel}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className={`grid grid-cols-1 gap-3 ${fixedKind ? '' : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
          <Input
            label="Group title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={255}
            placeholder="e.g. IELTS Reading — Passage 1: The history of glass"
            error={titleError}
            disabled={saving}
          />
          {!fixedKind && (
            <Select
              label="Group type *"
              value={kind}
              onChange={v => setKind(v as GroupKind)}
              invalid={kindInvalid?.(kind)}
              disabled={saving}
              options={GROUP_KIND_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
            />
          )}
        </div>
        <p className="text-xs text-content-subtle -mt-1">
          {fixedKind
            ? `Created as a ${GROUP_KIND_LABELS[fixedKind].toLowerCase()} group.`
            : `${hint}. A group can't mix question types of different kinds.`}
          {!fixedKind && kindInvalid?.(kind) && <span className="text-danger"> Some questions you've written aren't of this kind.</span>}
        </p>
        <div>
          <label htmlFor="new-group-passage" className="block text-sm font-medium text-content-secondary mb-1">Shared passage *</label>
          <textarea
            id="new-group-passage"
            value={passage}
            onChange={e => setPassage(e.target.value)}
            disabled={saving}
            placeholder="Paste the reading passage, listening transcript or scenario that every question in this group refers to…"
            className={`w-full h-[220px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
              passageError ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
            }`}
          />
          {passageError && <p className="text-xs text-danger mt-1">{passageError}</p>}
        </div>
      </div>
    </Modal>
  );
}
