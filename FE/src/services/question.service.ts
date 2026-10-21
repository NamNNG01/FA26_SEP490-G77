import { api } from './api';
import { apiClient } from './axios';
import { mockGenerateAiQuestions } from './mockQuestionAiData';
import type { ApiResponse } from '@/auth/authContext';

/**
 * QuestionService
 *
 * Types mirror the backend DTOs (com.examprep.dto.question.*) — do not
 * rename fields. Requests go through the shared axios instance, which
 * attaches the Bearer token.
 *
 * Endpoints (QuestionController):
 *   GET /api/v1/manager/questions  (Q-01: list with filters + pagination)
 *   POST /api/v1/manager/exams/ai/generate  (AI-01: draft questions with AI)
 *   POST /api/v1/manager/exams/ai/generate-from-material  (AI-02: draft questions with AI from a file)
 */

/** Values accepted by the `questions.question_type` CHECK constraint. */
export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'MATCHING'
  | 'FILL_BLANK'
  | 'ESSAY'
  | 'CODE'
  | 'DIAGRAM'
  | 'ORDERING';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type QuestionStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';

/** UI names for the stored statuses: ACTIVE shows as Published, INACTIVE as Archived. */
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  ACTIVE: 'Published',
  INACTIVE: 'Archived',
  DRAFT: 'Draft',
};

/** QuestionListItemDto */
export interface QuestionListItem {
  questionId: number;
  content: string;
  courseId: number | null;
  courseName: string | null;
  moduleId: number | null;
  moduleName: string | null;
  groupId: number | null;
  questionType: QuestionType | string;
  difficulty: QuestionDifficulty | string | null;
  status: QuestionStatus | string;
  approvalStatus: string;
  creatorRole: string;
  source: string;
  createdBy: number | null;
  scoringVersion: number | null;
  lockVersion: number | null;
  optionCount: number;
  updatedAt: string | null; // Instant → ISO string
}

export interface QuestionListParams {
  search?: string;
  courseId?: number;
  /** Several courses at once — sent as repeated `courseIds` params; each must be one the caller manages. */
  courseIds?: number[];
  moduleId?: number;
  groupId?: number;
  questionType?: string;
  difficulty?: string;
  status?: string;
  page?: number;
  size?: number;
}

