import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { type QuestionForm } from './QuestionForm';
import { QuestionLocationCard } from './QuestionLocationCard';

export function QuestionSidePanel({ mode, questions, courseId, moduleId, onLocationChange, onAdd, onImport, onSave, onCancel, onRemove, saveDisabled }: {
  mode: 'create' | 'edit';
  questions: QuestionForm[];
  courseId: string;
  moduleId: string;
  onLocationChange: (courseId: string, moduleId: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  saveDisabled?: boolean;
}) {
  const isEdit = mode === 'edit';
  return (
    <div className="space-y-4">
      {/* Location — fixed at the top of the sticky sidebar */}
      <div className="card p-4 lg:sticky lg:top-0">
        <QuestionLocationCard courseId={courseId} moduleId={moduleId} onChange={onLocationChange} />
      </div>

      {/* Actions */}
      <div className="card p-4 space-y-2">
        <h4 className="text-[14px] font-semibold text-[#111827] mb-1">Actions</h4>
        {isEdit ? (
          <>
            <Button className="w-full" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={onSave} disabled={saveDisabled}>Save Changes</Button>
            <Button variant="secondary" className="w-full" onClick={onCancel}>Cancel</Button>
            <Button variant="danger" className="w-full" icon={<Icon.XCircle className="w-4 h-4" />} onClick={onRemove}>Deactivate</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" className="w-full" icon={<Icon.Plus className="w-4 h-4" />} onClick={onAdd}>Add Question</Button>
            <Button variant="outline" className="w-full" icon={<Icon.Scan className="w-4 h-4" />} onClick={onImport}>Import PDF</Button>
            <Button className="w-full" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={onSave} disabled={saveDisabled}>Save All ({questions.length})</Button>
            {saveDisabled && (
              <p className="flex items-start gap-1.5 text-[12px] text-[#D97706]">
                <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />Set a course and module to enable saving.
              </p>
            )}
            <Button variant="ghost" className="w-full" onClick={onCancel}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
