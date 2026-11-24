import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/assets/icons';
import type { QuestionGroup } from '@/services/questionGroup.service';
import { GROUP_KIND_LABELS, asGroupKind, type GroupKind } from '../model';
import { NewGroupModal } from './NewGroupModal';

export const groupLabel = (g: Pick<QuestionGroup, 'groupId' | 'title'>) => g.title?.trim() || `Group #${g.groupId}`;

/** Title + shared passage inputs, used to create a group and to edit one. */
function GroupFields({ idPrefix, title, passage, onTitle, onPassage, showErrors, disabled }: {
  idPrefix: string;
  title: string;
  passage: string;
  onTitle: (v: string) => void;
  onPassage: (v: string) => void;
  showErrors: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Input
        label="Group title *"
        value={title}
        onChange={e => onTitle(e.target.value)}
        maxLength={255}
        placeholder="e.g. Reading passage 1 — Climate change"
        error={showErrors && !title.trim() ? 'Enter a group title.' : undefined}
        disabled={disabled}
      />
      <div>
        <label htmlFor={`${idPrefix}-group-passage`} className="block text-sm font-medium text-content-secondary mb-1">Shared passage *</label>
        <textarea
          id={`${idPrefix}-group-passage`}
          value={passage}
          onChange={e => onPassage(e.target.value)}
          disabled={disabled}
          placeholder="Paste the reading passage or scenario every question in this group refers to…"
          className={`w-full h-[110px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
            showErrors && !passage.trim() ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
          }`}
        />
        {showErrors && !passage.trim() && <p className="text-xs text-danger mt-1">Enter the shared passage.</p>}
      </div>
    </>
  );
}

/** "Quiz" for a QUIZ group; null for groups made before kinds existed. */
export const groupKindLabel = (g: Pick<QuestionGroup, 'questionType'>) => {
  const kind = asGroupKind(g.questionType);
  return kind ? GROUP_KIND_LABELS[kind] : null;
};

/** "Quiz · 3 questions (Published)" / "Draft" / "1/3 published" */
export const groupPublishLabel = (g: Pick<QuestionGroup, 'questionCount' | 'publishedQuestionCount'>): string => {
  const total = g.questionCount ?? 0;
  const pub = g.publishedQuestionCount;
  if (total === 0) return '0 questions';
  if (pub == null) return `${total} question${total === 1 ? '' : 's'}`;
  if (pub >= total) return `${total} question${total === 1 ? '' : 's'} · Published`;
  if (pub > 0) return `${total} question${total === 1 ? '' : 's'} · ${pub}/${total} published`;
  return `${total} question${total === 1 ? '' : 's'} · Draft`;
};

/** "[Quiz] Reading passage 1 · 3 questions · Published" for group dropdowns. */
export const groupOptionLabel = (g: QuestionGroup) => {
  const kind = groupKindLabel(g);
  return `${kind ? `[${kind}] ` : ''}${groupLabel(g)} · ${groupPublishLabel(g)}`;
};

/**
 * Can a question of `kind` (in `moduleId`, '' = none) join `group`? Mirrors
 * QuestionServiceImpl.updateQuestion: one kind per group (a group without a
 * kind takes the first one), and a question in a module only joins a group of
 * that same module.
 */
export const groupFits = (g: QuestionGroup, kind: GroupKind | null, moduleId: string) =>
  (!g.questionType || !kind || g.questionType === kind) && (!moduleId || String(g.moduleId ?? '') === moduleId);

const PENDING_GROUP_VALUE = '__pending__';

export interface PendingGroupDraft {
  title: string;
  passageText: string;
  questionType: GroupKind;
}

/**
 * Link the question to a shared passage: pick a group of the course (only the
 * ones this question fits are offered), or write a new one. Picking a group
 * links it at once — the link (and any newly drafted group) is stored with Save Changes.
 */
