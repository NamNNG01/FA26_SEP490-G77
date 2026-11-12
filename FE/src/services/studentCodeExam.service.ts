import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentCodeExamService — CODE questions: run in the BE sandbox, grade against test cases.
 *
 * Endpoints (needs an enrollment in the exam's course):
 *   GET  /api/v1/student/code-exams/{examId}/questions     (CD-03) — languages, template, sample I/O
 *   POST /api/v1/student/code-exams/run                    (CD-04) — run on the sample, 5 s / 256 MB
 *   POST /api/v1/student/code-exams/submit                 (CD-05) — grade on every test case, writes the attempt answer
 *   GET  /api/v1/student/code-exams/languages              (CD-06)
 *   GET  /api/v1/student/code-exams/{examId}/submissions   (CD-07) — history, paged
 */

/** JAVA / PYTHON / C / CPP today — CD-06 is the source of truth. */
export type CodeLanguage = string;

/** CD-05 grading budget: every question's test cases run in the sandbox before the BE answers. */
const CODE_SUBMIT_TIMEOUT_MS = 120_000;

/** BE limit on `sourceCode` (CD-04 / CD-05). */
export const SOURCE_CODE_MAX_BYTES = 100 * 1024;

export interface CodeLanguageInfo {
  id: CodeLanguage;
  /** e.g. "Java 17". */
  name: string;
}

export interface CodeQuestion {
  questionId: number;
  orderIndex: number;
  content: string;
  languages: CodeLanguage[];
  codeTemplate: string | null;
  sampleInput: string | null;
  sampleOutput: string | null;
}

/** CD-03 — no hidden test cases, no answers. */
export interface CodeExamQuestions {
  examId: number;
  title: string;
  durationMinutes: number | null;
  questions: CodeQuestion[];
}

/** CD-04 — a compile error comes back as FAILED with `stderr`. */
export interface CodeRunResult {
  status: 'COMPLETED' | 'FAILED' | string;
  stdout: string | null;
  stderr: string | null;
  executionTimeMs: number | null;
}

export interface CodeSubmitAnswer {
  questionId: number;
  language: CodeLanguage;
  sourceCode: string;
}

/** CD-05 — PASSED only when every test case passes. */
export interface CodeSubmitResult {
  questionId: number;
  status: 'PASSED' | 'FAILED' | string;
  testCasesPassed: number;
  testCasesTotal: number;
  failedTestCase?: number | null;
}

/**
 * CD-07 — one judged fixture. The API omits null fields, so a hidden fixture carries neither its
 * input nor its expected output at all.
 */
export interface CodeTestCaseOutcome {
  testCaseId?: number | null;
  orderIndex?: number | null;
  hidden: boolean;
  passed: boolean;
  inputData?: string | null;
  expectedOutput?: string | null;
  /** What the student's program printed for this fixture; absent on submissions judged before the BE stored it. */
  actualOutput?: string | null;
}

/** CD-07 */
export interface CodeSubmission {
  submissionId: number;
  questionId: number;
  language: CodeLanguage;
  status: 'PASSED' | 'FAILED' | string;
  testCasesPassed: number;
  testCasesTotal: number;
  /** Per-fixture verdicts in judging order; empty for submissions judged before this field existed. */
  testCases?: CodeTestCaseOutcome[] | null;
  createdAt: string;
}

export const studentCodeExamService = {
  /** CD-03 */
  async getQuestions(examId: number | string): Promise<CodeExamQuestions> {
    const res = await api.get<ApiResponse<CodeExamQuestions>>(`/student/code-exams/${examId}/questions`);
    return res.data;
  },

  /** CD-04 */
  async run(body: { questionId: number; language: CodeLanguage; sourceCode: string; stdin?: string }): Promise<CodeRunResult> {
    const res = await api.post<ApiResponse<CodeRunResult>>('/student/code-exams/run', body);
    return res.data;
  },

  /** CD-05. The BE runs every test case in the sandbox, which can take well past the default 15 s timeout. */
  async submit(examId: number, answers: CodeSubmitAnswer[]): Promise<CodeSubmitResult[]> {
    const res = await api.request<ApiResponse<{ results: CodeSubmitResult[] }>>({
      method: 'post',
      url: '/student/code-exams/submit',
      data: { examId, answers },
      timeout: CODE_SUBMIT_TIMEOUT_MS,
    });
    return res.data?.results ?? [];
  },

  /** CD-06 */
  async getLanguages(): Promise<CodeLanguageInfo[]> {
    const res = await api.get<ApiResponse<CodeLanguageInfo[]>>('/student/code-exams/languages');
    return res.data ?? [];
  },

  /** CD-07 — newest first. */
  async getSubmissions(examId: number | string, page = 0, size = 10): Promise<PageResponse<CodeSubmission>> {
    const res = await api.get<ApiResponse<PageResponse<CodeSubmission>>>(
      `/student/code-exams/${examId}/submissions?page=${page}&size=${size}`,
    );
    return res.data;
  },

  /** CD-07, every page. */
  async getAllSubmissions(examId: number | string): Promise<CodeSubmission[]> {
    const items: CodeSubmission[] = [];
    for (let page = 0; ; page++) {
      const res = await studentCodeExamService.getSubmissions(examId, page, 100);
      items.push(...res.content);
      if (res.last || res.content.length === 0) return items;
    }
  },
};
