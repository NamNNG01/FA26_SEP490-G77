import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { createModule, type ModuleInput } from '@/features/module/api';
import { type CourseModule } from '@/features/module/mockModules';

export function AddModuleModal({
  open,
  courseId = 'ml',
  onClose,
  onCreated,
}: {
  open: boolean;
  courseId?: string;
  onClose: () => void;
  onCreated: (module: CourseModule) => void;
}) {
  const [title, setTitle] = useState('');
  const [order, setOrder] = useState('');
  const [status, setStatus] = useState<'Active' | 'Draft'>('Draft');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setOrder('');
      setStatus('Draft');
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
    if (!title.trim()) {
      setErrors({ title: 'Module name is required.' });
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      const payload: ModuleInput = { courseId: courseId as 'ml' | 'dl' | 'py' | 'stats', title, order, status, description };
      const created = await createModule(payload);
      onCreated(created);
      onClose();
    } catch {
      setSubmitError('Failed to create the module. Please try again.');
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
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={submitting} icon={<Icon.Check className="w-4 h-4" />}>
            {submitting ? 'Creating…' : 'Create Module'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[#6B7280]">Modules organize lessons, questions, and exams within a course.</p>

        <Input
          label="Module Name"
          required
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Supervised Learning"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input label="Display Order" type="number" value={order} onChange={e => setOrder(e.target.value)} placeholder="1" hint="Optional" />
          <Select label="Status" value={status} onChange={v => setStatus(v as 'Active' | 'Draft')} options={[{ label: 'Draft', value: 'Draft' }, { label: 'Active', value: 'Active' }]} />
        </div>

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">Module Description <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
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