import { useEffect, useMemo, useRef } from "react";
import { cacheGeneration, setCached, useCachedQuery } from "@/hooks/useCachedQuery";
import { studentCourseService, type StudentCourseDetail } from "@/services/studentCourse.service";
import {
  studentProgressService,
  type CourseProgress,
  type ProgressCount,
} from "@/services/studentProgress.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { GENERAL_MODULE, sortedModules } from "./courseContent";

/**
 * Learning progress of a module, and of a course from its modules — the same numbers on My Courses'
 * course detail, the module cards and the module page. It all comes from LP-01, which the BE works
 * out live (read-only: reading it does not store anything).
 *
 * A module has up to three parts, each counted only when the module has something of that kind:
 * questions answered right at least once, course exams submitted at least once, and flashcard decks
 * with every card learned.
 */

export type ProgressPartKey = "questions" | "exams" | "decks";

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

export type BeProgressState = CourseProgress | "error" | undefined;

/** useCachedQuery keys of a course's reads, shared by the course page, the module page and My Courses. */
export const courseCacheKey = {
  /** MC-01 as My Courses lists it, with each course's live LP-01 percent. */
  myCourses: "student:my-courses",
  /** CL-02 + LP-01, as the course page reads them. */
  detail: (courseId: number | string) => `student:course-detail:${courseId}`,
  /** CL-02 */
  course: (courseId: number | string) => `student:course:${courseId}`,
  /** LP-01 */
  progress: (courseId: number | string) => `student:course-progress:${courseId}`,
  /** Module content (`general` = the General pool). */
  moduleContent: (courseId: number | string, moduleKey: number | string) =>
    `student:module-content:${courseId}:${moduleKey}`,
  /** MP-01 of a module, or of the course's General pool. */
  moduleOverview: (courseId: number | string, moduleKey: number | string) =>
    `student:module-overview:${courseId}:${moduleKey}`,
};

/** An LP-01 module scope as a LearningProgress (questions answered right in Practice or Exam). */
function fromBe(percent: number | null, questions: ProgressCount | null): LearningProgress {
  const parts: ProgressPart[] =
    questions && questions.total > 0
      ? [{ key: "questions", done: questions.done, total: questions.total }]
      : [];
  return { percent, parts };
}

/** LP-01's entry for a module (`GENERAL_MODULE` = the General pool); null when LP-01 has none or nothing to count. */
export function beModuleProgress(p: CourseProgress, key: string): LearningProgress | null {
  const m = p.modules.find(
    (x) => (x.moduleId == null ? GENERAL_MODULE : String(x.moduleId)) === key,
  );
  if (!m || m.progress == null) return null;
  return fromBe(m.progress, m.questions);
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
  const key = courseId == null || courseId === "" ? null : courseCacheKey.progress(courseId);
  const handed =
    initial != null && String(initial.courseId) === String(courseId) ? initial : undefined;
  const { data, error, reload } = useCachedQuery<CourseProgress>(
    key,
    () => studentProgressService.getCourseProgress(courseId as number | string),
    { initialData: handed },
  );
  const firstRefresh = useRef(refresh);
  useEffect(() => {
    if (refresh !== firstRefresh.current) reload();
  }, [refresh, reload]);
  return error ? "error" : data;
}

interface CourseDetailData {
  course: StudentCourseDetail;
  be: CourseProgress | "error";
}

/**
 * Everything the course page needs, read together and shown at once: CL-02 and LP-01 both start
 * from the route's courseId, without waiting for each other. LP-01 only answers for an ACTIVE
 * enrollment; for any other state its failure is dropped. MP-01 is not read here (that would be
 * one call per module): the course page reads it for one module only, when its Practice button is
 * pressed.
 */
export function useCourseDetail(courseId: string) {
  // Cached (useCachedQuery): opened again, the page shows the last reading at once and reads again behind it.
  const { data, loading, error, reload } = useCachedQuery<CourseDetailData>(
    courseCacheKey.detail(courseId),
    async () => {
      const gen = cacheGeneration();
      const [course, be] = await Promise.all([
        studentCourseService.getCourseDetail(courseId),
        studentProgressService.getCourseProgress(courseId).catch(() => "error" as const),
      ]);
      // Signed out meanwhile: nothing of this reading goes into the new session's cache.
      if (gen !== cacheGeneration()) return { course, be };
      // The module page reads these two on their own; it can start from them too.
      setCached(courseCacheKey.course(courseId), course);
      if (be !== "error") {
        setCached(courseCacheKey.progress(courseId), be);
      }
      return { course, be };
    },
  );

  const derived = useMemo(() => {
    if (!data) return null;
    const { course, be } = data;
    const isActive = Boolean(
      course.enrollment?.isEnrolled && course.enrollment.status === "ACTIVE",
    );
    const modules = sortedModules(course);
    const generalEntry = be !== "error" ? be.modules.find((m) => m.moduleId == null) : undefined;
    const generalCounts = {
      exams:
        generalEntry?.exams?.total ??
        Math.max(
          0,
          (course.stats.publishedExamCount ?? 0) -
            modules.reduce((sum, m) => sum + (m.examCount ?? 0), 0),
        ),
      decks:
        generalEntry?.decks?.total ??
        Math.max(
          0,
          (course.stats.deckCount ?? 0) - modules.reduce((sum, m) => sum + (m.deckCount ?? 0), 0),
        ),
      questions: be !== "error" ? (generalEntry?.questions?.total ?? 0) : undefined,
    };
    // Every course has a General pool; it counts as a module once it holds anything — practice
    // questions filed under no module, or such exams / decks. LP-01 lists it only then.
    const hasGeneral =
      isActive && (generalEntry != null || generalCounts.exams > 0 || generalCounts.decks > 0);
    /** A module's progress (`GENERAL_MODULE` = the General pool): undefined when LP-01 failed, null = nothing to count. */
    const moduleProgress = (key: string): LearningProgress | null | undefined =>
      be === "error" ? undefined : beModuleProgress(be, key);
    return {
      course,
      isActive,
      modules,
      generalCounts,
      hasGeneral,
      /** Modules shown on the course page: the course's own, plus General when it holds anything. */
      moduleCount: modules.length + (hasGeneral ? 1 : 0),
      be,
      moduleProgress,
    };
  }, [data]);

  return {
    data: derived,
    loading,
    error: error ? getApiErrorMessage(error, "Failed to load the course.") : null,
    retry: reload,
  };
}

export type CourseDetailState = NonNullable<ReturnType<typeof useCourseDetail>["data"]>;
