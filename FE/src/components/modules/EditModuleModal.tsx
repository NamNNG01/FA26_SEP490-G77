import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
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
  const [orderIndex, setOrderIndex] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; orderIndex?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && module) {
      setTitle(module.title ?? '');
      setOrderIndex(module.orderIndex !== undefined ? String(module.orderIndex) : '');
      setDescription(module.description ?? '');
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

    const nextErrors: { title?: string; orderIndex?: string } = {};
    if (!title.trim()) nextErrors.title = 'Module title is required.';
    if (orderIndex.trim() && (Number.isNaN(Number(orderIndex)) || Number(orderIndex) < 1)) {
      nextErrors.orderIndex = 'Order index must be a number of 1 or greater.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const targetId = module.moduleId ?? module.id;
      if (!targetId) {
        throw new Error('Module identifier is missing.');
      }
      const updated = await courseService.updateModule(targetId, {
        title: title.trim(),
        description: description.trim() || undefined,
        orderIndex: orderIndex.trim() ? Number(orderIndex) : undefined,
      });
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update module. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Module"
      size="lg"
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
        <p className="text-sm text-content-soft">
          Editing <span className="font-medium text-content-secondary">{module?.title}</span>
        </p>

        <Input
          label="Module Name"
          required
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Supervised Learning"
        />

        <Input
          label="Display Order"
          type="number"
          min={1}
          value={orderIndex}
          onChange={e => setOrderIndex(e.target.value)}
          error={errors.orderIndex}
          hint="Position in course curriculum"
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

        {submitError && <Alert type="error" title="Something went wrong" message={submitError} />}
      </div>
    </Modal>
  );
}
