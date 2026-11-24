import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/assets/icons';
import type { QuestionGroup } from '@/services/questionGroup.service';
import { GROUP_KIND_LABELS, asGroupKind, type GroupKind } from '../model';
import { groupOptionLabel } from './QuestionGroupPicker';
import { NewGroupModal } from './NewGroupModal';

/** standalone = independent questions; existing / new = every question shares one passage (e.g. an IELTS reading). */
export type GroupMode = 'standalone' | 'existing' | 'new';

export interface GroupContextValue {
  mode: GroupMode;
  existingGroupId: string;
  newTitle: string;
  newPassage: string;
  /** The one kind of question the new group holds. */
  newKind: GroupKind;
}

export const emptyGroupContext = (): GroupContextValue => ({ mode: 'standalone', existingGroupId: '', newTitle: '', newPassage: '', newKind: 'QUIZ' });

export function groupContextErrors(v: GroupContextValue): { group?: string; title?: string; passage?: string } {
  if (v.mode === 'existing' && !v.existingGroupId) return { group: 'Select a question group.' };
  if (v.mode === 'new') {
    return {
      ...(v.newTitle.trim() ? {} : { title: 'Enter a group title.' }),
      ...(v.newPassage.trim() ? {} : { passage: 'Enter the shared passage.' }),
    };
  }
  return {};
}

/** Groups a batch in `moduleId` ('' = none) can be saved into (Q-03 allows groups without a module). */
export const groupsForModule = (groups: QuestionGroup[], moduleId: string) =>
  groups.filter(g => !moduleId || g.moduleId == null || String(g.moduleId) === moduleId);

/**
 * The kind every question of the batch must be: the new group's, or the picked
 * group's. null = any type (standalone, or a group made before kinds existed).
 */
export function contextKind(v: GroupContextValue, groups: QuestionGroup[]): GroupKind | null {
  if (v.mode === 'new') return v.newKind;
  if (v.mode === 'existing') return asGroupKind(groups.find(g => String(g.groupId) === v.existingGroupId)?.questionType);
  return null;
}

/** The pending new group's value in the group dropdown — never a group id. */
const NEW_GROUP_VALUE = 'new';

const MODES: { value: 'standalone' | 'group'; label: string; hint: string }[] = [
  { value: 'standalone', label: 'Standalone questions', hint: 'Each question stands on its own.' },
  { value: 'group', label: 'Question group', hint: 'Questions share one passage — pick a group or create one.' },
];

/**
 * Top of the New Questions column: decides whether the batch is standalone or
 * a question group (shared passage / scenario, like one IELTS reading). A group
 * holds one kind of question — Quiz, Essay, Code or Diagram — so in group mode
 * the questions' types are limited to that kind. The group dropdown lists the
 * course's groups under a "+ New Group" row; a new group is written in a modal,
 * selected at once, and created on save together with the questions. The
 * passage stays visible above the questions while they are written.
 */
