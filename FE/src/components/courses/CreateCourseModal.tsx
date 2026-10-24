import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dropdown } from '@/components/ui/Dropdown';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  courseService,
  type CategoryResponse,
  type CourseDetailResponse,
} from '@/services/course.service';

interface ManagerOption {
  id: number;
  name: string;
  email: string;
}

export function CreateCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (course: CourseDetailResponse) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState<string | null>(null);
  const [managerLoadError, setManagerLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    title?: string;
    categoryId?: string;
    managerIds?: string;
    price?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setTitle('');
    setDescription('');
    setPrice('0');
    setManagerIds([]);
    setErrors({});
    setSubmitError(null);
    setCategoryLoadError(null);
    setManagerLoadError(null);
    setSubmitting(false);

    setLoadingCategories(true);
    courseService
      .getCategories()
      .then((cats) => {
        setCategories(cats);
        setCategoryLoadError(null);
        if (cats.length > 0) {
          setCategoryId(String(cats[0].categoryId));
        }
      })
      .catch((err) => {
        setCategories([]);
        const message = getApiErrorMessage(err, 'Failed to load categories.');
        setCategoryLoadError(message);
        toast.error(message, { title: 'Could not load categories', duration: null });
      })
      .finally(() => {
        setLoadingCategories(false);
      });

    setLoadingManagers(true);
    api
      .get<{
        data?:
          | { content?: Array<{ userId?: number; id?: number; fullName?: string; name?: string; email?: string }> }
          | Array<{ userId?: number; id?: number; fullName?: string; name?: string; email?: string }>;
      }>('/admin/users?role=COURSE_MANAGER&status=ACTIVE')
      .then((res) => {
        const payload = res.data;
        let rawList: Array<{ userId?: number; id?: number; fullName?: string; name?: string; email?: string }> = [];
        if (Array.isArray(payload)) {
          rawList = payload;
        } else if (payload && typeof payload === 'object' && 'content' in payload && Array.isArray(payload.content)) {
          rawList = payload.content;
        }
        if (rawList.length > 0) {
          setManagers(
            rawList.map((m) => ({
              id: Number(m.userId ?? m.id),
              name: m.fullName || m.name || `Manager #${m.userId ?? m.id}`,
              email: m.email || '',
            }))
          );
        } else {
          setManagers([]);
        }
        setManagerLoadError(null);
      })
      .catch((err) => {
        setManagers([]);
        const message = getApiErrorMessage(err, 'Failed to load course managers.');
        setManagerLoadError(message);
        toast.error(message, { title: 'Could not load course managers', duration: null });
      })
      .finally(() => setLoadingManagers(false));
  }, [open]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const nextErrors: { title?: string; categoryId?: string; managerIds?: string; price?: string } = {};
    if (!title.trim()) nextErrors.title = 'Course title is required.';
    if (!categoryId) nextErrors.categoryId = 'Please select a category.';
    const numPrice = Number(price);
    if (Number.isNaN(numPrice) || numPrice < 0) {
      nextErrors.price = 'Price must be 0 or greater.';
    }
    if (managerIds.length === 0) {
      nextErrors.managerIds = 'Please select at least one course manager.';
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
        managerId: Number(managerIds[0]),
        managerIds: managerIds.map(Number),
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to create course. Please try again.');
      setSubmitError(message);
      toast.error(message, { title: 'Course creation failed', duration: null });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find((c) => String(c.categoryId) === String(categoryId));
  const selectedManagerObjs = managers.filter((m) => managerIds.includes(String(m.id)));

  const managerTriggerLabel = loadingManagers
    ? 'Loading managers…'
    : managerIds.length === 0
    ? 'Select course managers…'
    : managerIds.length === 1
    ? selectedManagerObjs[0]
      ? `${selectedManagerObjs[0].name}`
      : 'Select course managers…'
    : `${managerIds.length} managers selected`;

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

        {categoryLoadError && (
          <Alert type="error" title="Could not load categories" message={categoryLoadError} />
        )}
        {managerLoadError && (
          <Alert type="error" title="Could not load course managers" message={managerLoadError} />
        )}

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
            <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
              Category <span className="text-red-500">*</span>
            </label>
            <Dropdown
              search={true}
              searchPlaceholder="Search category..."
              value={categoryId}
              onSelect={(val) => {
                setCategoryId(String(val));
                if (errors.categoryId) {
                  setErrors((prev) => ({ ...prev, categoryId: undefined }));
                }
              }}
              trigger={
                <button
                  type="button"
                  disabled={loadingCategories || submitting}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] border bg-surface text-sm text-left transition-colors ${
                    errors.categoryId
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-[#E5E7EB] hover:border-[#9CA3AF]'
                  } ${loadingCategories ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <span className={selectedCategory ? 'text-content truncate' : 'text-[#9CA3AF]'}>
                    {loadingCategories ? 'Loading categories…' : selectedCategory ? selectedCategory.name : 'Select category…'}
                  </span>
                  <Icon.ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0 ml-2" />
                </button>
              }
              items={categories.map((cat) => ({
                label: cat.name,
                value: String(cat.categoryId),
                onClick: () => {
                  setCategoryId(String(cat.categoryId));
                  if (errors.categoryId) setErrors((prev) => ({ ...prev, categoryId: undefined }));
                },
              }))}
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

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
            Course Managers <span className="text-red-500">*</span>
          </label>
          <Dropdown
            multi={true}
            search={true}
            searchPlaceholder="Search course manager..."
            values={managerIds}
            onSelectMulti={(vals) => {
              setManagerIds(vals.map(String));
              if (errors.managerIds) setErrors((prev) => ({ ...prev, managerIds: undefined }));
            }}
            trigger={
              <button
                type="button"
                disabled={loadingManagers || submitting}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] border bg-surface text-sm text-left transition-colors ${
                  errors.managerIds
                    ? 'border-red-500 ring-1 ring-red-500'
                    : 'border-[#E5E7EB] hover:border-[#9CA3AF]'
                } ${loadingManagers ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className={managerIds.length > 0 ? 'text-content truncate' : 'text-[#9CA3AF]'}>
                  {managerTriggerLabel}
                </span>
                <Icon.ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0 ml-2" />
              </button>
            }
            items={managers.map((m) => ({
              label: m.email ? `${m.name} (${m.email})` : m.name,
              value: String(m.id),
            }))}
          />

          {managerIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedManagerObjs.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  {m.name}
                  <button
                    type="button"
                    onClick={() => {
                      setManagerIds((prev) => prev.filter((id) => id !== String(m.id)));
                    }}
                    className="hover:text-danger transition-colors"
                    aria-label={`Remove ${m.name}`}
                  >
                    <Icon.X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-[12px] text-[#6B7280] mt-1">
            Assign one or more active course managers. The first selected becomes the primary manager.
          </p>
          {errors.managerIds && <p className="text-[12px] text-red-500 mt-1">{errors.managerIds}</p>}
        </div>

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

        {submitError && <p className="text-xs text-content-subtle">Creation failed. See the notification for details.</p>}
      </div>
    </Modal>
  );
}
