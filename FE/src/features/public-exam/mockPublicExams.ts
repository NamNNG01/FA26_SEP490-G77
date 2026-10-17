/**
 * Exam fixtures for the student "Public Exam" page.
 *
 * Self-consistent by construction so the statistic row is derived, never
 * hard-coded: 48 exams total, of which 12 are completed (scores average to
 * 78%), 2 are in progress and 34 are untouched — i.e. 36 "ready to start".
 *
 * The first nine records are the headline cards and must stay first, in this
 * order, so page 1 always renders exactly the specified set.
 */

export type ExamDifficulty = 'Easy' | 'Medium' | 'Hard';

/**
 * Question format. An exam is EITHER objective — multiple choice, true/false,
 * fill in the blank, matching, ordering — OR essay. Never both: the field is a
 * single value, not a list, so no card can render two types.
 */
export type ExamType = 'objective' | 'essay';

/** Lifecycle from the learner's point of view — NOT the authoring status. */
export type ExamStatus = 'available' | 'in-progress' | 'completed';

/** Category drives the tab strip. */
export type ExamCategory = 'AWS' | 'Frontend' | 'Backend' | 'Database' | 'DevOps' | 'Security';

export interface PublicExam {
  id: string;
  title: string;
  course: string;
  category: ExamCategory;
  /** Unit within the course this exam draws from. */
  module: string;
  /** Time limit in minutes. */
  duration: number;
  /** Objective exams run 40-70 items; essay exams are a handful of long answers. */
  questions: number;
  /** Required — an exam always belongs to exactly one question format. */
  examType: ExamType;
  difficulty: ExamDifficulty;
  status: ExamStatus;
  /** Percent score — only ever set on completed exams. */
  score?: number;
}

export interface PublicExamCourseMeta {
  name: string;
  /** Short label for the Course dropdown when `name` is too long to fit. Falls back to `name`. */
  shortName?: string;
  /** 2–3 character monogram rendered inside the card's logo tile. */
  monogram: string;
  /** Brand-ish accent used for the logo tile and its tint. */
  accent: string;
  /** Units of study — the Module dropdown is scoped to the selected course. */
  modules: string[];
}

/**
 * Course metadata — one entry per distinct `PublicExam.course`. The accent
 * colours are the real vendor brand hues so the logo tiles read instantly.
 * `modules` scopes the Module dropdown to the selected course.
 */
export const PUBLIC_EXAM_COURSES: PublicExamCourseMeta[] = [
  {
    name: 'AWS Certified Solutions Architect Associate',
    shortName: 'AWS SAA-C03',
    monogram: 'AWS',
    accent: '#F59E0B',
    modules: ['Architecture Fundamentals', 'Networking & VPC', 'Security, Identity & Compliance', 'Cost & Operations'],
  },
  { name: 'Azure', monogram: 'AZ', accent: '#0EA5E9', modules: ['Cloud Fundamentals', 'Compute & Networking', 'Identity & Governance', 'Monitoring & Cost'] },
  { name: 'Docker', monogram: 'DKR', accent: '#0891B2', modules: ['Containers Fundamentals', 'Images & Registries', 'Compose & Multi-container', 'Networking & Storage'] },
  { name: 'Kubernetes', monogram: 'K8s', accent: '#326CE5', modules: ['Cluster Fundamentals', 'Workloads & Scheduling', 'Networking & Storage', 'Helm & GitOps'] },
  { name: 'Java', monogram: 'JV', accent: '#DC2626', modules: ['Language Core', 'OOP & Collections', 'Concurrency', 'JVM & Performance'] },
  { name: 'React', monogram: 'RE', accent: '#0EA5E9', modules: ['Components & Props', 'Hooks', 'Routing & Data Fetching', 'State Management'] },
  { name: 'Angular', monogram: 'NG', accent: '#E11D48', modules: ['Components & Templates', 'Forms & Validation', 'Routing & Guards', 'RxJS & Signals'] },
  { name: 'PostgreSQL', monogram: 'PG', accent: '#0D7C6C', modules: ['SQL Fundamentals', 'Joins & Subqueries', 'Indexing & Performance', 'Replication & High Availability'] },
  { name: 'Linux', monogram: 'LX', accent: '#65A30D', modules: ['Filesystem & Users', 'Shell & Scripting', 'Networking & DNS', 'Processes & Services'] },
  { name: 'Web Security', monogram: 'WS', accent: '#7C3AED', modules: ['Threats & OWASP Top 10', 'Authentication & Sessions', 'Applied Cryptography', 'Secure API Design'] },
  { name: 'Database', monogram: 'DB', accent: '#0D7C6C', modules: ['Data Modelling', 'Query Design', 'Transactions & Concurrency', 'Performance Tuning'] },
  { name: 'Security', monogram: 'SEC', accent: '#7C3AED', modules: ['Threat Modelling', 'Network Security', 'Identity & Access', 'Incident Response'] },
  { name: 'Software Engineering', monogram: 'SE', accent: '#0F766E', modules: ['Requirements & Design', 'Architecture Patterns', 'Code Quality & Review', 'Delivery & CI'] },
];

