// Shared mock data module for the admin Users feature. Single source of truth
// so User List and User Detail always agree on identity and fields.

export interface MockUser {
  id: string;
  name: string;
  email: string;
  username: string;
  phone: string;
  role: 'Student' | 'Content Manager' | 'Admin';
  status: 'Active' | 'Inactive';
  joined: string;
  lastLogin: string;
  courses: number | null; // null for staff accounts
  bio: string;
}

export interface LearningStats {
  enrolled: number;
  examsTaken: number;
  avgScore: number;
  certificates: number;
  lastActivity: string;
}

export interface ExamAttempt {
  id: string;
  exam: string;
  score: number;
  result: 'Passed' | 'Failed';
  date: string;
}

// ── Profiles (the same 20 users from the User List, now with full fields) ─────

export const MOCK_USERS: MockUser[] = [
  { id: 'u-01', name: 'Alexandra Chen', email: 'alex.chen@uni.edu', username: 'alexchen', phone: '+1 (415) 555-0132', role: 'Student', status: 'Active', joined: 'Jan 12, 2026', lastLogin: '2h ago', courses: 6, bio: 'MSc Data Science student focused on NLP and model interpretability. Runs the weekly ML study group.' },
  { id: 'u-02', name: 'Marcus Johnson', email: 'm.johnson@corp.com', username: 'mjohnson', phone: '+1 (312) 555-0147', role: 'Student', status: 'Active', joined: 'Oct 3, 2025', lastLogin: '1d ago', courses: 4, bio: 'Software engineer upskilling into MLOps. Prefers evening study sessions.' },
  { id: 'u-03', name: 'Priya Nair', email: 'p.nair@institute.edu', username: 'priyanair', phone: '+91 98200 55512', role: 'Content Manager', status: 'Active', joined: 'Mar 22, 2025', lastLogin: '30m ago', courses: null, bio: 'Curates AI & Data Science curriculum. Reviews every question bank before publishing.' },
  { id: 'u-04', name: 'Tom Williams', email: 't.williams@certifyai.com', username: 'tomw', phone: '+1 (206) 555-0110', role: 'Admin', status: 'Active', joined: 'Jun 1, 2024', lastLogin: 'Just now', courses: null, bio: 'Platform administrator — user management, subscriptions, and audit oversight.' },
  { id: 'u-05', name: 'Li Wei', email: 'li.wei@university.cn', username: 'liwei', phone: '+86 138 5550 0110', role: 'Student', status: 'Inactive', joined: 'Sep 8, 2025', lastLogin: '2w ago', courses: 2, bio: 'Part-time learner while working in fintech; interested in quantitative finance.' },
  { id: 'u-06', name: 'Sofia Martinez', email: 's.martinez@uni.edu', username: 'sofiam', phone: '+34 655 555 019', role: 'Student', status: 'Active', joined: 'Nov 30, 2025', lastLogin: '45m ago', courses: 3, bio: 'Switching careers into data analytics; loves the guided exam-prep paths.' },
  { id: 'u-07', name: 'David Okafor', email: 'd.okafor@tech.edu', username: 'davidokafor', phone: '+234 803 555 0142', role: 'Student', status: 'Active', joined: 'Dec 14, 2025', lastLogin: '3h ago', courses: 5, bio: 'Backend developer expanding into applied machine learning.' },
  { id: 'u-08', name: 'Hannah Kim', email: 'h.kim@certifyai.com', username: 'hannahkim', phone: '+82 10 5550 0173', role: 'Content Manager', status: 'Active', joined: 'Jul 19, 2025', lastLogin: '1h ago', courses: null, bio: 'Owns the exam pipeline: builds exams, sets pass marks, monitors attempt analytics.' },
  { id: 'u-09', name: 'Raj Patel', email: 'r.patel@institute.edu', username: 'rajpatel', phone: '+91 90000 55523', role: 'Student', status: 'Inactive', joined: 'Aug 2, 2025', lastLogin: '1mo ago', courses: 1, bio: 'On a study break; plans to resume with the Database Systems course.' },
  { id: 'u-10', name: 'Emma Müller', email: 'e.mueller@uni.de', username: 'emmam', phone: '+49 151 5550 0116', role: 'Student', status: 'Active', joined: 'Feb 9, 2026', lastLogin: '5h ago', courses: 7, bio: 'Most active learner this month; chasing the full AI certificate track.' },
  { id: 'u-11', name: 'Carlos Silva', email: 'c.silva@corp.com', username: 'carloss', phone: '+55 11 5550 0188', role: 'Student', status: 'Active', joined: 'Apr 17, 2025', lastLogin: '2d ago', courses: 2, bio: 'Data analyst strengthening SQL and statistics fundamentals.' },
  { id: 'u-12', name: 'Fatima Al-Rashid', email: 'f.alrashid@uni.edu', username: 'fatimaar', phone: '+971 50 5550 0129', role: 'Admin', status: 'Active', joined: 'May 10, 2024', lastLogin: '4h ago', courses: null, bio: 'Oversees content-manager onboarding and platform-wide reporting.' },
  { id: 'u-13', name: 'James O’Connor', email: 'j.oconnor@uni.edu', username: 'jamesoc', phone: '+353 85 555 0161', role: 'Student', status: 'Active', joined: 'Jan 28, 2026', lastLogin: '6h ago', courses: 4, bio: 'Career switcher from civil engineering into data engineering.' },
  { id: 'u-14', name: 'Yuki Tanaka', email: 'y.tanaka@university.jp', username: 'yukit', phone: '+81 90 5550 0135', role: 'Student', status: 'Inactive', joined: 'Jul 3, 2025', lastLogin: '3w ago', courses: 3, bio: 'Graduate researcher using the platform for lab onboarding material.' },
  { id: 'u-15', name: 'Isabella Rossi', email: 'i.rossi@institute.edu', username: 'isabellar', phone: '+39 320 555 0154', role: 'Content Manager', status: 'Active', joined: 'Sep 25, 2025', lastLogin: '15m ago', courses: null, bio: 'Manages the question bank for programming courses; ex-teaching assistant.' },
  { id: 'u-16', name: 'Noah Dubois', email: 'n.dubois@uni.fr', username: 'noahd', phone: '+33 6 55 50 01 47', role: 'Student', status: 'Active', joined: 'Dec 2, 2025', lastLogin: '1w ago', courses: 2, bio: 'Learning at his own pace alongside a full-time role in logistics.' },
  { id: 'u-17', name: 'Aisha Mohammed', email: 'a.mohammed@tech.edu', username: 'aisham', phone: '+254 712 555 0178', role: 'Student', status: 'Active', joined: 'Oct 21, 2025', lastLogin: '8h ago', courses: 6, bio: 'Aiming for the AI engineering certificate track this year.' },
  { id: 'u-18', name: 'Lucas Weber', email: 'l.weber@uni.de', username: 'lucasw', phone: '+49 152 5550 0193', role: 'Student', status: 'Active', joined: 'Nov 11, 2025', lastLogin: '4d ago', courses: 1, bio: 'First course on the platform; working through Python fundamentals.' },
  { id: 'u-19', name: 'Olivia Bennett', email: 'o.bennett@certifyai.com', username: 'oliviab', phone: '+44 7700 555012', role: 'Content Manager', status: 'Inactive', joined: 'Jun 30, 2024', lastLogin: '1mo ago', courses: null, bio: 'On extended leave; authored the subscription-analytics course previously.' },
  { id: 'u-20', name: 'Mateo González', email: 'm.gonzalez@uni.edu', username: 'mateog', phone: '+52 55 5550 0166', role: 'Student', status: 'Active', joined: 'Feb 2, 2026', lastLogin: 'Just now', courses: 5, bio: 'Prepares for certification exams with spaced repetition.' },
];

