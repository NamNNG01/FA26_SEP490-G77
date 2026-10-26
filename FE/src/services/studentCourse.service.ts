import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

export interface StudentCourseItem {
  courseId: number;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  price: number;
  category: { categoryId: number; name: string } | null;
  manager: { userId: number; fullName: string } | null;
  publishedExamCount: number;
  deckCount: number;
  isEnrolled?: boolean;
}

export interface StudentCoursePage {
  content: StudentCourseItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface StudentCourseDetail extends StudentCourseItem {
  description: string | null;
  modules: { moduleId: number; title: string; orderIndex: number }[];
  stats: { publishedExamCount: number; deckCount: number };
  enrollment: { isEnrolled: boolean; status: string | null; progress: number | null } | null;
}

export const studentCourseService = {
  async getCourses(params: { page: number; size: number; keyword?: string; sort: 'newest' | 'title' }) {
    const query = new URLSearchParams({ page: String(params.page), size: String(params.size), sort: params.sort });
    if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
    const response = await api.get<ApiResponse<StudentCoursePage>>(`/student/courses?${query.toString()}`);
    if (!response.data || !Array.isArray(response.data.content)) throw new Error('Course list response is invalid.');
    return response.data;
  },

  async getCourse(courseId: number) {
    const response = await api.get<ApiResponse<StudentCourseDetail>>(`/student/courses/${courseId}`);
    if (!response.data?.courseId) throw new Error('Course response is invalid.');
    return response.data;
  },
};
