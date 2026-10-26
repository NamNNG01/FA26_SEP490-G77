import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * StudentCourseService — learner-side reads. Students cannot call the
 * /manager/** endpoints (403), so every student screen goes through here.
 *
 * Endpoints (StudentCourseController, StudentExamController):
 *   GET /api/v1/student/courses                     (CL-01) — public catalog
 *   GET /api/v1/student/courses/{courseId}          (CL-02) — public detail + my enrollment
 *   GET /api/v1/student/my-courses                  (MC-01)
 *   GET /api/v1/student/courses/{courseId}/exams    (MC-02) — ACTIVE enrollment only
 *   GET /api/v1/student/courses/{courseId}/decks    (MC-03) — ACTIVE enrollment only
 *   GET /api/v1/student/decks/{deckId}/cards        (MC-04)
 *   GET /api/v1/student/my-exams                    (ME-01) — exams the student has attempted
 */

export interface CategoryRef {
  categoryId: number;
  name: string;
}

export interface ManagerRef {
  userId: number;
  fullName: string;
}

/** `sort` accepted by CL-01 and MC-02. */
export type StudentSort = 'newest' | 'title';

/** Enrollment.status — MC-02/03/04 refuse anything but ACTIVE. */
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED';

/** CL-01 CourseCardDto */
export interface StudentCourseCard {
  courseId: number;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  price: number | null;
  category: CategoryRef | null;
  manager: ManagerRef | null;
  publishedExamCount: number;
  deckCount: number;
  isEnrolled: boolean | null;
}

export type StudentCourseItem = StudentCourseCard;
export type StudentCoursePage = PageResponse<StudentCourseCard>;

/** CL-02 CourseDetailDto */
export interface StudentCourseDetail {
  courseId: number;
  title: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  price: number | null;
  category: CategoryRef | null;
  manager: ManagerRef | null;
  modules: { moduleId: number; title: string; orderIndex: number }[];
  stats: { publishedExamCount: number; deckCount: number };
  isEnrolled?: boolean;
  publishedExamCount?: number;
  deckCount?: number;
  /** null for guests. */
  enrollment: { isEnrolled: boolean; status: EnrollmentStatus | null; progress: number | null } | null;
}

/** MC-01 MyCourseDto */
export interface MyCourse {
  courseId: number;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  price: number | null;
  category: CategoryRef | null;
  manager: ManagerRef | null;
  enrolledAt: string;
  status: EnrollmentStatus;
  progress: number | null;
  publishedExamCount: number;
  deckCount: number;
  nextExam: { examId: number; title: string; durationMinutes: number; maxScore: number } | null;
}

/** MC-02 CourseExamDto */
export interface CourseExam {
  examId: number;
  title: string;
  durationMinutes: number | null;
  maxScore: number | null;
  questionCount: number;
  myAttemptCount: number;
  myBestScore: number | null;
  myLastStatus: string | null;
  hasActiveAttempt: boolean;
  /** Module the exam is filed under; null = not in any module. */
  moduleId: number | null;
  /** From the question types; MIXED when several kinds, null/absent when the exam has none. */
  examKind?: StudentExamKind | null;
}

export type StudentExamKind = 'QUIZ' | 'ESSAY' | 'CODE' | 'DIAGRAM' | 'MIXED';

/** MC-03 DeckDto */
export interface StudentDeck {
  deckId: number;
  title: string;
  description: string | null;
  isPublic: boolean;
  cardCount: number;
  learnedCount: number;
  starredCount: number;
  /** Not sent by MC-03 yet (decks belong to the course, not a module) — such decks sit at the course root. */
  moduleId?: number | null;
}

/** MC-04 CardDto — `status` / `isStarred` are the caller's own progress. */
export interface StudentCard {
  cardId: number;
  frontText: string;
  backText: string;
  status: string | null;
  isStarred: boolean | null;
}

/** ME-01 MyExamDto */
export interface MyExam {
  examId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  maxScore: number | null;
  attemptCount: number;
  bestScore: number | null;
}

export interface PageParams {
  /** 0-based. */
  page?: number;
  /** 1–100. */
  size?: number;
}

function query(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.append(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const studentCourseService = {
  /** CL-01 */
  async getCourses(
    params: PageParams & { categoryId?: number; keyword?: string; sort?: StudentSort } = {},
  ): Promise<PageResponse<StudentCourseCard>> {
    const res = await api.get<ApiResponse<PageResponse<StudentCourseCard>>>(`/student/courses${query({ ...params })}`);
    return res.data;
  },

  /** CL-02 */
  async getCourseDetail(courseId: number | string): Promise<StudentCourseDetail> {
    const res = await api.get<ApiResponse<StudentCourseDetail>>(`/student/courses/${courseId}`);
    return res.data;
  },

  async getCourse(courseId: number | string): Promise<StudentCourseDetail> {
    return studentCourseService.getCourseDetail(courseId);
  },

  /** MC-01 — omit `status` for every enrollment. */
  async getMyCourses(params: PageParams & { status?: EnrollmentStatus } = {}): Promise<PageResponse<MyCourse>> {
    const res = await api.get<ApiResponse<PageResponse<MyCourse>>>(`/student/my-courses${query({ ...params })}`);
    return res.data;
  },

  /** MC-02 */
  async getCourseExams(
    courseId: number | string,
    params: PageParams & { sort?: StudentSort } = {},
  ): Promise<PageResponse<CourseExam>> {
    const res = await api.get<ApiResponse<PageResponse<CourseExam>>>(
      `/student/courses/${courseId}/exams${query({ ...params })}`,
    );
    return res.data;
  },

  /** MC-02, every page — the course page groups exams into module folders. */
  async getAllCourseExams(courseId: number | string): Promise<CourseExam[]> {
    const exams: CourseExam[] = [];
    for (let page = 0; ; page++) {
      const res = await studentCourseService.getCourseExams(courseId, { page, size: 100, sort: 'title' });
      exams.push(...res.content);
      if (res.last || res.content.length === 0) return exams;
    }
  },

  /** MC-03 — not paged. */
  async getCourseDecks(courseId: number | string): Promise<StudentDeck[]> {
    const res = await api.get<ApiResponse<StudentDeck[]>>(`/student/courses/${courseId}/decks`);
    return res.data;
  },

  /** MC-04 */
  async getDeckCards(deckId: number | string, params: PageParams = {}): Promise<PageResponse<StudentCard>> {
    const res = await api.get<ApiResponse<PageResponse<StudentCard>>>(`/student/decks/${deckId}/cards${query({ ...params })}`);
    return res.data;
  },

  /** MC-04, every page — a study session needs the whole deck. */
  async getAllDeckCards(deckId: number | string): Promise<StudentCard[]> {
    const cards: StudentCard[] = [];
    for (let page = 0; ; page++) {
      const res = await studentCourseService.getDeckCards(deckId, { page, size: 100 });
      cards.push(...res.content);
      if (res.last || res.content.length === 0) return cards;
    }
  },

  /** ME-01 */
  async getMyExams(params: PageParams = {}): Promise<PageResponse<MyExam>> {
    const res = await api.get<ApiResponse<PageResponse<MyExam>>>(`/student/my-exams${query({ ...params })}`);
    return res.data;
  },
};
