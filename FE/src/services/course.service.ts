import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

export interface CategoryResponse {
  categoryId: number;
  name: string;
  slug: string;
  description: string | null;
  parentId: number | null;
  parentName: string | null;
}

export interface CourseManagerItem {
  userId: number;
  fullName: string;
  primary?: boolean;
  email?: string;
  avatarUrl?: string | null;
}

export interface CourseSummaryItem {
  courseId: number;
  title: string;
  slug: string;
  categoryId: number;
  categoryName: string;
  managerId: number;
  managerName: string;
  managers?: CourseManagerItem[];
  thumbnailUrl: string | null;
  price: number;
  isPublished: boolean;
  moduleCount: number;
  studentCount: number;
  examCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface CourseListParams {
  search?: string;
  categoryId?: number;
  isPublished?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export interface CourseModuleResponse {
  moduleId: number;
  courseId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  questionCount: number;
  examCount: number;
}

export interface CreateModuleRequest {
  title: string;
  description?: string;
  orderIndex?: number;
}

export interface UpdateModuleRequest {
  title?: string;
  description?: string;
  orderIndex?: number;
}

export interface CourseDetailResponse {
  courseId: number;
  title: string;
  slug: string;
  categoryId: number;
  categoryName: string;
  managerId: number;
  managerName: string;
  managers?: CourseManagerItem[];
  thumbnailUrl: string | null;
  price: number;
  isPublished: boolean;
  moduleCount: number;
  studentCount: number;
  examCount: number;
  description: string | null;
  modules: CourseModuleResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseRequest {
  title: string;
  categoryId: number;
  description?: string;
  thumbnailUrl?: string;
  price?: number;
  managerId: number;
  managerIds?: number[];
}

export interface UpdateCourseRequest {
  title?: string;
  categoryId?: number;
  description?: string;
  thumbnailUrl?: string;
  price?: number;
  managerId?: number;
  managerIds?: number[];
}

export interface PublishCourseResponse {
  courseId: number;
  title: string;
  slug: string;
  isPublished: boolean;
  moduleCount: number;
  studentCount: number;
  examCount: number;
  updatedAt: string;
}

export interface CourseStudentItem {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  enrolledAt: string;
  status: 'ACTIVE' | 'COMPLETED' | string;
  progress: number;
}

export interface CourseStudentsParams {
  search?: string;
  status?: string;
  page?: number;
  size?: number;
}

export const courseService = {
  async getCategories(): Promise<CategoryResponse[]> {
    const res = await api.get<ApiResponse<CategoryResponse[]>>('/categories');
    if (!Array.isArray(res.data)) throw new Error('The category response is invalid.');
    return res.data;
  },

  async getCourses(params?: CourseListParams): Promise<PageResponse<CourseSummaryItem>> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.categoryId !== undefined) query.set('categoryId', String(params.categoryId));
    if (params?.isPublished !== undefined) query.set('isPublished', String(params.isPublished));
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.size !== undefined) query.set('size', String(params.size));
    if (params?.sort) query.set('sort', params.sort);

    const queryString = query.toString();
    const endpoint = `/manager/courses${queryString ? `?${queryString}` : ''}`;
    const res = await api.get<ApiResponse<PageResponse<CourseSummaryItem>>>(endpoint);
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error('The course response is invalid.');
    }
    return res.data;
  },

  async getCourseById(id: number | string): Promise<CourseDetailResponse> {
    const res = await api.get<ApiResponse<CourseDetailResponse>>(`/manager/courses/${id}`);
    if (!res.data || !res.data.courseId) throw new Error('The course response is invalid.');
    return res.data;
  },

  async createCourse(payload: CreateCourseRequest): Promise<CourseDetailResponse> {
    // No mock fallback: a fake success hides BE validation errors (e.g. managerId not a COURSE_MANAGER).
    const res = await api.post<ApiResponse<CourseDetailResponse>>('/manager/courses', payload);
    return res.data;
  },

  async updateCourse(id: number | string, payload: UpdateCourseRequest): Promise<CourseDetailResponse> {
    const res = await api.request<ApiResponse<CourseDetailResponse>>({
      method: 'put',
      url: `/manager/courses/${id}`,
      data: payload,
    });
    return res.data;
  },

  async updateCourseManagers(
    id: number | string,
    payload: Pick<UpdateCourseRequest, 'managerId' | 'managerIds'>,
  ): Promise<CourseDetailResponse> {
    const res = await api.request<ApiResponse<CourseDetailResponse>>({
      method: 'put',
      url: `/manager/courses/${id}`,
      data: payload,
    });
    return res.data;
  },

  async publishCourse(id: number | string, isPublished: boolean): Promise<PublishCourseResponse> {
    const res = await api.request<ApiResponse<PublishCourseResponse>>({
      method: 'patch',
      url: `/manager/courses/${id}/publish`,
      data: { isPublished },
    });
    return res.data;
  },

  async deleteCourse(id: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({
      method: 'delete',
      url: `/manager/courses/${id}`,
    });
  },

  async getCourseModules(courseId: number | string): Promise<CourseModuleResponse[]> {
    const res = await api.get<ApiResponse<CourseModuleResponse[]>>(`/manager/courses/${courseId}/modules`);
    if (!Array.isArray(res.data)) throw new Error('The course modules response is invalid.');
    return res.data;
  },

  async createModule(courseId: number | string, payload: CreateModuleRequest): Promise<CourseModuleResponse> {
    const res = await api.post<ApiResponse<CourseModuleResponse>>(`/manager/courses/${courseId}/modules`, payload);
    return res.data;
  },

  async updateModule(moduleId: number | string, payload: UpdateModuleRequest): Promise<CourseModuleResponse> {
    const res = await api.request<ApiResponse<CourseModuleResponse>>({
      method: 'put',
      url: `/manager/modules/${moduleId}`,
      data: payload,
    });
    return res.data;
  },

  async deleteModule(moduleId: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({
      method: 'delete',
      url: `/manager/modules/${moduleId}`,
    });
  },

  async getCourseStudents(courseId: number | string, params?: CourseStudentsParams): Promise<PageResponse<CourseStudentItem>> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.size !== undefined) query.set('size', String(params.size));

    const queryString = query.toString();
    const endpoint = `/manager/courses/${courseId}/students${queryString ? `?${queryString}` : ''}`;
    const res = await api.get<ApiResponse<PageResponse<CourseStudentItem>>>(endpoint);
    if (!res.data || !Array.isArray(res.data.content)) {
      throw new Error('The course students response is invalid.');
    }
    return res.data;
  },
};
