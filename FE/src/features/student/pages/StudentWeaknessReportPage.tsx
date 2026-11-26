import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentDeckPath, studentExamPath, studentModulePath } from '@/app/routes';
import { useAuth } from '@/auth/authContext';
import { studentCourseService, type StudentCourseDetail } from '@/services/studentCourse.service';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import { getApiErrorMessage } from '@/utils/apiError';
import { courseCacheKey } from '../components/courseProgress';
import {
  WEAKNESS_PERIOD_LABEL,
  getAiError,
  studentAiService,
  type AiError,
  type CategoryBreakdown,
  type CommonMistake,
  type DifficultyBreakdown,
  type Insights,
  type Mastery,
  type ModuleInsight,
  type WeaknessPeriod,
  type WeaknessReport,
} from '@/services/studentAi.service';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDateTime } from '../components/studentUi';
import { AccuracyBar, AiErrorAlert, AiSparkle, QuotaLine, SourceBadge, TrendIcon, accuracyTone } from '../components/aiUi';
import { SmartPracticeModal } from '../components/SmartPracticeModal';

const PERIODS: WeaknessPeriod[] = ['LAST_7_DAYS', 'LAST_30_DAYS', 'ALL_TIME'];
const DEFAULT_PERIOD: WeaknessPeriod = 'LAST_30_DAYS';
const FOCUS_COUNT = 3;

const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  FILL_BLANK: 'Fill in the blank',
  MATCHING: 'Matching',
  ORDERING: 'Ordering',
  ESSAY: 'Essay',
  DIAGRAM: 'Diagram',
  DIAGRAM_ESSAY: 'Diagram + Essay',
};

const DIFFICULTY_LABEL: Record<string, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

export const MASTERY_META: Record<Mastery, { label: string; variant: BadgeVariant }> = {
  NOT_STARTED: { label: 'Not started', variant: 'default' },
  WEAK: { label: 'Weak', variant: 'danger' },
  LEARNING: { label: 'Learning', variant: 'warning' },
  STRONG: { label: 'Strong', variant: 'info' },
  MASTERED: { label: 'Mastered', variant: 'success' },
};

/** The still-wrong questions of one course in the Question Notebook. */
function notebookPath(courseId: string) {
  return `${ROUTES.studentQuestionNotebook}?courseId=${encodeURIComponent(courseId)}&filter=wrong`;
}

/** Why a module needs work, from its numbers. */
function moduleReason(m: ModuleInsight) {
  if (m.answered === 0) return `Not practised yet — ${m.bankSize} question${m.bankSize === 1 ? '' : 's'} waiting.`;
  const parts = [`${m.accuracy}% correct on ${m.answered} question${m.answered === 1 ? '' : 's'}`];
  if (m.stillWrong > 0) parts.push(`${m.stillWrong} mistake${m.stillWrong === 1 ? '' : 's'} to fix`);
  if (m.bankSize > m.answered) parts.push(`${m.bankSize - m.answered} unseen`);
  return parts.join(' · ');
}

/**
 * The last AI report per (student, course, period) is kept in the browser so revisiting the page shows it
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
 * Weakness Analysis of one course, in two parts:
 *  - Your standing (GET /student/ai/insights, no AI, free): readiness, what to focus on next with direct actions,
 *    the mastery of every module, accuracy by difficulty and question type. Shown at once.
 *  - AI deep analysis (AI-04): mistake patterns and an action plan for a period, only when the student asks
 *    (an uncached report spends AI quota; the BE caches it 6 h per period; the last one is kept in the browser).
 */
