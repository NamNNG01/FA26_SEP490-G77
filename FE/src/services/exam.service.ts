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
        questionType: 'MULTIPLE_CHOICE',
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
    questionType: 'MULTIPLE_CHOICE',
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
    const res = await api.post<ApiResponse<ExamDetail>>('/manager/exams', payload);
    return res.data;
  },

  async updateExam(id: number, payload: UpdateExamRequest): Promise<ExamDetail> {
    const res = await api.request<ApiResponse<ExamDetail>>({
      method: 'put',
      url: `/manager/exams/${id}`,
      data: payload,
    });
    return res.data;
  },

  async patchPublishExam(id: number, status: ExamStatus): Promise<{ examId: number; status: ExamStatus; warnings?: string[] }> {
    const res = await api.request<ApiResponse<{ examId: number; status: ExamStatus; warnings?: string[] }>>({
      method: 'patch',
      url: `/manager/exams/${id}/publish`,
      data: { status },
    });
    return res.data;
  },

  async deleteExam(id: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}` });
  },

  async addQuestionToExam(id: number, payload: { questionId: number; points?: number }): Promise<ExamQuestion> {
    const res = await api.post<ApiResponse<ExamQuestion>>(`/manager/exams/${id}/questions`, payload);
    return res.data;
  },

  async removeQuestionFromExam(id: number, examQuestionId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}/questions/${examQuestionId}` });
  },

  async addGroupToExam(id: number, payload: { groupId: number; points?: number }): Promise<ExamGroup> {
    const res = await api.post<ApiResponse<ExamGroup>>(`/manager/exams/${id}/groups`, payload);
    return res.data;
  },

  async removeGroupFromExam(id: number, examGroupId: number): Promise<void> {
    await api.request<ApiResponse<null>>({ method: 'delete', url: `/manager/exams/${id}/groups/${examGroupId}` });
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
    const res = await api.request<ApiResponse<BankQuestionItem>>({
      method: 'put',
      url: `/manager/questions/${questionId}/rubric`,
      data: payload,
    });
    return res.data;
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
    const res = await api.post<ApiResponse<{ questionId: number }[]>>('/manager/questions/batch', payload);
    return res.data;
  },

  async importQuestions(id: number, formData: FormData): Promise<ImportExamResponse> {
    const res = await apiClient.post<ApiResponse<ImportExamResponse>>(`/manager/exams/${id}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async generateAiExam(payload: AiGenerateRequest, signal?: AbortSignal): Promise<AiExamDraftResponse> {
    const res = await apiClient.post<ApiResponse<AiExamDraftResponse>>('/manager/exams/ai/generate', payload, {
      timeout: 100000,
      signal,
    });
    return res.data.data;
  },

};