const courseMetaByName = new Map(PUBLIC_EXAM_COURSES.map(c => [c.name, c]));

/** Metadata for a course name — falls back to the primary brand colour. */
export function courseMeta(name: string): PublicExamCourseMeta {
  return (
    courseMetaByName.get(name) ?? {
      name,
      monogram: name.slice(0, 3).toUpperCase(),
      accent: '#0D7C6C',
      modules: ['General'],
    }
  );
}

/**
 * The card/detail subtitle: "Course · Category". Some courses share a name with
 * their category (Database, Security), so the category is omitted there rather
 * than repeating itself. Shared so the card and the detail page cannot drift.
 */
export function examSubtitle(exam: PublicExam): string {
  return exam.course === exam.category ? exam.course : `${exam.course} · ${exam.category}`;
}

/** Category tabs, in display order. "All Exams" is prepended by the page. */
export const PUBLIC_EXAM_CATEGORIES: ExamCategory[] = ['AWS', 'Frontend', 'Backend', 'Database', 'DevOps', 'Security'];

/** Difficulty -> dot colour. Green / orange / red, per the design spec. */
export const DIFFICULTY_ACCENT: Record<ExamDifficulty, string> = {
  Easy: '#16A34A',
  Medium: '#D97706',
  Hard: '#DC2626',
};

/** Status -> human label + Badge variant. */
export const STATUS_META: Record<ExamStatus, { label: string; badge: 'info' | 'success' | 'warning' }> = {
  available: { label: 'Available', badge: 'info' },
  'in-progress': { label: 'In Progress', badge: 'warning' },
  completed: { label: 'Completed', badge: 'success' },
};

/** Exam type -> human label + Badge variant. Blue = objective, purple = essay. */
export const EXAM_TYPE_META: Record<ExamType, { label: string; badge: 'info' | 'purple' }> = {
  objective: { label: 'Objective', badge: 'info' },
  essay: { label: 'Essay', badge: 'purple' },
};

/** Cards per page — 3 columns x 3 rows. */
export const PER_PAGE = 9;

