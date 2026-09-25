import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { updateModule } from '@/features/module/api';
import { MOCK_COURSES, type CourseModule } from '@/features/module/mockModules';

/**
 * Reusable "Edit Module" dialog.
 * Opens centered on top of the current page (no navigation): the background
 * stays visible behind a dimmed overlay. Pre-fills all module fields, shows
 * inline validation messages, and reports the saved module via `onSaved`.
 */
export function EditModuleModal({
  module,
  open,
  onClose,
  onSaved,
}: {
  module: CourseModule | null;
  open: boolean;
  onClose: () => void;
  onSaved: (module: CourseModule) => void;
}) {
  const [title, setTitle] = useState('');
  const [order, setOrder] = useState('');
  const [status, setStatus] = useState<CourseModule['status']>('Draft');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; order?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill with the module's current values each time the modal opens.
  useEffect(() => {
    if (open && module) {
      setTitle(module.title);
      setOrder(String(module.order));
      setStatus(module.status);
      setDescription(module.description);
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

    const nextErrors: { title?: string; order?: string } = {};
    if (!title.trim()) nextErrors.title = 'Module name is required.';
    if (order.trim() && (Number.isNaN(Number(order)) || Number(order) < 1)) {
      nextErrors.order = 'Order must be a number of 1 or greater.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const updated = await updateModule(module.id, {
        title,
        order,
        status,
        description,
      });
      onSaved(updated);
      onClose();
    } catch {
      setSubmitError('Failed to save the module. Please try again.');
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
          <Button onClick={handleSubmit} loading={submitting} disabled={submitting} icon={<Icon.Check className="w-4 h-4" />}>
            {submitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[#6B7280]">
          Editing <span className="font-medium text-[#374151]">{module?.title}</span>
          {module ? (
            <span> · {MOCK_COURSES.find(c => c.id === module.courseId)?.title ?? module.courseId}</span>
          ) : null}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Order"
            type="number"
            min={1}
            value={order}
            onChange={e => setOrder(e.target.value)}
            error={errors.order}
            hint="Optional"
          />
          <Select
            label="Status"
            value={status}
            onChange={v => setStatus(v as CourseModule['status'])}
            options={[
              { label: 'Draft', value: 'Draft' },
              { label: 'Active', value: 'Active' },
              { label: 'Archived', value: 'Archived' },
            ]}
          />
        </div>

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
            Description <span className="text-[#9CA3AF] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
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
