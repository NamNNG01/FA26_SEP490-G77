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
  onAdd, onImport, onSave, saveLabel, onCancel, onPublishOne, saving, statusBusy, tabs, onPublish, publishCount = 0, publishing,
}: {
  /** Create mode: publishes the saved drafts ticked in the list — disabled until some are. */
  onPublish?: () => void;
  publishCount?: number;
  publishing?: boolean;
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
  /** Hidden without it (e.g. in AI mode). */
  onAdd?: () => void;
  /** Template import — the button is hidden without it (e.g. on the AI tab). */
  onImport?: () => void;
  onSave: () => void;
  /** Defaults to "Save Changes" / "Save All (n)". */
  saveLabel?: string;
  onCancel: () => void;
  /** Edit mode: publish the question — passed only while it's a draft (publishing is final). */
  onPublishOne?: () => void;
  saving?: boolean;
  statusBusy?: boolean;
}) {
  const isEdit = mode === 'edit';
  return (
    <div className={SIDEBAR_CLS}>
      {tabs}
      <div className="card p-4">
        <QuestionLocationCard courseId={courseId} moduleId={moduleId} onChange={onLocationChange} courseLocked={isEdit} moduleRequired={!isEdit} showErrors={showErrors} />
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="text-base font-semibold text-content mb-1">Actions</h3>
        {!isEdit && (
          <>
            {onAdd && (
              <Button variant="secondary" className="w-full" icon={<Icon.Plus className="w-4 h-4" />} onClick={onAdd} disabled={saving}>Add Question</Button>
            )}
            {onImport && (
              <Button variant="outline" className="w-full" icon={<Icon.Scan className="w-4 h-4" />} onClick={onImport} disabled={saving}>Import PDF / Word</Button>
            )}
          </>
        )}
        <Button className="w-full" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={onSave} loading={saving} disabled={saving || statusBusy}>
          {saveLabel ?? (isEdit ? 'Save Changes' : `Save All (${count})`)}
        </Button>
        {prerequisiteNote && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{prerequisiteNote}
          </p>
        )}
        {isEdit && onPublishOne && (
          <Button
            variant="outline"
            className="w-full"
            icon={<Icon.Upload className="w-4 h-4" />}
            onClick={onPublishOne}
            loading={statusBusy}
            disabled={saving || statusBusy}
          >
            Publish
          </Button>
        )}
        {onPublish && (
          <Button
            variant="outline"
            className="w-full"
            icon={<Icon.Upload className="w-4 h-4" />}
            onClick={onPublish}
            loading={publishing}
            disabled={saving || publishing || publishCount === 0}
            title={publishCount === 0 ? 'Save questions, then tick the drafts to publish' : undefined}
          >
            Publish ({publishCount})
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