// ── Learning statistics per user ──────────────────────────────────────────────

export const USER_STATS: Record<string, LearningStats> = {
  'u-01': { enrolled: 6, examsTaken: 17, avgScore: 87, certificates: 3, lastActivity: '2h ago' },
  'u-02': { enrolled: 4, examsTaken: 9, avgScore: 78, certificates: 1, lastActivity: '1d ago' },
  'u-03': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: '30m ago' },
  'u-04': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: 'Just now' },
  'u-05': { enrolled: 2, examsTaken: 4, avgScore: 61, certificates: 0, lastActivity: '2w ago' },
  'u-06': { enrolled: 3, examsTaken: 6, avgScore: 74, certificates: 1, lastActivity: '45m ago' },
  'u-07': { enrolled: 5, examsTaken: 11, avgScore: 82, certificates: 2, lastActivity: '3h ago' },
  'u-08': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: '1h ago' },
  'u-09': { enrolled: 1, examsTaken: 2, avgScore: 58, certificates: 0, lastActivity: '1mo ago' },
  'u-10': { enrolled: 7, examsTaken: 14, avgScore: 91, certificates: 4, lastActivity: '5h ago' },
  'u-11': { enrolled: 2, examsTaken: 5, avgScore: 69, certificates: 0, lastActivity: '2d ago' },
  'u-12': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: '4h ago' },
  'u-13': { enrolled: 4, examsTaken: 8, avgScore: 76, certificates: 1, lastActivity: '6h ago' },
  'u-14': { enrolled: 3, examsTaken: 5, avgScore: 71, certificates: 0, lastActivity: '3w ago' },
  'u-15': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: '15m ago' },
  'u-16': { enrolled: 2, examsTaken: 3, avgScore: 66, certificates: 0, lastActivity: '1w ago' },
  'u-17': { enrolled: 6, examsTaken: 12, avgScore: 84, certificates: 2, lastActivity: '8h ago' },
  'u-18': { enrolled: 1, examsTaken: 1, avgScore: 64, certificates: 0, lastActivity: '4d ago' },
  'u-19': { enrolled: 0, examsTaken: 0, avgScore: 0, certificates: 0, lastActivity: '1mo ago' },
  'u-20': { enrolled: 5, examsTaken: 10, avgScore: 80, certificates: 1, lastActivity: 'Just now' },
};

// ── Recent exam attempts per user ─────────────────────────────────────────────

