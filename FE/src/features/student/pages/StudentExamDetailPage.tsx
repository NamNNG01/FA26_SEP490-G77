import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { studentExamAttemptsPath } from "@/app/routes";
import { Icon } from "@/assets/icons";
import { Container } from "@/features/landing/components/Container";
import {
  studentLearningService,
  type StudentActiveAttempt,
  type StudentExamDetail,
} from "@/services/studentLearning.service";

export function StudentExamDetailPage() {
  const { examId: examParam } = useParams<{ examId: string }>();
  const examId = Number(examParam);
  const navigate = useNavigate();
  const [exam, setExam] = useState<StudentExamDetail | null>(null);
  const [activeAttempt, setActiveAttempt] =
    useState<StudentActiveAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(examId) || examId <= 0) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      studentLearningService.getExam(examId),
      studentLearningService.getActiveAttempt(examId),
    ])
      .then(([examData, attemptData]) => {
        if (active) {
          setExam(examData);
          setActiveAttempt(attemptData);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "We couldn’t load this exam.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [examId, refresh]);

  if (!Number.isFinite(examId) || examId <= 0)
    return (
      <ExamState
        title="Exam not found"
        message="This exam link doesn’t look right."
        onBack={() => navigate("/student/courses")}
      />
    );
  if (loading)
    return (
      <Container className="py-12">
        <div className="mx-auto max-w-4xl animate-pulse space-y-5">
          <div className="skeleton h-52 rounded-3xl" />
          <div className="skeleton h-9 w-2/3 rounded" />
          <div className="skeleton h-32 rounded-2xl" />
        </div>
      </Container>
    );
  if (error || !exam)
    return (
      <Container className="py-14">
        <ExamState
          title="Exam didn’t load"
          message={error || "This exam may no longer be available."}
          onBack={() => navigate("/student/courses")}
          onRetry={() => setRefresh((value) => value + 1)}
        />
      </Container>
    );

  const activeAttemptId =
    activeAttempt?.attemptId ?? exam.actions.activeAttemptId;
  const continueAttempt =
    activeAttemptId !== null && activeAttemptId !== undefined;
  const canStart = exam.actions.canStart && !continueAttempt;
  const lastSubmitted = exam.myStats.lastSubmittedAt
    ? new Date(exam.myStats.lastSubmittedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  function enterExam() {
    const query = new URLSearchParams({ examId: String(examId) });
    if (continueAttempt) query.set("attemptId", String(activeAttemptId));
    navigate(`${"/student/exam"}?${query.toString()}`);
  }

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute inset-0 bg-[url('/images/exam_taking.png')] bg-cover bg-center opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-alt via-surface-alt/75 to-transparent" />
        </div>
        <Container className="relative py-8 sm:py-11">
          <button
            type="button"
            onClick={() =>
              navigate(`/student/courses/${exam.courseId}?tab=exams`)
            }
            className="inline-flex items-center gap-2 text-sm font-medium text-content-soft hover:text-brand-ink"
          >
            <Icon.ChevronLeft className="h-4 w-4" />
            {exam.courseTitle}
          </button>
          <div className="mt-6 grid gap-7 lg:grid-cols-[1fr_20rem] lg:items-center">
            <div className="max-w-3xl py-2">
              <p className="inline-flex items-center gap-2 rounded-full border border-brand-ink/10 bg-surface/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-ink shadow-sm backdrop-blur-sm">
                <Icon.ClipboardList className="h-4 w-4" />
                Practice exam
              </p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-content sm:text-5xl sm:leading-[1.1]">
                {exam.title}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-content-secondary sm:text-lg">
                {exam.description ||
                  "Settle in, focus on what you know, and see how far you’ve come."}
              </p>
            </div>
            <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-sm">
              {continueAttempt ? (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full bg-warning-light px-3 py-1.5 text-xs font-semibold text-warning-strong">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    Exam in progress
                  </span>
                  <h2 className="mt-3 text-lg font-semibold text-content">
                    Welcome back
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-content-soft">
                    Your answers are saved. Continue where you left off.
                  </p>
                  {activeAttempt?.deadlineAt && (
                    <p className="mt-3 text-xs text-content-subtle">
                      Time ends{" "}
                      {new Date(activeAttempt.deadlineAt).toLocaleString()}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={enterExam}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Continue exam
                    <Icon.ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : canStart ? (
                <>
                  <p className="text-sm font-medium text-content-subtle">
                    Ready when you are
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-content">
                    You’ve got this
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-content-soft">
                    Find a quiet moment and give this exam your full attention.
                  </p>
                  <button
                    type="button"
                    onClick={enterExam}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Start exam
                    <Icon.ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-2 rounded-full bg-warning-light px-3 py-1.5 text-xs font-semibold text-warning-strong">
                    <Icon.Info className="h-4 w-4" />
                    Not ready yet
                  </span>
                  <h2 className="mt-3 text-lg font-semibold text-content">
                    This exam can’t be started
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-content-soft">
                    {exam.actions.reason ||
                      "The exam is still being prepared. Please check back later."}
                  </p>
                </>
              )}
              {exam.actions.canViewHistory && (
                <button
                  type="button"
                  onClick={() => navigate(studentExamAttemptsPath(examId))}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold text-content-secondary hover:bg-surface-hover"
                >
                  <Icon.Clock className="h-4 w-4" />
                  See your exam history
                </button>
              )}
            </div>
          </div>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ExamFact
            icon={<Icon.ClipboardList className="h-5 w-5" />}
            value={String(exam.questionCount)}
            label="Questions"
          />
          <ExamFact
            icon={<Icon.Clock className="h-5 w-5" />}
            value={`${exam.durationMinutes} min`}
            label="Time limit"
          />
          <ExamFact
            icon={<Icon.Trophy className="h-5 w-5" />}
            value={String(exam.maxScore)}
            label="Maximum score"
          />
          <ExamFact
            icon={<Icon.RefreshCw className="h-5 w-5" />}
            value={String(exam.myStats.attemptCount)}
            label="Your attempts"
          />
        </div>
        {exam.myStats.attemptCount > 0 && (
          <div className="mx-auto mt-5 max-w-4xl rounded-2xl border border-line-soft bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-content">
                  Your progress so far
                </p>
                <p className="mt-1 text-sm text-content-soft">
                  {lastSubmitted
                    ? `Last completed ${lastSubmitted}`
                    : "You’ve already practiced this exam."}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-content-subtle">Best score</p>
                <p className="mt-1 text-2xl font-bold text-brand-ink">
                  {exam.myStats.bestScore ?? "—"}
                  <span className="ml-1 text-sm font-medium text-content-subtle">
                    / {exam.maxScore}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </Container>
    </>
  );
}

function ExamFact({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-sm">
      <span className="text-brand-ink">{icon}</span>
      <p className="mt-3 text-xl font-bold text-content">{value}</p>
      <p className="mt-1 text-xs text-content-subtle">{label}</p>
    </div>
  );
}

function ExamState({
  title,
  message,
  onBack,
  onRetry,
}: {
  title: string;
  message: string;
  onBack?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line-soft bg-surface px-6 py-12 text-center shadow-sm">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink">
        <Icon.ClipboardList className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-content">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-content-soft">
        {message}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-content-secondary hover:bg-surface-hover"
          >
            Back to courses
          </button>
        )}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
