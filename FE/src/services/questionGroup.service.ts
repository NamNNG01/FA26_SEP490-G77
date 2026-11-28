import { api } from "./api";
import type { ApiResponse } from "@/types/api";
import type { QuestionCreateRequest, QuestionDetail } from "./question.service";

/**
 * QuestionGroupService — shared passages that several questions read from.
 *
 * Endpoints (QuestionGroupController):
 *   GET    /api/v1/manager/question-groups                  (G-01)
 *   POST   /api/v1/manager/question-groups                  (G-02)
 *   PUT    /api/v1/manager/question-groups/{id}             (G-03) — updateQuestionGroup
 *   DELETE /api/v1/manager/question-groups/{id}             (G-04) — deleteQuestionGroup
 *   POST   /api/v1/manager/questions/groups-with-questions  — createGroupWithQuestions (requires >= 1 question)
 *   POST   /api/v1/manager/questions/groups/{id}/publish    — publishGroup
 */

/** QuestionGroupResponse */
export interface QuestionGroup {
  groupId: number;
  courseId: number | null;
  courseName?: string | null;
  moduleId: number | null;
  moduleName?: string | null;
  /** The one kind of question the group holds: QUIZ | ESSAY | CODE | DIAGRAM | DIAGRAM_ESSAY (null on groups made before kinds). */
  questionType: string | null;
  title: string | null;
  passageText: string | null;
  questionCount: number;
  publishedQuestionCount?: number;
  draftQuestionCount?: number;
}

export interface QuestionGroupBatchCreateRequest {
  courseId: number;
  moduleId?: number | null;
  questionType: string;
  title: string;
  passageText: string;
  questions: QuestionCreateRequest[];
}

export interface QuestionGroupBatchCreateResponse {
  group: QuestionGroup;
  questions: QuestionDetail[];
}

export interface QuestionGroupCreateRequest {
  courseId: number;
  moduleId?: number | null;
  /** Required: QUIZ | ESSAY | CODE | DIAGRAM. */
  questionType: string;
  title?: string;
  passageText?: string;
}

/** QuestionGroupUpdateRequest */
export interface QuestionGroupUpdateRequest {
  questionType?: string;
  title?: string;
  passageText?: string;
}

/** PageResponse<T> */
interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export const questionGroupService = {
  async getQuestionGroups(
    params: {
      courseId?: number;
      moduleId?: number;
      questionType?: string;
      search?: string;
      page?: number;
      size?: number;
    } = {},
  ): Promise<PageResponse<QuestionGroup>> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    const qs = query.toString();
    const res = await api.get<ApiResponse<PageResponse<QuestionGroup>>>(
      `/manager/question-groups${qs ? `?${qs}` : ""}`,
    );
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error("The question group response is invalid.");
    }
    return res.data;
  },

  async createQuestionGroup(payload: QuestionGroupCreateRequest): Promise<QuestionGroup> {
    const res = await api.post<ApiResponse<QuestionGroup>>("/manager/question-groups", payload);
    if (!res.data) throw new Error("The question group response is invalid.");
    return res.data;
  },

  /** Atomically creates a question group together with 1..50 questions (rolling back the group if any question fails). */
  async createGroupWithQuestions(
    payload: QuestionGroupBatchCreateRequest,
  ): Promise<QuestionGroupBatchCreateResponse> {
    const res = await api.post<ApiResponse<QuestionGroupBatchCreateResponse>>(
      "/manager/questions/groups-with-questions",
      payload,
    );
    return res.data;
  },

  /** Publishes every draft question inside the group. */
  async publishGroup(groupId: number): Promise<QuestionGroup> {
    const res = await api.post<ApiResponse<QuestionGroup>>(
      `/manager/questions/groups/${groupId}/publish`,
      {},
    );
    return res.data;
  },

  /** G-03: omitted fields are kept; the change applies to every question in the group. */
  async updateQuestionGroup(
    groupId: number,
    payload: QuestionGroupUpdateRequest,
  ): Promise<QuestionGroup> {
    const res = await api.request<ApiResponse<QuestionGroup>>({
      method: "put",
      url: `/manager/question-groups/${groupId}`,
      data: payload,
    });
    return res.data;
  },

  /** G-04: deletes a group and turns its questions standalone (blocked if used by a published exam). */
  async deleteQuestionGroup(groupId: number): Promise<void> {
    await api.request<ApiResponse<null>>({
      method: "delete",
      url: `/manager/question-groups/${groupId}`,
    });
  },
};