export interface QuestionPage {
  content: QuestionListItem[];
  /** Zero-based page index. */
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Spring serializes Page<T> either as PageImpl (totals at the top level) or,
 * with VIA_DTO serialization, with totals nested under `page`. Accept both.
 */
interface RawSpringPage<T> {
  content: T[];
  number?: number;
  size?: number;
  totalElements?: number;
  totalPages?: number;
  page?: { number: number; size: number; totalElements: number; totalPages: number };
}

function toQuestionPage(raw: RawSpringPage<QuestionListItem>): QuestionPage {
  const meta = raw.page ?? raw;
  return {
    content: raw.content ?? [],
    page: meta.number ?? 0,
    size: meta.size ?? raw.content?.length ?? 0,
    totalElements: meta.totalElements ?? raw.content?.length ?? 0,
    totalPages: meta.totalPages ?? 1,
  };
}

/** AnswerOptionDto. ORDERING options carry a `key` and no `isCorrect` (the validator rejects one). */
export interface AnswerOption {
  optionId?: number | null;
  /** ORDERING only: what answerKey.correctOrder refers to (max 32 chars). */
  key?: string;
  optionText: string;
  isCorrect?: boolean | null;
  explanation?: string | null;
  orderIndex?: number;
}

/** answerKey for MATCHING (ScoringService reads `pairs`). */
export interface MatchingAnswerKey {
  pairs: { left: string; right: string }[];
}

/** answerKey for FILL_BLANK — `index` matches a {{n}} marker in the content. */
export interface FillBlankAnswerKey {
  blanks: { index: number; accepted: string[]; caseSensitive: boolean }[];
}

/**
 * answerKey for ORDERING. Sent as option keys; the backend stores and returns
 * the optionIds of the options in their correct order.
 */
export interface OrderingAnswerKey {
  correctOrder: (string | number)[];
}

/** QuestionCreateRequest */
export interface QuestionCreateRequest {
  courseId: number;
  moduleId?: number | null;
  questionType: QuestionType;
  difficulty?: QuestionDifficulty;
  status?: QuestionStatus;
  content: string;
  options?: AnswerOption[];
  answerKey?: MatchingAnswerKey | FillBlankAnswerKey | OrderingAnswerKey | null;
  groupId?: number | null;
  /** Stored as ai_explanation — shown to students during review. */
  explanation?: string | null;
  /** The backend accepts only the keys in QUESTION_METADATA_KEYS. */
  questionMetadata?: Record<string, unknown> | null;
  /** Must equal the rubric's total maxScore for ESSAY / DIAGRAM; the backend defaults it to 1. */
  defaultPoints?: number | null;
  essayGradingRubric?: unknown;
}

/** QuestionUpdateRequest — every field optional; `lockVersion` guards concurrent edits. */
export interface QuestionUpdateRequest extends Partial<Omit<QuestionCreateRequest, 'courseId'>> {
  lockVersion?: number | null;
}

/** QuestionDetailDto */
export interface QuestionDetail {
  questionId: number;
  courseId: number | null;
  moduleId: number | null;
  groupId: number | null;
  questionType: QuestionType;
  difficulty: QuestionDifficulty | null;
  content: string;
  questionMetadata: unknown;
  answerKey: unknown;
  defaultPoints: number | null;
  source: string;
  creatorRole: string;
  createdBy: number | null;
  scoringVersion: number | null;
  lockVersion: number | null;
  aiExplanation: string | null;
  status: QuestionStatus;
  approvalStatus: string;
  essayGradingRubric: unknown;
  options: AnswerOption[];
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Keys QuestionValidator allows in questionMetadata — any other key fails the
 * request. DIAGRAM questions also send `drawioXml` (max 500 KB, starts with <mxfile or <mxGraphModel).
 */
export const QUESTION_METADATA_KEYS = ['skillTag'] as const;

/** ValidationError — one entry of a VALIDATION_ERROR response's `data`. */
export interface QuestionValidationError {
  /** Field path, e.g. "options", "answerKey.pairs[1].left"; batch paths start with "questions[i].". */
  path: string;
  message: string;
}

/** Field errors from a QuestionValidationException response, or [] for any other error. */
export function questionValidationErrors(err: unknown): QuestionValidationError[] {
  const data = (err as { response?: { data?: { data?: unknown } } })?.response?.data?.data;
  if (!Array.isArray(data)) return [];
  return data.filter((e): e is QuestionValidationError => typeof e?.path === 'string' && typeof e?.message === 'string');
}

/**
 * What the AI tab asks for. Sent to AI-01 (POST /manager/exams/ai/generate):
 * one call drafts 1..50 questions; the type counts and the difficulty counts
 * must each add up to the same total. Nothing is saved.
 */
export interface QuestionAiGenerateRequest {
  courseId: number;
  moduleId?: number | null;
  /** Question type → how many to draft. */
  questionTypeCounts: Partial<Record<QuestionType, number>>;
  /** Difficulty → how many to draft. */
  difficultyCounts: Partial<Record<QuestionDifficulty, number>>;
  /** Topic / instructions for the AI — sent as AI-01's `context` (max 2000). */
  topic?: string;
  language?: 'Vietnamese' | 'English';
}

/** AI-01 `context` limit. */
export const AI_CONTEXT_MAX = 2000;

/** ExamAiRequest (AI-01). */
interface ExamAiRequest {
  courseId: number;
  moduleId?: number | null;
  questionCount: number;
  difficultyDistribution: Record<QuestionDifficulty, number>;
  questionTypes: { questionType: QuestionType; count: number }[];
  language: 'vi' | 'en';
  context?: string;
}

/**
 * ExamAiDraftResponse.DraftQuestion (AI-01) — already in the Q-03 shape and
 * checked by QuestionValidator; drafts that fail are skipped with a warning.
 */
interface ExamAiDraftQuestion {
  content: string;
  questionType: string;
  difficulty: string | null;
  defaultPoints?: number | null;
  options?: { optionText: string; isCorrect?: boolean | null; orderIndex?: number | null }[] | null;
  answerKey?: unknown;
  explanation?: string | null;
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
  /** DIAGRAM only: the PlantUML behind questionMetadata.drawioXml. */
  plantUmlSource?: string | null;
}

interface ExamAiDraftResponse {
  questions?: ExamAiDraftQuestion[];
  warnings?: string[];
}

/** One AI-01 draft → the shape the editor accepts (same fields as a create request). */
function fromExamAiDraft(d: ExamAiDraftQuestion): QuestionAiDraft {
  const options = [...(d.options ?? [])]
    .filter(o => o?.optionText?.trim())
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((o, i) => ({ optionText: o.optionText, isCorrect: Boolean(o.isCorrect), orderIndex: i }));
  return {
    content: d.content ?? '',
    questionType: (d.questionType === 'MULTI_CHOICE' ? 'MULTIPLE_CHOICE' : d.questionType) as QuestionType,
    difficulty: (d.difficulty as QuestionDifficulty) ?? null,
    options,
    answerKey: d.answerKey ?? null,
    explanation: d.explanation ?? null,
    // plantUmlSource rides in metadata for the editor's preview; toMetadata never sends it.
    questionMetadata: d.plantUmlSource ? { ...d.questionMetadata, plantUmlSource: d.plantUmlSource } : d.questionMetadata ?? null,
    essayGradingRubric: d.essayGradingRubric ?? undefined,
  };
}

function fromExamAiDraftResponse(data: ExamAiDraftResponse | undefined): QuestionAiDraftResponse {
  return {
    questions: (data?.questions ?? [])
      .filter(q => q?.content?.trim())
      .map(q => ({ question: fromExamAiDraft(q), hasHashConflict: false, validationError: null })),
    warnings: data?.warnings ?? [],
  };
}

const AI_LANGUAGE_CODES = { Vietnamese: 'vi', English: 'en' } as const;

function toExamAiRequest(req: QuestionAiGenerateRequest): ExamAiRequest {
  const questionTypes = (Object.entries(req.questionTypeCounts) as [QuestionType, number][])
    .filter(([, count]) => count > 0)
    .map(([questionType, count]) => ({ questionType, count }));
  const context = req.topic?.trim();
  return {
    courseId: req.courseId,
    ...(req.moduleId != null ? { moduleId: req.moduleId } : {}),
    questionCount: questionTypes.reduce((n, t) => n + t.count, 0),
    difficultyDistribution: { EASY: req.difficultyCounts.EASY ?? 0, MEDIUM: req.difficultyCounts.MEDIUM ?? 0, HARD: req.difficultyCounts.HARD ?? 0 },
    questionTypes,
    language: AI_LANGUAGE_CODES[req.language ?? 'English'],
    ...(context ? { context: context.slice(0, AI_CONTEXT_MAX) } : {}),
  };
}

/** One drafted question — same fields as a create request, minus the location. */
export interface QuestionAiDraft {
  content: string;
  questionType: QuestionType;
  difficulty: QuestionDifficulty | null;
  options: AnswerOption[];
  answerKey?: unknown;
  explanation?: string | null;
  questionMetadata?: Record<string, unknown> | null;
  essayGradingRubric?: unknown;
}

/** One drafted question with the backend's checks on it. */
export interface QuestionAiPreview {
  question: QuestionAiDraft;
  /** An active question with the same content already exists in the course. */
  hasHashConflict: boolean;
  /** Set when the draft fails QuestionValidator — it is still returned so it can be fixed. */
  validationError: string | null;
}

export interface QuestionAiDraftResponse {
  questions: QuestionAiPreview[];
  /** Drafts the backend skipped (invalid, duplicate, outside the requested counts). */
  warnings: string[];
  /** FE only: the drafts are demo data from mockQuestionAiData, not the AI. */
  mock?: boolean;
}

/** One problem the Q-09 import found in a question block. */
export interface ImportBlockError {
  path: string;
  message: string;
  /** Line in the extracted text (0 when the error isn't tied to a line). */
  line: number;
}

/** A question as Q-09 read it — QuestionCreateRequest without course / module. */
export interface ImportedQuestionData extends QuestionAiDraft {
  defaultPoints?: number | null;
  /** ORDERING: option keys in the correct order (top level, not in answerKey). */
  correctOrder?: string[] | null;
}

/** One `[TYPE: ...]` block of the import file (ImportBlockResult). */
export interface ImportBlock {
  index: number;
  startLine: number;
  questionType: string;
  /** Missing when the block couldn't be read at all. */
  questionData: ImportedQuestionData | null;
  errors: ImportBlockError[];
}

/** Q-09 preview — nothing is saved; valid blocks go into the form and are saved through Q-03. */
export interface ImportPreviewResponse {
  fileName: string;
  fileType: 'PDF' | 'DOCX';
  totalBlocks: number;
  totalValid: number;
  totalErrors: number;
  blocks: ImportBlock[];
}

export interface ImportPreviewParams {
  courseId: number;
  moduleId?: number | null;
  /** Used for blocks without a DIFFICULTY line. */
  difficulty?: QuestionDifficulty;
}

/** Import file limits (PdfTextExtractor / DocxTextExtractor). */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_EXTENSIONS = ['.pdf', '.docx'] as const;
/** AI-02 material files (MaterialTextReader) — any layout, also plain text. */
export const AI_MATERIAL_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;

/** `VITE_AI_MOCK=true` uses demo data for AI generation (no AI quota spent). */
const AI_MOCK = import.meta.env.VITE_AI_MOCK === 'true';

export const questionService = {
  /**
   * Drafts questions with AI-01 — preview only; accepted drafts are saved
   * later through Q-03. AI-01 already drops drafts that fail its checks and
   * reports them in `warnings`.
   */
  async generateAiQuestions(payload: QuestionAiGenerateRequest, signal?: AbortSignal): Promise<QuestionAiDraftResponse> {
    if (AI_MOCK) return { ...(await mockGenerateAiQuestions(payload, signal)), mock: true };
    // Up to 50 questions in one AI call — give it time.
    const res = await apiClient.post<ApiResponse<ExamAiDraftResponse>>('/manager/exams/ai/generate', toExamAiRequest(payload), { timeout: 120000, signal });
    return fromExamAiDraftResponse(res.data?.data);
  },

  /**
   * AI-02: drafts questions from an uploaded material (PDF / DOCX / TXT, any
   * layout) with the same settings as AI-01. The backend reads the file's
   * text (first 30,000 characters) and `topic` goes along as extra instructions.
   */
  async generateAiQuestionsFromMaterial(file: File, payload: QuestionAiGenerateRequest, signal?: AbortSignal): Promise<QuestionAiDraftResponse> {
    if (AI_MOCK) return { ...(await mockGenerateAiQuestions(payload, signal)), mock: true };
    const req = toExamAiRequest(payload);
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', String(req.courseId));
    if (req.moduleId != null) form.append('moduleId', String(req.moduleId));
    form.append('questionCount', String(req.questionCount));
    form.append('difficultyDistribution', JSON.stringify(req.difficultyDistribution));
    form.append('questionTypes', JSON.stringify(req.questionTypes));
    form.append('language', req.language);
    if (req.context) form.append('context', req.context);
    // Upload + text extraction + up to 50 questions in one AI call.
    const res = await apiClient.post<ApiResponse<ExamAiDraftResponse>>('/manager/exams/ai/generate-from-material', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
      signal,
    });
    return fromExamAiDraftResponse(res.data?.data);
  },

