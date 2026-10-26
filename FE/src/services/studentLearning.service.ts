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
};
