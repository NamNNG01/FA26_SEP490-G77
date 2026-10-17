import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Icon } from '@/assets/icons';
import { useAuth } from '@/auth/authContext';
import {
  courseService,
  type CategoryResponse,
  type CourseDetailResponse,
} from '@/services/course.service';

export function CourseFormPage({
  mode = 'create',
  courseId,
  onNavigate,
}: {
  mode?: 'create' | 'edit';
  courseId?: string | number;
  onNavigate?: (id: string, params?: Record<string, string>) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = mode === 'edit';

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [managerId, setManagerId] = useState('');
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    courseService
      .getCategories()
      .then((cats) => {
        setCategories(cats);
        if (!isEdit && cats.length > 0) {
          setCategoryId(String(cats[0].categoryId));
        }
      })
      .catch(() => setCategories([]));
  }, [isEdit]);

  useEffect(() => {
    if (isEdit && courseId) {
      setLoading(true);
      courseService
        .getCourseById(courseId)
        .then((c) => {
          setTitle(c.title);
          setCategoryId(String(c.categoryId));
          setDescription(c.description ?? '');
          setPrice(String(c.price ?? 0));
          setManagerId(String(c.managerId));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load course details.');
        })
        .finally(() => setLoading(false));
    } else {
      setManagerId(user?.id ? String(user.id) : '1');
    }
  }, [isEdit, courseId, user?.id]);

  const handleCancel = () => {
    if (onNavigate) {
      onNavigate('course-list');
    } else {
      navigate('/manager/courses');
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Course title is required.');
      return;
    }
    if (!categoryId) {
      setError('Please select a category.');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      if (isEdit && courseId) {
        await courseService.updateCourse(courseId, {
          title: title.trim(),
          categoryId: Number(categoryId),
          description: description.trim() || undefined,
          price: Number(price) >= 0 ? Number(price) : 0,
        });
        setSuccess('Course updated successfully.');
        setTimeout(() => handleCancel(), 1000);
      } else {
        const created: CourseDetailResponse = await courseService.createCourse({
          title: title.trim(),
          categoryId: Number(categoryId),
          description: description.trim() || undefined,
          price: Number(price) >= 0 ? Number(price) : 0,
          managerId: Number(managerId) || 1,
        });
        setSuccess('Course created successfully.');
        setTimeout(() => {
          if (onNavigate) {
            onNavigate('course-detail', { courseId: String(created.courseId) });
          } else {
            navigate(`/manager/courses/${created.courseId}`);
          }
        }, 1000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: String(c.categoryId),
  }));

  if (loading) {
    return (
      <div className="p-8 py-20 text-center text-[#9CA3AF]">
        <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[14px]">Loading course details…</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb
        items={[
          { label: 'Courses', onClick: handleCancel },
          { label: isEdit ? 'Edit Course' : 'Create Course' },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold text-[#111827]">
          {isEdit ? 'Edit Course' : 'Create Course'}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            icon={<Icon.Check className="w-4 h-4" />}
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
          >
            {isEdit ? 'Save Changes' : 'Create Course'}
          </Button>
        </div>
      </div>

      {error && <Alert type="error" title="Error" message={error} />}
      {success && <Alert type="success" title="Success" message={success} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card p-6 space-y-4">
          <h4 className="text-[16px] font-semibold text-[#111827]">Course Information</h4>

          <Input
            label="Course Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Machine Learning Fundamentals"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Category"
              value={categoryId}
              onChange={setCategoryId}
              options={
                categoryOptions.length > 0
                  ? categoryOptions
                  : [{ label: 'Select Category', value: '' }]
              }
            />
            <Input
              label="Price ($)"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              hint="0 = Free"
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
              Course Description
            </label>
            <textarea
              className="w-full h-28 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              placeholder="Describe the course curriculum, learning objectives, and prerequisites…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {!isEdit && (
            <Input
              label="Course Manager ID"
              type="number"
              min={1}
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              hint="Assigned course manager"
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Course Guidelines</h4>
            <ul className="text-[12.5px] text-[#6B7280] space-y-2 list-disc pl-4">
              <li>Newly created courses are saved as drafts by default.</li>
              <li>A course requires at least 1 module before it can be published.</li>
              <li>Only administrators can assign or reassign course managers.</li>
              <li>Course managers can add and organize modules, questions, and exams.</li>
            </ul>
          </div>
          <Alert
            type="info"
            message="After creating the course, you will be able to add and manage curriculum modules in the Course Detail screen."
          />
        </div>
      </div>
    </div>
  );
}