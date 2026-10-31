import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

/**
 * ManagerContestService — contests of the courses the caller manages (Deadline 2, APIs 1-12).
 *
 * Endpoints (ManagerContestController):
 *   GET    /api/v1/manager/contests                        (API 1)  — keyword, status=A,B, courseId, from, to, sort
 *   GET    /api/v1/manager/contests/{id}                   (API 2)
 *   POST   /api/v1/manager/contests                        (API 3)  — 201, always DRAFT
 *   PUT    /api/v1/manager/contests/{id}                   (API 4)  — full replace; what may change depends on status
 *   POST   /api/v1/manager/contests/{id}/publish           (API 5)  — DRAFT → PUBLISHED
 *   POST   /api/v1/manager/contests/{id}/cancel            (API 6)  — reason required once someone joined
 *   DELETE /api/v1/manager/contests/{id}                   (API 7)  — DRAFT only
 *   GET    /api/v1/manager/contests/{id}/leaderboard       (API 8)  — 409 RANKING_NOT_READY until ranked
 *   POST   /api/v1/manager/contests/{id}/pay-rewards       (API 9)  — all-or-nothing
 *   POST   /api/v1/manager/contests/batch-pay-rewards      (API 10) — max 20, 200 even when some fail
 *   GET    /api/v1/manager/contest-options/exams           (API 11) — courseId required, eligible exams only
 *   GET    /api/v1/manager/contest-options/discounts       (API 12) — usable prize discounts only
 *
 * A contest outside the caller's courses is 404 CONTEST_NOT_FOUND, a courseId outside them 403 FORBIDDEN_COURSE.
 * Errors carry `data.code` (see contestErrorCode) and, for prize problems, `data.issues`.
 */

/** Derived status (section 1.5): PUBLISHED splits by time into UPCOMING / ONGOING / PENDING_REWARD. */
export type ContestStatus = 'DRAFT' | 'UPCOMING' | 'ONGOING' | 'PENDING_REWARD' | 'REWARDED' | 'CANCELLED';
export type StoredContestStatus = 'DRAFT' | 'PUBLISHED' | 'REWARDED' | 'CANCELLED';
/** null before the contest ends. */
export type RankingStatus = 'CALCULATING' | 'READY' | null;
/** Seeded discounts use FIXED, admin-created ones FIXED_AMOUNT; anything but PERCENT is an amount in VND. */
export type PrizeDiscountType = 'PERCENT' | 'FIXED' | 'FIXED_AMOUNT';
export type DiscountValidity = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'EXHAUSTED' | 'INACTIVE';

export const CONTEST_STATUSES: ContestStatus[] = ['DRAFT', 'UPCOMING', 'ONGOING', 'PENDING_REWARD', 'REWARDED', 'CANCELLED'];
export const CONTEST_TITLE_MAX = 255;
export const CONTEST_DESCRIPTION_MAX = 5000;
export const CANCEL_REASON_MAX = 1000;
export const MAX_PRIZE_RANKS = 50;
export const MAX_BATCH_PAY = 20;

export interface CourseRef { courseId: number; title: string }
export interface ExamRef { examId: number; title: string }

/** API 1 item */
export interface ContestListItem {
  contestId: number;
  title: string;
  course: CourseRef | null;
  exam: ExamRef;
  startTime: string;
  endTime: string;
  status: ContestStatus;
  storedStatus: StoredContestStatus;
  rankingStatus: RankingStatus;
  participantCount: number;
  topN: number;
  /** status PENDING_REWARD and rankingStatus READY — enables the row checkbox and "Pay rewards". */
  canPayReward: boolean;
  rewardedAt: string | null;
  createdAt: string;
}

export interface ContestListParams {
  keyword?: string;
  status?: ContestStatus[];
  courseId?: number;
  from?: string;
  to?: string;
  page: number;
  size: number;
  /** `field,dir` — startTime | endTime | title | createdAt. Default startTime,desc. */
  sort?: string;
}

/** Why a prize cannot be granted. required/remaining only for DISCOUNT_QUOTA_NOT_ENOUGH. */
export interface PrizeIssue {
  rankPosition: number;
  discountId: number;
  code: string;
  reason: string;
  required?: number;
  remaining?: number;
}