export function StudentWeaknessReportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.userId;
  const { courseId = '' } = useParams<{ courseId: string }>();
  // CL-02 for the title, shared with the course page's cache, so it is usually there at once.
  const courseTitle =
    useCachedQuery<StudentCourseDetail>(courseId ? courseCacheKey.course(courseId) : null, () =>
      studentCourseService.getCourseDetail(courseId),
    ).data?.title ?? null;
  const insights = useCachedQuery<Insights>(courseId ? `student:insights:${courseId}` : null, () =>
    studentAiService.getInsights(Number(courseId)),
  );
  const [practiceOpen, setPracticeOpen] = useState(false);
  /** Set by a "Focus next" card: practise that module only. Kept in state so the modal gets a stable object. */
  const [practiceModule, setPracticeModule] = useState<{ id: number | null; name: string } | null>(null);
  const openPractice = (module: { id: number | null; name: string } | null) => {
    setPracticeModule(module);
    setPracticeOpen(true);
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
        subtitle={courseTitle ? `Where you stand in ${courseTitle} and what to practise next.` : 'Where you stand and what to practise next.'}
        action={
          <Button icon={<Icon.Target className="w-4 h-4" />} onClick={() => openPractice(null)}>
            Personalized practice
          </Button>
        }
      />

      {insights.loading ? (
        <div className="card flex items-center gap-3 p-5 text-sm text-content-soft" role="status">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
          Reading your results…
        </div>
      ) : insights.error || !insights.data ? (
        <LoadError message={getApiErrorMessage(insights.error, 'Failed to load your results.')} onRetry={insights.reload} />
      ) : (
        <Standing insights={insights.data} courseId={courseId} onPractice={openPractice} />
      )}

      <AiAnalysis userId={userId} courseId={courseId} />

      <SmartPracticeModal
        open={practiceOpen}
        onClose={() => setPracticeOpen(false)}
        courses={[{ courseId: Number(courseId), title: courseTitle ?? 'This course' }]}
        initialCourseId={Number(courseId)}
        lockCourse
        focusModule={practiceModule}
      />
    </div>
  );
}

// ------------------------------------------------------------- standing (no AI)

