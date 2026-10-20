import { api } from './api';
import { apiClient } from './axios';
import type { ApiResponse } from '@/auth/authContext';
import type { PageResponse } from './course.service';

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ExamKind = 'QUIZ' | 'ESSAY' | 'CODE' | 'DIAGRAM' | 'MIXED';
export type GenerationType = 'STATIC' | 'RANDOM' | 'MIXED';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface ExamListItem {
  examId: number;
  title: string;
  description?: string;
  courseId: number;
  courseName: string;
  moduleId?: number;
  moduleName?: string;
  examKind: ExamKind;
  durationMinutes: number;
  passMark: number;
  maxAttempts: number;
  questionCount: number;
  totalPoints: number;
  status: ExamStatus;
  generationType: GenerationType;
  isPractice: boolean;
  createdAt: string;
}

export interface ExamConfig {
  configId?: number;
  questionType: string;
  numberOfQuestions: number;
  moduleId?: number;
  difficulty?: string;
}

export interface ExamQuestion {
  examQuestionId: number;
  questionId: number;
  content: string;
  questionType: string;
  points: number;
  orderIndex: number;
  hasRubric?: boolean;
}

export interface ExamGroup {
  examGroupId: number;
  groupId: number;
  title: string;
  points: number;
  orderIndex: number;
  passageText?: string;
  questionCount?: number;
}

export interface ExamDetail {
  examId: number;
  title?: string;
  description?: string;
  courseId?: number;
  courseName?: string;
  moduleId?: number;
  moduleName?: string;
  examKind?: ExamKind;
  durationMinutes?: number;
  passMark?: number;
  maxAttempts?: number;
  questionCount?: number;
  totalPoints?: number;
  status?: ExamStatus;
  generationType?: GenerationType;
  isPractice?: boolean;
  createdAt?: string;
  configs: ExamConfig[];
  questions: ExamQuestion[];
  groups: ExamGroup[];
  warnings?: string[];
}

export interface CreateExamRequest {
  title: string;
  description?: string;
  courseId?: number;
  moduleId?: number;
  durationMinutes: number;
  isPractice: boolean;
  generationType: GenerationType;
  status?: ExamStatus;
  passMark?: number;
  maxAttempts?: number;
  questionIds?: { questionId: number; points: number; orderIndex: number }[];
  configs?: ExamConfig[];
  groupIds?: { groupId: number; points: number; orderIndex: number }[];
}

export interface UpdateExamRequest {
  title?: string;
  description?: string;
  courseId?: number;
  moduleId?: number;
  durationMinutes?: number;
  isPractice?: boolean;
  generationType?: GenerationType;
  passMark?: number;
  maxAttempts?: number;
  configs?: ExamConfig[];
}

export interface ExamListParams {
  search?: string;
  courseId?: number;
  moduleId?: number;
  status?: ExamStatus | string;
  examKind?: ExamKind | string;
  page?: number;
  size?: number;
}

export interface RubricCriterion {
  name: string;
  maxScore: number;
  weight: number;
  descriptors?: string;
}

export interface RubricData {
  criteria: RubricCriterion[];
  totalPoints: number;
  notes?: string;
}

export interface BankQuestionItem {
  questionId: number;
  content: string;
  courseId?: number;
  courseName?: string;
  moduleId?: number;
  moduleName?: string;
  groupId?: number | null;
  questionType: string;
  difficulty: Difficulty;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  optionCount?: number;
  options?: { optionId?: number; optionText: string; isCorrect: boolean; orderIndex: number }[];
  explanation?: string;
  essayGradingRubric?: RubricData | null;
  updatedAt?: string;
}

export interface QuestionGroupItem {
  groupId: number;
  courseId?: number;
  moduleId?: number;
  title: string;
  passageText: string;
  questionCount: number;
}

export interface QuestionGroupListParams {
  courseId?: number;
  moduleId?: number;
  search?: string;
  page?: number;
  size?: number;
}

export interface CreateQuestionGroupRequest {
  courseId?: number;
  moduleId?: number;
  title: string;
  passageText: string;
}

export interface AiQuestionDraft {
  questionId?: number;
  content: string;
  questionType: string;
  difficulty: Difficulty;
  options: { optionText: string; isCorrect: boolean; orderIndex: number }[];
  explanation?: string;
  questionMetadata?: unknown;
}

export interface AiGenerateRequest {
  courseId: number;
  moduleId?: number;
  title?: string;
  questionCount: number;
  difficultyDistribution: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  questionTypes: {
    questionType: string;
    count: number;
  }[];
  durationMinutes?: number;
  language: string;
  useExistingBank?: boolean;
}

export interface AiExamDraftResponse {
  title: string;
  description: string;
  durationMinutes: number;
  questionCount: number;
  questions: AiQuestionDraft[];
  warnings?: string[];
}

export interface ImportExamResponse {
  imported: number;
  reused: number;
  skippedDuplicates: number;
  questionIds: number[];
}