export function QuestionGroupPicker({ groups, loading, currentGroupId, pendingGroup, kind, moduleId, onSelect, onCreate, onUpdate, disabled }: {
  groups: QuestionGroup[];
  loading?: boolean;
  currentGroupId: number | null;
  pendingGroup?: PendingGroupDraft | null;
  /** The question's kind — new groups get it, and only groups of it are offered. */
  kind: GroupKind | null;
  /** The question's module ('' = none). */
  moduleId: string;
  onSelect: (group: QuestionGroup | null) => void;
  onCreate: (title: string, passageText: string) => Promise<void> | void;
  onUpdate?: (group: QuestionGroup, title: string, passageText: string) => Promise<void>;
  disabled?: boolean;
}) {
  const hasPending = Boolean(pendingGroup);
  const selected = hasPending ? PENDING_GROUP_VALUE : (currentGroupId != null ? String(currentGroupId) : '');
  const [modalMode, setModalMode] = useState<'create' | 'editPending' | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPassage, setEditPassage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [showEditErrors, setShowEditErrors] = useState(false);

  // An open edit belongs to one group — close it when another group is picked.
  useEffect(() => {
    setEditing(false);
  }, [selected]);

  const fitting = groups.filter(g => groupFits(g, kind, moduleId));
  const options = fitting.map(g => ({ label: groupOptionLabel(g), value: String(g.groupId) }));
  if (pendingGroup) {
    options.unshift({
      label: `[${GROUP_KIND_LABELS[pendingGroup.questionType]}] ${pendingGroup.title} · 1 question (created on Save)`,
      value: PENDING_GROUP_VALUE,
    });
  }
  const selectedGroup = hasPending ? undefined : groups.find(g => String(g.groupId) === selected);
  // Keep the linked group selectable even when it isn't offered (not loaded, or the question no longer fits it).
  if (!hasPending && currentGroupId != null && !options.some(o => o.value === selected)) {
    options.unshift({ label: selectedGroup ? groupOptionLabel(selectedGroup) : groupLabel({ groupId: currentGroupId, title: null }), value: selected });
  }
  const misfit = selectedGroup != null && !groupFits(selectedGroup, kind, moduleId);
  const kindName = kind ? GROUP_KIND_LABELS[kind].toLowerCase() : null;

  const pick = (value: string) => {
    if (!value) return onSelect(null);
    if (value === PENDING_GROUP_VALUE) return;
    const group = groups.find(g => String(g.groupId) === value);
    if (group) onSelect(group);
  };

  const startEdit = () => {
    if (pendingGroup) {
      setModalMode('editPending');
      return;
    }
    if (!selectedGroup) return;
    setEditTitle(selectedGroup.title ?? '');
    setEditPassage(selectedGroup.passageText ?? '');
    setShowEditErrors(false);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selectedGroup || !onUpdate) return;
    setShowEditErrors(true);
    if (!editTitle.trim() || !editPassage.trim()) return;
    setSavingEdit(true);
    try {
      await onUpdate(selectedGroup, editTitle.trim(), editPassage.trim());
      setEditing(false);
    } catch {
      // The parent reports the error; keep the form open so nothing typed is lost.
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-line bg-surface-alt/50 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-content-secondary">Question Group</span>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <SearchableSelect
            className="flex-1 min-w-0"
            aria-label="Question group"
            value={selected}
            onChange={pick}
            action={{ label: 'New Group', onSelect: () => setModalMode('create') }}
            placeholder="No group (standalone question)"
            searchPlaceholder="Search groups…"
            emptyText={`No ${kindName ? `${kindName} ` : ''}groups found`}
            disabled={disabled || loading || savingEdit || editing}
            options={[
              { label: loading ? 'Loading groups…' : 'No group (standalone question)', value: '' },
              ...options,
            ]}
          />
          {(onUpdate || pendingGroup) && (
            <Button
              type="button"
              variant="outline"
              icon={<Icon.Edit className="w-4 h-4" />}
              onClick={startEdit}
              disabled={disabled || (!selectedGroup && !pendingGroup) || editing}
            >
              Edit Group
            </Button>
          )}
        </div>
        {pendingGroup ? (
          <p className="text-xs text-content-subtle">
            This new group will be created together with this question when you click Save Changes.
          </p>
        ) : misfit ? (
          <p className="text-xs text-danger">
            This {kindName ?? ''} question doesn’t fit this group{selectedGroup?.questionType ? ` (a ${groupKindLabel(selectedGroup)?.toLowerCase()} group)` : ''}
            {moduleId && String(selectedGroup?.moduleId ?? '') !== moduleId ? ' or its module' : ''}. Pick another group or change the type.
          </p>
        ) : (
          <p className="text-xs text-content-subtle">
            {!loading && options.length === 0
              ? `No ${kindName ? `${kindName} ` : ''}groups in this ${moduleId ? 'module' : 'course'} yet — create one.`
              : `Only ${kindName ? `${kindName} ` : ''}groups${moduleId ? ' of this module' : ''} are listed. The change is kept when you click Save Changes.`}
          </p>
        )}

        {editing && selectedGroup && (
          <div className="space-y-2 rounded-[10px] border border-line bg-surface p-3">
            <GroupFields
              idPrefix="edit"
              title={editTitle}
              passage={editPassage}
              onTitle={setEditTitle}
              onPassage={setEditPassage}
              showErrors={showEditErrors}
              disabled={disabled || savingEdit}
            />
            <p className="text-xs text-content-subtle">
              Saved right away — the new passage is shown for all {selectedGroup.questionCount} question{selectedGroup.questionCount === 1 ? '' : 's'} in this group.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</Button>
              <Button type="button" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={saveEdit} loading={savingEdit} disabled={disabled || savingEdit}>
                Save Group
              </Button>
            </div>
          </div>
        )}
      </div>

      <NewGroupModal
        open={modalMode != null}
        onClose={() => setModalMode(null)}
        fixedKind={kind ?? 'QUIZ'}
        initial={modalMode === 'editPending' && pendingGroup ? { title: pendingGroup.title, passage: pendingGroup.passageText, kind: pendingGroup.questionType } : undefined}
        onSave={g => onCreate(g.title, g.passage)}
      />
    </div>
  );
}

