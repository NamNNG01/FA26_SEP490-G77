import { courseService } from "@/services/course.service";
import { fromDetail, type QuestionDraft } from "@/features/question/model";
import type { QuestionDetail } from "@/services/question.service";

export type Kind = "contributions" | "decks";
export type Row = Record<string, any>;

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "MATCHING",
  "FILL_BLANK",
  "ORDERING",
  "ESSAY",
  "CODE",
  "DIAGRAM",
  "DIAGRAM_ESSAY",
];

export const REJECTION_TEMPLATES = [
  "Incorrect answer",
  "Duplicate content",
  "Spelling or grammar",
  "Not suitable for this course",
];

export const unwrap = (response: any) => {
  if (!response?.success) {
    throw Object.assign(new Error(response?.message || "Request failed"), {
      data: response?.data,
    });
  }
  return response.data;
};

export const idOf = (row: Row, kind: Kind) =>
  kind === "contributions" ? row.contributionId : row.deckId;

export const statusOf = (row: Row, kind: Kind) =>
  kind === "contributions" ? row.status : row.reviewStatus;

export const questionTypeLabel = (value: string) =>
  (
    {
      SINGLE_CHOICE: "Single choice",
      MULTIPLE_CHOICE: "Multiple choice",
      TRUE_FALSE: "True or false",
      MATCHING: "Matching",
      FILL_BLANK: "Fill in the blank",
      ORDERING: "Ordering",
      ESSAY: "Essay",
      CODE: "Code",
      DIAGRAM: "Diagram",
      DIAGRAM_ESSAY: "Diagram + Essay",
    } as Record<string, string>
  )[value] || value;

export const statusLabel = (value: string) =>
  (
    {
      PENDING: "Pending",
      PENDING_REVIEW: "Pending",
      ACCEPTED: "Accepted",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      ALL: "All statuses",
    } as Record<string, string>
  )[value] || value;

export const collectionPath = (kind: Kind) =>
  kind === "contributions" ? "/manager/contributions" : "/manager/decks/review";

export const detailPath = (kind: Kind, id: number | string) => `${collectionPath(kind)}/${id}`;

export const actionPath = (kind: Kind, id: number | string, decision: "approve" | "reject") =>
  `${detailPath(kind, id)}/${decision}`;

export const isPending = (kind: Kind, status: string | null | undefined) =>
  status === (kind === "contributions" ? "PENDING" : "PENDING_REVIEW");

export const apiStatus = (kind: Kind, status: string) => {
  if (status === "PENDING" || status === "PENDING_REVIEW") {
    return kind === "contributions" ? "PENDING" : "PENDING_REVIEW";
  }
  if (status === "APPROVED" || status === "ACCEPTED") {
    return kind === "contributions" ? "ACCEPTED" : "APPROVED";
  }
  return status;
};

export const decisionMessage = (decision: "approve" | "reject", kind: Kind) =>
  `${kind === "decks" ? "Flashcard deck" : "Question contribution"} ${decision === "approve" ? (kind === "decks" ? "approved" : "accepted") : "rejected"}.`;

export const errorDetails = (error: any) => error?.response?.data?.data ?? error?.data ?? {};

export const errorMessage = (error: any) =>
  error?.response?.data?.message || error?.message || "The request could not be completed.";

export const difficultyLabel = (value: string) =>
  value ? value[0] + value.slice(1).toLowerCase() : "—";

export const dateTimeLocal = (value: string | null, subtractMilliseconds = 0) => {
  if (!value) return "";
  const date = new Date(new Date(value).getTime() - subtractMilliseconds);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const parseJson = (value: unknown, fallback: unknown = null): any => {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export function contributionQuestionDraft(detail: Row): QuestionDraft {
  const metadata = parseJson(detail.questionMetadata, {});
  const rawOptions = parseJson(detail.options, []);
  const rawTestCases = parseJson(detail.testCases, metadata?.testCases ?? null);
  const options = Array.isArray(rawOptions)
    ? rawOptions.map((option: Row, index: number) => ({
        optionId: option.optionId ?? null,
        optionText: option.optionText ?? option.text ?? option.label ?? "",
        isCorrect: option.isCorrect ?? false,
        explanation: option.explanation ?? null,
        orderIndex: option.orderIndex ?? index,
      }))
    : [];
  const question: QuestionDetail = {
    questionId: detail.contributionId,
    courseId: detail.courseId ?? null,
    moduleId: detail.moduleId ?? null,
    groupId: detail.groupId ?? null,
    questionType: detail.questionType || detail.type || "SINGLE_CHOICE",
    difficulty: detail.difficulty || "MEDIUM",
    content: detail.content ?? "",
    questionMetadata: metadata,
    answerKey: parseJson(detail.answerKey, null),
    defaultPoints: null,
    source: "CONTRIBUTION_REVIEW",
    creatorRole: "STUDENT",
    createdBy: detail.contributor?.userId ?? detail.contributor?.id ?? detail.contributorId ?? null,
    scoringVersion: null,
    lockVersion: detail.version ?? null,
    aiExplanation: detail.explanation ?? "",
    status: "INACTIVE",
    approvalStatus: "PENDING",
    essayGradingRubric: parseJson(detail.essayGradingRubric, null),
    options,
    codeConfig: parseJson(
      detail.codeConfig,
      metadata?.codeConfig ?? metadata?.codeQuestionConfig ?? null,
    ),
    testCases: Array.isArray(rawTestCases)
      ? rawTestCases.map((testCase: Row, index: number) => ({
          ...testCase,
          inputData: testCase.inputData ?? testCase.input ?? "",
          expectedOutput: testCase.expectedOutput ?? testCase.output ?? "",
          hidden: testCase.hidden ?? testCase.isHidden ?? false,
          orderIndex: testCase.orderIndex ?? index,
        }))
      : null,
    createdAt: detail.createdAt ?? null,
    updatedAt: detail.reviewedAt ?? null,
  };
  return fromDetail(question);
}

export async function findContributorName(courseId: number | string, userId: number | string) {
  for (let page = 0, totalPages = 1; page < totalPages; page += 1) {
    const result = await courseService.getCourseStudents(courseId, { page, size: 100 });
    const match = result.content.find((student) => String(student.userId) === String(userId));
    if (match?.fullName?.trim()) return match.fullName;
    totalPages = result.totalPages;
  }
  return undefined;
}