export const PUBLIC_EXAMS: PublicExam[] = [
  // --- Headline cards: the nine specified records, in order ---
  { id: 'EX-P-1001', title: 'AWS SAA-C03 Mock Exam #12', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Architecture Fundamentals', duration: 65, questions: 65, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 78 },
  { id: 'EX-P-1002', title: 'AWS Scenario-Based Essay #01', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Architecture Fundamentals', duration: 90, questions: 5, examType: 'essay', difficulty: 'Hard', status: 'available' },
  { id: 'EX-P-1003', title: 'React Fundamentals Practice #03', course: 'React', category: 'Frontend', module: 'Components & Props', duration: 45, questions: 50, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1004', title: 'Java Programming Essay #02', course: 'Java', category: 'Backend', module: 'Language Core', duration: 120, questions: 4, examType: 'essay', difficulty: 'Hard', status: 'available' },
  { id: 'EX-P-1005', title: 'Docker Basics Practice #07', course: 'Docker', category: 'DevOps', module: 'Containers Fundamentals', duration: 50, questions: 55, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1006', title: 'Database Design Essay #01', course: 'Database', category: 'Database', module: 'Data Modelling', duration: 90, questions: 3, examType: 'essay', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1007', title: 'Kubernetes Practice #08', course: 'Kubernetes', category: 'DevOps', module: 'Cluster Fundamentals', duration: 60, questions: 70, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1008', title: 'Web Security Practice #06', course: 'Security', category: 'Security', module: 'Threat Modelling', duration: 55, questions: 60, examType: 'objective', difficulty: 'Hard', status: 'in-progress' },
  { id: 'EX-P-1009', title: 'Software Architecture Essay #03', course: 'Software Engineering', category: 'Backend', module: 'Architecture Patterns', duration: 120, questions: 5, examType: 'essay', difficulty: 'Hard', status: 'available' },

  // --- Remaining catalogue: 39 exams across the same 13 courses ---
  { id: 'EX-P-1010', title: 'AWS SAA-C03 Mock Exam #13', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Networking & VPC', duration: 70, questions: 65, examType: 'objective', difficulty: 'Hard', status: 'completed', score: 84 },
  { id: 'EX-P-1011', title: 'AWS Cloud Practitioner Practice #04', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Architecture Fundamentals', duration: 45, questions: 50, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1012', title: 'AWS Networking & VPC Design #07', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Networking & VPC', duration: 60, questions: 55, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 71 },
  { id: 'EX-P-1013', title: 'AWS Cost Optimization & Well-Architected #09', course: 'AWS Certified Solutions Architect Associate', category: 'AWS', module: 'Cost & Operations', duration: 55, questions: 45, examType: 'objective', difficulty: 'Medium', status: 'in-progress' },

  { id: 'EX-P-1014', title: 'Azure AZ-900 Fundamentals Practice #06', course: 'Azure', category: 'DevOps', module: 'Cloud Fundamentals', duration: 45, questions: 50, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1015', title: 'Azure AZ-104 Administrator Mock #11', course: 'Azure', category: 'DevOps', module: 'Compute & Networking', duration: 65, questions: 65, examType: 'objective', difficulty: 'Hard', status: 'completed', score: 90 },
  { id: 'EX-P-1016', title: 'Azure App Services & Functions #03', course: 'Azure', category: 'DevOps', module: 'Compute & Networking', duration: 50, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'available' },

  { id: 'EX-P-1017', title: 'Docker & Compose Hands-On #02', course: 'Docker', category: 'DevOps', module: 'Compose & Multi-container', duration: 40, questions: 45, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1018', title: 'Docker Networking Deep Dive #03', course: 'Docker', category: 'DevOps', module: 'Networking & Storage', duration: 55, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1019', title: 'Docker Image Optimisation #09', course: 'Docker', category: 'DevOps', module: 'Images & Registries', duration: 45, questions: 45, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 66 },
  { id: 'EX-P-1020', title: 'Docker Swarm & Orchestration #05', course: 'Docker', category: 'DevOps', module: 'Compose & Multi-container', duration: 60, questions: 60, examType: 'objective', difficulty: 'Hard', status: 'in-progress' },

  { id: 'EX-P-1021', title: 'CKA Cluster Administration Mock #04', course: 'Kubernetes', category: 'DevOps', module: 'Cluster Fundamentals', duration: 75, questions: 70, examType: 'objective', difficulty: 'Hard', status: 'completed', score: 82 },
  { id: 'EX-P-1022', title: 'Kubernetes Workloads & Scheduling #12', course: 'Kubernetes', category: 'DevOps', module: 'Workloads & Scheduling', duration: 60, questions: 65, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1023', title: 'Helm & GitOps Fundamentals #02', course: 'Kubernetes', category: 'DevOps', module: 'Helm & GitOps', duration: 45, questions: 40, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1024', title: 'Kubernetes Troubleshooting #06', course: 'Kubernetes', category: 'DevOps', module: 'Networking & Storage', duration: 55, questions: 55, examType: 'objective', difficulty: 'Medium', status: 'available' },

  { id: 'EX-P-1025', title: 'Java 17 Written Deep Dive #05', course: 'Java', category: 'Backend', module: 'Language Core', duration: 50, questions: 6, examType: 'essay', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1026', title: 'Spring Boot Fundamentals #09', course: 'Java', category: 'Backend', module: 'OOP & Collections', duration: 55, questions: 60, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 75 },
  { id: 'EX-P-1027', title: 'JVM Tuning Written Assessment #03', course: 'Java', category: 'Backend', module: 'JVM & Performance', duration: 50, questions: 5, examType: 'essay', difficulty: 'Hard', status: 'available' },
  { id: 'EX-P-1028', title: 'Concurrency in Java #07', course: 'Java', category: 'Backend', module: 'Concurrency', duration: 60, questions: 55, examType: 'objective', difficulty: 'Hard', status: 'available' },

  { id: 'EX-P-1029', title: 'Linux Shell Scripting #03', course: 'Linux', category: 'Backend', module: 'Shell & Scripting', duration: 45, questions: 45, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1030', title: 'Linux Networking Case Study #07', course: 'Linux', category: 'Backend', module: 'Networking & DNS', duration: 55, questions: 4, examType: 'essay', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1031', title: 'Linux Boot & Filesystems #01', course: 'Linux', category: 'Backend', module: 'Filesystem & Users', duration: 50, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 88 },
  { id: 'EX-P-1032', title: 'Bash Scripting Advanced #10', course: 'Linux', category: 'Backend', module: 'Shell & Scripting', duration: 65, questions: 60, examType: 'objective', difficulty: 'Hard', status: 'completed', score: 73 },

  { id: 'EX-P-1033', title: 'React Core Concepts #02', course: 'React', category: 'Frontend', module: 'Components & Props', duration: 45, questions: 50, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1034', title: 'Frontend Data-Fetching Design #04', course: 'React', category: 'Frontend', module: 'Routing & Data Fetching', duration: 40, questions: 4, examType: 'essay', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1035', title: 'React Performance & Memoisation #06', course: 'React', category: 'Frontend', module: 'State Management', duration: 55, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1036', title: 'React State Management Patterns #11', course: 'React', category: 'Frontend', module: 'State Management', duration: 50, questions: 45, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 69 },

  { id: 'EX-P-1037', title: 'Angular Architecture Write-Up #08', course: 'Angular', category: 'Frontend', module: 'Components & Templates', duration: 50, questions: 5, examType: 'essay', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1038', title: 'Angular Forms Deep Dive #01', course: 'Angular', category: 'Frontend', module: 'Forms & Validation', duration: 45, questions: 45, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1039', title: 'Angular Routing & Guards #05', course: 'Angular', category: 'Frontend', module: 'Routing & Guards', duration: 45, questions: 45, examType: 'objective', difficulty: 'Easy', status: 'available' },
  { id: 'EX-P-1040', title: 'NgRx State Management #10', course: 'Angular', category: 'Frontend', module: 'RxJS & Signals', duration: 55, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'available' },

  { id: 'EX-P-1041', title: 'PostgreSQL Optimisation Report #06', course: 'PostgreSQL', category: 'Database', module: 'Indexing & Performance', duration: 55, questions: 4, examType: 'essay', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1042', title: 'PostgreSQL Indexing Strategies #04', course: 'PostgreSQL', category: 'Database', module: 'Indexing & Performance', duration: 45, questions: 45, examType: 'objective', difficulty: 'Easy', status: 'completed', score: 79 },
  { id: 'EX-P-1043', title: 'PostgreSQL Replication & High Availability #01', course: 'PostgreSQL', category: 'Database', module: 'Replication & High Availability', duration: 60, questions: 55, examType: 'objective', difficulty: 'Hard', status: 'available' },
  { id: 'EX-P-1044', title: 'SQL Query Design Write-Up #09', course: 'PostgreSQL', category: 'Database', module: 'Joins & Subqueries', duration: 40, questions: 5, examType: 'essay', difficulty: 'Easy', status: 'available' },

  { id: 'EX-P-1045', title: 'OWASP Top 10 Deep Dive #02', course: 'Web Security', category: 'Security', module: 'Threats & OWASP Top 10', duration: 50, questions: 55, examType: 'objective', difficulty: 'Medium', status: 'available' },
  { id: 'EX-P-1046', title: 'Applied Cryptography Scenario #05', course: 'Web Security', category: 'Security', module: 'Applied Cryptography', duration: 60, questions: 6, examType: 'essay', difficulty: 'Hard', status: 'available' },
  { id: 'EX-P-1047', title: 'Secure Authentication Patterns #09', course: 'Web Security', category: 'Security', module: 'Authentication & Sessions', duration: 45, questions: 45, examType: 'objective', difficulty: 'Medium', status: 'completed', score: 85 },
  { id: 'EX-P-1048', title: 'API Security Best Practices #04', course: 'Web Security', category: 'Security', module: 'Secure API Design', duration: 50, questions: 50, examType: 'objective', difficulty: 'Medium', status: 'available' },
];

/** Score delta quoted on the Average Score card. */
export const SCORE_TREND = 6;
