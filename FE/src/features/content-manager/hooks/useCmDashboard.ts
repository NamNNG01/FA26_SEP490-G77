import { useCallback, useEffect, useRef, useState } from 'react';
import type { CmCourseStat, CmDashboardSummary, CmExamStat } from '@/services/cmDashboard.types';
import { CM_MIN_ATTEMPTS } from '@/services/cmDashboard.types';
import { cmDashboardService } from '@/services/cmDashboard.service';

/**
 * useCmDashboard
 *
 * Data for the Course Manager dashboard v2. The three sections load
 * independently, so one failing or being slow never blocks the others:
 *
 *   summary → GET /api/v1/dashboard/course-manager/summary
 *   courses → GET /api/v1/dashboard/course-manager/courses
 *   exams   → GET /api/v1/dashboard/course-manager/exams?minAttempts=5
 *
 * All three are scoped server-side to the signed-in course manager. Exams
 * arrive unfiltered and the panel narrows them to the selected course on the
 * client — the lists are small and the API also accepts `courseId` when a
 * caller needs only one course.
 */

export type CmDashboardSection = 'summary' | 'courses' | 'exams';

type SectionFlags<T> = Record<CmDashboardSection, T>;

export interface UseCmDashboardResult {
  summary: CmDashboardSummary | null;
  courses: CmCourseStat[] | null;
  exams: CmExamStat[] | null;
  loading: SectionFlags<boolean>;
  error: SectionFlags<string | null>;
  /** Reload one section, or all of them when called without an argument. */
  refresh: (section?: CmDashboardSection) => void;
}

const SECTIONS: CmDashboardSection[] = ['summary', 'courses', 'exams'];

export function useCmDashboard(): UseCmDashboardResult {
  const [summary, setSummary] = useState<CmDashboardSummary | null>(null);
  const [courses, setCourses] = useState<CmCourseStat[] | null>(null);
  const [exams, setExams] = useState<CmExamStat[] | null>(null);
  const [loading, setLoading] = useState<SectionFlags<boolean>>({ summary: true, courses: true, exams: true });
  const [error, setError] = useState<SectionFlags<string | null>>({ summary: null, courses: null, exams: null });

  // Latest request id per section, so a slow stale response never overwrites a newer one.
  const requestIds = useRef<SectionFlags<number>>({ summary: 0, courses: 0, exams: 0 });
  const mounted = useRef(true);

  const load = useCallback((section: CmDashboardSection) => {
    const id = ++requestIds.current[section];
    setLoading((s) => ({ ...s, [section]: true }));
    setError((s) => ({ ...s, [section]: null }));

    const isCurrent = () => mounted.current && id === requestIds.current[section];
    const keep = <T,>(set: (v: T) => void) => (v: T) => {
      if (isCurrent()) set(v);
    };

    const request: Promise<void> =
      section === 'summary'
        ? cmDashboardService.getSummary().then(keep(setSummary))
        : section === 'courses'
          ? cmDashboardService.getCourses().then(keep(setCourses))
          : cmDashboardService.getExams({ minAttempts: CM_MIN_ATTEMPTS }).then(keep(setExams));

    request
      .catch((e: unknown) => {
        if (!isCurrent()) return;
        setError((s) => ({ ...s, [section]: e instanceof Error ? e.message : 'Failed to load data.' }));
      })
      .finally(() => {
        if (isCurrent()) setLoading((s) => ({ ...s, [section]: false }));
      });
  }, []);

  const refresh = useCallback(
    (section?: CmDashboardSection) => (section ? [section] : SECTIONS).forEach(load),
    [load],
  );

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { summary, courses, exams, loading, error, refresh };
}
