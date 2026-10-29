import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { StudentPage } from './studentLearning.service';

export type ContestStatus = 'UPCOMING' | 'ONGOING' | 'ENDED';

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
}

export interface ContestLeaderboard {
  generatedAt: string;
  rows: { rank: number; userId: number; studentName: string; score: number; completedAt: string; isCurrentUser: boolean }[];
}

export interface ContestReward {
  rewardId: number;
  rewardType: 'BADGE' | 'DISCOUNT_CODE' | 'CERTIFICATE' | string;
  value: string;
  description: string;
  claimed: boolean;
  claimedAt?: string | null;
  certificateUrl?: string | null;
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

  async claimReward(contestId: number | string, rewardId: number) {
    const res = await api.post<ApiResponse<ContestReward>>(`/student/contests/${contestId}/claim-reward`, { rewardId });
    return res.data;
  },
};
