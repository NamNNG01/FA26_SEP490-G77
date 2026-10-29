import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

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
  lastWrongChoice: string | null;
  wrongCount: number;
  firstWrongAt: string | null;
  lastPracticedAt: string | null;
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
    page?: number; size?: number; type?: 'all' | 'wrong' | 'bookmarked'; examType?: string; categoryId?: number; search?: string;
  }) {
    const res = await api.get<ApiResponse<StudentPage<SavedQuestion>>>(`/student/questions/saved?${query(params)}`);
    return res.data;
  },

  async getWeakSpots(limit = 5) {
    const res = await api.get<ApiResponse<SavedQuestion[]>>(`/student/questions/weak-spots?${query({ limit })}`);
    return res.data;
  },

  async toggleBookmark(questionId: number) {
    const res = await api.post<ApiResponse<{ questionId: number; isBookmarked: boolean }>>(`/student/questions/${questionId}/bookmark`);
    return res.data;
  },

  async removeSavedQuestion(reviewId: number) {
    await api.request({ method: 'delete', url: `/student/questions/saved/${reviewId}` });
  },

  async startReviewSession(params: { type: 'wrong' | 'bookmarked' | 'all'; size: number }) {
    const res = await api.post<ApiResponse<{ attemptId: number; questions: unknown[] }>>('/student/questions/review-session', params);
    return res.data;
  },
};
