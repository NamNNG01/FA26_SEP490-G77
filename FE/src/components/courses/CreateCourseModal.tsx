import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { useAuth } from '@/auth/authContext';
import {
  courseService,
  type CategoryResponse,
  type CourseDetailResponse,
} from '@/services/course.service';

export function CreateCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (course: CourseDetailResponse) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [managerId, setManagerId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; categoryId?: string; managerId?: string; price?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setPrice('0');
      setManagerId(user?.id ? String(user.id) : '1');
      setErrors({});
      setSubmitError(null);
      setSubmitting(false);

      setLoadingCategories(true);
      courseService
        .getCategories()
        .then((cats) => {
          setCategories(cats);
          if (cats.length > 0) {
            setCategoryId(String(cats[0].categoryId));
          }
        })
        .catch(() => {
          setCategories([]);
        })
        .finally(() => {
          setLoadingCategories(false);
        });
    }
  }, [open, user?.id]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const nextErrors: { title?: string; categoryId?: string; managerId?: string; price?: string } = {};
    if (!title.trim()) nextErrors.title = 'Course title is required.';
    if (!categoryId) nextErrors.categoryId = 'Please select a category.';
    const numPrice = Number(price);
    if (Number.isNaN(numPrice) || numPrice < 0) {
      nextErrors.price = 'Price must be 0 or greater.';
    }
    const numManager = Number(managerId);
    if (!managerId || Number.isNaN(numManager) || numManager <= 0) {
      nextErrors.managerId = 'Valid manager ID is required.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await courseService.createCourse({
        title: title.trim(),
        categoryId: Number(categoryId),
        description: description.trim() || undefined,
        price: numPrice,
        managerId: numManager,
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create course. Please try again.';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: String(c.categoryId),
  }));

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create New Course"
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
            {submitting ? 'Creating…' : 'Create Course'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[#6B7280]">
          Enter course details to set up a new course catalog entry. Newly created courses start as drafts.
        </p>

        <Input
          label="Course Title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Python for Data Science"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Select
              label="Category"
              value={categoryId}
              onChange={setCategoryId}
              options={
                categoryOptions.length > 0
                  ? categoryOptions
                  : [{ label: loadingCategories ? 'Loading…' : 'No categories available', value: '' }]
              }
            />
            {errors.categoryId && <p className="text-[12px] text-red-500 mt-1">{errors.categoryId}</p>}
          </div>

          <Input
            label="Price ($)"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
            hint="Set 0 for free course"
          />
        </div>

        <Input
          label="Course Manager ID"
          type="number"
          min={1}
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          error={errors.managerId}
          hint="ID of active course manager"
        />

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
            Course Description <span className="text-[#9CA3AF] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the course curriculum, goals, and intended audience…"
          />
        </div>

        {submitError && <Alert type="error" title="Creation failed" message={submitError} />}
      </div>
    </Modal>
  );
}

