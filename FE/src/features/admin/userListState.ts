/**
 * User List view state (search, filters, page) kept in a module singleton, so
 * that returning from User Detail via "Back to User List" restores the exact
 * previous view instead of resetting the filters.
 */
export interface UserListState {
  search: string;
  /** 'all' or a role code: STUDENT / COURSE_MANAGER / ADMIN. */
  role: string;
  /** 'all' or a status code: ACTIVE / INACTIVE. */
  status: string;
  /** 1-based page number of the server-side pagination. */
  page: number;
}

const userListState: UserListState = { search: '', role: 'all', status: 'all', page: 1 };

export function getUserListState(): UserListState {
  return userListState;
}
