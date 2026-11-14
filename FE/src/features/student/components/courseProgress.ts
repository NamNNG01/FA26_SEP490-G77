import { useEffect, useMemo, useState } from 'react';
import { modulePracticeService, type ModulePracticeOverview, type PracticeScope } from '@/services/modulePractice.service';
import type { StudentCourseDetail } from '@/services/studentCourse.service';
import { studentProgressService, type CourseProgress, type ProgressCount } from '@/services/studentProgress.service';
import { GENERAL_MODULE, sortedModules, useCourseContent } from './courseContent';

/**
 * Learning progress of a module, and of a course from its modules — the same numbers on My Courses'
 * course detail, the module cards and the module page. It all comes from LP-01, which the BE works
 * out live (and stores on the enrollment, so CL-02, My Courses and the dashboard agree).
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

export type OverviewState = ModulePracticeOverview | 'error' | undefined;
export type BeProgressState = CourseProgress | 'error' | undefined;

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

/** LP-01 of the course; reread when `refresh` changes. undefined while loading. */
export function useBeCourseProgress(courseId: number | string | null | undefined, refresh = 0): BeProgressState {
  const [state, setState] = useState<BeProgressState>(undefined);
  useEffect(() => {
    if (courseId == null || courseId === '') return;
    let cancelled = false;
    setState(undefined);
    studentProgressService
      .getCourseProgress(courseId)
      .then(p => {
        if (!cancelled) setState(p);
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, refresh]);
  return state;
}

function loadOverview(
  key: string,
  scope: PracticeScope,
  cancelled: () => boolean,
  set: (update: (prev: Record<string, OverviewState>) => Record<string, OverviewState>) => void,
) {
  modulePracticeService
    .getOverview(scope)
    .then(o => {
      if (!cancelled()) set(prev => ({ ...prev, [key]: o }));
    })
    .catch(() => {
      if (!cancelled()) set(prev => ({ ...prev, [key]: 'error' }));
    });
}

/**
 * Everything the course page needs: MC-02 / MC-03 grouped by module (useCourseContent), LP-01 for
 * the course's progress, and MP-01 of every module and of the General pool for the open practice
 * session ("Continue practice" on the cards) and the practice modal.
 * `course` undefined while LP-01 is loading, 'error' when it failed.
 */
export function useCourseProgress(course: StudentCourseDetail | null) {
  const content = useCourseContent(course);
  const be = useBeCourseProgress(course?.courseId);
  const { general } = content;
  // Keyed by moduleId, plus GENERAL_MODULE for the course's General pool.
  const [overviews, setOverviews] = useState<Record<string, OverviewState>>({});
  const modules = useMemo(() => (course ? sortedModules(course) : []), [course]);
  const courseId = course?.courseId;
  // Every course has a General pool; it counts as a module once it holds anything — practice
  // questions filed under no module, or such exams / decks. LP-01 lists it only then.
  const generalOverview = overviews[GENERAL_MODULE];
  const hasGeneral =
    general.length > 0 ||
    (be != null && be !== 'error' && be.modules.some(m => m.moduleId == null)) ||
    (generalOverview != null && generalOverview !== 'error' && generalOverview.totalQuestions > 0);

  useEffect(() => {
    let cancelled = false;
    modules.forEach(m => loadOverview(String(m.moduleId), { moduleId: m.moduleId }, () => cancelled, setOverviews));
    return () => {
      cancelled = true;
    };
  }, [modules]);

  useEffect(() => {
    if (courseId == null) return;
    let cancelled = false;
    loadOverview(GENERAL_MODULE, { courseId }, () => cancelled, setOverviews);
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const progress = useMemo<LearningProgress | 'error' | undefined>(
    () => (be === undefined || be === 'error' ? be : beCourseProgress(be)),
    [be],
  );

  /** Modules shown on the course page: the course's own, plus General when it holds anything. */
  const moduleCount = modules.length + (hasGeneral ? 1 : 0);
  return { ...content, modules, overviews, hasGeneral, moduleCount, course: progress };
}
