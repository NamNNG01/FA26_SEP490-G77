import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { ROUTES } from '@/app/routes';

/**
 * Auth gate for actions that require a signed-in learner.
 *
 * Guests are sent to the login form with the intended destination preserved in
 * `?redirect=`, and the auth pages send them back there once they sign in:
 *
 *   /courses/aws-cloud-practitioner  →  Start Practice
 *   → /login?redirect=%2Fcourses%2Faws-cloud-practitioner
 *   → after login → /courses/aws-cloud-practitioner
 */

/** Login URL that remembers where the learner was heading. */
export function loginPathFor(target: string): string {
  return withRedirectTarget(ROUTES.login, target);
}

/** Sign-up URL that remembers where the new learner was heading. */
export function registerPathFor(target: string): string {
  return withRedirectTarget(ROUTES.register, target);
}

/**
 * Appends `?redirect=<target>` to any auth route, so a learner who bails to
 * Register or Forgot password still lands back where they started.
 */
export function withRedirectTarget(path: string, target: string | null): string {
  return target ? `${path}?redirect=${encodeURIComponent(target)}` : path;
}

/**
 * Validates a `?redirect=` value before navigating to it.
 *
 * Only same-origin app paths are allowed — a leading single "/" is required
 * and "//host" / absolute URLs / "javascript:" are rejected, so the query
 * string can never be used to bounce a user off the platform.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.startsWith('/\\')) return null;
  return value;
}

/**
 * Returns a guard function: `requireAuth(target)` navigates to `target` when
 * signed in, otherwise to the login page with `?redirect=target`.
 */
export function useRequireAuth(): (target: string) => void {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return useCallback(
    (target: string) => {
      navigate(isAuthenticated ? target : loginPathFor(target));
    },
    [isAuthenticated, navigate],
  );
}