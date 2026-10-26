import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import {
  ROUTES,
  studentCoursePath,
  studentResumeAttemptPath,
  studentTakeExamPath,
} from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  RUBRIC_TYPES,
  studentAttemptService,
  type ExamQuestionPreview,
  type StudentExamDetail,
} from '@/services/studentAttempt.service';
import { ListSkeleton, LoadError, formatDate, formatScore } from '../components/studentUi';
import { QUESTION_TYPE_LABEL, QuestionText, optionLetter } from '../components/QuestionAnswerInput';

/**
 * Student exam detail — read-only, two columns:
 *  - left: the exam's questions and their options, never the answers
 *    (proposed EX-03 — MOCK data until the BE adds it);
 *  - right, sticky 10px from the top: info, my stats and actions (EX-01)
 *    and the Start / Continue button.
 * Starting goes to the full-screen take screen; an attempt left with
 * "Cancel" is resumed from here. Past attempts are reviewed from My Exams.
 */
export function StudentExamDetailPage() {
  const { examId = '' } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<StudentExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentAttemptService
      .getExamDetail(examId)
      .then(res => {
        if (!cancelled) setExam(res);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the exam.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, reload]);

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) },
        ...(exam ? [{ label: exam.courseTitle, onClick: () => navigate(studentCoursePath(exam.courseId)) }] : []),
        { label: exam?.title ?? 'Exam' },
      ]}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <div className="card p-5 space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-12 w-full" />
        </div>
        <ListSkeleton rows={3} />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <LoadError message={error ?? 'Exam not found.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  const activeAttemptId = exam.actions?.activeAttemptId ?? null;
  const canStart = Boolean(exam.actions?.canStart);
  const stats = exam.myStats;

  return (
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      {breadcrumb}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-[clamp(1rem,2vw,1.5rem)] items-start">
        {/* Right column: info + start. Sticky 10px from the top of the scroll area. */}
        <aside className="lg:order-2 lg:sticky lg:top-[10px] lg:max-h-[calc(100dvh-20px)] lg:overflow-y-auto space-y-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-[12px] bg-primary-light flex items-center justify-center flex-shrink-0">
                <Icon.ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-content break-words leading-snug">{exam.title}</h1>
                <p className="text-sm text-content-subtle mt-0.5 break-words">{exam.courseTitle}</p>
              </div>
            </div>

            {exam.description && <p className="text-sm text-content-soft whitespace-pre-line">{exam.description}</p>}

            <dl className="grid grid-cols-2 gap-2">
              {[
                { label: 'Questions', value: String(exam.questionCount) },
                { label: 'Duration', value: exam.durationMinutes != null ? `${exam.durationMinutes} min` : 'No limit' },
                { label: 'Max score', value: exam.maxScore != null ? String(Number(exam.maxScore)) : '—' },
                { label: 'My attempts', value: String(stats?.attemptCount ?? 0) },
                { label: 'Best score', value: formatScore(stats?.bestScore, exam.maxScore) },
                { label: 'Last submitted', value: formatDate(stats?.lastSubmittedAt) },
              ].map(s => (
                <div key={s.label} className="flex flex-col-reverse rounded-[10px] border border-line px-3 py-2">
                  <dt className="text-xs text-content-subtle">{s.label}</dt>
                  <dd className="text-sm font-semibold text-content">{s.value}</dd>
                </div>
              ))}
            </dl>

            {activeAttemptId ? (
              <Alert
                type="info"
                title="You have an attempt in progress"
                message="Your answers were saved. The timer keeps running while you are away — the attempt is submitted automatically when time is up."
              />
            ) : (
              !canStart &&
              exam.actions?.reason && <Alert type="warning" title="You can't start this exam" message={exam.actions.reason} />
            )}

            {activeAttemptId ? (
              <Button
                className="w-full"
                icon={<Icon.Clock className="w-4 h-4" />}
                onClick={() => navigate(studentResumeAttemptPath(activeAttemptId))}
              >
                Continue attempt
              </Button>
            ) : (
              <Button
                className="w-full"
                icon={<Icon.Zap className="w-4 h-4" />}
                disabled={!canStart}
                onClick={() => navigate(studentTakeExamPath(exam.examId))}
              >
                {stats && stats.attemptCount > 0 ? 'Start new attempt' : 'Start exam'}
              </Button>
            )}
          </div>

        </aside>

        {/* Left column: the questions, read-only — no answer, no key. */}
        <section className="lg:order-1 min-w-0">
          <QuestionPreviewList examId={exam.examId} questionCount={exam.questionCount} />
        </section>
      </div>
    </div>
  );
}

function QuestionPreviewList({ examId, questionCount }: { examId: number; questionCount: number }) {
  const [questions, setQuestions] = useState<ExamQuestionPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentAttemptService
      .getExamQuestions(examId, questionCount)
      .then(res => {
        if (!cancelled) setQuestions([...res].sort((a, b) => a.orderIndex - b.orderIndex));
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the questions.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, questionCount, reload]);

  return (
    <div className="space-y-3" aria-label="Questions">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-content">Questions</h2>
        {!loading && !error && <span className="text-sm text-content-subtle">{questions.length} questions</span>}
      </div>
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : questions.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon.HelpCircle className="w-7 h-7" />} title="No questions" message="This exam has no question yet." />
        </div>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.questionId}>
              <QuestionPreviewCard question={q} index={i} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function QuestionPreviewCard({ question: q, index }: { question: ExamQuestionPreview; index: number }) {
  const multi = q.questionType === 'MULTIPLE_CHOICE';
  return (
    <article className="card p-[clamp(0.875rem,2vw,1.25rem)] space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-surface-muted text-xs font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <Badge variant="info" size="sm">
          {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
        </Badge>
        {q.maxPoints != null && <span className="ml-auto text-xs text-content-subtle">{Number(q.maxPoints)} pts</span>}
      </div>

      <QuestionText content={q.content} className="text-base text-content leading-relaxed" />

      {q.options && q.options.length > 0 && (
        <ul className="space-y-1.5">
          {q.options.map((opt, i) => (
            <li key={opt.optionId} className="flex items-start gap-2.5 rounded-[8px] border border-line px-3 py-2">
              <span
                className={`w-6 h-6 flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-surface-muted text-content-secondary ${
                  multi ? 'rounded-[5px]' : 'rounded-full'
                }`}
              >
                {q.questionType === 'ORDERING' ? '•' : optionLetter(i)}
              </span>
              <span className="text-sm text-content-secondary break-words">{opt.optionText}</span>
            </li>
          ))}
        </ul>
      )}

      {q.matching && (
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { title: 'Items', values: q.matching.lefts },
            { title: 'Match with', values: q.matching.rights },
          ].map(col => (
            <div key={col.title}>
              <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1.5">{col.title}</p>
              <ul className="space-y-1.5">
                {col.values.map(v => (
                  <li key={v} className="rounded-[8px] border border-line px-3 py-2 text-sm text-content-secondary break-words">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {RUBRIC_TYPES.has(q.questionType) && (
        <p className="text-xs text-content-subtle">Written answer — graded against a rubric after you submit.</p>
      )}
    </article>
  );
}
