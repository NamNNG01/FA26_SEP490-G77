import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { QuestionLocationCard } from './QuestionLocationCard';

/** Right-hand column: Location card + Actions card. */
export function QuestionSidePanel({
  mode, count, courseId, moduleId, onLocationChange, showErrors, prerequisiteNote,
  onAdd, onImport, onSave, onCancel, onToggleStatus, saving, statusBusy, isActive,
}: {
  mode: 'create' | 'edit';
  count: number;
  courseId: string;
  moduleId: string;
  onLocationChange: (courseId: string, moduleId: string) => void;
  showErrors: boolean;
  /** Why saving can't happen yet (shown under Save). */
  prerequisiteNote?: string | null;
  onAdd?: () => void;
  onImport?: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** Edit mode: activate / deactivate the question. */
  onToggleStatus?: () => void;
  saving?: boolean;
  statusBusy?: boolean;
  isActive?: boolean;
}) {
  const isEdit = mode === 'edit';
  return (
    <div className="space-y-4 lg:sticky lg:top-0">
      <div className="card p-4">
        <QuestionLocationCard courseId={courseId} moduleId={moduleId} onChange={onLocationChange} courseLocked={isEdit} showErrors={showErrors} />
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="text-base font-semibold text-content mb-1">Actions</h3>
        {!isEdit && (
          <>
            <Button variant="secondary" className="w-full" icon={<Icon.Plus className="w-4 h-4" />} onClick={onAdd} disabled={saving}>Add Question</Button>
            <Button variant="outline" className="w-full" icon={<Icon.Scan className="w-4 h-4" />} onClick={onImport} disabled={saving}>Import PDF</Button>
          </>
        )}
        <Button className="w-full" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={onSave} loading={saving} disabled={saving || statusBusy}>
          {isEdit ? 'Save Changes' : `Save All (${count})`}
        </Button>
        {prerequisiteNote && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{prerequisiteNote}
          </p>
        )}
        {isEdit && onToggleStatus && (
          <Button
            variant={isActive ? 'danger' : 'outline'}
            className="w-full"
            icon={isActive ? <Icon.XCircle className="w-4 h-4" /> : <Icon.CheckCircle className="w-4 h-4" />}
            onClick={onToggleStatus}
            loading={statusBusy}
            disabled={saving || statusBusy}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
