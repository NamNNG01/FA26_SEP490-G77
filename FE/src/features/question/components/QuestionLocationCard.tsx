import React, { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';

/**
 * Course / Module pickers for where new questions are saved. The course is
 * required, the module optional. Module options load for the selected course;
 * switching course clears the module.
 */
export function QuestionLocationCard({ courseId, moduleId, onChange, courseLocked, showErrors, hideHeading }: {
  courseId: string;
  moduleId: string;
  onChange: (courseId: string, moduleId: string) => void;
  /** Edit mode: a question can't move to another course (the update API has no courseId). */
  courseLocked?: boolean;
  showErrors?: boolean;
  /** Render only the pickers, for callers that supply their own card heading. */
  hideHeading?: boolean;
}) {
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);

  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100 }).then(res => {
      if (!cancelled) setCourses(res.content);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setModules([]);
      return;
    }
    let cancelled = false;
    setLoadingModules(true);
    courseService
      .getCourseModules(courseId)
      .then(res => {
        if (!cancelled) setModules([...res].sort((a, b) => a.orderIndex - b.orderIndex));
      })
      .finally(() => {
        if (!cancelled) setLoadingModules(false);
      });
    return () => { cancelled = true; };
  }, [courseId]);

  const courseOptions = courses.map(c => ({ label: c.title, value: String(c.courseId) }));
  // Keep the current value selectable even if it isn't in the loaded list.
  if (courseId && !courseOptions.some(o => o.value === courseId)) courseOptions.unshift({ label: `Course #${courseId}`, value: courseId });
  const moduleOptions = modules.map(m => ({ label: m.title, value: String(m.moduleId) }));
  if (moduleId && !loadingModules && !moduleOptions.some(o => o.value === moduleId)) moduleOptions.unshift({ label: `Module #${moduleId}`, value: moduleId });

  return (
    <div className="space-y-3">
      {!hideHeading && (
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-content">
          <Icon.FolderOpen className="w-4 h-4 text-brand-ink" /> Location
        </h3>
      )}
      <div>
        <Select
          label="Course *"
          value={courseId}
          onChange={v => onChange(v, '')}
          disabled={courseLocked}
          options={[{ label: 'Select course', value: '' }, ...courseOptions]}
        />
        {showErrors && !courseId && <p className="text-xs text-danger mt-1">Select a course.</p>}
      </div>
      <div>
        <Select
          label="Module (optional)"
          value={moduleId}
          onChange={v => onChange(courseId, v)}
          disabled={!courseId || loadingModules}
          options={[{ label: !courseId ? 'Select a course first' : loadingModules ? 'Loading…' : 'No module', value: '' }, ...moduleOptions]}
        />
      </div>
    </div>
  );
}