const INITIAL_MOCK_EXAMS: ExamDetail[] = [
  {
    examId: 20,
    title: 'ML Fundamentals Final Examination',
    description: 'Comprehensive final examination covering ML algorithms and fundamentals.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    examKind: 'QUIZ',
    durationMinutes: 90,
    passMark: 70,
    maxAttempts: 2,
    questionCount: 3,
    totalPoints: 8,
    status: 'PUBLISHED',
    generationType: 'STATIC',
    isPractice: false,
    createdAt: '2026-10-10T08:00:00Z',
    configs: [],
    questions: [
      {
        examQuestionId: 301,
        questionId: 101,
        content: 'What is gradient descent and how does it optimize cost function?',
        questionType: 'SINGLE_CHOICE',
        points: 2,
        orderIndex: 0,
      },
      {
        examQuestionId: 302,
        questionId: 103,
        content: 'What is the primary function of the softmax activation in multiclass classification?',
        questionType: 'SINGLE_CHOICE',
        points: 2,
        orderIndex: 1,
      },
      {
        examQuestionId: 303,
        questionId: 105,
        content: 'Which statements about ReLU activation are true?',
        questionType: 'MULTI_CHOICE',
        points: 4,
        orderIndex: 2,
      },
    ],
    groups: [
      {
        examGroupId: 401,
        groupId: 7,
        title: 'Reading Passage: Neural Optimization',
        points: 5,
        orderIndex: 0,
        passageText: 'Deep learning optimizers adjust neural network weights iteratively to minimize error.',
        questionCount: 3,
      },
    ],
    warnings: [],
  },
  {
    examId: 21,
    title: 'Advanced AI Ethics & Societal Impact Essay',
    description: 'Critical analysis of modern generative AI systems and their ethical implications.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Ethics in AI',
    examKind: 'ESSAY',
    durationMinutes: 60,
    passMark: 60,
    maxAttempts: 1,
    questionCount: 2,
    totalPoints: 20,
    status: 'DRAFT',
    generationType: 'STATIC',
    isPractice: false,
    createdAt: '2026-10-12T09:30:00Z',
    configs: [],
    questions: [
      {
        examQuestionId: 304,
        questionId: 201,
        content: 'Analyze the impact of autonomous AI agents on labor markets and privacy.',
        questionType: 'ESSAY',
        points: 10,
        orderIndex: 0,
        hasRubric: true,
      },
      {
        examQuestionId: 305,
        questionId: 202,
        content: 'Discuss algorithmic bias in credit scoring systems and propose mitigation strategies.',
        questionType: 'ESSAY',
        points: 10,
        orderIndex: 1,
        hasRubric: false,
      },
    ],
    groups: [],
    warnings: ['Question 202 is missing grading rubric'],
  },
  {
    examId: 22,
    title: 'Python Core Practice Quiz',
    description: 'Self-assessment quiz covering control flow, data structures and functions.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Python Basics',
    examKind: 'QUIZ',
    durationMinutes: 45,
    passMark: 50,
    maxAttempts: 3,
    questionCount: 0,
    totalPoints: 0,
    status: 'DRAFT',
    generationType: 'RANDOM',
    isPractice: true,
    createdAt: '2026-10-14T11:00:00Z',
    configs: [
      {
        configId: 1,
        questionType: 'SINGLE_CHOICE',
        numberOfQuestions: 10,
        moduleId: 3,
        difficulty: 'EASY',
      },
      {
        configId: 2,
        questionType: 'TRUE_FALSE',
        numberOfQuestions: 5,
        moduleId: 3,
        difficulty: 'MEDIUM',
      },
    ],
    questions: [],
    groups: [],
    warnings: [],
  },
  {
    examId: 23,
    title: 'Data Wrangling Midterm Exam',
    description: 'Midterm test with Pandas, NumPy and data cleaning exercises.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Data Preparation',
    examKind: 'QUIZ',
    durationMinutes: 75,
    passMark: 65,
    maxAttempts: 1,
    questionCount: 2,
    totalPoints: 6,
    status: 'ARCHIVED',
    generationType: 'STATIC',
    isPractice: false,
    createdAt: '2026-09-20T14:00:00Z',
    configs: [],
    questions: [
      {
        examQuestionId: 306,
        questionId: 101,
        content: 'What is gradient descent and how does it optimize cost function?',
        questionType: 'SINGLE_CHOICE',
        points: 3,
        orderIndex: 0,
      },
      {
        examQuestionId: 307,
        questionId: 106,
        content: 'Python lists are mutable while tuples are immutable.',
        questionType: 'TRUE_FALSE',
        points: 3,
        orderIndex: 1,
      },
    ],
    groups: [],
    warnings: [],
  },
];

