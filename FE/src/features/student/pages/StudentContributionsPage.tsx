import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { focusFirstInvalidAfter } from "@/utils/focusFirstInvalid";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/assets/icons";
import { ROUTES, studentDeckPath } from "@/app/routes";
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
  studentContributionService,
  type ContributionDetail,
  type ContributionItem,
  type ContributionStatus,
  type QuestionContributionBody,
} from "@/services/studentContribution.service";
import { studentDeckService, type DeckListItem } from "@/services/studentDeck.service";
import { DeckContributionModal as SharedDeckContributionModal } from "../components/flashcards/DeckContributionModal";
import { useActiveCourses } from "../components/flashcards/flashcardUi";
import { ContributionCourseModuleFields } from "../components/ContributionCourseModuleFields";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  LoadError,
  PageTitle,
  STUDENT_PAGE_CLASS,
} from "../components/studentUi";

const PAGE_SIZE = 10;
const STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
type MyContributionRow = {
  key: string;
  type: "question" | "deck";
  status: string;
  summary: string;
  createdAt: string | null;
  reviewedAt: string | null;
  contributionId?: number;
  deckId?: number;
  cardCount?: number;
  deck?: DeckListItem;
};

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
  const [items, setItems] = useState<MyContributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<"question" | "deck" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      studentContributionService.getAllMine({ type: "question" }),
      studentDeckService.listAllDecks({ scope: "MINE" }),
    ])
      .then(([questions, decks]) => {
        if (!cancelled) setItems([
          ...questions.map((item: ContributionItem) => ({
            key: `question-${item.contributionId}`,
            type: "question" as const,
            status: item.status,
            summary: item.summary,
            createdAt: item.createdAt,
            reviewedAt: item.reviewedAt,
            contributionId: item.contributionId,
          })),
          ...decks.filter(deck => deck.reviewStatus !== "NONE").map(deck => ({
            key: `deck-${deck.deckId}`,
            type: "deck" as const,
            status: deck.reviewStatus,
            summary: deck.title,
            createdAt: deck.createdAt,
            reviewedAt: null,
            deckId: deck.deckId,
            cardCount: deck.cardCount,
            deck,
          })),
        ]);
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
  }, [reload]);

  const filteredItems = useMemo(() => items
    .filter(item => tab === "All" || (tab === "Question" ? item.type === "question" : item.type === "deck"))
    .filter(item => !status || item.status === status || (status === "PENDING" && item.status === "PENDING_REVIEW") || (status === "ACCEPTED" && item.status === "APPROVED"))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()), [items, tab, status]);
  const total = filteredItems.length;
  const pageItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        subtitle="Track review progress for your questions and flashcard decks."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              icon={<Icon.Plus className="h-4 w-4" />}
              onClick={() => setForm("deck")}
            >
              Contribute a flashcard deck
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
        tabs={["All", "Question", "Flashcard deck"]}
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
      ) : pageItems.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.FileText className="h-7 w-7" />}
            title="No contributions yet"
            message="Submit a practice question or a flashcard deck for review."
            action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setForm("question")}>Contribute a question</Button><Button variant="outline" onClick={() => setForm("deck")}>Contribute a flashcard deck</Button></div>}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {pageItems.map((item) => (
              <li
                key={item.contributionId}
                className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                  {item.type === "deck" ? <Icon.Layers className="h-5 w-5" /> : <Icon.FileText className="h-5 w-5" />}
                </span>
                <div className="min-w-[12rem] flex-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(item.type === "deck" ? studentDeckPath(item.deckId!) : `${ROUTES.studentContributions}/${item.contributionId}`)
                    }
                    className="text-left text-sm font-semibold text-content hover:text-primary hover:underline"
                  >
                    {item.summary}
                  </button>
                  <p className="mt-1 text-xs text-content-subtle">
                    {item.type === "deck" ? `Flashcard deck · ${item.cardCount ?? 0} cards · Created ${formatDate(item.createdAt)}` : `Question · Submitted ${formatDate(item.createdAt)}`}
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
                      navigate(item.type === "deck" ? studentDeckPath(item.deckId!) : `${ROUTES.studentContributions}/${item.contributionId}`)
                  }
                >
                  {item.type === "deck" ? "Open deck" : "Details"}
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
              unit="submissions"
            />
          </div>
        </div>
      )}
      <QuestionContributionModal
        open={form === "question"}
        onClose={() => setForm(null)}
        onSaved={saved}
      />
      <SharedDeckContributionModal open={form === "deck"} onClose={() => setForm(null)} onSubmitted={saved} />
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-content-subtle">
          <p>Submitted {formatDate(item.createdAt)}</p>
          <span aria-hidden="true" className="text-content-subtle/60">·</span>
          <p>{item.reviewedAt ? `Reviewed ${formatDate(item.reviewedAt)}` : "Awaiting review"}</p>
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
  const draft = contributionQuestionDraft(item);
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <QuestionForm
        q={draft}
        index={0}
        heading="Question details"
        onChange={() => {}}
        showErrors={false}
        allowedTypes={STUDENT_QUESTION_TYPES}
        readOnly
      />
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
  "DIAGRAM_ESSAY",
  "CODE",
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
    codeConfig: item.codeConfig ?? null,
    testCases: item.testCases ?? null,
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
  const { courses, error: coursesError } = useActiveCourses();
  const [courseId, setCourseId] = useState(
    initial?.courseId ? String(initial.courseId) : "",
  );
  const [moduleId, setModuleId] = useState(initial?.moduleId ? String(initial.moduleId) : "");
  const [question, setQuestion] = useState<QuestionDraft>(() =>
    contributionQuestionDraft(initial),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseError, setCourseError] = useState("");
  const [moduleError, setModuleError] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuestion(contributionQuestionDraft(initial));
    setCourseId(initial?.courseId ? String(initial.courseId) : "");
    setModuleId(initial?.moduleId ? String(initial.moduleId) : "");
    setShowErrors(false);
    setError(null);
    setCourseError("");
    setModuleError("");
  }, [open, initial]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCourseError(courseId ? "" : "Choose an enrolled course.");
    setModuleError(moduleId ? "" : "Choose a module.");
    if (!courseId || !moduleId) {
      setError("Choose both an enrolled course and a module before submitting.");
      return;
    }
    if (!isDraftValid(question)) {
      focusFirstInvalidAfter(() => setShowErrors(true));
      return;
    }
    if (question.type === "DIAGRAM" && question.rubric.length === 0) {
      setShowErrors(true);
      setError(
        "Add at least one grading rubric criterion for a diagram question.",
      );
      return;
    }
    const request = toCreateRequest(question, Number(courseId), Number(moduleId));
    const body: QuestionContributionBody = {
      ...request,
      moduleId: Number(moduleId),
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
      onClose={busy ? () => {} : onClose}
      error={error && <Alert type="error" message={error} />}
      title={
        contributionId ? "Edit and resubmit question" : "Contribute a question"
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            form="question-contribution-form"
            type="submit"
            loading={busy}
            disabled={busy || !courses?.length}
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
        <ContributionCourseModuleFields
          courses={courses ?? []}
          courseId={courseId}
          moduleId={moduleId}
          onCourseChange={value => { setCourseId(value); setCourseError(""); setError(null); }}
          onModuleChange={value => { setModuleId(value); setModuleError(""); setError(null); }}
          courseError={courseError || coursesError || undefined}
          moduleError={moduleError || undefined}
          disabled={busy}
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
        {!courses?.length && <p className="text-sm text-warning">An active course enrollment is needed to contribute a question.</p>}
      </form>
    </Modal>
  );
}

function StatusBadge({ status }: { status: ContributionStatus | string }) {
  const variant =
    status === "ACCEPTED" || status === "APPROVED"
      ? "success"
      : status === "REJECTED"
        ? "danger"
        : "warning";
  const label = status === "PENDING_REVIEW" ? "Pending review" : status === "APPROVED" || status === "ACCEPTED" ? "Approved" : titleCase(status);
  return <Badge variant={variant}>{label}</Badge>;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
