import type {
  CourseSummaryItem,
  CourseDetailResponse,
  CourseModuleResponse,
  CourseStudentItem,
  CourseListParams,
  CourseStudentsParams,
  CreateCourseRequest,
  UpdateCourseRequest,
  CreateModuleRequest,
  UpdateModuleRequest,
  PublishCourseResponse,
  PageResponse,
} from './course.service';

export const initialMockCourses: CourseDetailResponse[] = [
  {
    courseId: 1,
    title: 'Machine Learning Fundamentals',
    slug: 'machine-learning-fundamentals-1',
    categoryId: 1,
    categoryName: 'Machine Learning',
    managerId: 2,
    managerName: 'Priya Nair',
    thumbnailUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=800&auto=format&fit=crop&q=60',
    price: 0,
    isPublished: true,
    moduleCount: 3,
    studentCount: 142,
    examCount: 4,
    description: 'Master core concepts of machine learning, regression, classification, and model evaluation.',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-10-15T10:30:00Z',
    modules: [
      {
        moduleId: 101,
        courseId: 1,
        title: 'Foundations of ML',
        description: 'Core concepts, bias-variance tradeoff, and evaluation metrics.',
        orderIndex: 1,
        status: 'VISIBLE',
        questionCount: 35,
        examCount: 2,
      },
      {
        moduleId: 102,
        courseId: 1,
        title: 'Supervised Learning',
        description: 'Linear regression, logistic regression, and decision trees.',
        orderIndex: 2,
        status: 'VISIBLE',
        questionCount: 42,
        examCount: 1,
      },
      {
        moduleId: 103,
        courseId: 1,
        title: 'Model Tuning & Validation',
        description: 'Cross-validation, hyperparameter grid search, and regularization.',
        orderIndex: 3,
        status: 'VISIBLE',
        questionCount: 28,
        examCount: 1,
      },
    ],
  },
  {
    courseId: 2,
    title: 'Deep Neural Networks',
    slug: 'deep-neural-networks-2',
    categoryId: 1,
    categoryName: 'Machine Learning',
    managerId: 2,
    managerName: 'Priya Nair',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&auto=format&fit=crop&q=60',
    price: 49.99,
    isPublished: true,
    moduleCount: 2,
    studentCount: 88,
    examCount: 2,
    description: 'Explore neural network architectures, backpropagation, CNNs, and transformers.',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-10-12T14:20:00Z',
    modules: [
      {
        moduleId: 201,
        courseId: 2,
        title: 'Perceptrons & Backprop',
        description: 'Foundations of multi-layer perceptrons and gradient optimization.',
        orderIndex: 1,
        status: 'VISIBLE',
        questionCount: 25,
        examCount: 1,
      },
      {
        moduleId: 202,
        courseId: 2,
        title: 'Convolutional Networks',
        description: 'Image processing, convolution filters, pooling, and transfer learning.',
        orderIndex: 2,
        status: 'VISIBLE',
        questionCount: 30,
        examCount: 1,
      },
    ],
  },
  {
    courseId: 3,
    title: 'Python for Data Science',
    slug: 'python-for-data-science-3',
    categoryId: 2,
    categoryName: 'Programming',
    managerId: 3,
    managerName: 'Marcus Reid',
    thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=60',
    price: 0,
    isPublished: true,
    moduleCount: 2,
    studentCount: 230,
    examCount: 3,
    description: 'Comprehensive Python programming including NumPy, Pandas, and data visualization.',
    createdAt: '2026-08-15T07:30:00Z',
    updatedAt: '2026-10-14T11:00:00Z',
    modules: [
      {
        moduleId: 301,
        courseId: 3,
        title: 'Python Syntax & Data Structures',
        description: 'Lists, dictionaries, control flow, functions, and error handling.',
        orderIndex: 1,
        status: 'VISIBLE',
        questionCount: 50,
        examCount: 2,
      },
      {
        moduleId: 302,
        courseId: 3,
        title: 'Data Wrangling with Pandas',
        description: 'DataFrame operations, grouping, filtering, and cleaning missing data.',
        orderIndex: 2,
        status: 'VISIBLE',
        questionCount: 40,
        examCount: 1,
      },
    ],
  },
  {
    courseId: 4,
    title: 'Advanced Algorithms & Problem Solving',
    slug: 'advanced-algorithms-4',
    categoryId: 2,
    categoryName: 'Programming',
    managerId: 3,
    managerName: 'Marcus Reid',
    thumbnailUrl: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&auto=format&fit=crop&q=60',
    price: 29.99,
    isPublished: false,
    moduleCount: 1,
    studentCount: 0,
    examCount: 1,
    description: 'Master dynamic programming, graph traversal algorithms, and complexity analysis.',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-16T16:00:00Z',
    modules: [
      {
        moduleId: 401,
        courseId: 4,
        title: 'Graph Theory & DP',
        description: 'Shortest paths, minimum spanning trees, and memoization patterns.',
        orderIndex: 1,
        status: 'VISIBLE',
        questionCount: 20,
        examCount: 1,
      },
    ],
  },
];

