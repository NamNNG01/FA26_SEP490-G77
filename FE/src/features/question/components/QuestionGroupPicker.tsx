import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Radio } from '@/components/ui/Radio';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import type { QuestionGroup } from '@/services/questionGroup.service';

type Mode = 'existing' | 'new';

export const groupLabel = (g: Pick<QuestionGroup, 'groupId' | 'title'>) => g.title?.trim() || `Group #${g.groupId}`;

/**
 * Link the question to a shared passage: pick an existing group of the course,
 * or write a new one. Creating a group happens right away (onCreate); the link
 * itself is stored with the next Save Changes.
 */
export function QuestionGroupPicker({ groups, loading, currentGroupId, onAttach, onCreate, disabled }: {
  groups: QuestionGroup[];
  loading?: boolean;
  currentGroupId: number | null;
  onAttach: (group: QuestionGroup) => void;
  onCreate: (title: string, passageText: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('existing');
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const options = groups.map(g => ({ label: `${groupLabel(g)} · ${g.questionCount} question${g.questionCount === 1 ? '' : 's'}`, value: String(g.groupId) }));
  const selectedGroup = groups.find(g => String(g.groupId) === selected);
  const alreadyLinked = selectedGroup != null && selectedGroup.groupId === currentGroupId;

  const create = async () => {
    setShowErrors(true);
    if (!title.trim() || !passage.trim()) return;
    setCreating(true);
    try {
      await onCreate(title.trim(), passage.trim());
      setTitle('');
      setPassage('');
      setShowErrors(false);
      setMode('existing');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-line bg-surface-alt/50 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-content-secondary">Question Group</span>
        <div className="flex items-center gap-4" role="radiogroup" aria-label="Question group mode">
          <Radio label="Choose existing" checked={mode === 'existing'} onChange={() => setMode('existing')} />
          <Radio label="Create new" checked={mode === 'new'} onChange={() => setMode('new')} />
        </div>
      </div>

      {mode === 'existing' ? (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <Select
            className="flex-1 min-w-0"
            aria-label="Existing question group"
            value={selected}
            onChange={setSelected}
            disabled={disabled || loading || groups.length === 0}
            options={[
              { label: loading ? 'Loading groups…' : groups.length === 0 ? 'No groups in this course yet' : 'Select a group', value: '' },
              ...options,
            ]}
          />
          <Button
            type="button"
            variant="secondary"
            icon={<Icon.Layers className="w-4 h-4" />}
            onClick={() => selectedGroup && onAttach(selectedGroup)}
            disabled={disabled || !selectedGroup || alreadyLinked}
          >
            {alreadyLinked ? 'Already linked' : 'Attach Group'}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            label="Group title *"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={255}
            placeholder="e.g. Reading passage 1 — Climate change"
            error={showErrors && !title.trim() ? 'Enter a group title.' : undefined}
            disabled={disabled || creating}
          />
          <div>
            <label htmlFor="new-group-passage" className="block text-sm font-medium text-content-secondary mb-1">Shared passage *</label>
            <textarea
              id="new-group-passage"
              value={passage}
              onChange={e => setPassage(e.target.value)}
              disabled={disabled || creating}
              placeholder="Paste the reading passage or scenario every question in this group refers to…"
              className={`w-full h-[110px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
                showErrors && !passage.trim() ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
              }`}
            />
            {showErrors && !passage.trim() && <p className="text-xs text-danger mt-1">Enter the shared passage.</p>}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" icon={<Icon.Plus className="w-4 h-4" />} onClick={create} loading={creating} disabled={disabled || creating}>
              Create &amp; Attach Group
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sidebar card with the linked group's name and full passage. */
export function GroupInfoCard({ group, pending, onUnlink }: { group: QuestionGroup | null; pending?: boolean; onUnlink?: () => void }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-content">
          <Icon.Layers className="w-4 h-4 text-brand-ink" /> Question Group
        </h3>
        {pending && <span className="text-xs font-medium text-warning">Unsaved</span>}
      </div>
      {group ? (
        <>
          <p className="text-sm font-semibold text-content">{groupLabel(group)}</p>
          <p className="text-xs text-content-subtle">{group.questionCount} question{group.questionCount === 1 ? '' : 's'} share this passage</p>
          <div className="max-h-[260px] overflow-y-auto rounded-[8px] bg-surface-alt px-3 py-2 text-sm text-content-secondary whitespace-pre-wrap">
            {group.passageText?.trim() || <span className="text-content-subtle italic">No passage text.</span>}
          </div>
          {pending && onUnlink && (
            <button type="button" onClick={onUnlink} className="text-xs font-medium text-content-soft hover:text-danger hover:underline">
              Undo group change
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-content-soft">This question is standalone. Attach it to a group to share a reading passage with other questions.</p>
      )}
    </div>
  );
}
