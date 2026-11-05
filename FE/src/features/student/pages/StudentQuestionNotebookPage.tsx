import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { EmptyState } from "@/components/ui/Card";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import {
  studentProgressService,
  type SavedQuestion,
} from "@/services/studentProgress.service";
import {
  studentCourseService,
  type MyCourse,
} from "@/services/studentCourse.service";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  LoadError,
  PageTitle,
  STUDENT_PAGE_CLASS,
} from "../components/studentUi";
import { ReportQuestionIssueButton } from "../components/ReportQuestionIssueDialog";

const SIZE = 10;
const FILTERS = [
  { label: "All saved questions", value: "all" },
  { label: "Incorrect answers", value: "wrong" },
  { label: "Bookmarked", value: "bookmarked" },
];
const SESSION_TYPES = [
  { label: "Incorrect answers", value: "wrong" },
  { label: "Bookmarked questions", value: "bookmarked" },
  { label: "All saved questions", value: "all" },
];
const SESSION_EXAM_TYPES = [
  { label: "Quiz", value: "QUIZ" },
  { label: "Essay", value: "ESSAY" },
];

export function StudentQuestionNotebookPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "wrong" | "bookmarked">("all");
  const [search, setSearch] = useState("");
  const [examType, setExamType] = useState<"" | "QUIZ" | "EXAM">("");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [page, setPage] = useState(0);
  const [sessionType, setSessionType] = useState<
    "wrong" | "bookmarked" | "all"
  >("wrong");
  const [sessionExamType, setSessionExamType] = useState<"QUIZ" | "ESSAY">(
    "QUIZ",
  );
  const [sessionSize, setSessionSize] = useState("10");
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<SavedQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studentCourseService
      .getMyCourses({ status: "ACTIVE", page: 0, size: 100 })
      .then((result) => {
        if (!cancelled) setCourses(result.content);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentProgressService.getSavedQuestions({
      page,
      size: SIZE,
      type: filter,
      search: search.trim() || undefined,
      examType: examType || undefined,
      courseId: courseId ? Number(courseId) : undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.content);
        setTotal(result.totalElements);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            getApiErrorMessage(err, "Failed to load the question notebook."),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, filter, search, examType, courseId, reload]);

  const startSession = async () => {
    setActionError(null);
    const size = Number(sessionSize);
    if (!Number.isInteger(size) || size < 1 || size > 50) {
      setActionError("Question count must be a whole number between 1 and 50.");
      return;
    }
    setStarting(true);
    try {
      const session = await studentProgressService.startReviewSession({
        type: sessionType,
        examType: sessionExamType,
        size,
      });
      navigate(
        `${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(session.attemptId))}`,
      );
    } catch (err) {
      setActionError(
        getApiErrorMessage(err, "Could not start a review session."),
      );
    } finally {
      setStarting(false);
    }
  };

  const toggleBookmark = async (question: SavedQuestion) => {
    setBusyId(question.reviewId);
    setActionError(null);
    try {
      const updated = await studentProgressService.toggleBookmark(
        question.questionId,
      );
      if (filter === "bookmarked" && !updated.isBookmarked) {
        setRows((rowsNow) =>
          rowsNow.filter((row) => row.reviewId !== question.reviewId),
        );
        setTotal((value) => Math.max(0, value - 1));
      } else
        setRows((rowsNow) =>
          rowsNow.map((row) =>
            row.questionId === question.questionId
              ? { ...row, isBookmarked: updated.isBookmarked }
              : row,
          ),
        );
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not update the bookmark."));
    } finally {
      setBusyId(null);
    }
  };

  const removeQuestion = async (reviewId: number) => {
    setBusyId(reviewId);
    setActionError(null);
    try {
      await studentProgressService.removeSavedQuestion(reviewId);
      const nextTotal = Math.max(0, total - 1);
      const lastPage = Math.max(0, Math.ceil(nextTotal / SIZE) - 1);
      setLoading(true);
      setTotal(nextTotal);
      if (page > lastPage) setPage(lastPage);
      else setReload((value) => value + 1);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not remove the question."));
    } finally {
      setBusyId(null);
    }
  };

  const updateFilter = (value: string) => {
    setFilter(value as typeof filter);
    setPage(0);
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="Question notebook"
        subtitle="Review incorrect answers, keep useful questions, and practice them again."
        action={
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.studentLearningActivities)}
          >
            Learning activity
          </Button>
        }
      />

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold text-content">Start a review session</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Questions to practice"
            className="w-full sm:w-56"
            value={sessionType}
            options={SESSION_TYPES}
            onChange={(v) => setSessionType(v as typeof sessionType)}
          />
          <Select
            label="Exam type"
            className="w-full sm:w-44"
            value={sessionExamType}
            options={SESSION_EXAM_TYPES}
            onChange={(v) => setSessionExamType(v as typeof sessionExamType)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
            Question count
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={sessionSize}
              onChange={(e) => setSessionSize(e.target.value)}
              aria-invalid={
                !Number.isInteger(Number(sessionSize)) ||
                Number(sessionSize) < 1 ||
                Number(sessionSize) > 50
              }
              className="h-9 w-28 rounded-[10px] border border-line bg-surface px-3 text-content"
            />
          </label>
          <Button onClick={startSession} disabled={starting}>
            {starting ? "Starting…" : "Practice now"}
          </Button>
        </div>
        {actionError && (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-content">
            Saved questions
          </h2>
        </div>
        <div className="card p-4 flex flex-wrap gap-3">
          <Select
            aria-label="Question filter"
            className="w-full sm:w-56"
            value={filter}
            options={FILTERS}
            onChange={updateFilter}
          />
          <Select
            aria-label="Filter by exam type"
            className="w-full sm:w-44"
            value={examType}
            options={[
              { label: "All exam types", value: "" },
              { label: "Quiz", value: "QUIZ" },
              { label: "Essay", value: "ESSAY" },
            ]}
            onChange={(v) => {
              setExamType(v as typeof examType);
              setPage(0);
            }}
          />
          <SearchableSelect
            label="Course"
            showLabel={false}
            className="w-full sm:w-64"
            value={courseId}
            options={[
              { label: "All courses", value: "" },
              ...courses.map((course) => ({
                label: course.title,
                value: String(course.courseId),
              })),
            ]}
            onChange={(value) => {
              setCourseId(value);
              setPage(0);
            }}
            placeholder="All courses"
            searchPlaceholder="Search courses…"
            emptyText="No courses found"
          />
          <SearchInput
            className="w-full sm:w-72"
            placeholder="Search questions…"
            aria-label="Search saved questions"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {error ? (
          <LoadError message={error} onRetry={() => setReload((v) => v + 1)} />
        ) : loading ? (
          <div className="card p-8 text-sm text-content-subtle">
            Loading questions…
          </div>
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Icon.Book className="w-7 h-7" />}
              title="No saved questions"
              message="Bookmark a question or complete an exam to build your notebook."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((question) => (
              <QuestionCard
                key={question.reviewId}
                question={question}
                busy={busyId === question.reviewId}
                onBookmark={() => toggleBookmark(question)}
                onRemove={() => removeQuestion(question.reviewId)}
              />
            ))}
            <div className="card">
              <Pagination
                page={page + 1}
                total={total}
                perPage={SIZE}
                onChange={(p) => setPage(p - 1)}
                unit="questions"
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function QuestionCard({
  question,
  busy,
  onBookmark,
  onRemove,
}: {
  question: SavedQuestion;
  busy: boolean;
  onBookmark: () => void;
  onRemove: () => void;
}) {
  const correct = new Set(question.correctOptionIds ?? []);
  return (
    <article className="card p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            {question.isWrong && (
              <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
                Missed {question.wrongCount}×
              </span>
            )}
            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-content-secondary">
              {question.questionType.replace(/_/g, " ")}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm font-medium text-content">
            {question.questionText}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={
            question.isBookmarked ? "Remove bookmark" : "Bookmark question"
          }
          title={
            question.isBookmarked ? "Remove bookmark" : "Bookmark question"
          }
          onClick={onBookmark}
        >
          <Icon.Star
            className={`h-4 w-4 ${question.isBookmarked ? "fill-current text-warning" : ""}`}
          />
        </Button>
      </div>
      {!!question.options?.length && (
        <ul className="space-y-1.5 pl-1">
          {question.options.map((option) => (
            <li
              key={option.optionId}
              className={`rounded-lg px-3 py-2 text-sm ${correct.has(option.optionId) ? "bg-success/10 text-success" : "bg-surface-muted text-content-secondary"}`}
            >
              <span className="mr-2 text-xs font-semibold">
                {correct.has(option.optionId) ? "✓" : "•"}
              </span>
              {option.optionText}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-xs text-content-subtle">
          {question.lastPracticedAt
            ? `Last practiced ${new Date(question.lastPracticedAt).toLocaleString()}`
            : "Not practiced yet"}
        </p>
        <div className="flex flex-wrap gap-2">
          <ReportQuestionIssueButton questionId={question.questionId} />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            icon={<Icon.Trash className="w-4 h-4" />}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
    </article>
  );
}