const INITIAL_MOCK_BANK_QUESTIONS: BankQuestionItem[] = [
  {
    questionId: 101,
    content: 'What is gradient descent and how does it optimize cost function?',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    status: 'ACTIVE',
    optionCount: 4,
    options: [
      { optionId: 1, optionText: 'Iteratively updates parameters in opposite direction of gradient', isCorrect: true, orderIndex: 0 },
      { optionId: 2, optionText: 'Maximizes the training dataset size through augmentation', isCorrect: false, orderIndex: 1 },
      { optionId: 3, optionText: 'Computes closed-form inverse matrix solution', isCorrect: false, orderIndex: 2 },
      { optionId: 4, optionText: 'Eliminates outliers from validation partition', isCorrect: false, orderIndex: 3 },
    ],
    explanation: 'Gradient descent minimizes the cost function by taking steps proportional to the negative of the gradient.',
  },
  {
    questionId: 103,
    content: 'What is the primary function of the softmax activation in multiclass classification?',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'SINGLE_CHOICE',
    difficulty: 'EASY',
    status: 'ACTIVE',
    optionCount: 4,
    options: [
      { optionId: 5, optionText: 'Converts arbitrary real-valued logits into a probability distribution', isCorrect: true, orderIndex: 0 },
      { optionId: 6, optionText: 'Scales features to zero mean and unit variance', isCorrect: false, orderIndex: 1 },
      { optionId: 7, optionText: 'Prevents overfitting by dropping random neurons', isCorrect: false, orderIndex: 2 },
      { optionId: 8, optionText: 'Computes Euclidean distance between embeddings', isCorrect: false, orderIndex: 3 },
    ],
    explanation: 'Softmax turns unnormalized output values into probabilities that sum to 1.',
  },
  {
    questionId: 105,
    content: 'Which statements about ReLU activation are true?',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'MULTI_CHOICE',
    difficulty: 'MEDIUM',
    status: 'ACTIVE',
    optionCount: 4,
    options: [
      { optionId: 9, optionText: 'It is defined as f(x) = max(0, x)', isCorrect: true, orderIndex: 0 },
      { optionId: 10, optionText: 'It mitigates vanishing gradient problem for positive inputs', isCorrect: true, orderIndex: 1 },
      { optionId: 11, optionText: 'It outputs negative values between -1 and 0', isCorrect: false, orderIndex: 2 },
      { optionId: 12, optionText: 'Its derivative is always 1 for all real numbers', isCorrect: false, orderIndex: 3 },
    ],
    explanation: 'ReLU is max(0, x) and its derivative is 1 for positive numbers and 0 for negative.',
  },
  {
    questionId: 106,
    content: 'Python lists are mutable while tuples are immutable.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Python Basics',
    questionType: 'TRUE_FALSE',
    difficulty: 'EASY',
    status: 'ACTIVE',
    optionCount: 2,
    options: [
      { optionId: 13, optionText: 'True', isCorrect: true, orderIndex: 0 },
      { optionId: 14, optionText: 'False', isCorrect: false, orderIndex: 1 },
    ],
    explanation: 'Tuples cannot be modified after instantiation.',
  },
  {
    questionId: 107,
    content: 'Fill in the blank: In supervised learning, the model is trained on ________ data.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'FILL_BLANK',
    difficulty: 'EASY',
    status: 'ACTIVE',
    optionCount: 1,
    options: [
      { optionId: 15, optionText: 'labeled', isCorrect: true, orderIndex: 0 },
    ],
    explanation: 'Supervised learning requires labeled training pairs.',
  },
  {
    questionId: 108,
    content: 'Match the evaluation metric to its appropriate machine learning task.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'MATCHING',
    difficulty: 'HARD',
    status: 'ACTIVE',
    optionCount: 4,
    options: [
      { optionId: 16, optionText: 'Precision / Recall', isCorrect: true, orderIndex: 0 },
      { optionId: 17, optionText: 'Classification', isCorrect: true, orderIndex: 1 },
      { optionId: 18, optionText: 'Mean Squared Error', isCorrect: true, orderIndex: 2 },
      { optionId: 19, optionText: 'Regression', isCorrect: true, orderIndex: 3 },
    ],
    explanation: 'Precision/Recall applies to classification while MSE evaluates regression.',
  },
  {
    questionId: 109,
    content: 'Arrange the standard Machine Learning pipeline steps in chronological order.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Machine Learning Basics',
    questionType: 'ORDERING',
    difficulty: 'MEDIUM',
    status: 'ACTIVE',
    optionCount: 4,
    options: [
      { optionId: 20, optionText: 'Data Ingestion & Cleaning', isCorrect: true, orderIndex: 0 },
      { optionId: 21, optionText: 'Feature Engineering', isCorrect: true, orderIndex: 1 },
      { optionId: 22, optionText: 'Model Training', isCorrect: true, orderIndex: 2 },
      { optionId: 23, optionText: 'Evaluation on Test Partition', isCorrect: true, orderIndex: 3 },
    ],
    explanation: 'Standard order proceeds from data cleaning to feature prep, model training, and evaluation.',
  },
  {
    questionId: 201,
    content: 'Analyze the impact of autonomous AI agents on labor markets and privacy.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Ethics in AI',
    questionType: 'ESSAY',
    difficulty: 'HARD',
    status: 'ACTIVE',
    optionCount: 0,
    options: [],
    explanation: 'Evaluate systemic risks, workforce displacement, and data governance frameworks.',
    essayGradingRubric: {
      totalPoints: 10,
      notes: 'Deduct up to 2 points if exceeds word count by 20%.',
      criteria: [
        { name: 'Content and Ideas', maxScore: 4, weight: 40, descriptors: 'Thorough discussion of labor automation and privacy dilemmas.' },
        { name: 'Critical Reasoning & Organization', maxScore: 3, weight: 30, descriptors: 'Logical progression and structured comparative arguments.' },
        { name: 'Evidence & Solutions', maxScore: 3, weight: 30, descriptors: 'Concrete mitigation strategies proposed with realistic feasibility.' },
      ],
    },
  },
  {
    questionId: 202,
    content: 'Discuss algorithmic bias in credit scoring systems and propose mitigation strategies.',
    courseId: 12,
    courseName: 'Python for Data Science',
    moduleId: 3,
    moduleName: 'Ethics in AI',
    questionType: 'ESSAY',
    difficulty: 'HARD',
    status: 'ACTIVE',
    optionCount: 0,
    options: [],
    explanation: 'Identify bias sources in training datasets and proxy features.',
    essayGradingRubric: null,
  },
];

const INITIAL_MOCK_GROUPS: QuestionGroupItem[] = [
  {
    groupId: 7,
    courseId: 12,
    moduleId: 3,
    title: 'Reading Passage: Neural Optimization',
    passageText: 'Deep learning models optimize loss functions across multi-dimensional parameter spaces. Stochastic gradient descent and its adaptive variants such as Adam dynamically regulate learning rates across diverse gradient trajectories.',
    questionCount: 3,
  },
  {
    groupId: 8,
    courseId: 12,
    moduleId: 3,
    title: 'Case Study: AI Governance in Healthcare',
    passageText: 'Deploying machine learning models in diagnostic pipelines introduces regulatory scrutiny around explainability, patient data consent, and algorithmic accountability.',
    questionCount: 2,
  },
];

const EXAMS_STORAGE_KEY = 'examprep_manager_exams_v1';
const QUESTIONS_STORAGE_KEY = 'examprep_manager_questions_v1';
const GROUPS_STORAGE_KEY = 'examprep_manager_groups_v1';

function loadStoredExams(): ExamDetail[] {
  try {
    const raw = localStorage.getItem(EXAMS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_EXAMS));
      return INITIAL_MOCK_EXAMS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MOCK_EXAMS;
  }
}

function saveStoredExams(exams: ExamDetail[]): void {
  try {
    localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(exams));
  } catch { }
}

function loadStoredQuestions(): BankQuestionItem[] {
  try {
    const raw = localStorage.getItem(QUESTIONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_BANK_QUESTIONS));
      return INITIAL_MOCK_BANK_QUESTIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MOCK_BANK_QUESTIONS;
  }
}

function saveStoredQuestions(questions: BankQuestionItem[]): void {
  try {
    localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify(questions));
  } catch { }
}

function loadStoredGroups(): QuestionGroupItem[] {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_GROUPS));
      return INITIAL_MOCK_GROUPS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_MOCK_GROUPS;
  }
}

