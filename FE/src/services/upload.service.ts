import { apiClient } from './axios';
import type { ApiResponse, UserResponse } from '@/auth/authContext';
import type { CourseDetailResponse } from './course.service';

/**
 * Image uploads to Cloudinary through the BE (see BE/docs/image-upload-fe-guide.md).
 *   POST /users/me/avatar                  USER-03 → UserResponse
 *   POST /manager/courses/{id}/thumbnail   C-15    → CourseDetailResponse
 *   POST /manager/uploads                  D3      → UploadedImage
 */

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  url: string;
  publicId: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

/** Same rules as the BE, checked first so the user is not made to wait for a 400. */
export function imageFileError(file: File): string | null {
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) return 'Only JPG, PNG, WEBP and GIF images are supported.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image must not exceed 5 MB.';
  return null;
}

async function upload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<ApiResponse<T>>(url, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.data;
}

export const uploadService = {
  uploadAvatar: (file: File) => upload<UserResponse>('/users/me/avatar', file),
  uploadCourseThumbnail: (courseId: number | string, file: File) =>
    upload<CourseDetailResponse>(`/manager/courses/${courseId}/thumbnail`, file),
  uploadMedia: (file: File) => upload<UploadedImage>('/manager/uploads', file),
};
