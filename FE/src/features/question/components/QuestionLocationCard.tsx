import React from 'react';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { LOCATION_COURSES, locationModulesByCourse } from '../mockQuestionLocation';

/**
 * Location card with inline Course/Module dropdown selectors.
 * Sits at the top of the sticky sidebar. The Module dropdown stays disabled
 * until a Course is chosen and lists only that Course's modules.
 */
export function QuestionLocationCard({ courseId, moduleId, onChange, className = '' }: {
  courseId: string;
  moduleId: string;
  onChange: (courseId: string, moduleId: string) => void;
  className?: string;
}) {
  const moduleOptions = [
    { label: 'Select Module', value: '' },
    ...locationModulesByCourse(courseId).map(m => ({ label: m.title, value: m.id })),
  ];

  const handleCourseChange = (v: string) => {
    // Switching the course resets the module; options reload for the new course.
    onChange(v, '');
  };

  return (
    <div className={`rounded-[10px] border border-[#E5E7EB] bg-[#F9FAFB] p-3 space-y-2.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Icon.FolderOpen className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />
        <span className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">Location</span>
      </div>
      <Select
        label="Course *"
        value={courseId}
        onChange={handleCourseChange}
        options={[{ label: 'Select Course', value: '' }, ...LOCATION_COURSES.map(c => ({ label: c.title, value: c.id }))]}
      />
      <Select
        label="Module *"
        value={moduleId}
        onChange={v => onChange(courseId, v)}
        disabled={courseId === ''}
        options={moduleOptions}
      />
    </div>
  );
}
