import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import {
  emptyDraft,
  fromDetail,
  isDraftValid,
  toCreateRequest,
  type QuestionDraft,
} from "@/features/question/model";
import type { QuestionDetail } from "@/services/question.service";
import {
  studentCourseService,
  type MyCourse,
} from "@/services/studentCourse.service";
import {
  studentContributionService,
  type ContributionDetail,
  type ContributionItem,
  type ContributionStatus,
  type ContributionType,
  type QuestionContributionBody,
} from "@/services/studentContribution.service";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  LoadError,
  PageTitle,
  STUDENT_PAGE_CLASS,
} from "../components/studentUi";

const PAGE_SIZE = 10;
const STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;

export function StudentContributionsPage() {
  const { contributionId } = useParams<{ contributionId: string }>();
  return contributionId ? (
    <ContributionDetail contributionId={contributionId} />
  ) : (
    <ContributionList />
  );
}

function ContributionList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("All");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ContributionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<"question" | "tip" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const type =
      tab === "All" ? undefined : (tab.toLowerCase() as ContributionType);
    studentContributionService
      .getMine({
        type,
        status: status as ContributionStatus | undefined,
        page,
        size: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) {
          setItems(result.content);
          setTotal(result.totalElements);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            getApiErrorMessage(err, "Failed to load your contributions."),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, status, page, reload]);

  const updateTab = (value: string) => {
    setTab(value);
    setPage(0);
  };
  const saved = () => {
    setForm(null);
    setReload((value) => value + 1);
  };
  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="My Contributions"
        subtitle="Track review progress and share questions or learning tips."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Icon.Lightbulb className="h-4 w-4" />}
              onClick={() => setForm("tip")}
            >
              Share a tip
            </Button>
            <Button
              icon={<Icon.Plus className="h-4 w-4" />}
              onClick={() => setForm("question")}
            >
              Contribute a question
            </Button>
          </div>
        }
      />
      <Tabs
        tabs={["All", "Question", "Tip"]}
        active={tab}
        onChange={updateTab}
        variant="underline"
      />
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Select
          aria-label="Filter by review status"
          className="w-full sm:w-52"
          value={status}
          options={[
            { label: "All statuses", value: "" },
            ...STATUSES.map((value) => ({ label: titleCase(value), value })),
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
        />
        <p className="text-sm text-content-subtle">
          {total} contribution{total === 1 ? "" : "s"}
        </p>
      </div>
      {error ? (
        <LoadError
          message={error}
          onRetry={() => setReload((value) => value + 1)}
        />
      ) : loading ? (
        <div className="card p-8 text-sm text-content-subtle">
          Loading contributions…
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.FileText className="h-7 w-7" />}
            title="No contributions yet"
            message="Submit a practice question or a helpful learning tip for review."
            action={
              <Button onClick={() => setForm("question")}>
                Contribute a question
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.contributionId}
                className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                  {item.type === "tip" ? (
                    <Icon.Lightbulb className="h-5 w-5" />
                  ) : (
                    <Icon.FileText className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-[12rem] flex-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `${ROUTES.studentContributions}/${item.contributionId}`,
                      )
                    }
                    className="text-left text-sm font-semibold text-content hover:text-primary hover:underline"
                  >
                    {item.summary}
                  </button>
                  <p className="mt-1 text-xs text-content-subtle">
                    {titleCase(item.type)} · Submitted{" "}
                    {formatDate(item.createdAt)}
                    {item.reviewedAt
                      ? ` · Reviewed ${formatDate(item.reviewedAt)}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={item.status} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      `${ROUTES.studentContributions}/${item.contributionId}`,
                    )
                  }
                >
                  Details
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination
              page={page + 1}
              total={total}
              perPage={PAGE_SIZE}
              onChange={(value) => setPage(value - 1)}
              unit="contributions"
            />
          </div>
        </div>
      )}
      <QuestionContributionModal
        open={form === "question"}
        onClose={() => setForm(null)}
        onSaved={saved}
      />
      <TipContributionModal
        open={form === "tip"}
        onClose={() => setForm(null)}
        onSaved={saved}
      />
    </div>
  );
}

function ContributionDetail({ contributionId }: { contributionId: string }) {
  const navigate = useNavigate();
  const [item, setItem] = useState<ContributionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentContributionService
      .getDetail(contributionId)
      .then((result) => {
        if (!cancelled) setItem(result);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            getApiErrorMessage(err, "Failed to load this contribution."),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contributionId, reload]);
  if (loading)
    return (
      <div className={`${STUDENT_PAGE_CLASS}`}>
        <div className="card p-8 text-sm text-content-subtle">
          Loading contribution…
        </div>
      </div>
    );
  if (error || !item)
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Button
          variant="ghost"
          onClick={() => navigate(ROUTES.studentContributions)}
        >
          ← My Contributions
        </Button>
        <LoadError
          message={error ?? "Contribution not found."}
          onRetry={() => setReload((value) => value + 1)}
        />
      </div>
    );
  const canResubmit =
    item.type === "question" && item.status === "REJECTED" && item.courseId;
  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
      <Button
        variant="ghost"
        onClick={() => navigate(ROUTES.studentContributions)}
      >
        ← My Contributions
      </Button>
      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant={item.type === "tip" ? "success" : "info"}>
              {titleCase(item.type)}
            </Badge>
            <h1 className="mt-2 text-xl font-bold text-content">
              {item.summary}
            </h1>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <div className="grid gap-2 text-sm text-content-subtle sm:grid-cols-2">
          <p>Submitted {formatDate(item.createdAt)}</p>
          <p>
            {item.reviewedAt
              ? `Reviewed ${formatDate(item.reviewedAt)}`
              : "Awaiting review"}
          </p>
        </div>
        {item.reviewNote && (
          <div className="rounded-xl border border-warning-line bg-warning-light p-4">
            <p className="text-sm font-semibold text-warning-strong">
              Reviewer feedback
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-content-secondary">
              {item.reviewNote}
            </p>
          </div>
        )}
        {item.type === "question" ? (
          <QuestionPreview item={item} />
        ) : (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-content-secondary">
              {item.content ?? item.summary}
            </p>
            {item.sourceReference && (
              <p className="text-xs text-content-subtle">
                Source: {item.sourceReference}
              </p>
            )}
          </div>
        )}
        {canResubmit && (
          <Button onClick={() => setResubmitOpen(true)}>
            Edit and resubmit
          </Button>
        )}
      </section>
      {canResubmit && (
        <QuestionContributionModal
          open={resubmitOpen}
          initial={item}
          contributionId={item.contributionId}
          onClose={() => setResubmitOpen(false)}
          onSaved={() => {
            setResubmitOpen(false);
            setReload((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

function QuestionPreview({ item }: { item: ContributionDetail }) {
  const questionType = item.questionType ?? "SINGLE_CHOICE";
  const answerKey = item.answerKey as {
    pairs?: { left: string; right: string }[];
    blanks?: { index: number; accepted: string[] }[];
    correctOrder?: string[];
  } | null;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
        {titleCase(questionType.replace(/_/g, " "))}
      </p>
      <p className="whitespace-pre-wrap text-sm font-medium text-content">
        {item.content ?? item.questionText ?? item.summary}
      </p>
      {questionType === "MATCHING" && (
        <ol className="space-y-2">
          {(answerKey?.pairs ?? []).map((pair, index) => (
            <li
              key={index}
              className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary"
            >
              {pair.left} ↔ {pair.right}
            </li>
          ))}
        </ol>
      )}
      {questionType === "FILL_BLANK" && (
        <div className="space-y-1 text-sm text-content-secondary">
          {(answerKey?.blanks ?? []).map((blank) => (
            <p key={blank.index}>
              Blank {blank.index}: {(blank.accepted ?? []).join(", ")}
            </p>
          ))}
        </div>
      )}
      {questionType === "DIAGRAM" && (
        <p className="text-sm text-content-subtle">
          Diagram question attached.
        </p>
      )}
      {["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
        questionType,
      ) && (
        <ol className="space-y-2">
          {(item.options ?? []).map((option, index) => (
            <li
              key={`${index}-${option.optionText}`}
              className={`rounded-lg px-3 py-2 text-sm ${option.isCorrect ? "bg-success-light text-success" : "bg-surface-muted text-content-secondary"}`}
            >
              <span className="mr-2 font-semibold">
                {String.fromCharCode(65 + index)}.
              </span>
              {option.optionText}
              {option.isCorrect && (
                <span className="ml-2 text-xs font-semibold">Correct</span>
              )}
            </li>
          ))}
        </ol>
      )}
      {questionType === "ORDERING" && (
        <ol className="space-y-2">
          {(answerKey?.correctOrder ?? []).map((key, index) => (
            <li
              key={key}
              className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary"
            >
              {index + 1}.{" "}
              {(item.options ?? []).find((option) => option.key === key)
                ?.optionText ?? key}
            </li>
          ))}
        </ol>
      )}
      {questionType === "ESSAY" && Boolean(item.essayGradingRubric) && (
        <p className="text-sm text-content-secondary">
          Grading rubric provided.
        </p>
      )}
      {item.explanation && (
        <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">
          <span className="font-semibold">Explanation: </span>
          {item.explanation}
        </p>
      )}
      {item.sourceReference && (
        <p className="text-xs text-content-subtle">
          Source: {item.sourceReference}
        </p>
      )}
    </div>
  );
}

const STUDENT_QUESTION_TYPES: QuestionDetail["questionType"][] = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "MATCHING",
  "FILL_BLANK",
  "ESSAY",
  "DIAGRAM",
  "ORDERING",
];

function contributionQuestionDraft(item?: ContributionDetail): QuestionDraft {
  if (!item) return emptyDraft();
  return fromDetail({
    questionId: item.contributionId,
    courseId: item.courseId ?? null,
    moduleId: item.moduleId ?? null,
    groupId: null,
    questionType: item.questionType ?? "SINGLE_CHOICE",
    difficulty: item.difficulty ?? "MEDIUM",
    content: item.content ?? item.questionText ?? "",
    questionMetadata: item.questionMetadata ?? null,
    answerKey: item.answerKey ?? null,
    defaultPoints: null,
    source: "STUDENT_CONTRIBUTION",
    creatorRole: "STUDENT",
    createdBy: null,
    scoringVersion: null,
    lockVersion: null,
    aiExplanation: item.explanation ?? null,
    // The editor's QuestionDetail model only accepts persisted question states;
    // this contribution is still pending review, represented separately below.
    status: "INACTIVE",
    approvalStatus: item.status,
    essayGradingRubric: item.essayGradingRubric ?? null,
    options: item.options ?? [],
    createdAt: item.createdAt ?? null,
    updatedAt: item.createdAt ?? null,
  });
}

function QuestionContributionModal({
  open,
  onClose,
  onSaved,
  initial,
  contributionId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ContributionDetail;
  contributionId?: number;
}) {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [courseId, setCourseId] = useState(
    initial?.courseId ? String(initial.courseId) : "",
  );
  const [question, setQuestion] = useState<QuestionDraft>(() =>
    contributionQuestionDraft(initial),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setQuestion(contributionQuestionDraft(initial));
    setCourseId(initial?.courseId ? String(initial.courseId) : "");
    setShowErrors(false);
    setError(null);
  }, [open, initial]);
  useEffect(() => {
    let cancelled = false;
    studentCourseService
      .getMyCourses({ page: 0, size: 100 })
      .then((result) => {
        if (!cancelled)
          setCourses(
            result.content.filter((course) => course.status === "ACTIVE"),
          );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const courseOptions = useMemo(
    () => [
      { label: "Choose an enrolled course", value: "" },
      ...courses.map((course) => ({
        label: course.title,
        value: String(course.courseId),
      })),
    ],
    [courses],
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!courseId) {
      setError("Choose an enrolled course.");
      return;
    }
    if (!isDraftValid(question)) {
      setShowErrors(true);
      return;
    }
    if (question.type === "DIAGRAM" && question.rubric.length === 0) {
      setShowErrors(true);
      setError(
        "Add at least one grading rubric criterion for a diagram question.",
      );
      return;
    }
    const request = toCreateRequest(question, Number(courseId), null);
    const body: QuestionContributionBody = {
      ...request,
      questionType:
        request.questionType as QuestionContributionBody["questionType"],
      difficulty: request.difficulty ?? "MEDIUM",
      options: request.options ?? [],
      explanation: request.explanation ?? "",
    };
    setBusy(true);
    try {
      if (contributionId)
        await studentContributionService.resubmit(contributionId, body);
      else await studentContributionService.createQuestion(body);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit this question."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        contributionId ? "Edit and resubmit question" : "Contribute a question"
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="question-contribution-form"
            type="submit"
            loading={busy}
          >
            {contributionId ? "Resubmit" : "Submit question"}
          </Button>
        </>
      }
    >
      <form
        id="question-contribution-form"
        onSubmit={submit}
        className="space-y-4"
      >
        <Select
          label="Enrolled course"
          value={courseId}
          options={courseOptions}
          onChange={setCourseId}
        />
        <QuestionForm
          q={question}
          index={0}
          heading="Question details"
          onChange={(next) => {
            setQuestion(next);
            setError(null);
          }}
          showErrors={showErrors}
          allowedTypes={STUDENT_QUESTION_TYPES}
        />
        {!courses.length && (
          <p className="text-sm text-warning">
            An active course enrollment is needed to contribute a question.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function TipContributionModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    studentCourseService
      .getMyCourses({ page: 0, size: 100 })
      .then((result) => {
        if (!cancelled)
          setCourses(
            result.content.filter((course) => course.status === "ACTIVE"),
          );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!courseId || !title.trim() || !content.trim()) {
      setError("Choose a course and complete the title and tip.");
      return;
    }
    setBusy(true);
    try {
      await studentContributionService.createTip({
        courseId: Number(courseId),
        title: title.trim(),
        content: content.trim(),
        sourceReference: sourceReference.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit this tip."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share a learning tip"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="tip-contribution-form" type="submit" loading={busy}>
            Submit tip
          </Button>
        </>
      }
    >
      <form id="tip-contribution-form" onSubmit={submit} className="space-y-4">
        <Select
          label="Enrolled course"
          value={courseId}
          options={[
            { label: "Choose an enrolled course", value: "" },
            ...courses.map((course) => ({
              label: course.title,
              value: String(course.courseId),
            })),
          ]}
          onChange={setCourseId}
        />
        <Input
          label="Title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
          Tip
          <textarea
            required
            maxLength={10000}
            rows={6}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
        </label>
        <Input
          label="Source reference (optional)"
          value={sourceReference}
          onChange={(event) => setSourceReference(event.target.value)}
        />
        {!courses.length && (
          <p className="text-sm text-warning">
            An active course enrollment is needed to share a tip.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function StatusBadge({ status }: { status: ContributionStatus }) {
  const variant =
    status === "ACCEPTED"
      ? "success"
      : status === "REJECTED"
        ? "danger"
        : "warning";
  return <Badge variant={variant}>{titleCase(status)}</Badge>;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
