import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { courseService, type CourseModuleResponse } from '@/services/course.service';

export function AddModuleModal({
  open,
  courseId,
  onClose,
  onCreated,
}: {
  open: boolean;
  courseId: number | string;
  onClose: () => void;
  onCreated: (module: CourseModuleResponse) => void;
}) {
  const [title, setTitle] = useState('');
  const [orderIndex, setOrderIndex] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; orderIndex?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setOrderIndex('');
      setDescription('');
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const nextErrors: { title?: string; orderIndex?: string } = {};

    if (!title.trim()) {
      nextErrors.title = 'Module title is required.';
    }

    if (orderIndex.trim() && (Number.isNaN(Number(orderIndex)) || Number(orderIndex) < 1)) {
      nextErrors.orderIndex = 'Order index must be a positive number.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await courseService.createModule(courseId, {
        title: title.trim(),
        description: description.trim() || undefined,
        orderIndex: orderIndex.trim() ? Number(orderIndex) : undefined,
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create module. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Module"
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
            {submitting ? 'Creating…' : 'Add Module'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-content-soft">
          Add a new module to organize questions and exams within this course.
        </p>

        <Input
          label="Module Name"
          required
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Python Basics"
        />

        <Input
          label="Display Order"
          type="number"
          min={1}
          value={orderIndex}
          onChange={e => setOrderIndex(e.target.value)}
          error={errors.orderIndex}
          placeholder="Leave blank to append at end"
          hint="Optional: defaults to next available order"
        />

        <div>
          <label className="text-sm font-medium text-content-secondary block mb-1.5">
            Module Description <span className="text-content-subtle font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-line text-base text-content resize-none focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
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