import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath } from '@/app/routes';
import { useAuth } from '@/auth/authContext';
import { studentCourseService } from '@/services/studentCourse.service';
import {
  WEAKNESS_PERIOD_LABEL,
  getAiError,
  studentAiService,
  type AiError,
  type CategoryBreakdown,
  type WeaknessPeriod,
  type WeaknessReport,
} from '@/services/studentAi.service';
import { PageTitle, STUDENT_PAGE_CLASS, formatDateTime } from '../components/studentUi';
import { AccuracyBar, AiErrorAlert, AiSparkle, QuotaLine, SourceBadge, TrendIcon, accuracyTone } from '../components/aiUi';

const PERIODS: WeaknessPeriod[] = ['LAST_7_DAYS', 'LAST_30_DAYS', 'ALL_TIME'];
const DEFAULT_PERIOD: WeaknessPeriod = 'LAST_30_DAYS';

const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  FILL_BLANK: 'Fill in the blank',
  MATCHING: 'Matching',
  ORDERING: 'Ordering',
  ESSAY: 'Essay',
  DIAGRAM: 'Diagram',
};

/**
 * The last report per (student, course, period) is kept in the browser so revisiting the page shows it
 * without calling AI-04 again — the BE has no read-only "cached report" endpoint, and an uncached call spends quota.
 */
function reportKey(userId: number | undefined, courseId: string, period: WeaknessPeriod) {
  return `student.weaknessReport.${userId ?? 'anon'}.${courseId}.${period}`;
}

function readSavedReports(userId: number | undefined, courseId: string): Partial<Record<WeaknessPeriod, WeaknessReport>> {
  const saved: Partial<Record<WeaknessPeriod, WeaknessReport>> = {};
  for (const p of PERIODS) {
    try {
      const raw = localStorage.getItem(reportKey(userId, courseId, p));
      const report = raw ? (JSON.parse(raw) as WeaknessReport) : null;
      if (report && Array.isArray(report.categoryBreakdown) && Array.isArray(report.actionPlan)) saved[p] = report;
    } catch {
      // Unreadable or blocked storage — that period just starts empty.
    }
  }
  return saved;
}

function saveReport(userId: number | undefined, courseId: string, report: WeaknessReport, period: WeaknessPeriod) {
  try {
    localStorage.setItem(reportKey(userId, courseId, period), JSON.stringify(report));
  } catch {
    // Storage full or blocked — the report still shows until the page closes.
  }
}

/** Ticks on the action plan are a per-browser convenience; the BE does not store them. */
function checklistKey(r: WeaknessReport) {
  return `student.weaknessPlan.${r.courseId}.${r.period}.${r.generatedAt ?? ''}`;
}

function readChecked(key: string): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter(n => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/**
 * Weakness Analysis (AI-04) — one course, one period. A report is generated only when the student
 * presses the button (an uncached report spends AI quota; the BE caches it 6 h per period); the last
 * one per period is remembered in the browser and shown straight away on the next visit.
 */
export function StudentWeaknessReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.userId;
  const { courseId = '' } = useParams<{ courseId: string }>();
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [period, setPeriod] = useState<WeaknessPeriod>(DEFAULT_PERIOD);
  const [reports, setReports] = useState<Partial<Record<WeaknessPeriod, WeaknessReport>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCourseTitle(null);
    setReports(readSavedReports(userId, courseId));
    setError(null);
    studentCourseService
      .getCourseDetail(courseId)
      .then(c => {
        if (!cancelled) setCourseTitle(c.title);
      })
      .catch(() => {
        // The title is only cosmetic — the report call reports enrollment problems itself.
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, userId]);

  const report = reports[period];

  const generate = async () => {
    const id = Number(courseId);
    if (!Number.isInteger(id) || id <= 0) return;
    const p = period;
    setLoading(true);
    setError(null);
    try {
      const res = await studentAiService.getWeaknessReport(id, p);
      setReports(r => ({ ...r, [p]: res }));
      saveReport(userId, courseId, res, p);
    } catch (err) {
      const e = getAiError(err, 'Failed to build the weakness report.');
      setError(
        e.kind === 'OTHER' && (e.status === 500 || e.status === null)
          ? { ...e, message: `${e.message} The AI may have timed out — please try again.` }
          : e,
      );
    } finally {
      setLoading(false);
    }
  };

  const changePeriod = (v: string) => {
    setPeriod(v as WeaknessPeriod);
    setError(null);
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <Breadcrumb
        items={[
          { label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) },
          { label: courseTitle ?? 'Course', onClick: () => navigate(studentCoursePath(courseId)) },
          { label: 'Weakness Analysis' },
        ]}
      />

      <PageTitle
        title="Weakness Analysis"
        subtitle={courseTitle ? `AI breakdown of your mistakes in ${courseTitle}.` : 'AI breakdown of your mistakes in this course.'}
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Select
              className="w-full sm:w-44"
              aria-label="Period"
              options={PERIODS.map(p => ({ value: p, label: WEAKNESS_PERIOD_LABEL[p] }))}
              value={period}
              onChange={changePeriod}
              disabled={loading}
            />
            <Button loading={loading} disabled={loading} icon={<AiSparkle />} onClick={generate}>
              {report ? 'Refresh report' : 'Generate report'}
            </Button>
          </div>
        }
      />

      {error && <AiErrorAlert error={error} />}

      {loading && !report && (
        <div className="card flex items-center gap-3 p-5 text-sm text-content-soft" role="status">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
          The AI is analysing your mistakes. This can take up to 15 seconds…
        </div>
      )}

      {!report && !loading && !error && (
        <div className="card p-5 text-sm text-content-soft">
          Pick a period and press <span className="font-medium text-content">Generate report</span>. A new report uses AI tokens; the same
          period is free again for 6 hours. You need at least 5 finished exams and 20 wrong answers.
        </div>
      )}

      {report && <ReportBody report={report} />}
    </div>
  );
}

