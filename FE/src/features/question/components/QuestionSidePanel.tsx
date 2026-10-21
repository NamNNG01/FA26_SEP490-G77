import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { QuestionLocationCard } from './QuestionLocationCard';

/**
 * Right-hand column of the question pages. The page scrolls inside <main>;
 * the column stays pinned 10px below its top and scrolls on its own if taller
 * than the viewport (header h-14 + main's 20px top padding).
 */
export const SIDEBAR_CLS = 'space-y-4 pb-4 lg:sticky lg:top-[10px] lg:max-h-[calc(100vh-3.5rem-20px)] lg:overflow-y-auto';

/** Right-hand column: optional tabs, Location card + Actions card. */
export function QuestionSidePanel({
  mode, count, courseId, moduleId, onLocationChange, showErrors, prerequisiteNote,
  onAdd, onImport, onSave, onCancel, onToggleStatus, saving, statusBusy, isActive, tabs,
}: {
  /** Shown above the Location card (the create page's Manual / AI Generate switch). */
  tabs?: React.ReactNode;
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
  /** Edit mode: publish / archive the question. */
  onToggleStatus?: () => void;
  saving?: boolean;
  statusBusy?: boolean;
  isActive?: boolean;
}) {
  const isEdit = mode === 'edit';
  return (
    <div className={SIDEBAR_CLS}>
      {tabs}
      <div className="card p-4">
        <QuestionLocationCard courseId={courseId} moduleId={moduleId} onChange={onLocationChange} courseLocked={isEdit} showErrors={showErrors} />
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="text-base font-semibold text-content mb-1">Actions</h3>
        {!isEdit && (
          <>
            <Button variant="secondary" className="w-full" icon={<Icon.Plus className="w-4 h-4" />} onClick={onAdd} disabled={saving}>Add Question</Button>
            <Button variant="outline" className="w-full" icon={<Icon.Scan className="w-4 h-4" />} onClick={onImport} disabled={saving}>Import PDF / Word</Button>
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
            icon={isActive ? <Icon.Package className="w-4 h-4" /> : <Icon.CheckCircle className="w-4 h-4" />}
            onClick={onToggleStatus}
            loading={statusBusy}
            disabled={saving || statusBusy}
          >
            {isActive ? 'Archive' : 'Publish'}
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