export const USER_ATTEMPTS: Record<string, ExamAttempt[]> = {
  'u-01': [
    { id: 'a-01', exam: 'ML Fundamentals — Mid Exam', score: 87, result: 'Passed', date: 'Feb 18, 2026' },
    { id: 'a-02', exam: 'Supervised Learning Quiz 1', score: 92, result: 'Passed', date: 'Feb 10, 2026' },
    { id: 'a-03', exam: 'Statistics for ML — Final', score: 84, result: 'Failed', date: 'Jan 29, 2026' },
    { id: 'a-04', exam: 'Python Syntax Check — Practice', score: 96, result: 'Passed', date: 'Jan 12, 2026' },
  ],
  'u-02': [
    { id: 'a-05', exam: 'Foundations of ML — Module Test', score: 74, result: 'Passed', date: 'Feb 16, 2026' },
    { id: 'a-06', exam: 'Data Wrangling Practical', score: 81, result: 'Passed', date: 'Feb 2, 2026' },
    { id: 'a-07', exam: 'Descriptive Statistics Midterm', score: 55, result: 'Failed', date: 'Jan 20, 2026' },
  ],
  'u-05': [
    { id: 'a-08', exam: 'Python Syntax Check — Practice', score: 61, result: 'Passed', date: 'Jan 30, 2026' },
    { id: 'a-09', exam: 'Hypothesis Testing Quiz', score: 48, result: 'Failed', date: 'Jan 8, 2026' },
  ],
  'u-06': [
    { id: 'a-10', exam: 'Model Evaluation Final', score: 78, result: 'Passed', date: 'Feb 15, 2026' },
    { id: 'a-11', exam: 'Supervised Learning Quiz 1', score: 70, result: 'Passed', date: 'Jan 25, 2026' },
  ],
  'u-07': [
    { id: 'a-12', exam: 'ML Fundamentals — Mid Exam', score: 83, result: 'Passed', date: 'Feb 17, 2026' },
    { id: 'a-13', exam: 'Backpropagation & Training Quiz', score: 88, result: 'Passed', date: 'Feb 6, 2026' },
    { id: 'a-14', exam: 'Normalization & Architectures Test', score: 52, result: 'Failed', date: 'Jan 22, 2026' },
  ],
  'u-10': [
    { id: 'a-15', exam: 'Model Evaluation Final', score: 95, result: 'Passed', date: 'Feb 18, 2026' },
    { id: 'a-16', exam: 'Statistics for ML — Final', score: 89, result: 'Passed', date: 'Feb 4, 2026' },
    { id: 'a-17', exam: 'Supervised Learning Quiz 1', score: 93, result: 'Passed', date: 'Jan 18, 2026' },
  ],
  'u-13': [
    { id: 'a-18', exam: 'Foundations of ML — Module Test', score: 72, result: 'Passed', date: 'Feb 12, 2026' },
    { id: 'a-19', exam: 'Data Wrangling Practical', score: 79, result: 'Passed', date: 'Jan 26, 2026' },
  ],
  'u-14': [
    { id: 'a-20', exam: 'Descriptive Statistics Midterm', score: 66, result: 'Failed', date: 'Feb 1, 2026' },
    { id: 'a-21', exam: 'Hypothesis Testing Quiz', score: 71, result: 'Passed', date: 'Jan 11, 2026' },
  ],
  'u-17': [
    { id: 'a-22', exam: 'ML Fundamentals — Mid Exam', score: 85, result: 'Passed', date: 'Feb 9, 2026' },
    { id: 'a-23', exam: 'Supervised Learning Quiz 1', score: 82, result: 'Passed', date: 'Jan 15, 2026' },
  ],
  'u-20': [
    { id: 'a-24', exam: 'Model Evaluation Final', score: 84, result: 'Passed', date: 'Feb 18, 2026' },
    { id: 'a-25', exam: 'Statistics for ML — Final', score: 78, result: 'Passed', date: 'Jan 30, 2026' },
  ],
};

// ── Mutable per-user state (Activate/Deactivate, password reset) ──────────────

const userState: Record<string, { resetRequested: boolean }> = {};

export function isPasswordResetRequested(id: string): boolean {
  return userState[id]?.resetRequested ?? false;
}

export function markPasswordReset(id: string) {
  if (!userState[id]) userState[id] = { resetRequested: false };
  userState[id].resetRequested = true;
}

/** Activate/Deactivate mutates the shared mock record so the User List reflects it. */
export function setUserStatus(id: string, status: MockUser['status']) {
  const u = MOCK_USERS.find(x => x.id === id);
  if (u) u.status = status;
}

// ── User List state persistence (filters/search/sort/page survive navigation) ─

export interface UserListState {
  search: string;
  role: string;
  status: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  page: number;
}

// Module singleton: survives unmount/remount as the user navigates to a detail
// page and back, so "Back to User List" restores the exact previous view.
const userListState: UserListState = { search: '', role: 'all', status: 'all', sortKey: 'name', sortDir: 'asc', page: 1 };

export function getUserListState(): UserListState {
  return userListState;
}
