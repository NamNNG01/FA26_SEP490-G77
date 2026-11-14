import { useEffect, useMemo, useRef } from 'react';
import { cacheGeneration, getCached, setCached, useCachedQuery } from '@/hooks/useCachedQuery';
import {
  studentCourseService,
  type CourseExam,
  type MyCourse,
  type StudentCourseDetail,
  type StudentDeck,
} from '@/services/studentCourse.service';
import { studentProgressService, type CourseProgress, type ProgressCount } from '@/services/studentProgress.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { GENERAL_MODULE, groupCourseContent, sortedModules } from './courseContent';

/**
 * Learning progress of a module, and of a course from its modules — the same numbers on My Courses'
 * course detail, the module cards and the module page. It all comes from LP-01, which the BE works
 * out live (read-only: reading it does not store anything).
 *
 * A module has up to three parts, each counted only when the module has something of that kind:
 * questions answered right at least once, course exams submitted at least once, and flashcard decks
 * with every card learned.
 */

export type ProgressPartKey = 'questions' | 'exams' | 'decks';

export interface ProgressPart {
  key: ProgressPartKey;
  done: number;
  total: number;
}

export interface LearningProgress {
  /** 0–100; null when there is nothing to count. */
  percent: number | null;
  /** Only the parts the module has. */
  parts: ProgressPart[];
}

export type BeProgressState = CourseProgress | 'error' | undefined;

/** useCachedQuery keys of a course's reads, shared by the course page, the module page and My Courses. */
export const courseCacheKey = {
  /** MC-01 as My Courses lists it, with each course's live LP-01 percent. */
  myCourses: 'student:my-courses',
  /** CL-02 + MC-02 + MC-03 + LP-01, as the course page reads them. */
  detail: (courseId: number | string) => `student:course-detail:${courseId}`,
  /** CL-02 */
  course: (courseId: number | string) => `student:course:${courseId}`,
  /** LP-01 */
  progress: (courseId: number | string) => `student:course-progress:${courseId}`,
  /** Module content (`general` = the General pool). */
  moduleContent: (courseId: number | string, moduleKey: number | string) => `student:module-content:${courseId}:${moduleKey}`,
  /** MP-01 of a module, or of the course's General pool. */
  moduleOverview: (courseId: number | string, moduleKey: number | string) => `student:module-overview:${courseId}:${moduleKey}`,
};

/** An LP-01 scope (course, module or General) as a LearningProgress: only the parts it has. */
function fromBe(percent: number | null, counts: Record<ProgressPartKey, ProgressCount | null>): LearningProgress {
  const order: ProgressPartKey[] = ['questions', 'exams', 'decks'];
  const parts = order
    .map(key => ({ key, done: counts[key]?.done ?? 0, total: counts[key]?.total ?? 0 }))
    .filter(p => p.total > 0);
  return { percent, parts };
}

/** LP-01's course total. */
export const beCourseProgress = (p: CourseProgress): LearningProgress =>
  fromBe(p.progress, { questions: p.questions, exams: p.exams, decks: p.decks });

/** LP-01's entry for a module (`GENERAL_MODULE` = the General pool); null when LP-01 has none, i.e. nothing to count. */
export function beModuleProgress(p: CourseProgress, key: string): LearningProgress | null {
  const m = p.modules.find(x => (x.moduleId == null ? GENERAL_MODULE : String(x.moduleId)) === key);
  return m ? fromBe(m.progress, { questions: m.questions, exams: m.exams, decks: m.decks }) : null;
}

/**
 * LP-01 of the course; reread when `refresh` changes. undefined while loading. `initial` (LP-01
 * the course page already read) is used as is until the first refresh, so opening a module from
 * the course page does not read LP-01 again.
 */
export function useBeCourseProgress(
  courseId: number | string | null | undefined,
  refresh = 0,
  initial?: CourseProgress | null,
): BeProgressState {
  const key = courseId == null || courseId === '' ? null : courseCacheKey.progress(courseId);
  const handed = initial != null && String(initial.courseId) === String(courseId) ? initial : undefined;
  const { data, error, reload } = useCachedQuery<CourseProgress>(
    key,
    () => studentProgressService.getCourseProgress(courseId as number | string),
    { initialData: handed },
  );
  const firstRefresh = useRef(refresh);
  useEffect(() => {
    if (refresh !== firstRefresh.current) reload();
  }, [refresh, reload]);
  return error ? 'error' : data;
}