export const initialMockStudents: CourseStudentItem[] = [
  {
    userId: 101,
    fullName: 'Alex Johnson',
    email: 'alex.j@example.com',
    avatarUrl: null,
    enrolledAt: '2026-09-05T10:15:00Z',
    status: 'ACTIVE',
    progress: 85,
  },
  {
    userId: 102,
    fullName: 'Sarah Chen',
    email: 'sarah.c@example.com',
    avatarUrl: null,
    enrolledAt: '2026-09-08T14:30:00Z',
    status: 'COMPLETED',
    progress: 100,
  },
  {
    userId: 103,
    fullName: 'Michael Brown',
    email: 'mbrown@example.com',
    avatarUrl: null,
    enrolledAt: '2026-09-12T09:00:00Z',
    status: 'ACTIVE',
    progress: 45,
  },
  {
    userId: 104,
    fullName: 'Elena Rostova',
    email: 'elena.r@example.com',
    avatarUrl: null,
    enrolledAt: '2026-09-15T16:45:00Z',
    status: 'ACTIVE',
    progress: 60,
  },
  {
    userId: 105,
    fullName: 'David Kim',
    email: 'dkim@example.com',
    avatarUrl: null,
    enrolledAt: '2026-09-20T11:20:00Z',
    status: 'COMPLETED',
    progress: 100,
  },
];

let mockCoursesStore: CourseDetailResponse[] = JSON.parse(JSON.stringify(initialMockCourses));
let mockStudentsStore: CourseStudentItem[] = JSON.parse(JSON.stringify(initialMockStudents));