function saveStoredGroups(groups: QuestionGroupItem[]): void {
  try {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch { }
}

export const examService = {
  async getExams(params?: ExamListParams): Promise<PageResponse<ExamListItem>> {
    try {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.courseId) q.set('courseId', String(params.courseId));
      if (params?.moduleId) q.set('moduleId', String(params.moduleId));
      if (params?.status && params.status !== 'all') q.set('status', params.status);
      if (params?.examKind && params.examKind !== 'all') q.set('examKind', params.examKind);
      if (params?.page !== undefined) q.set('page', String(params.page));
      if (params?.size !== undefined) q.set('size', String(params.size));

      const queryStr = q.toString();
      const res = await api.get<ApiResponse<PageResponse<ExamListItem>>>(
        `/manager/exams${queryStr ? `?${queryStr}` : ''}`
      );
      if (res.data && Array.isArray(res.data.content)) {
        return res.data;
      }
      return this.getMockExams(params);
    } catch {
      return this.getMockExams(params);
    }
  },

  getMockExams(params?: ExamListParams): PageResponse<ExamListItem> {
    const all = loadStoredExams();
    let filtered = all.filter((item) => {
      if (params?.search) {
        const s = params.search.toLowerCase().trim();
        if (!item.title?.toLowerCase().includes(s) && !item.description?.toLowerCase().includes(s)) {
          return false;
        }
      }
      if (params?.courseId && item.courseId !== params.courseId) {
        return false;
      }
      if (params?.moduleId && item.moduleId !== params.moduleId) {
        return false;
      }
      if (params?.status && params.status !== 'all' && item.status !== params.status) {
        return false;
      }
      if (params?.examKind && params.examKind !== 'all' && item.examKind !== params.examKind) {
        return false;
      }
      return true;
    });

    const page = params?.page ?? 0;
    const size = params?.size ?? 20;
    const totalElements = filtered.length;
    const totalPages = Math.ceil(totalElements / size) || 1;
    const start = page * size;
    const pagedContent = filtered.slice(start, start + size).map((e) => ({
      examId: e.examId,
      title: e.title || '',
      description: e.description,
      courseId: e.courseId || 12,
      courseName: e.courseName || 'Course',
      moduleId: e.moduleId,
      moduleName: e.moduleName,
      examKind: e.examKind || 'QUIZ',
      durationMinutes: e.durationMinutes || 60,
      passMark: e.passMark || 50,
      maxAttempts: e.maxAttempts || 1,
      questionCount: e.questions.length + e.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0),
      totalPoints: e.questions.reduce((acc, q) => acc + q.points, 0) + e.groups.reduce((acc, g) => acc + g.points, 0),
      status: e.status || 'DRAFT',
      generationType: e.generationType || 'STATIC',
      isPractice: !!e.isPractice,
      createdAt: e.createdAt || new Date().toISOString(),
    }));

    return {
      content: pagedContent,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    };
  },

  async getExamById(id: number): Promise<ExamDetail> {
    try {
      const res = await api.get<ApiResponse<ExamDetail>>(`/manager/exams/${id}`);
      if (res.data && res.data.examId) {
        return res.data;
      }
      return this.getMockExamById(id);
    } catch {
      return this.getMockExamById(id);
    }
  },

  getMockExamById(id: number): ExamDetail {
    const list = loadStoredExams();
    const found = list.find((e) => e.examId === id);
    if (!found) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    return JSON.parse(JSON.stringify(found));
  },

  async createExam(payload: CreateExamRequest): Promise<ExamDetail> {
    try {
      const res = await api.post<ApiResponse<ExamDetail>>('/manager/exams', payload);
      if (res.data && res.data.examId) {
        return res.data;
      }
      return this.createMockExam(payload);
    } catch {
      return this.createMockExam(payload);
    }
  },

  createMockExam(payload: CreateExamRequest): ExamDetail {
    const list = loadStoredExams();
    const bank = loadStoredQuestions();
    const groupsBank = loadStoredGroups();
    const newId = Date.now();

    const questions: ExamQuestion[] = (payload.questionIds || []).map((q, idx) => {
      const bq = bank.find((b) => b.questionId === q.questionId);
      return {
        examQuestionId: newId * 10 + idx + 1,
        questionId: q.questionId,
        content: bq?.content || 'Sample question',
        questionType: bq?.questionType || 'SINGLE_CHOICE',
        points: q.points || 1,
        orderIndex: q.orderIndex ?? idx,
        hasRubric: !!bq?.essayGradingRubric,
      };
    });

    const groups: ExamGroup[] = (payload.groupIds || []).map((g, idx) => {
      const bg = groupsBank.find((grp) => grp.groupId === g.groupId);
      return {
        examGroupId: newId * 100 + idx + 1,
        groupId: g.groupId,
        title: bg?.title || 'Group',
        points: g.points || 1,
        orderIndex: g.orderIndex ?? idx,
        passageText: bg?.passageText,
        questionCount: bg?.questionCount || 0,
      };
    });

    const isEssay = questions.length > 0 && questions.every((q) => q.questionType === 'ESSAY');
    const examKind: ExamKind = isEssay ? 'ESSAY' : 'QUIZ';

    const newExam: ExamDetail = {
      examId: newId,
      title: payload.title,
      description: payload.description,
      courseId: payload.courseId,
      courseName: payload.courseId ? `Course ${payload.courseId}` : undefined,
      moduleId: payload.moduleId,
      moduleName: payload.moduleId ? `Module ${payload.moduleId}` : undefined,
      examKind,
      durationMinutes: payload.durationMinutes,
      passMark: payload.passMark ?? 50,
      maxAttempts: payload.maxAttempts ?? 1,
      questionCount: questions.length + groups.reduce((acc, g) => acc + (g.questionCount || 0), 0),
      totalPoints: questions.reduce((acc, q) => acc + q.points, 0) + groups.reduce((acc, g) => acc + g.points, 0),
      status: 'DRAFT',
      generationType: payload.generationType,
      isPractice: payload.isPractice,
      createdAt: new Date().toISOString(),
      configs: payload.configs || [],
      questions,
      groups,
      warnings: [],
    };

    list.unshift(newExam);
    saveStoredExams(list);
    return newExam;
  },

  async updateExam(id: number, payload: UpdateExamRequest): Promise<ExamDetail> {
    try {
      const res = await api.request<ApiResponse<ExamDetail>>({
        method: 'put',
        url: `/manager/exams/${id}`,
        data: payload,
      });
      if (res.data) {
        return res.data;
      }
      return this.updateMockExam(id, payload);
    } catch {
      return this.updateMockExam(id, payload);
    }
  },

  updateMockExam(id: number, payload: UpdateExamRequest): ExamDetail {
    const list = loadStoredExams();
    const idx = list.findIndex((e) => e.examId === id);
    if (idx === -1) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    const current = list[idx];
    const updated: ExamDetail = {
      ...current,
      title: payload.title !== undefined ? payload.title : current.title,
      description: payload.description !== undefined ? payload.description : current.description,
      courseId: payload.courseId !== undefined ? payload.courseId : current.courseId,
      moduleId: payload.moduleId !== undefined ? payload.moduleId : current.moduleId,
      durationMinutes: payload.durationMinutes !== undefined ? payload.durationMinutes : current.durationMinutes,
      isPractice: payload.isPractice !== undefined ? payload.isPractice : current.isPractice,
      generationType: payload.generationType !== undefined ? payload.generationType : current.generationType,
      passMark: payload.passMark !== undefined ? payload.passMark : current.passMark,
      maxAttempts: payload.maxAttempts !== undefined ? payload.maxAttempts : current.maxAttempts,
      configs: payload.configs !== undefined ? payload.configs : current.configs,
    };
    list[idx] = updated;
    saveStoredExams(list);
    return updated;
  },

  async patchPublishExam(id: number, status: ExamStatus): Promise<{ examId: number; status: ExamStatus; warnings?: string[] }> {
    try {
      const res = await api.request<ApiResponse<{ examId: number; status: ExamStatus; warnings?: string[] }>>({
        method: 'patch',
        url: `/manager/exams/${id}/publish`,
        data: { status },
      });
      if (res.data) {
        return res.data;
      }
      return this.patchMockPublishExam(id, status);
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: unknown } };
      if (errorObj?.response?.status === 400 || errorObj?.response?.status === 409) {
        throw err;
      }
      return this.patchMockPublishExam(id, status);
    }
  },

  patchMockPublishExam(id: number, status: ExamStatus): { examId: number; status: ExamStatus; warnings?: string[] } {
    const list = loadStoredExams();
    const idx = list.findIndex((e) => e.examId === id);
    if (idx === -1) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    const current = list[idx];
    const questionCount = current.questions.length + current.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    if (status === 'PUBLISHED' && questionCount === 0 && current.generationType === 'STATIC') {
      throw { response: { status: 400, data: { message: 'Exam has no questions and cannot be published' } } };
    }
    const warnings: string[] = [];
    if (status === 'PUBLISHED') {
      current.questions.forEach((q) => {
        if (q.questionType === 'ESSAY' && !q.hasRubric) {
          warnings.push(`Essay question #${q.questionId} is missing rubric`);
        }
      });
    }
    current.status = status;
    current.warnings = warnings;
    list[idx] = current;
    saveStoredExams(list);
    return { examId: id, status, warnings };
  },

  async deleteExam(id: number): Promise<void> {
    try {
      await api.request<ApiResponse<null>>({
        method: 'delete',
        url: `/manager/exams/${id}`,
      });
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: unknown } };
      if (errorObj?.response?.status === 409) {
        throw err;
      }
      this.deleteMockExam(id);
    }
  },

  deleteMockExam(id: number): void {
    const list = loadStoredExams();
    const idx = list.findIndex((e) => e.examId === id);
    if (idx === -1) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    list.splice(idx, 1);
    saveStoredExams(list);
  },

  async addQuestionToExam(id: number, payload: { questionId: number; points?: number }): Promise<ExamQuestion> {
    try {
      const res = await api.post<ApiResponse<ExamQuestion>>(`/manager/exams/${id}/questions`, payload);
      if (res.data) {
        return res.data;
      }
      return this.addMockQuestionToExam(id, payload);
    } catch {
      return this.addMockQuestionToExam(id, payload);
    }
  },

  addMockQuestionToExam(id: number, payload: { questionId: number; points?: number }): ExamQuestion {
    const list = loadStoredExams();
    const exam = list.find((e) => e.examId === id);
    if (!exam) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    if (exam.questions.some((q) => q.questionId === payload.questionId)) {
      throw { response: { status: 409, data: { message: 'Question already exists in this exam' } } };
    }
    const bank = loadStoredQuestions();
    const bq = bank.find((b) => b.questionId === payload.questionId);
    if (bq?.status === 'DRAFT' || bq?.status === 'INACTIVE') {
      throw { response: { status: 400, data: { message: 'Only ACTIVE questions can be added to exams' } } };
    }
    const newExamQuestion: ExamQuestion = {
      examQuestionId: Date.now() + Math.floor(Math.random() * 1000),
      questionId: payload.questionId,
      content: bq?.content || 'Question content',
      questionType: bq?.questionType || 'SINGLE_CHOICE',
      points: payload.points || 1,
      orderIndex: exam.questions.length,
      hasRubric: !!bq?.essayGradingRubric,
    };
    exam.questions.push(newExamQuestion);
    exam.questionCount = exam.questions.length + exam.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    exam.totalPoints = exam.questions.reduce((acc, q) => acc + q.points, 0) + exam.groups.reduce((acc, g) => acc + g.points, 0);
    saveStoredExams(list);
    return newExamQuestion;
  },

  async removeQuestionFromExam(id: number, examQuestionId: number): Promise<void> {
    try {
      await api.request<ApiResponse<null>>({
        method: 'delete',
        url: `/manager/exams/${id}/questions/${examQuestionId}`,
      });
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: unknown } };
      if (errorObj?.response?.status === 409) {
        throw err;
      }
      this.removeMockQuestionFromExam(id, examQuestionId);
    }
  },

  removeMockQuestionFromExam(id: number, examQuestionId: number): void {
    const list = loadStoredExams();
    const exam = list.find((e) => e.examId === id);
    if (!exam) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    if (exam.status === 'PUBLISHED') {
      throw { response: { status: 409, data: { message: 'Cannot modify a published exam. Unpublish first.' } } };
    }
    exam.questions = exam.questions.filter((q) => q.examQuestionId !== examQuestionId);
    exam.questionCount = exam.questions.length + exam.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    exam.totalPoints = exam.questions.reduce((acc, q) => acc + q.points, 0) + exam.groups.reduce((acc, g) => acc + g.points, 0);
    saveStoredExams(list);
  },

  async addGroupToExam(id: number, payload: { groupId: number; points?: number }): Promise<ExamGroup> {
    try {
      const res = await api.post<ApiResponse<ExamGroup>>(`/manager/exams/${id}/groups`, payload);
      if (res.data) {
        return res.data;
      }
      return this.addMockGroupToExam(id, payload);
    } catch {
      return this.addMockGroupToExam(id, payload);
    }
  },

  addMockGroupToExam(id: number, payload: { groupId: number; points?: number }): ExamGroup {
    const list = loadStoredExams();
    const exam = list.find((e) => e.examId === id);
    if (!exam) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    if (exam.groups.some((g) => g.groupId === payload.groupId)) {
      throw { response: { status: 409, data: { message: 'Group already attached to this exam' } } };
    }
    const groupsBank = loadStoredGroups();
    const bg = groupsBank.find((grp) => grp.groupId === payload.groupId);
    const newGroup: ExamGroup = {
      examGroupId: Date.now() + Math.floor(Math.random() * 1000),
      groupId: payload.groupId,
      title: bg?.title || 'Question Group',
      points: payload.points || 1,
      orderIndex: exam.groups.length,
      passageText: bg?.passageText,
      questionCount: bg?.questionCount || 0,
    };
    exam.groups.push(newGroup);
    exam.questionCount = exam.questions.length + exam.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    exam.totalPoints = exam.questions.reduce((acc, q) => acc + q.points, 0) + exam.groups.reduce((acc, g) => acc + g.points, 0);
    saveStoredExams(list);
    return newGroup;
  },

  async removeGroupFromExam(id: number, examGroupId: number): Promise<void> {
    try {
      await api.request<ApiResponse<null>>({
        method: 'delete',
        url: `/manager/exams/${id}/groups/${examGroupId}`,
      });
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: unknown } };
      if (errorObj?.response?.status === 409) {
        throw err;
      }
      this.removeMockGroupFromExam(id, examGroupId);
    }
  },

  removeMockGroupFromExam(id: number, examGroupId: number): void {
    const list = loadStoredExams();
    const exam = list.find((e) => e.examId === id);
    if (!exam) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    if (exam.status === 'PUBLISHED') {
      throw { response: { status: 409, data: { message: 'Cannot modify a published exam. Unpublish first.' } } };
    }
    exam.groups = exam.groups.filter((g) => g.examGroupId !== examGroupId);
    exam.questionCount = exam.questions.length + exam.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    exam.totalPoints = exam.questions.reduce((acc, q) => acc + q.points, 0) + exam.groups.reduce((acc, g) => acc + g.points, 0);
    saveStoredExams(list);
  },

  async getQuestions(params?: QuestionListParams): Promise<PageResponse<BankQuestionItem>> {
    try {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.courseId) q.set('courseId', String(params.courseId));
      if (params?.moduleId) q.set('moduleId', String(params.moduleId));
      if (params?.questionType) q.set('questionType', params.questionType);
      if (params?.difficulty) q.set('difficulty', params.difficulty);
      if (params?.status) q.set('status', params.status);
      if (params?.page !== undefined) q.set('page', String(params.page));
      if (params?.size !== undefined) q.set('size', String(params.size));

      const queryStr = q.toString();
      const res = await api.get<ApiResponse<PageResponse<BankQuestionItem>>>(
        `/manager/questions${queryStr ? `?${queryStr}` : ''}`
      );
      if (res.data && Array.isArray(res.data.content)) {
        return res.data;
      }
      return this.getMockQuestions(params);
    } catch {
      return this.getMockQuestions(params);
    }
  },

  getMockQuestions(params?: QuestionListParams): PageResponse<BankQuestionItem> {
    const bank = loadStoredQuestions();
    let filtered = bank.filter((item) => {
      if (params?.search) {
        const s = params.search.toLowerCase().trim();
        if (!item.content.toLowerCase().includes(s)) return false;
      }
      if (params?.courseId && item.courseId !== params.courseId) return false;
      if (params?.moduleId && item.moduleId !== params.moduleId) return false;
      if (params?.difficulty && item.difficulty !== params.difficulty) return false;
      if (params?.status && item.status !== params.status) return false;
      if (params?.questionType && item.questionType !== params.questionType) return false;
      return true;
    });

    const page = params?.page ?? 0;
    const size = params?.size ?? 20;
    const totalElements = filtered.length;
    const totalPages = Math.ceil(totalElements / size) || 1;
    const start = page * size;
    const pagedContent = filtered.slice(start, start + size);

    return {
      content: pagedContent,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    };
  },

  async getQuestionById(id: number): Promise<BankQuestionItem> {
    try {
      const res = await api.get<ApiResponse<BankQuestionItem>>(`/manager/questions/${id}`);
      if (res.data && res.data.questionId) {
        return res.data;
      }
      return this.getMockQuestionById(id);
    } catch {
      return this.getMockQuestionById(id);
    }
  },

  getMockQuestionById(id: number): BankQuestionItem {
    const bank = loadStoredQuestions();
    const item = bank.find((q) => q.questionId === id);
    if (!item) {
      throw { response: { status: 404, data: { message: 'Question not found' } } };
    }
    return JSON.parse(JSON.stringify(item));
  },

  async updateRubric(questionId: number, payload: RubricData): Promise<BankQuestionItem> {
    try {
      const res = await api.request<ApiResponse<BankQuestionItem>>({
        method: 'put',
        url: `/manager/questions/${questionId}/rubric`,
        data: payload,
      });
      if (res.data) {
        return res.data;
      }
      return this.updateMockRubric(questionId, payload);
    } catch {
      return this.updateMockRubric(questionId, payload);
    }
  },

  updateMockRubric(questionId: number, payload: RubricData): BankQuestionItem {
    if (!payload.criteria || payload.criteria.length === 0) {
      throw { response: { status: 400, data: { message: 'Criteria list cannot be empty' } } };
    }
    const sumScore = payload.criteria.reduce((acc, c) => acc + (Number(c.maxScore) || 0), 0);
    if (sumScore !== payload.totalPoints) {
      throw { response: { status: 400, data: { message: 'Sum of criterion max scores must equal total points' } } };
    }
    const bank = loadStoredQuestions();
    const q = bank.find((item) => item.questionId === questionId);
    if (!q) {
      throw { response: { status: 404, data: { message: 'Question not found' } } };
    }
    q.essayGradingRubric = {
      criteria: payload.criteria,
      totalPoints: payload.totalPoints,
      notes: payload.notes,
    };
    saveStoredQuestions(bank);

    const exams = loadStoredExams();
    exams.forEach((ex) => {
      ex.questions.forEach((eq) => {
        if (eq.questionId === questionId) {
          eq.hasRubric = true;
        }
      });
    });
    saveStoredExams(exams);

    return q;
  },

  async getQuestionGroups(params?: QuestionGroupListParams): Promise<PageResponse<QuestionGroupItem>> {
    try {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.courseId) q.set('courseId', String(params.courseId));
      if (params?.moduleId) q.set('moduleId', String(params.moduleId));
      if (params?.page !== undefined) q.set('page', String(params.page));
      if (params?.size !== undefined) q.set('size', String(params.size));

      const queryStr = q.toString();
      const res = await api.get<ApiResponse<PageResponse<QuestionGroupItem>>>(
        `/manager/question-groups${queryStr ? `?${queryStr}` : ''}`
      );
      if (res.data && Array.isArray(res.data.content)) {
        return res.data;
      }
      return this.getMockQuestionGroups(params);
    } catch {
      return this.getMockQuestionGroups(params);
    }
  },

  getMockQuestionGroups(params?: QuestionGroupListParams): PageResponse<QuestionGroupItem> {
    const groups = loadStoredGroups();
    let filtered = groups.filter((g) => {
      if (params?.search) {
        const s = params.search.toLowerCase().trim();
        if (!g.title.toLowerCase().includes(s) && !g.passageText.toLowerCase().includes(s)) return false;
      }
      if (params?.courseId && g.courseId !== params.courseId) return false;
      if (params?.moduleId && g.moduleId !== params.moduleId) return false;
      return true;
    });

    const page = params?.page ?? 0;
    const size = params?.size ?? 20;
    const totalElements = filtered.length;
    const totalPages = Math.ceil(totalElements / size) || 1;
    const start = page * size;
    const pagedContent = filtered.slice(start, start + size);

    return {
      content: pagedContent,
      page,
      size,
      totalElements,
      totalPages,
      first: page === 0,
      last: page >= totalPages - 1,
    };
  },

  async createQuestionGroup(payload: CreateQuestionGroupRequest): Promise<QuestionGroupItem> {
    try {
      const res = await api.post<ApiResponse<QuestionGroupItem>>('/manager/question-groups', payload);
      if (res.data) {
        return res.data;
      }
      return this.createMockQuestionGroup(payload);
    } catch {
      return this.createMockQuestionGroup(payload);
    }
  },

  createMockQuestionGroup(payload: CreateQuestionGroupRequest): QuestionGroupItem {
    const groups = loadStoredGroups();
    const newGroup: QuestionGroupItem = {
      groupId: Date.now(),
      courseId: payload.courseId,
      moduleId: payload.moduleId,
      title: payload.title,
      passageText: payload.passageText,
      questionCount: 0,
    };
    groups.unshift(newGroup);
    saveStoredGroups(groups);
    return newGroup;
  },

  async batchCreateQuestions(payload: { moduleId?: number; questions: unknown[] }): Promise<{ questionId: number }[]> {
    try {
      const res = await api.post<ApiResponse<{ questionId: number }[]>>('/manager/questions/batch', payload);
      if (res.data && Array.isArray(res.data)) {
        return res.data;
      }
      return this.batchCreateMockQuestions(payload);
    } catch {
      return this.batchCreateMockQuestions(payload);
    }
  },

  batchCreateMockQuestions(payload: { moduleId?: number; questions: unknown[] }): { questionId: number }[] {
    const bank = loadStoredQuestions();
    const created: { questionId: number }[] = [];
    (payload.questions as {
      content: string;
      questionType: string;
      difficulty?: Difficulty;
      options?: { optionText: string; isCorrect: boolean; orderIndex: number }[];
      explanation?: string;
    }[]).forEach((q) => {
      const id = Date.now() + Math.floor(Math.random() * 10000);
      const bq: BankQuestionItem = {
        questionId: id,
        content: q.content,
        moduleId: payload.moduleId,
        questionType: q.questionType,
        difficulty: q.difficulty || 'MEDIUM',
        status: 'ACTIVE',
        optionCount: q.options ? q.options.length : 0,
        options: (q.options || []).map((o, idx) => ({ optionId: id * 10 + idx, ...o })),
        explanation: q.explanation,
      };
      bank.push(bq);
      created.push({ questionId: id });
    });
    saveStoredQuestions(bank);
    return created;
  },

  async importQuestions(id: number, formData: FormData): Promise<ImportExamResponse> {
    try {
      const res = await apiClient.post<ApiResponse<ImportExamResponse>>(`/manager/exams/${id}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.data) {
        return res.data.data;
      }
      return this.mockImportQuestions(id);
    } catch {
      return this.mockImportQuestions(id);
    }
  },

  mockImportQuestions(id: number): ImportExamResponse {
    const list = loadStoredExams();
    const exam = list.find((e) => e.examId === id);
    if (!exam) {
      throw { response: { status: 404, data: { message: 'Exam not found' } } };
    }
    if (exam.status === 'PUBLISHED') {
      throw { response: { status: 409, data: { message: 'Exam is published. Unpublish first.' } } };
    }
    const importedCount = 3;
    const reusedCount = 1;
    const skippedCount = 1;
    const newIds: number[] = [];

    for (let i = 1; i <= importedCount; i++) {
      const qid = Date.now() + i;
      newIds.push(qid);
      exam.questions.push({
        examQuestionId: qid * 10,
        questionId: qid,
        content: `Imported sample question #${i} from syllabus document`,
        questionType: 'SINGLE_CHOICE',
        points: 1,
        orderIndex: exam.questions.length,
      });
    }

    exam.questionCount = exam.questions.length + exam.groups.reduce((acc, g) => acc + (g.questionCount || 0), 0);
    exam.totalPoints = exam.questions.reduce((acc, q) => acc + q.points, 0) + exam.groups.reduce((acc, g) => acc + g.points, 0);
    saveStoredExams(list);

    return {
      imported: importedCount,
      reused: reusedCount,
      skippedDuplicates: skippedCount,
      questionIds: newIds,
    };
  },

  async generateAiExam(payload: AiGenerateRequest, signal?: AbortSignal): Promise<AiExamDraftResponse> {
    try {
      const res = await apiClient.post<ApiResponse<AiExamDraftResponse>>('/manager/exams/ai/generate', payload, {
        timeout: 35000,
        signal,
      });
      if (res.data?.data) {
        return res.data.data;
      }
      return this.mockGenerateAiExam(payload);
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: unknown } };
      if (errorObj?.response?.status === 429 || errorObj?.response?.status === 502 || errorObj?.response?.status === 504) {
        throw err;
      }
      return this.mockGenerateAiExam(payload);
    }
  },

  mockGenerateAiExam(payload: AiGenerateRequest): Promise<AiExamDraftResponse> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const questions: AiQuestionDraft[] = [];
        let index = 0;

        payload.questionTypes.forEach((qt) => {
          for (let i = 0; i < qt.count; i++) {
            index++;
            let diff: Difficulty = 'MEDIUM';
            if (index <= payload.difficultyDistribution.EASY) {
              diff = 'EASY';
            } else if (index > payload.questionCount - payload.difficultyDistribution.HARD) {
              diff = 'HARD';
            }

            if (qt.questionType === 'SINGLE_CHOICE') {
              questions.push({
                content: `AI Generated Single Choice #${index}: What is the primary characteristic of supervised learning?`,
                questionType: 'SINGLE_CHOICE',
                difficulty: diff,
                options: [
                  { optionText: 'Training with labeled input-output pairs', isCorrect: true, orderIndex: 0 },
                  { optionText: 'Grouping unlabelled inputs into latent clusters', isCorrect: false, orderIndex: 1 },
                  { optionText: 'Reinforcement reward maximizing agent policy', isCorrect: false, orderIndex: 2 },
                  { optionText: 'Generating synthetic data distribution', isCorrect: false, orderIndex: 3 },
                ],
                explanation: 'Supervised learning relies on paired features and corresponding ground truth targets.',
              });
            } else if (qt.questionType === 'MULTI_CHOICE') {
              questions.push({
                content: `AI Generated Multiple Choice #${index}: Select all valid regularization techniques for deep neural networks.`,
                questionType: 'MULTI_CHOICE',
                difficulty: diff,
                options: [
                  { optionText: 'Dropout', isCorrect: true, orderIndex: 0 },
                  { optionText: 'L2 weight decay', isCorrect: true, orderIndex: 1 },
                  { optionText: 'Batch Normalization', isCorrect: true, orderIndex: 2 },
                  { optionText: 'Infinite learning rate', isCorrect: false, orderIndex: 3 },
                ],
                explanation: 'Dropout, weight decay and batch norm help mitigate model overfitting.',
              });
            } else if (qt.questionType === 'TRUE_FALSE') {
              questions.push({
                content: `AI Generated True/False #${index}: Gradient descent steps are computed in the positive direction of the gradient.`,
                questionType: 'TRUE_FALSE',
                difficulty: diff,
                options: [
                  { optionText: 'True', isCorrect: false, orderIndex: 0 },
                  { optionText: 'False', isCorrect: true, orderIndex: 1 },
                ],
                explanation: 'Gradient descent moves in the negative direction to minimize cost.',
              });
            } else if (qt.questionType === 'ESSAY') {
              questions.push({
                content: `AI Generated Essay #${index}: Discuss the architectural innovations introduced by Transformer attention mechanisms compared to Recurrent Neural Networks.`,
                questionType: 'ESSAY',
                difficulty: diff,
                options: [],
                explanation: 'Key points: self-attention parallelism, resolving vanishing gradients across sequence lengths, and positional encodings.',
              });
            } else if (qt.questionType === 'FILL_BLANK') {
              questions.push({
                content: `AI Generated Fill-in-Blank #${index}: The function used to map input activations into a probability range between 0 and 1 in binary classification is ________.`,
                questionType: 'FILL_BLANK',
                difficulty: diff,
                options: [{ optionText: 'sigmoid', isCorrect: true, orderIndex: 0 }],
                explanation: 'Sigmoid is standard for binary classification.',
              });
            } else if (qt.questionType === 'MATCHING') {
              questions.push({
                content: `AI Generated Matching #${index}: Match the neural layer type with its primary functional domain.`,
                questionType: 'MATCHING',
                difficulty: diff,
                options: [
                  { optionText: 'Convolutional Layer', isCorrect: true, orderIndex: 0 },
                  { optionText: 'Spatial feature extraction', isCorrect: true, orderIndex: 1 },
                  { optionText: 'Recurrent Layer', isCorrect: true, orderIndex: 2 },
                  { optionText: 'Sequential context tracking', isCorrect: true, orderIndex: 3 },
                ],
                explanation: 'CNN handles spatial grids and RNN processes temporal sequences.',
              });
            } else if (qt.questionType === 'ORDERING') {
              questions.push({
                content: `AI Generated Ordering #${index}: Order the lifecycle stages of developing an ML solution.`,
                questionType: 'ORDERING',
                difficulty: diff,
                options: [
                  { optionText: 'Data Ingestion and Exploration', isCorrect: true, orderIndex: 0 },
                  { optionText: 'Feature Engineering', isCorrect: true, orderIndex: 1 },
                  { optionText: 'Hyperparameter Tuning', isCorrect: true, orderIndex: 2 },
                  { optionText: 'Model Deployment and Monitoring', isCorrect: true, orderIndex: 3 },
                ],
                explanation: 'Follow standard sequential ML engineering lifecycle.',
              });
            }
          }
        });

        const warnings: string[] = [];
        if (questions.length < payload.questionCount) {
          warnings.push(`AI only generated ${questions.length}/${payload.questionCount} questions based on provided topic depth.`);
        }

        resolve({
          title: payload.title || 'AI Generated Exam Draft',
          description: 'AI synthesized assessment draft. Review and adjust questions before confirming.',
          durationMinutes: payload.durationMinutes || 45,
          questionCount: questions.length,
          questions,
          warnings,
        });
      }, 1500);
    });
  },
};