interface CourseDetailData {
  course: StudentCourseDetail;
  /** MC-02 / MC-03; null when they failed (they also refuse an enrollment that is not ACTIVE). */
  exams: CourseExam[] | null;
  decks: StudentDeck[] | null;
  be: CourseProgress | 'error';
}

/**
 * Everything the course page needs, read together and shown at once: CL-02, MC-02 (every page),
 * MC-03 and LP-01 all start from the route's courseId, without waiting for CL-02. MC-02/03 and LP-01
 * only answer for an ACTIVE enrollment; for any other state their failures are dropped. MP-01 is not
 * read here (that would be one call per module): the course page reads it for one module only, when
 * its Practice button is pressed.
 */
export function useCourseDetail(courseId: string) {
  // Cached (useCachedQuery): opened again, the page shows the last reading at once and reads again behind it.
  const { data, loading, error, reload } = useCachedQuery<CourseDetailData>(courseCacheKey.detail(courseId), async () => {
    const gen = cacheGeneration();
    const [course, exams, decks, be] = await Promise.all([
      studentCourseService.getCourseDetail(courseId),
      studentCourseService.getAllCourseExams(courseId).catch(() => null),
      studentCourseService.getCourseDecks(courseId).catch(() => null),
      studentProgressService.getCourseProgress(courseId).catch(() => 'error' as const),
    ]);
    // Signed out meanwhile: nothing of this reading goes into the new session's cache.
    if (gen !== cacheGeneration()) return { course, exams, decks, be };
    // The module page reads these two on their own; it can start from them too.
    setCached(courseCacheKey.course(courseId), course);
    if (be !== 'error') {
      setCached(courseCacheKey.progress(courseId), be);
      // Back on My Courses, this course's bar shows the percent just read.
      const myCourses = getCached<MyCourse[]>(courseCacheKey.myCourses);
      if (myCourses) {
        setCached(
          courseCacheKey.myCourses,
          myCourses.map(c => (c.courseId === be.courseId ? { ...c, progress: be.progress } : c)),
        );
      }
    }
    return { course, exams, decks, be };
  });

  const derived = useMemo(() => {
    if (!data) return null;
    const { course, exams, decks, be } = data;
    const isActive = Boolean(course.enrollment?.isEnrolled && course.enrollment.status === 'ACTIVE');
    const modules = sortedModules(course);
    const { byModule, general } = groupCourseContent(course, exams ?? [], decks ?? []);
    // Every course has a General pool; it counts as a module once it holds anything — practice
    // questions filed under no module, or such exams / decks. LP-01 lists it only then.
    const hasGeneral = isActive && (general.length > 0 || (be !== 'error' && be.modules.some(m => m.moduleId == null)));
    /** A module's progress (`GENERAL_MODULE` = the General pool): undefined when LP-01 failed, null = nothing to count. */
    const moduleProgress = (key: string): LearningProgress | null | undefined =>
      be === 'error' ? undefined : beModuleProgress(be, key);
    return {
      course,
      isActive,
      modules,
      byModule,
      general,
      hasGeneral,
      /** Modules shown on the course page: the course's own, plus General when it holds anything. */
      moduleCount: modules.length + (hasGeneral ? 1 : 0),
      contentError: isActive && (exams == null || decks == null) ? 'Failed to load the course content.' : null,
      progress: (be === 'error' ? 'error' : beCourseProgress(be)) as LearningProgress | 'error',
      be,
      moduleProgress,
    };
  }, [data]);

  return {
    data: derived,
    loading,
    error: error ? getApiErrorMessage(error, 'Failed to load the course.') : null,
    retry: reload,
  };
}

export type CourseDetailState = NonNullable<ReturnType<typeof useCourseDetail>['data']>;