export interface PrizeDiscount {
  discountId: number;
  code: string;
  name: string;
  discountType: PrizeDiscountType;
  value: number;
  isActive: boolean;
  validity: DiscountValidity;
}

export interface ContestReward {
  rewardId: number;
  rankPosition: number;
  discount: PrizeDiscount;
  /** Holder of the rank once ranked (rankingStatus READY); null otherwise or when nobody holds it. */
  winner: { userId: number; fullName: string; score: number } | null;
  granted: boolean;
}

/** API 2 / 3 / 4 / 5 / 6 body */
export interface ContestDetail {
  contestId: number;
  title: string;
  description: string | null;
  status: ContestStatus;
  storedStatus: StoredContestStatus;
  rankingStatus: RankingStatus;
  startTime: string;
  endTime: string;
  course: CourseRef | null;
  exam: ExamRef & { durationMinutes: number; maxScore: number | null; questionCount: number };
  rewards: ContestReward[];
  topN: number;
  participantCount: number;
  rankedAt: string | null;
  rewardedAt: string | null;
  rewardedBy: { userId: number; fullName: string } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Live reasons "Pay rewards" would fail (same shape as API 9 issues); empty = payable. */
  payBlockers: PrizeIssue[];
  canEdit: boolean;
  canPublish: boolean;
  canCancel: boolean;
  canPayReward: boolean;
}

/** API 3 / API 4 body */
export interface ContestWrite {
  title: string;
  description: string | null;
  examId: number;
  startTime: string;
  endTime: string;
  rewards: { rankPosition: number; discountId: number }[];
}

/** API 8 item */
export interface LeaderboardRow {
  rank: number;
  user: { userId: number; fullName: string; avatarUrl: string | null };
  score: number | null;
  timeSpentSeconds: number | null;
  submittedAt: string | null;
  /** Prize planned for this rank; null when the rank has none. */
  reward: { discountId: number; code: string; discountType: PrizeDiscountType; value: number } | null;
  rewardGranted: boolean;
  rewardGrantedAt: string | null;
}

/** API 9 */
export interface PayResult {
  contestId: number;
  status: ContestStatus;
  rewardedAt: string;
  rewardsGranted: number;
  winners: { rank: number; userId: number; fullName: string; discount: { discountId: number; code: string } }[];
}

/** API 10 row: success rows carry status/rewardsGranted/rewardedAt, failed rows errorCode/message/issues. */
export interface BatchPayRow {
  contestId: number;
  title: string;
  success: boolean;
  status?: ContestStatus;
  rewardsGranted?: number;
  rewardedAt?: string;
  errorCode?: string;
  message?: string;
  issues?: PrizeIssue[];
}

export interface BatchPayResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchPayRow[];
}

/** API 11 item */
export interface ContestExamOption {
  examId: number;
  title: string;
  courseId: number;
  durationMinutes: number;
  maxScore: number | null;
  questionCount: number;
  /** Essays are graded by AI, so ranking may stay CALCULATING longer. */
  hasEssayQuestions: boolean;
  publishedAt: string | null;
}

/** API 12 item */
export interface ContestDiscountOption {
  discountId: number;
  code: string;
  name: string;
  discountType: PrizeDiscountType;
  value: number;
  remaining: number;
  expiredAt: string | null;
}

// ------------------------------------------------------------- errors

type ErrorData = { code?: string; issues?: PrizeIssue[]; errors?: { field: string; message: string }[] };
type HttpError = { response?: { status?: number; data?: { message?: string; data?: ErrorData | null } } };

const errorData = (err: unknown): ErrorData | null => (err as HttpError | null)?.response?.data?.data ?? null;

/** `data.code` of a BE error (CONTEST_LOCKED, REWARD_PAYMENT_BLOCKED, RANKING_NOT_READY, …). */
export function contestErrorCode(err: unknown): string | null {
  return errorData(err)?.code ?? null;
}

/** `data.issues` of REWARD_PAYMENT_BLOCKED / DISCOUNT_NOT_AVAILABLE / DISCOUNT_QUOTA_NOT_ENOUGH. */
export function contestErrorIssues(err: unknown): PrizeIssue[] {
  return errorData(err)?.issues ?? [];
}

