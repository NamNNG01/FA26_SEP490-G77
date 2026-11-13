import { useEffect, useMemo, useState } from 'react';
import { modulePracticeService, type ModulePracticeOverview, type PracticeScope } from '@/services/modulePractice.service';
import type { StudentCourseDetail } from '@/services/studentCourse.service';
import { studentProgressService, type CourseProgress, type ProgressCount } from '@/services/studentProgress.service';
import { GENERAL_MODULE, sortedModules, useCourseContent, type ContentItem } from './courseContent';

/**
 * Learning progress of a module, and of a course from its modules — the same numbers on My Courses'
 * course detail, the module cards and the module page.
 *
 * A module has up to three parts, each counted only when the module has something of that kind:
 *  - questions: practised questions answered right at least once (MP-01 everCorrectQuestions);
 *  - exams: course exams submitted at least once (graded or still waiting for the AI);
 *  - decks: flashcard decks with every card learned.
 * The module's percent is the plain average of its parts; the course's is the plain average of its
 * modules (General included when it has content).
 *
 * The numbers come from LP-01, which the BE works out live (and stores on the enrollment, so CL-02,
 * My Courses and the dashboard agree). The same sums are worked out here from MP-01 / MC-02 / MC-03
 * only as a fallback when LP-01 fails.
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

/** MC-02 counts the attempt still open; at most one is, so anything beyond it was submitted. */
const examDone = (item: ContentItem) => item.kind === 'exam' && item.exam.myAttemptCount > (item.exam.hasActiveAttempt ? 1 : 0);
const deckDone = (item: ContentItem) => item.kind === 'deck' && item.deck.cardCount > 0 && item.deck.learnedCount >= item.deck.cardCount;

const average = (values: number[]) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

/** One module (or General): its practice overview and its exams and decks. */
export function moduleProgress(overview: ModulePracticeOverview, items: ContentItem[]): LearningProgress {
  const exams = items.filter(i => i.kind === 'exam');
  const decks = items.filter(i => i.kind === 'deck');
  const parts: ProgressPart[] = [
    { key: 'questions' as const, done: overview.everCorrectQuestions, total: overview.totalQuestions },
    { key: 'exams' as const, done: exams.filter(examDone).length, total: exams.length },
    { key: 'decks' as const, done: decks.filter(deckDone).length, total: decks.length },
  ].filter(p => p.total > 0);
  const ratio = average(parts.map(p => Math.min(1, p.done / p.total)));
  return { percent: ratio == null ? null : Math.round(ratio * 100), parts };
}

/** The course from its modules: each module with content weighs the same. Parts are summed for the summary line. */
export function courseProgress(modules: LearningProgress[]): LearningProgress {
  const counted = modules.filter(m => m.percent != null);
  const avg = average(counted.map(m => m.percent as number));
  const sums = new Map<ProgressPartKey, ProgressPart>();
  counted.forEach(m =>
    m.parts.forEach(p => {
      const s = sums.get(p.key) ?? { key: p.key, done: 0, total: 0 };
      sums.set(p.key, { key: p.key, done: s.done + p.done, total: s.total + p.total });
    }),
  );
  const order: ProgressPartKey[] = ['questions', 'exams', 'decks'];
  return {
    percent: avg == null ? null : Math.round(avg),
    parts: order.map(k => sums.get(k)).filter((p): p is ProgressPart => p != null),
  };
}

export type OverviewState = ModulePracticeOverview | 'error' | undefined;
export type ProgressState = LearningProgress | 'error' | undefined;
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

/** A module's progress once its practice overview is read. */
export const progressOf = (overview: OverviewState, items: ContentItem[]): ProgressState =>
  overview === undefined || overview === 'error' ? overview : moduleProgress(overview, items);

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
 * Everything a course's progress needs, for the course page and My Courses alike: MC-02 / MC-03
 * grouped by module (useCourseContent), MP-01 of every module and of the course's General pool,
 * then each module's progress and the course's.
 * `course` undefined while something is still loading; `partial` when a module's MP-01 failed.
 */
export function useCourseProgress(course: StudentCourseDetail | null) {
  const content = useCourseContent(course);
  const be = useBeCourseProgress(course?.courseId);
  const { byModule, general } = content;
  // Keyed by moduleId, plus GENERAL_MODULE for the course's General pool.
  const [overviews, setOverviews] = useState<Record<string, OverviewState>>({});
  const modules = useMemo(() => (course ? sortedModules(course) : []), [course]);
  const courseId = course?.courseId;
  // Every course has a General pool; it counts as a module once it holds anything — practice
  // questions filed under no module, or such exams / decks.
  const generalOverview = overviews[GENERAL_MODULE];
  const hasGeneral = general.length > 0 || (generalOverview != null && generalOverview !== 'error' && generalOverview.totalQuestions > 0);

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

  const progress = useMemo(() => {
    // General is always read; with nothing in it its percent is null and the course average leaves it out.
    const entries: [string, ProgressState][] = [
      ...modules.map((m): [string, ProgressState] => [String(m.moduleId), progressOf(overviews[m.moduleId], byModule.get(m.moduleId) ?? [])]),
      [GENERAL_MODULE, progressOf(overviews[GENERAL_MODULE], general)],
    ];
    // LP-01 in: its numbers win; a module it leaves out has nothing to count.
    if (be && be !== 'error') {
      return {
        byKey: Object.fromEntries(entries.map(([key]) => [key, beModuleProgress(be, key) ?? { percent: null, parts: [] }])) as Record<string, ProgressState>,
        course: beCourseProgress(be),
        partial: false,
      };
    }
    const states = entries.map(([, s]) => s);
    const ready = be === 'error' && !content.loading && !content.error && states.every(s => s !== undefined);
    return {
      byKey: Object.fromEntries(entries) as Record<string, ProgressState>,
      course: ready ? courseProgress(states.filter((s): s is LearningProgress => s !== undefined && s !== 'error')) : undefined,
      partial: be === 'error' && states.includes('error'),
    };
  }, [modules, overviews, byModule, general, content.loading, content.error, be]);

  /** Modules shown on the course page: the course's own, plus General when it holds anything. */
  const moduleCount = modules.length + (hasGeneral ? 1 : 0);
  return { ...content, modules, overviews, hasGeneral, moduleCount, ...progress };
}
