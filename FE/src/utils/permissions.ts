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