/** VALIDATION_FAILED field errors, keyed by field name. */
export function contestFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  (errorData(err)?.errors ?? []).forEach(e => { if (e?.field && !out[e.field]) out[e.field] = e.message; });
  return out;
}

// ------------------------------------------------------------- calls

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const managerContestService = {
  /** API 1 */
  async list(params: ContestListParams): Promise<PageResponse<ContestListItem>> {
    const { status, ...rest } = params;
    const res = await api.get<ApiResponse<PageResponse<ContestListItem>>>(
      `/manager/contests?${query({ ...rest, keyword: rest.keyword?.trim(), status: status?.length ? status.join(',') : undefined })}`,
    );
    return res.data;
  },

  /** API 2 */
  async get(id: number | string): Promise<ContestDetail> {
    const res = await api.get<ApiResponse<ContestDetail>>(`/manager/contests/${id}`);
    return res.data;
  },

  /** API 3 */
  async create(body: ContestWrite): Promise<ContestDetail> {
    const res = await api.post<ApiResponse<ContestDetail>>('/manager/contests', body);
    return res.data;
  },

  /** API 4 */
  async update(id: number | string, body: ContestWrite): Promise<ContestDetail> {
    const res = await api.request<ApiResponse<ContestDetail>>({ method: 'put', url: `/manager/contests/${id}`, data: body });
    return res.data;
  },

  /** API 5 */
  async publish(id: number | string): Promise<ContestDetail> {
    const res = await api.post<ApiResponse<ContestDetail>>(`/manager/contests/${id}/publish`);
    return res.data;
  },

  /** API 6 */
  async cancel(id: number | string, reason: string): Promise<ContestDetail> {
    const res = await api.post<ApiResponse<ContestDetail>>(`/manager/contests/${id}/cancel`, { reason: reason.trim() || null });
    return res.data;
  },

  /** API 7 */
  async remove(id: number | string): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/contests/${id}` });
  },

  /** API 8 */
  async leaderboard(id: number | string, page: number, size: number): Promise<PageResponse<LeaderboardRow>> {
    const res = await api.get<ApiResponse<PageResponse<LeaderboardRow>>>(`/manager/contests/${id}/leaderboard?${query({ page, size })}`);
    return res.data;
  },

  /** API 9 — 409 REWARD_PAYMENT_BLOCKED carries data.issues and grants nothing. */
  async payRewards(id: number | string): Promise<PayResult> {
    const res = await api.post<ApiResponse<PayResult>>(`/manager/contests/${id}/pay-rewards`);
    return res.data;
  },

  /** API 10 */
  async batchPayRewards(contestIds: number[]): Promise<BatchPayResult> {
    const res = await api.post<ApiResponse<BatchPayResult>>('/manager/contests/batch-pay-rewards', { contestIds });
    return res.data;
  },

  /** API 11 */
  async examOptions(params: { courseId: number; keyword?: string; page: number; size: number }): Promise<PageResponse<ContestExamOption>> {
    const res = await api.get<ApiResponse<PageResponse<ContestExamOption>>>(
      `/manager/contest-options/exams?${query({ ...params, keyword: params.keyword?.trim() })}`,
    );
    return res.data;
  },

  /** API 12 */
  async discountOptions(params: { keyword?: string; page: number; size: number }): Promise<PageResponse<ContestDiscountOption>> {
    const res = await api.get<ApiResponse<PageResponse<ContestDiscountOption>>>(
      `/manager/contest-options/discounts?${query({ ...params, keyword: params.keyword?.trim() })}`,
    );
    return res.data;
  },

  /** Every page of API 11 (max 100 per page). */
  async allExamOptions(courseId: number): Promise<ContestExamOption[]> {
    const all: ContestExamOption[] = [];
    for (let page = 0; ; page++) {
      const res = await managerContestService.examOptions({ courseId, page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },

  /** Every page of API 12 (max 100 per page). */
  async allDiscountOptions(): Promise<ContestDiscountOption[]> {
    const all: ContestDiscountOption[] = [];
    for (let page = 0; ; page++) {
      const res = await managerContestService.discountOptions({ page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },
};
