import React, { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import type { QuestionGroup } from '@/services/questionGroup.service';
import { GROUP_KIND_LABELS, GROUP_KIND_OPTIONS, asGroupKind, type GroupKind } from '../model';
import { groupOptionLabel } from './QuestionGroupPicker';

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

const MODES: { value: GroupMode; label: string; hint: string }[] = [
  { value: 'standalone', label: 'Standalone questions', hint: 'Each question stands on its own.' },
  { value: 'existing', label: 'Existing group', hint: 'Add questions to a passage that already exists.' },
  { value: 'new', label: 'New group', hint: 'Write a passage, then the questions about it.' },
];

/**
 * Top of the New Questions column: decides whether the batch is standalone or
 * a question group (shared passage / scenario, like one IELTS reading). A group
 * holds one kind of question — Quiz, Essay, Code or Diagram — so in group mode
 * the questions' types are limited to that kind. The passage stays visible
 * above the questions while they are written.
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
  /** Some questions don't fit the new group's type — its Group type dropdown turns red. */
  kindInvalid?: boolean;
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const set = (patch: Partial<GroupContextValue>) => onChange({ ...value, ...patch });
  const errors = showErrors ? groupContextErrors(value) : {};
  const mixed = questionKinds.length > 1;
  const writtenKind = questionKinds.length === 1 ? questionKinds[0] : null;
  const kindNames = questionKinds.map(k => GROUP_KIND_LABELS[k]).join(' and ');
  // Groups without a kind yet take the kind of the first questions saved into them.
  const offered = mixed ? [] : groupsForModule(groups, moduleId).filter(g => !writtenKind || !g.questionType || g.questionType === writtenKind);
  const hiddenByKind = writtenKind ? groupsForModule(groups, moduleId).length - offered.length : 0;
  const mixedNote = mixed && (
    <p className="flex items-start gap-1.5 text-xs text-danger">
      <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      Your questions mix {kindNames} types — a group holds one kind. Remove or change some questions first.
    </p>
  );
  const selected = groups.find(g => String(g.groupId) === value.existingGroupId);
  const selectedKind = asGroupKind(selected?.questionType);

  return (
    <section aria-labelledby="group-context-title" className="card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="group-context-title" className="flex items-center gap-1.5 text-base font-semibold text-content">
          <Icon.Layers className="w-4 h-4 text-brand-ink" /> Question Context
        </h3>
        {value.mode !== 'standalone' && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="text-xs font-medium text-brand-ink hover:underline" aria-expanded={!collapsed}>
            {collapsed ? 'Show passage' : 'Hide passage'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Question context">
        {MODES.map(m => {
          const active = value.mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => { set({ mode: m.value }); setCollapsed(false); }}
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

      {value.mode === 'existing' && (
        <div className="space-y-2">
          <div>
            <Select
              label="Question group *"
              value={value.existingGroupId}
              onChange={v => set({ existingGroupId: v })}
              disabled={disabled || !courseSelected || loadingGroups || offered.length === 0}
              options={[
                {
                  label: !courseSelected ? 'Select a course first'
                    : loadingGroups ? 'Loading groups…'
                    : mixed ? 'No group fits mixed question types'
                    : offered.length === 0 ? (writtenKind ? `No ${GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups here yet` : 'No groups here yet')
                    : 'Select a group',
                  value: '',
                },
                ...offered.map(g => ({ label: groupOptionLabel(g), value: String(g.groupId) })),
              ]}
            />
            {errors.group && <p className="text-xs text-danger mt-1">{errors.group}</p>}
            {mixedNote}
            {writtenKind && !selected && courseSelected && !loadingGroups && (
              <p className="text-xs text-content-subtle mt-1">
                Only {GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups are listed — they match the questions you’ve written
                {hiddenByKind > 0 ? ` (${hiddenByKind} group${hiddenByKind === 1 ? '' : 's'} of other types hidden)` : ''}.
              </p>
            )}
            {selected && (
              <p className="text-xs text-content-subtle mt-1">
                {selectedKind
                  ? `A ${GROUP_KIND_LABELS[selectedKind].toLowerCase()} group — every question below must be a ${GROUP_KIND_LABELS[selectedKind].toLowerCase()} question.`
                  : 'This group has no kind yet — it takes the kind of the first questions saved into it.'}
              </p>
            )}
          </div>
          {selected && !collapsed && (
            <div className="max-h-[280px] overflow-y-auto rounded-[10px] bg-surface-alt px-3 py-2.5 text-sm text-content-secondary whitespace-pre-wrap">
              {selected.passageText?.trim() || <span className="text-content-subtle italic">This group has no passage text.</span>}
            </div>
          )}
        </div>
      )}

      {value.mode === 'new' && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <Input
              label="Group title *"
              value={value.newTitle}
              onChange={e => set({ newTitle: e.target.value })}
              maxLength={255}
              placeholder="e.g. IELTS Reading — Passage 1: The history of glass"
              error={errors.title}
              disabled={disabled}
            />
            <Select
              label="Group type *"
              value={value.newKind}
              onChange={v => set({ newKind: v as GroupKind })}
              invalid={kindInvalid}
              // Free to change even with questions written — ones of another kind are reported on save.
              disabled={disabled}
              options={GROUP_KIND_OPTIONS.map(o => ({ label: o.label, value: o.value }))}
            />
          </div>
          <p className="text-xs text-content-subtle -mt-1">
            {`${GROUP_KIND_OPTIONS.find(o => o.value === value.newKind)?.hint}. A group can't mix question types of different kinds.`}
          </p>
          {(!collapsed || errors.passage) && (
            <div>
              <label htmlFor="group-context-passage" className="block text-sm font-medium text-content-secondary mb-1">Shared passage *</label>
              <textarea
                id="group-context-passage"
                value={value.newPassage}
                onChange={e => set({ newPassage: e.target.value })}
                disabled={disabled}
                placeholder="Paste the reading passage, listening transcript or scenario that every question below refers to…"
                className={`w-full h-[200px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
                  errors.passage ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
                }`}
              />
              {errors.passage && <p className="text-xs text-danger mt-1">{errors.passage}</p>}
            </div>
          )}
          <p className="text-xs text-content-subtle">The group is created when you save, together with the questions.</p>
        </div>
      )}
    </section>
  );
}
