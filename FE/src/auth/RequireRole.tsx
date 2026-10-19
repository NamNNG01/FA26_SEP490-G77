import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth, landingPathForRole } from './authContext';
import { Role } from '@/utils/permissions';

/**
 * RequireRole — route-level authorisation.
 *
 * Hiding a menu item is NOT access control: with only `menuByRole` filtering the
 * sidebar, any signed-in user could type /admin/users into the URL bar and the
 * admin page would render. This layout route closes that hole by checking the
 * role on the route itself.
 *
 * It stays deliberately dumb — it takes an allow-list and redirects everything
 * else to the signed-in user's OWN landing page (landingPathForRole, the same
 * function the auth gate uses). Which roles a group allows is decided in
 * AppContent, next to the routes themselves, so the access model reads in one
 * place instead of being scattered through this component.
 *
 * Role precedence is "more access wins": ADMIN is included in the manager group
 * because administrators have full system access.
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  const roleCode = user?.role;

  // Unknown/missing role: refuse rather than guessing. AppContent's outer gate
  // already handles the signed-out case, so this only fires on a broken session.
  if (!isAuthenticated || !roleCode) {
    return <Navigate to={landingPathForRole(roleCode)} replace />;
  }

  if (!roles.includes(roleCode as Role)) {
    return <Navigate to={landingPathForRole(roleCode)} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Allow-lists per route group, so AppContent reads as a table of permissions. */
export const ROLE_ADMIN: Role[] = [Role.ADMIN];
export const ROLE_MANAGER: Role[] = [Role.COURSE_MANAGER, Role.ADMIN];
export const ROLE_STUDENT: Role[] = [Role.STUDENT];
/** Course Manager only — ADMIN deliberately excluded. */
export const ROLE_COURSE_MANAGER_ONLY: Role[] = [Role.COURSE_MANAGER];
