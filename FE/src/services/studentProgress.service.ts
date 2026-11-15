import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';
import { downloadFile } from '@/utils/downloadFile';

/** LP-01 done / total of one part; null when the scope has nothing of that kind. */
export interface ProgressCount {
  done: number;
  total: number;
}

/** LP-01 — one module, or the course's General pool (moduleId null). */
export interface ModuleProgress {
  moduleId: number | null;
  title: string;
  /** 0–100; null when the module has nothing to count. */
  progress: number | null;
  questions: ProgressCount | null;
  exams: ProgressCount | null;
  decks: ProgressCount | null;
}

/** LP-01 — worked out live by the BE, which also stores `progress` on the enrollment. */
export interface CourseProgress {
  courseId: number;
  progress: number;
  questions: ProgressCount | null;
  exams: ProgressCount | null;
  decks: ProgressCount | null;
  modules: ModuleProgress[];
  totalExams: number;
  completedExams: number;
  totalDecks: number;
  learnedDecks: number;
  averageScore: number | null;
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

export type ReviewSessionExamType = 'QUIZ' | 'ESSAY' | 'CODE';

export interface ReviewSessionRequest {
  type: 'wrong' | 'bookmarked' | 'all';
  examType: ReviewSessionExamType;
  size: number;
  durationMinutes: number;
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
  examType: ReviewSessionExamType;
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
  /** LP-01 — reading it also stores the live percent on the enrollment (what CL-02 and the dashboard read). */
  async getCourseProgress(courseId: number | string): Promise<CourseProgress> {
    const res = await api.get<ApiResponse<CourseProgress>>(`/student/progress/courses/${courseId}`);
    return res.data;
  },

  /**
   * Fire-and-forget LP-01 after something that moves the course's progress (a submit, a practice
   * answer, a deck learned), so the stored percent is fresh. Failures are ignored: the next read retries.
   */
  syncCourseProgress(courseId: number | string | null | undefined): void {
    if (courseId == null || courseId === '') return;
    api.get(`/student/progress/courses/${courseId}`).catch(() => {});
  },

  /**
   * LP-01 for many courses, a few at a time; `onEach` gets each live percent as it comes in.
   * A failed course is skipped (its listed percent stays). Stops early once `cancelled()` is true.
   */
  async refreshCoursesProgress(
    courseIds: number[],
    onEach: (courseId: number, progress: number) => void,
    cancelled: () => boolean = () => false,
    concurrency = 4,
  ): Promise<void> {
    const queue = [...courseIds];
    const worker = async () => {
      for (let id = queue.shift(); id != null && !cancelled(); id = queue.shift()) {
        try {
          const p = await studentProgressService.getCourseProgress(id);
          if (!cancelled()) onEach(id, p.progress);
        } catch {
          // Keep the percent the list came with.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
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
