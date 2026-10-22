import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import {
  getMockAdminCategories,
  getMockCategoryTreeSelect,
  createMockCategory,
  updateMockCategory,
  deleteMockCategory,
} from './mockCategoryData';

export interface AdminCategoryNode {
  categoryId: number;
  slug?: string;
  code: string;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  children: AdminCategoryNode[];
}

export interface AdminCategoryTreeResponse {
  items: AdminCategoryNode[];
}

export interface CreateCategoryRequest {
  name: string;
  isActive: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  isActive?: boolean;
}

export interface AdminCategoryItem {
  categoryId: number;
  slug?: string;
  code: string;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CategoryTreeSelectNode {
  categoryId: number;
  label: string;
  value: number;
  disabled: boolean;
  children: CategoryTreeSelectNode[];
}

export const categoryService = {
  async getAdminCategories(): Promise<AdminCategoryNode[]> {
    try {
      const res = await api.get<ApiResponse<AdminCategoryTreeResponse | AdminCategoryNode[]>>('/admin/categories');
      if (Array.isArray(res.data)) {
        return res.data;
      }
      if (res.data && 'items' in res.data && Array.isArray(res.data.items)) {
        return res.data.items;
      }
      return getMockAdminCategories();
    } catch {
      return getMockAdminCategories();
    }
  },

  async createCategory(payload: CreateCategoryRequest): Promise<AdminCategoryItem> {
    try {
      const res = await api.post<ApiResponse<AdminCategoryItem>>('/admin/categories', payload);
      return res.data;
    } catch {
      return createMockCategory(payload);
    }
  },

  async updateCategory(id: number | string, payload: UpdateCategoryRequest): Promise<AdminCategoryItem> {
    try {
      const res = await api.request<ApiResponse<AdminCategoryItem>>({
        method: 'put',
        url: `/admin/categories/${id}`,
        data: payload,
      });
      return res.data;
    } catch {
      return updateMockCategory(id, payload);
    }
  },

  async deleteCategory(id: number | string): Promise<void> {
    try {
      await api.request<ApiResponse<null>>({
        method: 'delete',
        url: `/admin/categories/${id}`,
      });
    } catch {
      deleteMockCategory(id);
    }
  },

  async getCategoryTreeSelect(): Promise<CategoryTreeSelectNode[]> {
    try {
      const res = await api.get<ApiResponse<CategoryTreeSelectNode[]>>('/admin/categories/tree');
      return res.data;
    } catch {
      return getMockCategoryTreeSelect();
    }
  },
};

