import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

export interface StudentPage<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface MyCourse {
  courseId: number;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  price: number;
  category: { categoryId: number; name: string } | null;
  manager: { userId: number; fullName: string } | null;
  enrolledAt: string;
  status: string;
  progress: number;
  publishedExamCount: number;
  deckCount: number;
  nextExam: { examId: number; title: string; durationMinutes: number; maxScore: number } | null;
}

export interface CourseExam {
  examId: number;
  title: string;
  durationMinutes: number;
  maxScore: number;
  questionCount: number;
  myAttemptCount: number;
  myBestScore: number | null;
  myLastStatus: string | null;
  hasActiveAttempt: boolean;
}

export interface CourseDeck {
  deckId: number;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
  learnedCount: number;
  starredCount: number;
}

export interface StudentExamDetail {
  examId: number;
  courseId: number;
  courseTitle: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  maxScore: number;
  questionCount: number;
  publishedAt: string;
  myStats: { attemptCount: number; bestScore: number | null; lastSubmittedAt: string | null; lastAttemptId: number | null };
  actions: { canStart: boolean; activeAttemptId: number | null; canViewHistory: boolean; reason: string | null };
}

export interface StudentActiveAttempt {
  attemptId: number;
  examId: number;
  startTime: string;
  deadlineAt: string | null;
  status: string;
  durationMinutes: number;
  maxScore: number;
}

export interface MyExam {
  examId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  maxScore: number;
  attemptCount: number;
  bestScore: number | null;
}

export interface StudentCard {
  cardId: number;
  frontText: string;
  backText: string;
  status: string;
  isStarred: boolean;
}

export const studentLearningService = {
  async getMyCourses(params: { page?: number; size?: number; status?: 'ACTIVE' | 'COMPLETED' }) {
    const query = new URLSearchParams({ page: String(params.page ?? 0), size: String(params.size ?? 20) });
    if (params.status) query.set('status', params.status);
    const response = await api.get<ApiResponse<StudentPage<MyCourse>>>(`/student/my-courses?${query.toString()}`);
    if (!response.data || !Array.isArray(response.data.content)) throw new Error('My courses response is invalid.');
    return response.data;
  },

  async getCourseExams(courseId: number, params: { page?: number; size?: number; sort?: 'newest' | 'title' } = {}) {
    const query = new URLSearchParams({ page: String(params.page ?? 0), size: String(params.size ?? 20), sort: params.sort ?? 'newest' });
    const response = await api.get<ApiResponse<StudentPage<CourseExam>>>(`/student/courses/${courseId}/exams?${query.toString()}`);
    if (!response.data || !Array.isArray(response.data.content)) throw new Error('Course exams response is invalid.');
    return response.data;
  },

  async getCourseDecks(courseId: number) {
    const response = await api.get<ApiResponse<CourseDeck[]>>(`/student/courses/${courseId}/decks`);
    if (!Array.isArray(response.data)) throw new Error('Course flashcards response is invalid.');
    return response.data;
  },

  async getDeckCards(deckId: number, page = 0, size = 20) {
    const query = new URLSearchParams({ page: String(page), size: String(size) });
    const response = await api.get<ApiResponse<StudentPage<StudentCard>>>(`/student/decks/${deckId}/cards?${query.toString()}`);
    if (!response.data || !Array.isArray(response.data.content)) throw new Error('Flashcards response is invalid.');
    return response.data;
  },

  async getExam(examId: number) {
    const response = await api.get<ApiResponse<StudentExamDetail>>(`/student/exams/${examId}`);
    if (!response.data?.examId) throw new Error('Exam response is invalid.');
    return response.data;
  },

  async getActiveAttempt(examId: number) {
    const response = await api.get<ApiResponse<StudentActiveAttempt | null>>(`/student/exams/${examId}/active-attempt`);
    return response.data;
  },

  async getMyExams(params: { page?: number; size?: number; sort?: 'lastActivity' | 'title' } = {}) {
    const query = new URLSearchParams({ page: String(params.page ?? 0), size: String(params.size ?? 20), sort: params.sort ?? 'lastActivity' });
    const response = await api.get<ApiResponse<StudentPage<MyExam>>>(`/student/my-exams?${query.toString()}`);
    if (!response.data || !Array.isArray(response.data.content)) throw new Error('My exams response is invalid.');
    return response.data;
  },
};
