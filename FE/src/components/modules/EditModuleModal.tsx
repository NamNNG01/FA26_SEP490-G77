import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { apiFieldErrors } from '@/utils/apiError';
import { focusFirstInvalidAfter } from '@/utils/focusFirstInvalid';
import { courseService, type CourseModuleResponse } from '@/services/course.service';

export interface EditableModule {
  moduleId?: number;
  id?: string | number;
  courseId?: number | string;
  title: string;
  description?: string | null;
  orderIndex?: number;
  status?: 'VISIBLE' | 'HIDDEN';
  order?: number;
  questionCount?: number;
  examCount?: number;
}

export function EditModuleModal({
  module,
  open,
  onClose,
  onSaved,
}: {
  module: EditableModule | null;
  open: boolean;
  onClose: () => void;
  onSaved: (module: EditableModule | CourseModuleResponse) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visible, setVisible] = useState(true);
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && module) {
      setTitle(module.title ?? '');
      setDescription(module.description ?? '');
      setVisible(module.status !== 'HIDDEN');
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, module]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (submitting || !module) return;

    const nextErrors: { title?: string } = {};
    if (!title.trim()) nextErrors.title = 'Module title is required.';
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidAfter(() => setErrors(nextErrors));
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const targetId = module.moduleId ?? module.id;
      if (!targetId) {
        throw new Error('Module identifier is missing.');
      }
      let updated = await courseService.updateModule(targetId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      const nextStatus = visible ? 'VISIBLE' : 'HIDDEN';
      if (module.status !== nextStatus) {
        updated = await courseService.updateModuleStatus(targetId, nextStatus);
      }
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update module. Please try again.';
      setSubmitError(message);
      const fields = apiFieldErrors(err);
      if (fields.title) focusFirstInvalidAfter(() => setErrors({ title: fields.title }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Module"
      description={<>Editing <span className="font-medium text-content-secondary">{module?.title}</span></>}
      size="lg"
      error={submitError && <Alert type="error" title="Something went wrong" message={submitError} />}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            icon={<Icon.Check className="w-4 h-4" />}
          >
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Module Name"
          required
          autoFocus
          value={title}
          onChange={e => { setTitle(e.target.value); setErrors({}); }}
          error={errors.title}
          placeholder="e.g. Supervised Learning"
        />

        <div>
          <label className="text-sm font-medium text-content-secondary block mb-1.5">
            Module Description <span className="text-content-subtle font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-line text-base text-content resize-none focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Summarize what this module covers…"
          />
        </div>

        <div className="flex items-center justify-between rounded-[10px] border border-line px-3.5 py-3">
          <div>
            <p className="text-sm font-medium text-content-secondary">Module visibility</p>
            <p className="text-xs text-content-subtle mt-0.5">
              {visible ? 'Students can see this module.' : 'This module is hidden from students.'}
            </p>
          </div>
          <Switch
            checked={visible}
            onChange={setVisible}
            label={visible ? 'Visible' : 'Hidden'}
            disabled={submitting}
          />
        </div>
      </div>
    </Modal>
  );
}