  /** Q-09: reads a PDF / DOCX in the import template and returns the questions found — saves nothing. */
  async previewImport(file: File, params: ImportPreviewParams, signal?: AbortSignal): Promise<ImportPreviewResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('courseId', String(params.courseId));
    if (params.moduleId != null) form.append('moduleId', String(params.moduleId));
    if (params.difficulty) form.append('difficulty', params.difficulty);
    // The backend allows up to 20s to extract the text; leave room for the upload.
    const res = await apiClient.post<ApiResponse<ImportPreviewResponse>>('/manager/questions/import-preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
      signal,
    });
    return res.data.data;
  },

  /** Q-03: creates 1..50 questions in one transaction — all or nothing. */
  async createQuestionsBatch(courseId: number, moduleId: number | null, questions: QuestionCreateRequest[]): Promise<QuestionDetail[]> {
    const query = new URLSearchParams({ courseId: String(courseId) });
    if (moduleId != null) query.set('moduleId', String(moduleId));
    const res = await api.post<ApiResponse<QuestionDetail[]>>(`/manager/questions/batch?${query}`, questions);
    return res.data;
  },

  /** Q-04 */
  async getQuestionById(id: number | string): Promise<QuestionDetail> {
    const res = await api.get<ApiResponse<QuestionDetail>>(`/manager/questions/${id}`);
    return res.data;
  },

  /** Q-05 */
  async updateQuestion(id: number | string, payload: QuestionUpdateRequest): Promise<QuestionDetail> {
    const res = await api.request<ApiResponse<QuestionDetail>>({ method: 'put', url: `/manager/questions/${id}`, data: payload });
    return res.data;
  },

  /** Q-06: soft delete. */
  async deleteQuestion(id: number | string): Promise<void> {
    await api.request<ApiResponse<void>>({ method: 'delete', url: `/manager/questions/${id}` });
  },

  /** Q-07: copies the question (options, answer key, group) and returns the new one. */
  async duplicateQuestion(id: number | string): Promise<QuestionDetail> {
    const res = await api.post<ApiResponse<QuestionDetail>>(`/manager/questions/${id}/duplicate`);
    return res.data;
  },

  /** Q-08 */
  async updateQuestionStatus(id: number | string, status: QuestionStatus, lockVersion?: number | null): Promise<QuestionDetail> {
    const res = await api.request<ApiResponse<QuestionDetail>>({
      method: 'patch',
      url: `/manager/questions/${id}/status`,
      data: { status, lockVersion },
    });
    return res.data;
  },

  async getQuestions(params: QuestionListParams = {}): Promise<QuestionPage> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach(v => query.append(key, String(v)));
      else query.set(key, String(value));
    });
    const queryString = query.toString();
    const res = await api.get<ApiResponse<RawSpringPage<QuestionListItem>>>(
      `/manager/questions${queryString ? `?${queryString}` : ''}`,
    );
    return toQuestionPage(res.data);
  },
};