export function getMockCourses(params?: CourseListParams): PageResponse<CourseSummaryItem> {
  let list = mockCoursesStore.map((c) => ({
    courseId: c.courseId,
    title: c.title,
    slug: c.slug,
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    managerId: c.managerId,
    managerName: c.managerName,
    thumbnailUrl: c.thumbnailUrl,
    price: c.price,
    isPublished: c.isPublished,
    moduleCount: c.modules.length,
    studentCount: c.studentCount,
    examCount: c.examCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter((c) => c.title.toLowerCase().includes(q) || c.categoryName.toLowerCase().includes(q));
  }
  if (params?.categoryId !== undefined) {
    list = list.filter((c) => c.categoryId === params.categoryId);
  }
  if (params?.isPublished !== undefined) {
    list = list.filter((c) => c.isPublished === params.isPublished);
  }

  const page = params?.page ?? 0;
  const size = params?.size ?? 12;
  const totalElements = list.length;
  const totalPages = Math.ceil(totalElements / size) || 1;
  const start = page * size;
  const content = list.slice(start, start + size);

  return {
    content,
    page,
    size,
    totalElements,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

export function getMockCourseById(id: number | string): CourseDetailResponse {
  const numId = Number(id);
  const found = mockCoursesStore.find((c) => c.courseId === numId);
  if (found) {
    return JSON.parse(JSON.stringify(found));
  }
  const fallback = mockCoursesStore[0];
  return {
    ...fallback,
    courseId: numId,
    title: `Course #${numId}`,
    slug: `course-${numId}`,
  };
}

export function createMockCourse(payload: CreateCourseRequest): CourseDetailResponse {
  const newId = Date.now();
  const slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + `-${newId}`;
  const now = new Date().toISOString();

  const newCourse: CourseDetailResponse = {
    courseId: newId,
    title: payload.title,
    slug,
    categoryId: payload.categoryId,
    categoryName: 'General Category',
    managerId: payload.managerId,
    managerName: 'Course Manager',
    thumbnailUrl: payload.thumbnailUrl ?? null,
    price: payload.price ?? 0,
    isPublished: false,
    moduleCount: 0,
    studentCount: 0,
    examCount: 0,
    description: payload.description ?? '',
    modules: [],
    createdAt: now,
    updatedAt: now,
  };

  mockCoursesStore.unshift(newCourse);
  return JSON.parse(JSON.stringify(newCourse));
}

export function updateMockCourse(id: number | string, payload: UpdateCourseRequest): CourseDetailResponse {
  const numId = Number(id);
  const course = mockCoursesStore.find((c) => c.courseId === numId);
  const now = new Date().toISOString();

  if (course) {
    if (payload.title !== undefined) course.title = payload.title;
    if (payload.description !== undefined) course.description = payload.description;
    if (payload.categoryId !== undefined) course.categoryId = payload.categoryId;
    if (payload.thumbnailUrl !== undefined) course.thumbnailUrl = payload.thumbnailUrl;
    if (payload.price !== undefined) course.price = payload.price;
    if (payload.managerId !== undefined) {
      course.managerId = payload.managerId;
      course.managerName = `Manager #${payload.managerId}`;
    }
    if (payload.managerIds !== undefined) {
      const managerIds = [payload.managerId ?? course.managerId, ...payload.managerIds];
      course.managers = managerIds.map((userId, index) => ({
        userId,
        fullName: userId === course.managerId ? course.managerName : `Manager #${userId}`,
        primary: index === 0,
      }));
    }
    course.updatedAt = now;
    return JSON.parse(JSON.stringify(course));
  }

  const generated: CourseDetailResponse = {
    courseId: numId,
    title: payload.title ?? 'Updated Course',
    slug: `course-${numId}`,
    categoryId: payload.categoryId ?? 1,
    categoryName: 'General Category',
    managerId: payload.managerId ?? 1,
    managerName: 'Course Manager',
    thumbnailUrl: payload.thumbnailUrl ?? null,
    price: payload.price ?? 0,
    isPublished: false,
    moduleCount: 0,
    studentCount: 0,
    examCount: 0,
    description: payload.description ?? '',
    modules: [],
    createdAt: now,
    updatedAt: now,
  };
  mockCoursesStore.unshift(generated);
  return generated;
}

export function publishMockCourse(id: number | string, isPublished: boolean): PublishCourseResponse {
  const numId = Number(id);
  const course = mockCoursesStore.find((c) => c.courseId === numId);
  const now = new Date().toISOString();

  if (course) {
    course.isPublished = isPublished;
    course.updatedAt = now;
    return {
      courseId: course.courseId,
      title: course.title,
      slug: course.slug,
      isPublished: course.isPublished,
      moduleCount: course.modules.length,
      studentCount: course.studentCount,
      examCount: course.examCount,
      updatedAt: course.updatedAt,
    };
  }

  return {
    courseId: numId,
    title: `Course #${numId}`,
    slug: `course-${numId}`,
    isPublished,
    moduleCount: 1,
    studentCount: 0,
    examCount: 0,
    updatedAt: now,
  };
}

export function deleteMockCourse(id: number | string): void {
  const numId = Number(id);
  mockCoursesStore = mockCoursesStore.filter((c) => c.courseId !== numId);
}

export function getMockCourseModules(courseId: number | string): CourseModuleResponse[] {
  const numId = Number(courseId);
  const course = mockCoursesStore.find((c) => c.courseId === numId);
  if (course) {
    return JSON.parse(JSON.stringify(course.modules));
  }
  return [];
}

export function createMockModule(courseId: number | string, payload: CreateModuleRequest): CourseModuleResponse {
  const numCourseId = Number(courseId);
  const course = mockCoursesStore.find((c) => c.courseId === numCourseId);
  const newModuleId = Date.now();

  const newModule: CourseModuleResponse = {
    moduleId: newModuleId,
    courseId: numCourseId,
    title: payload.title,
    description: payload.description ?? null,
    orderIndex: payload.orderIndex ?? (course ? course.modules.length + 1 : 1),
    status: 'VISIBLE',
    questionCount: 0,
    examCount: 0,
  };

  if (course) {
    course.modules.push(newModule);
    course.moduleCount = course.modules.length;
  }

  return newModule;
}

export function updateMockModule(moduleId: number | string, payload: UpdateModuleRequest): CourseModuleResponse {
  const numModId = Number(moduleId);

  for (const course of mockCoursesStore) {
    const mod = course.modules.find((m) => m.moduleId === numModId);
    if (mod) {
      if (payload.title !== undefined) mod.title = payload.title;
      if (payload.description !== undefined) mod.description = payload.description;
      if (payload.orderIndex !== undefined) mod.orderIndex = payload.orderIndex;
      return JSON.parse(JSON.stringify(mod));
    }
  }

  return {
    moduleId: numModId,
    courseId: 1,
    title: payload.title ?? 'Updated Module',
    description: payload.description ?? null,
    orderIndex: payload.orderIndex ?? 1,
    status: 'VISIBLE',
    questionCount: 0,
    examCount: 0,
  };
}

export function deleteMockModule(moduleId: number | string): void {
  const numModId = Number(moduleId);
  for (const course of mockCoursesStore) {
    course.modules = course.modules.filter((m) => m.moduleId !== numModId);
    course.moduleCount = course.modules.length;
  }
}

export function getMockCourseStudents(
  _courseId: number | string,
  params?: CourseStudentsParams
): PageResponse<CourseStudentItem> {
  let list = JSON.parse(JSON.stringify(mockStudentsStore)) as CourseStudentItem[];

  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter((s) => s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }
  if (params?.status && params.status !== 'all') {
    list = list.filter((s) => s.status === params.status);
  }

  const page = params?.page ?? 0;
  const size = params?.size ?? 10;
  const totalElements = list.length;
  const totalPages = Math.ceil(totalElements / size) || 1;
  const start = page * size;
  const content = list.slice(start, start + size);

  return {
    content,
    page,
    size,
    totalElements,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