/** Sidebar card with the linked group's name and full passage. */
export function GroupInfoCard({ group, groupId, pendingGroup, loading, pending, onUnlink }: {
  group: QuestionGroup | null;
  /** The question's group id — shown even when the group's details aren't in the loaded list. */
  groupId?: number | null;
  pendingGroup?: PendingGroupDraft | null;
  loading?: boolean;
  pending?: boolean;
  onUnlink?: () => void;
}) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-content">
          <Icon.Layers className="w-4 h-4 text-brand-ink" /> Question Group
        </h3>
        {(pending || pendingGroup) && <span className="text-xs font-medium text-warning">Unsaved</span>}
      </div>
      {pendingGroup ? (
        <>
          <p className="text-sm font-semibold text-content">{pendingGroup.title}</p>
          <p className="text-xs text-content-subtle">{GROUP_KIND_LABELS[pendingGroup.questionType]} group · Created when you save</p>
          <div className="max-h-[260px] overflow-y-auto rounded-[8px] bg-surface-alt px-3 py-2 text-sm text-content-secondary whitespace-pre-wrap">
            {pendingGroup.passageText}
          </div>
          {onUnlink && (
            <button type="button" onClick={onUnlink} className="text-xs font-medium text-content-soft hover:text-danger hover:underline">
              Undo new group
            </button>
          )}
        </>
      ) : group ? (
        <>
          <p className="text-sm font-semibold text-content">{groupLabel(group)}</p>
          <p className="text-xs text-content-subtle">{groupKindLabel(group) ? `${groupKindLabel(group)} group · ` : ''}{groupPublishLabel(group)}</p>
          <div className="max-h-[260px] overflow-y-auto rounded-[8px] bg-surface-alt px-3 py-2 text-sm text-content-secondary whitespace-pre-wrap">
            {group.passageText?.trim() || <span className="text-content-subtle italic">No passage text.</span>}
          </div>
          {pending && onUnlink && (
            <button type="button" onClick={onUnlink} className="text-xs font-medium text-content-soft hover:text-danger hover:underline">
              Undo group change
            </button>
          )}
        </>
      ) : groupId != null ? (
        <>
          <p className="text-sm font-semibold text-content">{groupLabel({ groupId, title: null })}</p>
          <p className="text-xs text-content-subtle">{loading ? 'Loading group…' : "Couldn't load this group's passage."}</p>
        </>
      ) : (
        <p className="text-sm text-content-soft">This question is standalone. Pick a group to share a reading passage with other questions.</p>
      )}
    </div>
  );
}
