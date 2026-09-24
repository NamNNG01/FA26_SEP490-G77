import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/authContext';
import {
  dashboardService,
  type StudentDashboardData,
  type ManagerDashboardData,
  type AdminDashboardData,
} from '@/services/dashboard.service';

/**
 * useDashboard
 *
 * Role-scoped dashboard data hook. Reads the authenticated role from
 * AuthContext (never hardcoded) and calls exactly ONE matching endpoint:
 *
 *   STUDENT        → GET /dashboard/student
 *   COURSE_MANAGER → GET /dashboard/course-manager
 *   ADMIN          → GET /dashboard/admin
 *
 * The dispatch is a plain lookup — no if/else page branching anywhere.
 * Returns { data, loading, error, refresh } and re-fetches on mount and on
 * role change, so F5 refreshes work without re-login (session is restored
 * synchronously from storage).
 */

export type DashboardData =
  | ({ kind: 'student' } & StudentDashboardData)
  | ({ kind: 'manager' } & ManagerDashboardData)
  | ({ kind: 'admin' } & AdminDashboardData);

interface UseDashboardResult {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Map a backend role code to its fetcher + payload discriminator. */
const FETCHER_BY_ROLE: Record<string, () => Promise<DashboardData>> = {
  STUDENT: async () => ({
    kind: 'student' as const,
    ...(await dashboardService.getStudentDashboard()),
  }),
  COURSE_MANAGER: async () => ({
    kind: 'manager' as const,
    ...(await dashboardService.getManagerDashboard()),
  }),
  ADMIN: async () => ({
    kind: 'admin' as const,
    ...(await dashboardService.getAdminDashboard()),
  }),
};

export function useDashboard(): UseDashboardResult {
  const { user } = useAuth();
  const roleCode = user?.role?.code;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const fetcher = roleCode ? FETCHER_BY_ROLE[roleCode] : undefined;

    if (!fetcher) {
      // Unknown/missing role → nothing to fetch; surface an error state.
      setData(null);
      setLoading(false);
      setError('Unable to determine your role. Please sign in again.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError('Unable to load dashboard.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [roleCode, tick]);

  return { data, loading, error, refresh };
}
