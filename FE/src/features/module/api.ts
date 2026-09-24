import { MOCK_MODULES, type CourseModule, type CourseId, modulesByCourse } from './mockModules';

export type ModuleInput = {
  courseId: CourseId;
  title: string;
  order?: string;
  status: 'Active' | 'Draft';
  description: string;
};

export type ModuleUpdateInput = {
  title: string;
  order?: string;
  status: CourseModule['status'];
  description: string;
};

export async function updateModule(id: string, input: ModuleUpdateInput): Promise<CourseModule> {
  const existing = MOCK_MODULES.find(m => m.id === id);
  if (!existing) {
    return Promise.reject(new Error(`Module not found: ${id}`));
  }

  const order = input.order !== undefined && input.order.trim() !== ''
    ? Math.max(1, Math.floor(Number(input.order)))
    : existing.order;

  const updated: CourseModule = {
    ...existing,
    title: input.title.trim(),
    order,
    status: input.status,
    description: input.description.trim(),
    updated: 'Just now',
  };

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const index = MOCK_MODULES.findIndex(m => m.id === id);
      if (index === -1) {
        reject(new Error(`Module not found: ${id}`));
        return;
      }
      MOCK_MODULES[index] = updated;
      resolve(updated);
    }, 600);
  });
}

export async function createModule(input: ModuleInput): Promise<CourseModule> {
  const siblings = modulesByCourse(input.courseId);
  const order = input.order && Number(input.order) > 0
    ? Math.floor(Number(input.order))
    : siblings.length + 1;

  const module: CourseModule = {
    id: `mod-${Date.now()}`,
    title: input.title.trim(),
    courseId: input.courseId,
    order,
    description: input.description.trim(),
    status: input.status,
    updated: 'Just now',
  };

  return new Promise(resolve => {
    setTimeout(() => resolve(module), 800);
  });
}