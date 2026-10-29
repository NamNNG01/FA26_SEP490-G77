import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { studentDeckPath, studentExamPath } from '@/app/routes';
import type { MyCourse } from '@/services/studentCourse.service';
import {
  getAiError,
  studentAiService,
  type AiError,
  type Recommendation,
  type RecommendationType,
  type Recommendations,
} from '@/services/studentAi.service';
import type { DeckStudyState } from './DeckCard';
import { AccuracyBar, AiErrorAlert, AiSparkle, PriorityBadge, QuotaLine, SourceBadge, TrendIcon, accuracyTone } from './aiUi';

const COURSE_KEY = 'student.recommendations.courseId';

const TYPE_META: Record<RecommendationType, { label: string; icon: React.ReactNode }> = {
  FLASHCARD_DECK: { label: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" /> },
  EXAM: { label: 'Exam', icon: <Icon.ClipboardList className="w-4 h-4" /> },
  REVIEW_SESSION: { label: 'Review', icon: <Icon.RefreshCw className="w-4 h-4" /> },
  WEAK_TOPIC: { label: 'Weak topic', icon: <Icon.Flag className="w-4 h-4" /> },
};

function readSavedCourse(): number | null {
  try {
    const v = Number(localStorage.getItem(COURSE_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function saveCourse(id: number) {
  try {
    localStorage.setItem(COURSE_KEY, String(id));
  } catch {
    // Storage blocked — the pick just isn't remembered.
  }
}

/**
 * "Recommended for you" (AI-03) under the My Courses header. One course at a time (picked in the
 * dropdown, remembered per browser); the AI is called only when the student presses
 * "Get recommendations" since an uncached call spends quota. Results stay per course while on the page.
 *
 * Clicks: FLASHCARD_DECK → deck study (FP-01), EXAM → exam detail (EX-01),
 * REVIEW_SESSION / WEAK_TOPIC → Smart Practice modal (the FE has no Mistake Notebook / MN-04 yet).
 */
export function RecommendationsCard({
  courses,
  onSmartPractice,
}: {
  courses: MyCourse[];
  onSmartPractice: (courseId: number) => void;
}) {
  const navigate = useNavigate();
  const defaultCourse = useMemo(() => {
    const saved = readSavedCourse();
    if (saved != null && courses.some(c => c.courseId === saved)) return saved;
    const newest = [...courses].sort((a, b) => (b.enrolledAt ?? '').localeCompare(a.enrolledAt ?? ''))[0];
    return newest?.courseId ?? null;
  }, [courses]);

  const [courseId, setCourseId] = useState<number | null>(defaultCourse);
  const [results, setResults] = useState<Record<number, Recommendations>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);

  useEffect(() => {
    setCourseId(id => (id != null && courses.some(c => c.courseId === id) ? id : defaultCourse));
  }, [courses, defaultCourse]);

  const course = courses.find(c => c.courseId === courseId) ?? null;
  const data = courseId != null ? results[courseId] : undefined;

  const changeCourse = (value: string) => {
    const id = Number(value);
    setCourseId(id);
    saveCourse(id);
    setError(null);
  };

  const load = async () => {
    if (courseId == null) return;
    const id = courseId;
    setLoading(true);
    setError(null);
    try {
      const res = await studentAiService.getRecommendations(id);
      setResults(r => ({ ...r, [id]: res }));
    } catch (err) {
      setError(getAiError(err, 'Failed to get recommendations.'));
    } finally {
      setLoading(false);
    }
  };

  const open = (rec: Recommendation) => {
    if (!course) return;
    if (rec.type === 'FLASHCARD_DECK' && rec.refId != null) {
      navigate(studentDeckPath(rec.refId), {
        state: { deckTitle: rec.title, courseId: course.courseId, courseTitle: course.title } satisfies DeckStudyState,
      });
    } else if (rec.type === 'EXAM' && rec.refId != null) {
      navigate(studentExamPath(rec.refId));
    } else {
      onSmartPractice(course.courseId);
    }
  };

  if (courses.length === 0) return null;

  return (
    <section className="card p-[clamp(1rem,2vw,1.5rem)] space-y-4" aria-labelledby="ai-recommendations-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0 text-primary">
            <AiSparkle className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 id="ai-recommendations-title" className="text-base font-semibold text-content flex items-center gap-2">
              Recommended for you <SourceBadge source={data?.source} />
            </h2>
            <p className="text-xs text-content-subtle">AI looks at your results in a course and suggests what to study next.</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            className="w-full sm:w-64"
            aria-label="Course for recommendations"
            options={courses.map(c => ({ value: String(c.courseId), label: c.title }))}
            value={courseId != null ? String(courseId) : undefined}
            onChange={changeCourse}
            disabled={loading}
          />
          <Button loading={loading} disabled={loading || courseId == null} icon={<AiSparkle />} onClick={load}>
            {data ? 'Refresh' : 'Get recommendations'}
          </Button>
        </div>
      </div>

      {error && <AiErrorAlert error={error} />}

      {!data && !error && !loading && (
        <p className="text-sm text-content-soft">
          Press <span className="font-medium text-content">Get recommendations</span> to analyse your results in this course. A fresh
          analysis uses AI tokens; asking again within the hour is free.
        </p>
      )}

      {data && <RecommendationsBody data={data} onOpen={open} />}
    </section>
  );
}

function RecommendationsBody({ data, onOpen }: { data: Recommendations; onOpen: (rec: Recommendation) => void }) {
  const readiness = Math.round(data.overallReadiness);
  const noData = data.recommendations.length === 0 && data.strengths.length === 0 && data.weaknesses.length === 0;

  if (noData) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-content-soft">{data.message || 'Finish a few more exams in this course to get recommendations.'}</p>
        <QuotaLine quota={data.quota} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4 min-w-0">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Exam readiness</span>
              <span className={`text-lg font-bold ${accuracyTone(readiness).text}`}>{readiness}%</span>
            </div>
            <AccuracyBar accuracy={readiness} label="Exam readiness" />
          </div>
          <TopicChips title="Needs work" items={data.weaknesses} />
          <TopicChips title="Strengths" items={data.strengths} />
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-content-subtle">What to study next</h3>
          {data.recommendations.length === 0 ? (
            <p className="text-sm text-content-soft">{data.message || 'No suggestions right now.'}</p>
          ) : (
            <ul className="space-y-2">
              {data.recommendations.map((rec, i) => (
                <li key={`${rec.type}-${rec.refId ?? i}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(rec)}
                    className="w-full flex items-start gap-3 rounded-[10px] border border-line px-3 py-2.5 text-left hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="mt-0.5 w-7 h-7 rounded-[8px] bg-surface-muted flex items-center justify-center flex-shrink-0 text-content-secondary">
                      {TYPE_META[rec.type]?.icon ?? <AiSparkle />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-content break-words">{rec.title}</span>
                        <PriorityBadge priority={rec.priority} />
                        <span className="text-2xs text-content-subtle">{TYPE_META[rec.type]?.label ?? rec.type}</span>
                      </span>
                      <span className="block text-xs text-content-soft mt-0.5 break-words">{rec.reason}</span>
                    </span>
                    <Icon.ChevronRight className="w-4 h-4 mt-1.5 flex-shrink-0 text-content-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <QuotaLine quota={data.quota} />
    </div>
  );
}

function TopicChips({ title, items }: { title: string; items: { categoryId: number; name: string; accuracy: number; trend: Recommendations['strengths'][number]['trend'] }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-content-subtle">{title}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {items.map(t => (
          <li key={t.categoryId} className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs">
            <span className="text-content-secondary">{t.name}</span>
            <span className={`font-semibold ${accuracyTone(t.accuracy).text}`}>{t.accuracy}%</span>
            <TrendIcon trend={t.trend} />
          </li>
        ))}
      </ul>
    </div>
  );
}
