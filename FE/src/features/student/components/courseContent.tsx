import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';
import { studentDeckPath, studentExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import type { ExamKind } from '@/services/exam.service';
import {
  studentCourseService,
  type CourseExam,
  type StudentCourseDetail,
  type StudentDeck,
} from '@/services/studentCourse.service';
import type { DeckStudyState } from './DeckCard';
import { formatScore } from './studentUi';

/** Route segment of the pseudo-module holding the exams and decks not filed under any module. */
export const GENERAL_MODULE = 'general';

export type ContentItem = { kind: 'exam'; exam: CourseExam } | { kind: 'deck'; deck: StudentDeck };

export function contentKey(item: ContentItem) {
  return item.kind === 'exam' ? `e-${item.exam.examId}` : `d-${item.deck.deckId}`;
}

export function contentTitle(item: ContentItem) {
  return item.kind === 'exam' ? item.exam.title : item.deck.title;
}

export function sortedModules(course: StudentCourseDetail) {
  return [...course.modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/**
 * MC-02 exams and MC-03 decks of a course, grouped by module. Items whose module is unknown or
 * missing go to `general`.
 */
export function useCourseContent(course: StudentCourseDetail | null) {
  const courseId = course?.courseId;
  const [exams, setExams] = useState<CourseExam[]>([]);
  const [decks, setDecks] = useState<StudentDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (courseId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([studentCourseService.getAllCourseExams(courseId), studentCourseService.getCourseDecks(courseId)])
      .then(([examRes, deckRes]) => {
        if (cancelled) return;
        setExams(examRes);
        setDecks(deckRes);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the course content.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, reload]);

  const grouped = useMemo(() => {
    const byModule = new Map<number, ContentItem[]>((course?.modules ?? []).map(m => [m.moduleId, []]));
    const general: ContentItem[] = [];
    const file = (moduleId: number | null | undefined, item: ContentItem) => {
      const bucket = moduleId != null ? byModule.get(moduleId) : undefined;
      (bucket ?? general).push(item);
    };
    exams.forEach(exam => file(exam.moduleId, { kind: 'exam', exam }));
    decks.forEach(deck => file(deck.moduleId, { kind: 'deck', deck }));
    return { byModule, general };
  }, [course, exams, decks]);

  return { ...grouped, loading, error, retry: () => setReload(r => r + 1) };
}

/** Opens an exam's detail page, or a deck's study page with the course for its breadcrumb. */
export function useOpenContent(course: StudentCourseDetail) {
  const navigate = useNavigate();
  return (item: ContentItem) =>
    item.kind === 'exam'
      ? navigate(studentExamPath(item.exam.examId))
      : navigate(studentDeckPath(item.deck.deckId), {
          state: { deckTitle: item.deck.title, courseId: course.courseId, courseTitle: course.title } satisfies DeckStudyState,
        });
}

export function countItems(items: ContentItem[]) {
  let exams = 0;
  for (const item of items) if (item.kind === 'exam') exams++;
  return { exams, decks: items.length - exams };
}

const EXAM_KIND: Record<ExamKind, { label: string; variant: 'info' | 'purple' | 'warning' | 'success' | 'default' }> = {
  QUIZ: { label: 'Quiz', variant: 'info' },
  ESSAY: { label: 'Essay', variant: 'purple' },
  CODE: { label: 'Code', variant: 'warning' },
  DIAGRAM: { label: 'Diagram', variant: 'success' },
  MIXED: { label: 'Mixed', variant: 'default' },
};

export function ExamKindBadge({ kind }: { kind: ExamKind }) {
  const k = EXAM_KIND[kind] ?? { label: kind, variant: 'default' as const };
  return (
    <Badge variant={k.variant} size="sm">
      {k.label}
    </Badge>
  );
}

/** One exam or deck as a clickable card. */
export function ContentItemCard({ item, onOpen }: { item: ContentItem; onOpen: () => void }) {
  const isExam = item.kind === 'exam';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card p-4 flex flex-col gap-3 text-left hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 ${
            isExam ? 'bg-primary-light text-primary' : 'bg-purple-light text-purple'
          }`}
        >
          {isExam ? <Icon.ClipboardList className="w-5 h-5" /> : <Icon.Layers className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-medium uppercase tracking-wide text-content-subtle">{isExam ? 'Exam' : 'Flashcards'}</span>
            {item.kind === 'exam' && item.exam.examKind && <ExamKindBadge kind={item.exam.examKind} />}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-content leading-snug line-clamp-2">{contentTitle(item)}</h3>
        </div>
      </div>

      {item.kind === 'exam' ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-soft">
          <span>{item.exam.questionCount} questions</span>
          {item.exam.durationMinutes != null && <span>{item.exam.durationMinutes} min</span>}
          {item.exam.myAttemptCount > 0 && (
            <span>
              Best <span className="font-medium text-content-secondary">{formatScore(item.exam.myBestScore, item.exam.maxScore)}</span>
            </span>
          )}
          {item.exam.hasActiveAttempt && (
            <Badge variant="warning" size="sm" className="ml-auto">
              In progress
            </Badge>
          )}
        </div>
      ) : (
        <div className="mt-auto space-y-1.5">
          <div className="flex justify-between text-xs text-content-soft">
            <span>{item.deck.cardCount} cards</span>
            <span>
              {item.deck.learnedCount}/{item.deck.cardCount} learned
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-accent overflow-hidden">
            <div
              className="h-full rounded-full bg-purple"
              style={{ width: `${item.deck.cardCount > 0 ? Math.round((item.deck.learnedCount / item.deck.cardCount) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
