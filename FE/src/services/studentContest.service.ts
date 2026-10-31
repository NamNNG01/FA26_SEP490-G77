import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

export type ContestStatus = 'UPCOMING' | 'ONGOING' | 'ENDED' | 'CANCELLED';

/**
 * Prize of one rank. CT-01 / CT-04 do not send prizes yet (docs/notes/contest-be-gaps-2026-10-31.md):
 * the optional fields below light up once the BE adds them.
 */
export interface ContestPrize {
  rankPosition: number;
  discountCode: string;
  discountType?: string;
  value?: number | null;
}

export interface StudentContest {
  contestId: number;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  questionCount: number;
  maxParticipants: number | null;
  registeredCount: number;
  status: ContestStatus;
  isRegistered: boolean;
  /** Not sent by CT-01 yet. */
  course?: { courseId: number; title: string } | null;
  /** Not sent by CT-01 yet. */
  rewards?: ContestPrize[];
}

export interface ContestLeaderboard {
  generatedAt: string;
  rows: {
    rank: number; userId: number; studentName: string; score: number; completedAt: string; isCurrentUser: boolean;
    /** Not sent by CT-04 yet. */
    avatarUrl?: string | null;
    /** Not sent by CT-04 yet. */
    reward?: ContestPrize | null;
  }[];
}

export interface ContestReward {
  rewardId: number;
  rewardType: 'BADGE' | 'DISCOUNT_CODE' | 'CERTIFICATE' | string;
  value: string;
  description: string;
  claimed: boolean;
  claimedAt?: string | null;
  certificateUrl?: string | null;
  /** Not sent by CT-05 yet; CT-05 currently returns the prizes of every rank. */
  rankPosition?: number;
  /** Not sent by CT-05 yet. */
  claimable?: boolean;
}

export interface ContestResult {
  rank: number;
  score: number;
  totalParticipants: number;
  certificateUrl: string | null;
  rewards: ContestReward[];
}

export interface ContestHistoryItem {
  contestId: number;
  title: string;
  registeredAt: string;
  score: number | null;
  rank: number | null;
  status: ContestStatus;
  /** Not sent by CT-06 yet. */
  course?: { courseId: number; title: string } | null;
  /** Not sent by CT-06 yet. */
  startTime?: string;
}

function query(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  return qs.toString();
}

export const studentContestService = {
  async getContests(params: { status?: ContestStatus; page?: number; size?: number } = {}) {
    const res = await api.get<ApiResponse<StudentPage<StudentContest>>>(`/student/contests?${query(params)}`);
    return res.data;
  },

  async register(contestId: number | string) {
    const res = await api.post<ApiResponse<{ contestId: number; registeredCount: number }>>(`/student/contests/${contestId}/register`);
    return res.data;
  },

  async start(contestId: number | string) {
    const res = await api.post<ApiResponse<{ attemptId: number; examId: number; durationMinutes: number; endsAt: string; questions: unknown[] }>>(`/student/contests/${contestId}/start`);
    return res.data;
  },

  async getLeaderboard(contestId: number | string) {
    const res = await api.get<ApiResponse<ContestLeaderboard>>(`/student/contests/${contestId}/leaderboard`);
    return res.data;
  },

  async getResult(contestId: number | string) {
    const res = await api.get<ApiResponse<ContestResult>>(`/student/contests/${contestId}/result`);
    return res.data;
  },

  async getHistory(params: { page?: number; size?: number } = {}) {
    const res = await api.get<ApiResponse<StudentPage<ContestHistoryItem>>>(`/student/contests/history?${query(params)}`);
    return res.data;
  },

  /** Every page of CT-01 (it ignores its filters today, so the list page filters on the client). */
  async getAllContests(): Promise<StudentContest[]> {
    const all: StudentContest[] = [];
    for (let page = 0; ; page++) {
      const res = await studentContestService.getContests({ page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },

  /** Every page of CT-06. */
  async getAllHistory(): Promise<ContestHistoryItem[]> {
    const all: ContestHistoryItem[] = [];
    for (let page = 0; ; page++) {
      const res = await studentContestService.getHistory({ page, size: 100 });
      all.push(...res.content);
      if (res.last || res.content.length === 0 || page + 1 >= res.totalPages) return all;
    }
  },

  async claimReward(contestId: number | string, rewardId: number) {
    const res = await api.post<ApiResponse<ContestReward>>(`/student/contests/${contestId}/claim-reward`, { rewardId });
    return res.data;
  },
};
