export type CourseId = 'ml' | 'dl' | 'py' | 'stats';

export type CourseModule = {
  id: string;
  title: string;
  courseId: CourseId;
  order: number;
  description: string;
  status: 'Active' | 'Draft' | 'Archived';
  updated: string;
};

export const MOCK_COURSES: { id: CourseId; title: string; description: string; manager: string; updated: string }[] = [
  { id: 'ml', title: 'Machine Learning Fundamentals', description: 'Core theory and practice for designing, training, and evaluating machine learning models across three curriculum modules.', manager: 'Priya Nair', updated: '2d ago' },
  { id: 'dl', title: 'Deep Neural Networks', description: 'Advanced architectures, backpropagation, and modern normalization techniques for deep learning.', manager: 'Priya Nair', updated: '1h ago' },
  { id: 'py', title: 'Python for Data Science', description: 'Hands-on foundation in Python, data wrangling, and analysis workflows for aspiring data scientists.', manager: 'Marcus Reid', updated: '5d ago' },
  { id: 'stats', title: 'Statistics for ML', description: 'Distributions, inference, and hypothesis testing applied to machine learning problems.', manager: 'Priya Nair', updated: '1w ago' },
];

export const courseLabel = (id: CourseId | string) =>
  MOCK_COURSES.find(c => c.id === id)?.title ?? String(id);

export const MOCK_MODULES: CourseModule[] = [
  { id: 'mod-1', title: 'Foundations of ML', courseId: 'ml', order: 1, description: 'Core concepts, model evaluation, and the bias-variance framework.', status: 'Active', updated: '1d ago' },
  { id: 'mod-2', title: 'Supervised Learning', courseId: 'ml', order: 2, description: 'Regression and classification algorithms from first principles.', status: 'Active', updated: '2d ago' },
  { id: 'mod-3', title: 'Optimization & Tuning', courseId: 'ml', order: 3, description: 'Gradient descent, learning rates, and hyperparameter tuning.', status: 'Active', updated: '3h ago' },
  { id: 'mod-4', title: 'Neural Network Basics', courseId: 'dl', order: 1, description: 'Perceptrons, activation functions, and backpropagation.', status: 'Active', updated: '4d ago' },
  { id: 'mod-5', title: 'Advanced Architectures', courseId: 'dl', order: 2, description: 'Deep networks, normalization, and modern layer designs.', status: 'Draft', updated: '1h ago' },
  { id: 'mod-6', title: 'Python Basics', courseId: 'py', order: 1, description: 'Syntax, data types, and control flow.', status: 'Active', updated: '2w ago' },
  { id: 'mod-7', title: 'Data Wrangling', courseId: 'py', order: 2, description: 'Pandas, cleaning, and reshaping datasets.', status: 'Draft', updated: '1d ago' },
  { id: 'mod-8', title: 'Statistics Fundamentals', courseId: 'stats', order: 1, description: 'Distributions, descriptive statistics, and the CLT.', status: 'Active', updated: '1w ago' },
  { id: 'mod-9', title: 'Inference & Testing', courseId: 'stats', order: 2, description: 'Confidence intervals, p-values, and hypothesis tests.', status: 'Archived', updated: '3w ago' },
];

export const moduleLabel = (id: string) => MOCK_MODULES.find(m => m.id === id)?.title ?? id;

export const modulesByCourse = (courseId: string) =>
  MOCK_MODULES.filter(m => m.courseId === courseId).sort((a, b) => a.order - b.order);