function ReportBody({ report }: { report: WeaknessReport }) {
  return (
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      <section className="card p-[clamp(1rem,2vw,1.5rem)] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-content">Summary</h2>
          <SourceBadge source={report.source} />
          <span className="text-2xs text-content-subtle">
            {WEAKNESS_PERIOD_LABEL[report.period] ?? report.period}
            {report.generatedAt ? ` · generated ${formatDateTime(report.generatedAt)}` : ''}
          </span>
        </div>
        <p className="text-sm text-content-secondary whitespace-pre-line">{report.summary}</p>
        <QuotaLine quota={report.quota} />
        <p className="text-2xs text-content-subtle">
          Saved on this device. Refreshing within 6 hours of generation returns this same report from the cache (no tokens used).
        </p>
      </section>

      <div className="grid gap-[clamp(1rem,2vw,1.25rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-3 min-w-0">
          <h2 className="text-base font-semibold text-content">By module</h2>
          {report.categoryBreakdown.length === 0 ? (
            <p className="card p-5 text-sm text-content-soft">No module data for this period.</p>
          ) : (
            report.categoryBreakdown.map(c => <CategoryCard key={c.categoryId} category={c} />)
          )}
        </section>

        <div className="space-y-[clamp(1rem,2vw,1.25rem)] min-w-0">
          <ActionPlan report={report} />
          <QuestionTypes items={report.questionTypeBreakdown} />
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category: c }: { category: CategoryBreakdown }) {
  return (
    <article className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-content break-words">{c.name}</h3>
        <span className="flex items-center gap-2 text-xs text-content-subtle">
          {c.correctCount}/{c.totalQuestions} correct
          <span className={`text-sm font-bold ${accuracyTone(c.accuracy).text}`}>{c.accuracy}%</span>
          <TrendIcon trend={c.trend} withLabel />
        </span>
      </div>
      <AccuracyBar accuracy={c.accuracy} label={`${c.name} accuracy`} />
      {c.commonMistakes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Common mistakes</h4>
          <ul className="space-y-2">
            {c.commonMistakes.map((m, i) => (
              <li key={i} className="rounded-[10px] bg-surface-muted px-3 py-2 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-content">
                  <Icon.AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                  <span className="font-medium break-words">{m.pattern}</span>
                  <span className="text-2xs text-content-subtle">× {m.frequency}</span>
                </p>
                <p className="flex items-start gap-2 text-xs text-content-soft">
                  <Icon.Lightbulb className="w-3.5 h-3.5 mt-px flex-shrink-0 text-primary" />
                  <span className="break-words">{m.suggestion}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function ActionPlan({ report }: { report: WeaknessReport }) {
  const key = checklistKey(report);
  const [checked, setChecked] = useState<number[]>(() => readChecked(key));

  useEffect(() => setChecked(readChecked(key)), [key]);

  const toggle = (i: number) => {
    setChecked(prev => {
      const next = prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage blocked — ticks last until the page closes.
      }
      return next;
    });
  };

  if (report.actionPlan.length === 0) return null;
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
      <h2 className="text-base font-semibold text-content">Action plan</h2>
      <ul className="space-y-2">
        {report.actionPlan.map((step, i) => {
          const done = checked.includes(i);
          return (
            <li key={i}>
              <label className="flex items-start gap-2.5 cursor-pointer text-sm">
                <input type="checkbox" className="mt-0.5 accent-[var(--color-primary)]" checked={done} onChange={() => toggle(i)} />
                <span className={done ? 'text-content-subtle line-through' : 'text-content-secondary'}>
                  {step.replace(/^\s*\d+[.)]\s*/, '')}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuestionTypes({ items }: { items: WeaknessReport['questionTypeBreakdown'] }) {
  if (items.length === 0) return null;
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
      <h2 className="text-base font-semibold text-content">By question type</h2>
      <ul className="space-y-3">
        {items.map(t => (
          <li key={t.questionType} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-content-secondary">{QUESTION_TYPE_LABEL[t.questionType] ?? t.questionType}</span>
              <span className="flex items-center gap-2">
                <span className={`font-semibold ${accuracyTone(t.accuracy).text}`}>{t.accuracy}%</span>
                <TrendIcon trend={t.trend} />
              </span>
            </div>
            <AccuracyBar accuracy={t.accuracy} label={`${t.questionType} accuracy`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
