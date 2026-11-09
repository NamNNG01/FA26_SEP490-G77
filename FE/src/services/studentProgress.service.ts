import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';
import { downloadFile } from '@/utils/downloadFile';

export interface CourseProgress {
  courseId: number;
  totalExams: number;
  completedExams: number;
  totalDecks: number;
  learnedDecks: number;
  averageScore: number | null;
  progress: number;
  recentAttempts: { attemptId: number; examTitle: string; totalScore: number; maxScore: number; submittedAt: string }[];
}

export interface LearningActivity {
  activityType: 'EXAM' | 'FLASHCARD' | 'QUIZ';
  refId: number;
  title: string;
  score?: number | null;
  maxScore?: number | null;
  learnedCount?: number;
  totalCards?: number;
  happenedAt: string;
}

export interface SavedQuestion {
  reviewId: number;
  questionId: number;
  isWrong: boolean;
  isBookmarked: boolean;
  questionText: string;
  questionType: string;
  options: { optionId: number; optionText: string }[];
  correctOptionIds: number[];
  wrongCount: number;
  firstWrongAt: string | null;
  lastPracticedAt: string | null;
}

export interface ReviewSessionRequest {
  type: 'wrong' | 'bookmarked' | 'all';
  examType: 'QUIZ' | 'ESSAY';
  size: number;
  courseId: number;
}

export interface SavedQuestionExportParams {
  type?: 'all' | 'wrong' | 'bookmarked';
  examType?: 'QUIZ' | 'ESSAY';
  courseId?: number;
}

export interface ReviewSessionResponse {
  examId: number;
  attemptId: number;
  examType: 'QUIZ' | 'ESSAY';
  title: string;
  maxScore: number;
  durationMinutes: number;
  questions: unknown[];
}

function query(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString();
}

export const studentProgressService = {
  async getCourseProgress(courseId: number | string) {
    const res = await api.get<ApiResponse<CourseProgress>>(`/student/progress/courses/${courseId}`);
    return res.data;
  },

  async getActivities(params: { page?: number; size?: number; type?: LearningActivity['activityType'] }) {
    const res = await api.get<ApiResponse<StudentPage<LearningActivity>>>(`/student/progress/activities?${query(params)}`);
    return res.data;
  },

  async getSavedQuestions(params: {
    page?: number; size?: number; type?: 'all' | 'wrong' | 'bookmarked'; examType?: 'QUIZ' | 'ESSAY'; courseId?: number; search?: string;
  }) {
    const res = await api.get<ApiResponse<StudentPage<SavedQuestion>>>(`/student/questions/saved?${query(params)}`);
    return res.data;
  },

  async toggleBookmark(questionId: number) {
    const res = await api.post<ApiResponse<{ questionId: number; isBookmarked: boolean }>>(`/student/questions/${questionId}/bookmark`);
    return res.data;
  },

  async removeSavedQuestion(reviewId: number) {
    await api.request({ method: 'delete', url: `/student/questions/saved/${reviewId}` });
  },

  async bookmarkAllSavedQuestions() {
    await api.post<ApiResponse<null>>('/student/questions/bookmarks/all');
  },

  async clearAllBookmarks() {
    await api.request<ApiResponse<null>>({ method: 'delete', url: '/student/questions/bookmarks' });
  },

  async deleteAllSavedQuestions() {
    await api.request<ApiResponse<null>>({ method: 'delete', url: '/student/questions/saved' });
  },

  async exportSavedQuestionsPdf(params: SavedQuestionExportParams = {}) {
    const qs = query(params);
    await downloadFile(`/student/questions/saved/export/pdf${qs ? `?${qs}` : ''}`, 'question-notebook.pdf');
  },

  async startReviewSession(params: ReviewSessionRequest) {
    const res = await api.post<ApiResponse<ReviewSessionResponse>>('/student/questions/review-session', params);
    return res.data;
  },
};
