import { useEffect, useState } from 'react';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { studentCourseService, type CourseModuleSummary, type MyCourse } from '@/services/studentCourse.service';

export function ContributionCourseModuleFields({
  courses,
  courseId,
  moduleId,
  onCourseChange,
  onModuleChange,
  courseError,
  moduleError,
  disabled = false,
}: {
  courses: MyCourse[];
  courseId: string;
  moduleId: string;
  onCourseChange: (value: string) => void;
  onModuleChange: (value: string) => void;
  courseError?: string;
  moduleError?: string;
  disabled?: boolean;
}) {
  const [modules, setModules] = useState<CourseModuleSummary[]>([]);
  const [modulesCourseId, setModulesCourseId] = useState('');
  const [loadingModules, setLoadingModules] = useState(false);
  const [modulesError, setModulesError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setModules([]);
    setModulesCourseId('');
    setModulesError('');
    if (!courseId) {
      setLoadingModules(false);
      return;
    }

    setLoadingModules(true);
    studentCourseService.getCourseDetail(courseId)
      .then(detail => {
        if (cancelled) return;
        setModules(detail.modules ?? []);
        setModulesCourseId(courseId);
      })
      .catch(() => {
        if (!cancelled) setModulesError('Could not load modules for this course. Try choosing the course again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingModules(false);
      });

    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    if (modulesCourseId === courseId && moduleId && !modules.some(module => String(module.moduleId) === moduleId)) {
      onModuleChange('');
    }
  }, [courseId, moduleId, modules, modulesCourseId, onModuleChange]);

  const courseOptions = [
    { label: 'Choose an enrolled course', value: '' },
    ...courses.map(course => ({ label: course.title, value: String(course.courseId) })),
  ];
  const moduleOptions = [
    { label: 'Choose a module', value: '' },
    ...modules.map(module => ({ label: module.title, value: String(module.moduleId) })),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <SearchableSelect
          label="Enrolled course *"
          options={courseOptions}
          value={courseId}
          onChange={value => { onCourseChange(value); onModuleChange(''); }}
          placeholder="Choose an enrolled course"
          searchPlaceholder="Search courses…"
          emptyText="No active course enrollments found"
          disabled={disabled}
        />
        {courseError && <p className="mt-1 text-xs text-danger" role="alert">{courseError}</p>}
      </div>
      <div>
        <SearchableSelect
          label="Module *"
          options={moduleOptions}
          value={moduleId}
          onChange={onModuleChange}
          placeholder={!courseId ? 'Choose a course first' : loadingModules ? 'Loading modules…' : 'Choose a module'}
          searchPlaceholder="Search modules…"
          emptyText="No visible modules found"
          disabled={disabled || !courseId || loadingModules || modules.length === 0}
        />
        {moduleError && <p className="mt-1 text-xs text-danger" role="alert">{moduleError}</p>}
        {modulesError ? <p className="mt-1 text-xs text-danger" role="alert">{modulesError}</p> :
          courseId && !loadingModules && modulesCourseId === courseId && modules.length === 0 && <p className="mt-1 text-xs text-warning">This course has no visible modules yet.</p>}
      </div>
    </div>
  );
}
