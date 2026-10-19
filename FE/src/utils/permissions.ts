/**
 * Role codes — MUST match the backend constants in
 * com.examprep.entities.Role:
 *   CODE_STUDENT        = "STUDENT"
 *   CODE_COURSE_MANAGER = "COURSE_MANAGER"
 *   CODE_ADMIN          = "ADMIN"
 */
export enum Role {
  STUDENT = 'STUDENT',
  COURSE_MANAGER = 'COURSE_MANAGER',
  ADMIN = 'ADMIN',
}

export type AllowedRoles = Role[] | Role[][];

/** Human-readable role names for the UI — never show the raw backend code. */
export const ROLE_LABELS: Record<string, string> = {
  [Role.STUDENT]: 'Student',
  [Role.COURSE_MANAGER]: 'Course Manager',
  [Role.ADMIN]: 'Admin',
};

/** Display label for a backend role code, e.g. 'COURSE_MANAGER' → 'Course Manager'. */
export function roleLabel(code: string | null | undefined): string {
  if (!code) return '';
  return ROLE_LABELS[code] ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}