function Standing({
  insights: s,
  courseId,
  onPractice,
}: {
  insights: Insights;
  courseId: string;
  onPractice: (module: { id: number | null; name: string }) => void;
}) {
  const focus = s.modules.filter(m => m.mastery !== 'MASTERED').slice(0, FOCUS_COUNT);
  return (
    <div className="space-y-[clamp(1rem,2vw,1.25rem)]">
      <div className="grid grid-cols-2 gap-[clamp(0.75rem,1.5vw,1rem)] lg:grid-cols-4">
        <StatTile label="Readiness" value={`${s.readiness}%`} hint="Half coverage, half accuracy" tone={accuracyTone(s.readiness).text} />
        <StatTile label="Accuracy" value={`${s.accuracy}%`} hint={`Latest answer of ${s.answered} questions`} tone={accuracyTone(s.accuracy).text} />
        <StatTile label="Coverage" value={`${s.coverage}%`} hint={`${s.answered} of ${s.bankSize} bank questions seen`} />
        <StatTile
          label="Mistakes to fix"
          value={String(s.stillWrong)}
          hint={s.staleWrong > 0 ? `${s.staleWrong} not reviewed for 7 days` : 'Two right in a row fixes one'}
          tone={s.stillWrong > 0 ? 'text-danger' : 'text-success'}
          action={
            s.stillWrong > 0 ? (
              <Link to={notebookPath(courseId)} className="text-xs font-medium text-primary hover:underline">
                Review them
              </Link>
            ) : undefined
          }
        />
      </div>

      {s.answered === 0 && (
        <p className="card p-4 text-sm text-content-soft">
          You have not answered any question of this course yet. Take an exam or a practice exam — this page fills in as you go.
        </p>
      )}

      {focus.length > 0 && (
        <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-content">Focus next</h2>
            <span className="text-2xs text-content-subtle">Ranked by accuracy, open mistakes and unseen questions</span>
          </div>
          <ol className="grid gap-3 md:grid-cols-3">
            {focus.map((m, i) => (
              <li key={m.categoryId ?? 'general'} className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-content break-words">{m.name}</p>
                    <Badge size="sm" variant={MASTERY_META[m.mastery].variant}>
                      {MASTERY_META[m.mastery].label}
                    </Badge>
                  </div>
                </div>
                <p className="text-xs text-content-soft">{moduleReason(m)}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Icon.Target className="w-3.5 h-3.5" />}
                    onClick={() => onPractice({ id: m.categoryId, name: m.name })}
                  >
                    Practice this module
                  </Button>
                  <Link
                    to={studentModulePath(courseId, m.categoryId ?? 'general')}
                    className="inline-flex items-center gap-1 px-2 text-xs font-medium text-primary hover:underline"
                  >
                    Open module <Icon.ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-[clamp(1rem,2vw,1.25rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MasteryMap modules={s.modules} courseId={courseId} />
        <div className="space-y-[clamp(1rem,2vw,1.25rem)] min-w-0">
          <Difficulties items={s.difficultyBreakdown} />
          <QuestionTypes items={s.questionTypeBreakdown} />
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, tone = 'text-content', action }: { label: string; value: string; hint: string; tone?: string; action?: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-1 min-w-0">
      <p className="text-xs font-medium text-content-subtle">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-2xs text-content-subtle">{hint}</p>
      {action}
    </div>
  );
}

function MasteryMap({ modules, courseId }: { modules: ModuleInsight[]; courseId: string }) {
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3 min-w-0">
      <h2 className="text-base font-semibold text-content">Mastery by module</h2>
      {modules.length === 0 ? (
        <p className="text-sm text-content-soft">This course has no practice questions yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {modules.map(m => (
            <li key={m.categoryId ?? 'general'} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={studentModulePath(courseId, m.categoryId ?? 'general')} className="min-w-0 flex-1 text-sm font-medium text-content hover:text-primary break-words">
                  {m.name}
                </Link>
                <Badge size="sm" variant={MASTERY_META[m.mastery].variant}>
                  {MASTERY_META[m.mastery].label}
                </Badge>
                {m.answered > 0 && (
                  <span className={`text-sm font-bold ${accuracyTone(m.accuracy).text}`}>{m.accuracy}%</span>
                )}
                <TrendIcon trend={m.trend} />
              </div>
              <AccuracyBar accuracy={m.answered > 0 ? m.accuracy : 0} label={`${m.name} accuracy`} />
              <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-content-subtle">
                <span>
                  Seen {m.answered}/{m.bankSize} ({m.coverage}%)
                </span>
                {m.stillWrong > 0 && <span className="text-danger">{m.stillWrong} to fix</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Difficulties({ items }: { items: DifficultyBreakdown[] }) {
  if (items.length === 0) return null;
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
      <h2 className="text-base font-semibold text-content">By difficulty</h2>
      <ul className="space-y-3">
        {items.map(d => (
          <li key={d.difficulty} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-content-secondary">
                {DIFFICULTY_LABEL[d.difficulty] ?? d.difficulty} <span className="text-2xs text-content-subtle">· {d.questionCount}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`font-semibold ${accuracyTone(d.accuracy).text}`}>{d.accuracy}%</span>
                <TrendIcon trend={d.trend} />
              </span>
            </div>
            <AccuracyBar accuracy={d.accuracy} label={`${d.difficulty} accuracy`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestionTypes({ items }: { items: Insights['questionTypeBreakdown'] }) {
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

// ------------------------------------------------------------- AI deep analysis (AI-04)

function AiAnalysis({ userId, courseId }: { userId: number | undefined; courseId: string }) {
  const [period, setPeriod] = useState<WeaknessPeriod>(DEFAULT_PERIOD);
  const [reports, setReports] = useState<Partial<Record<WeaknessPeriod, WeaknessReport>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);

  useEffect(() => {
    setReports(readSavedReports(userId, courseId));
    setError(null);
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

  return (
    <section className="space-y-[clamp(1rem,2vw,1.25rem)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-content">
            <AiSparkle /> AI deep analysis
          </h2>
          <p className="text-xs text-content-subtle">The AI reads your wrong answers to find the misconceptions behind them.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            className="w-full sm:w-44"
            aria-label="Period"
            options={PERIODS.map(p => ({ value: p, label: WEAKNESS_PERIOD_LABEL[p] }))}
            value={period}
            onChange={v => {
              setPeriod(v as WeaknessPeriod);
              setError(null);
            }}
            disabled={loading}
          />
          <Button variant="outline" loading={loading} disabled={loading} icon={<AiSparkle />} onClick={generate}>
            {report ? 'Refresh analysis' : 'Analyse my mistakes'}
          </Button>
        </div>
      </div>

      {error && <AiErrorAlert error={error} />}

      {loading && !report && (
        <div className="card flex items-center gap-3 p-5 text-sm text-content-soft" role="status">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
          The AI is analysing your mistakes. This can take up to 15 seconds…
        </div>
      )}

      {!report && !loading && !error && (
        <div className="card p-5 text-sm text-content-soft">
          Pick a period and press <span className="font-medium text-content">Analyse my mistakes</span>. It uses AI tokens; the same period
          is free again for 6 hours. You need at least 5 finished exams and 20 wrong answers in the period.
        </div>
      )}

      {report && <ReportBody report={report} courseId={courseId} />}
    </section>
  );
}

function ReportBody({ report, courseId }: { report: WeaknessReport; courseId: string }) {
  const withMistakes = report.categoryBreakdown.filter(c => c.commonMistakes.length > 0);
  const notPracticed = report.notPracticedCategories ?? [];
  return (
    <div className="space-y-[clamp(1rem,2vw,1.25rem)]">
      <section className="card p-[clamp(1rem,2vw,1.5rem)] space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-content">Summary</h3>
          <SourceBadge source={report.source} />
          <span className="text-2xs text-content-subtle">
            {WEAKNESS_PERIOD_LABEL[report.period] ?? report.period}
            {report.generatedAt ? ` · generated ${formatDateTime(report.generatedAt)}` : ''}
          </span>
        </div>
        <p className="text-sm text-content-secondary whitespace-pre-line">{report.summary}</p>
        <QuotaLine quota={report.quota} />
      </section>

      <div className="grid gap-[clamp(1rem,2vw,1.25rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-3 min-w-0">
          <h3 className="text-base font-semibold text-content">Mistake patterns</h3>
          {withMistakes.length === 0 ? (
            <p className="card p-5 text-sm text-content-soft">The AI found no recurring pattern in this period.</p>
          ) : (
            withMistakes.map(c => <CategoryCard key={c.categoryId} category={c} courseId={courseId} />)
          )}
        </section>

        <div className="space-y-[clamp(1rem,2vw,1.25rem)] min-w-0">
          <ActionPlan report={report} />
          {notPracticed.length > 0 && (
            <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-2">
              <h3 className="text-base font-semibold text-content">Not practised in this period</h3>
              <ul className="flex flex-wrap gap-1.5">
                {notPracticed.map(t => (
                  <li key={t.categoryId}>
                    <Link to={studentModulePath(courseId, t.categoryId)} className="inline-block rounded-full border border-line px-2.5 py-1 text-xs text-content-secondary hover:border-primary hover:text-primary">
                      {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ category: c, courseId }: { category: CategoryBreakdown; courseId: string }) {
  return (
    <article className="card p-[clamp(1rem,2vw,1.25rem)] space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-content break-words">{c.name}</h4>
        <span className="flex items-center gap-2 text-xs text-content-subtle">
          {c.correctCount}/{c.totalQuestions} correct
          <span className={`text-sm font-bold ${accuracyTone(c.accuracy).text}`}>{c.accuracy}%</span>
          <TrendIcon trend={c.trend} withLabel />
        </span>
      </div>
      <AccuracyBar accuracy={c.accuracy} label={`${c.name} accuracy`} />
      <ul className="space-y-2">
        {c.commonMistakes.map((m, i) => (
          <li key={i} className="rounded-[10px] bg-surface-muted px-3 py-2 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm text-content">
              <Icon.AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" />
              <span className="font-medium break-words">{m.pattern}</span>
              <span className="text-2xs text-content-subtle">
                in {m.frequency} question{m.frequency === 1 ? '' : 's'}
              </span>
            </p>
            <p className="flex items-start gap-2 text-xs text-content-soft">
              <Icon.Lightbulb className="w-3.5 h-3.5 mt-px flex-shrink-0 text-primary" />
              <span className="break-words">{m.suggestion}</span>
            </p>
            <MistakeRef mistake={m} courseId={courseId} />
          </li>
        ))}
      </ul>
    </article>
  );
}

/** The deck, exam or module the AI points to (the BE checked it exists in the course). */
function MistakeRef({ mistake: m, courseId }: { mistake: CommonMistake; courseId: string }) {
  if (m.refId == null || !m.refType || !m.refTitle) return null;
  const meta = {
    DECK: { to: studentDeckPath(m.refId), label: 'Study deck', icon: <Icon.Layers className="w-3.5 h-3.5" /> },
    EXAM: { to: studentExamPath(m.refId), label: 'Take exam', icon: <Icon.ClipboardList className="w-3.5 h-3.5" /> },
    MODULE: { to: studentModulePath(courseId, m.refId), label: 'Open module', icon: <Icon.BookOpen className="w-3.5 h-3.5" /> },
  }[m.refType];
  if (!meta) return null;
  return (
    <Link to={meta.to} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
      {meta.icon} {meta.label}: <span className="break-words">{m.refTitle}</span>
    </Link>
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
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-content">Action plan</h3>
        <span className="text-2xs text-content-subtle">
          {checked.length}/{report.actionPlan.length} done
        </span>
      </div>
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