export function GroupContextCard({ value, onChange, groups, loadingGroups, courseSelected, moduleId, questionKinds = [], showErrors, kindInvalid, disabled }: {
  value: GroupContextValue;
  onChange: (v: GroupContextValue) => void;
  groups: QuestionGroup[];
  loadingGroups?: boolean;
  courseSelected: boolean;
  /** The batch's module ('' = none) — only groups the batch can join are offered. */
  moduleId: string;
  /**
   * Kinds of the questions already written. One kind → only groups of it are
   * offered; several → no existing group fits until they agree. A new group's
   * type stays free — a mismatch is reported when saving.
   */
  questionKinds?: GroupKind[];
  showErrors?: boolean;
  /** Some questions don't fit the new group's type — the group dropdown turns red. */
  kindInvalid?: boolean;
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const set = (patch: Partial<GroupContextValue>) => onChange({ ...value, ...patch });
  const errors = showErrors ? groupContextErrors(value) : {};
  const mixed = questionKinds.length > 1;
  const writtenKind = questionKinds.length === 1 ? questionKinds[0] : null;
  const kindNames = questionKinds.map(k => GROUP_KIND_LABELS[k]).join(' and ');
  // Groups without a kind yet take the kind of the first questions saved into them.
  const offered = mixed ? [] : groupsForModule(groups, moduleId).filter(g => !writtenKind || !g.questionType || g.questionType === writtenKind);
  const hiddenByKind = writtenKind ? groupsForModule(groups, moduleId).length - offered.length : 0;
  const isGroup = value.mode !== 'standalone';
  const isNew = value.mode === 'new';
  /** A new group has been written — it stays in the list while another group is picked. */
  const hasPending = Boolean(value.newTitle.trim() || value.newPassage.trim());
  const selected = isNew ? undefined : groups.find(g => String(g.groupId) === value.existingGroupId);
  const selectedKind = isNew ? value.newKind : asGroupKind(selected?.questionType);
  const passage = isNew ? value.newPassage : selected?.passageText;
  const groupError = errors.group ?? (errors.title || errors.passage ? 'Finish the new group — click Edit Group.' : undefined);

  const options = [
    ...(hasPending ? [{ label: `[${GROUP_KIND_LABELS[value.newKind]}] ${value.newTitle.trim() || 'Untitled group'} · new, created on save`, value: NEW_GROUP_VALUE }] : []),
    ...offered.map(g => ({ label: groupOptionLabel(g), value: String(g.groupId) })),
  ];

  const pickMode = (m: 'standalone' | 'group') => {
    setCollapsed(false);
    if (m === 'standalone') set({ mode: 'standalone' });
    else if (!isGroup) set({ mode: value.existingGroupId || !hasPending ? 'existing' : 'new' });
  };

  const pickGroup = (v: string) => {
    if (v === NEW_GROUP_VALUE) set({ mode: 'new' });
    else set({ mode: 'existing', existingGroupId: v });
  };

  return (
    <section aria-labelledby="group-context-title" className="card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="group-context-title" className="flex items-center gap-1.5 text-base font-semibold text-content">
          <Icon.Layers className="w-4 h-4 text-brand-ink" /> Question Context
        </h3>
        {isGroup && (selected || isNew) && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="text-xs font-medium text-brand-ink hover:underline" aria-expanded={!collapsed}>
            {collapsed ? 'Show passage' : 'Hide passage'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Question context">
        {MODES.map(m => {
          const active = m.value === 'group' ? isGroup : !isGroup;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => pickMode(m.value)}
              className={`text-left rounded-[10px] border px-3 py-2 transition-all disabled:opacity-60 ${
                active ? 'border-brand-600 bg-brand-600/5 ring-2 ring-brand-600/15' : 'border-line hover:border-brand-600/50'
              }`}
            >
              <span className={`block text-sm font-semibold ${active ? 'text-brand-ink' : 'text-content'}`}>{m.label}</span>
              <span className="block text-xs text-content-subtle mt-0.5">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {isGroup && (
        <div className="space-y-2">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <SearchableSelect
                className="flex-1 min-w-0"
                label="Question group *"
                value={isNew ? NEW_GROUP_VALUE : value.existingGroupId}
                onChange={pickGroup}
                action={{ label: 'New Group', onSelect: () => setModal('create') }}
                disabled={disabled || !courseSelected || loadingGroups}
                invalid={Boolean(groupError) || (isNew && kindInvalid)}
                placeholder={!courseSelected ? 'Select a course first' : loadingGroups ? 'Loading groups…' : 'Select a group'}
                searchPlaceholder="Search groups…"
                emptyText={mixed ? 'No group fits mixed question types'
                  : writtenKind ? `No ${GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups here yet`
                  : 'No groups here yet'}
                options={options}
              />
              {isNew && (
                <Button type="button" variant="outline" icon={<Icon.Edit className="w-4 h-4" />} onClick={() => setModal('edit')} disabled={disabled}>
                  Edit Group
                </Button>
              )}
            </div>
            {groupError && <p className="text-xs text-danger mt-1">{groupError}</p>}
            {mixed && (
              <p className="flex items-start gap-1.5 text-xs text-danger mt-1">
                <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Your questions mix {kindNames} types — a group holds one kind. Remove or change some questions first.
              </p>
            )}
            {writtenKind && !selected && !isNew && courseSelected && !loadingGroups && (
              <p className="text-xs text-content-subtle mt-1">
                Only {GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups are listed — they match the questions you’ve written
                {hiddenByKind > 0 ? ` (${hiddenByKind} group${hiddenByKind === 1 ? '' : 's'} of other types hidden)` : ''}.
              </p>
            )}
            {(selected || isNew) && (
              <p className={`text-xs mt-1 ${isNew && kindInvalid ? 'text-danger' : 'text-content-subtle'}`}>
                {selectedKind
                  ? `A ${GROUP_KIND_LABELS[selectedKind].toLowerCase()} group — every question below must be a ${GROUP_KIND_LABELS[selectedKind].toLowerCase()} question.`
                  : 'This group has no kind yet — it takes the kind of the first questions saved into it.'}
                {isNew && ' It is created when you save, together with the questions.'}
              </p>
            )}
          </div>
          {(selected || isNew) && !collapsed && (
            <div className="max-h-[280px] overflow-y-auto rounded-[10px] bg-surface-alt px-3 py-2.5 text-sm text-content-secondary whitespace-pre-wrap">
              {passage?.trim() || <span className="text-content-subtle italic">This group has no passage text.</span>}
            </div>
          )}
        </div>
      )}

      <NewGroupModal
        open={modal != null}
        onClose={() => setModal(null)}
        initial={modal === 'edit' ? { title: value.newTitle, passage: value.newPassage, kind: value.newKind } : { kind: writtenKind ?? 'QUIZ' }}
        kindInvalid={kind => questionKinds.some(k => k !== kind)}
        onSave={g => { set({ mode: 'new', newTitle: g.title, newPassage: g.passage, newKind: g.kind }); setCollapsed(false); }}
      />
    </section>
  );
}
