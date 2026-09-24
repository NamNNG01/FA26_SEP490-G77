export type LessonStatus = 'Published' | 'Draft' | 'Archived';

export type MockLesson = {
  id: string;
  title: string;
  courseId: string;
  moduleId: string;
  order: number;
  blocks: string[];
  exams: number;
  duration: string;
  status: LessonStatus;
  updated: string;
};

export const MOCK_LESSONS: MockLesson[] = [
  { id: 'L-2101', title: 'Introduction to Gradient Descent', courseId: 'ml', moduleId: 'mod-3', order: 1, blocks: ['Video', 'Text', 'Quiz'], exams: 1, duration: '12 min', status: 'Published', updated: '2h ago' },
  { id: 'L-2100', title: 'Cost Functions Explained', courseId: 'ml', moduleId: 'mod-3', order: 2, blocks: ['Text', 'PDF', 'Image'], exams: 0, duration: '18 min', status: 'Published', updated: '1d ago' },
  { id: 'L-2099', title: 'Learning Rate Tuning Lab', courseId: 'ml', moduleId: 'mod-3', order: 3, blocks: ['Video', 'Text', 'Quiz', 'Image'], exams: 1, duration: '25 min', status: 'Draft', updated: '3h ago' },
  { id: 'L-2098', title: 'Backpropagation Deep Dive', courseId: 'dl', moduleId: 'mod-4', order: 1, blocks: ['Video', 'PDF', 'Quiz'], exams: 2, duration: '34 min', status: 'Published', updated: '4d ago' },
  { id: 'L-2097', title: 'Activation Functions Recap', courseId: 'dl', moduleId: 'mod-4', order: 2, blocks: ['Text', 'Quiz'], exams: 1, duration: '15 min', status: 'Archived', updated: '3w ago' },
  { id: 'L-2096', title: 'What is a Neural Network?', courseId: 'dl', moduleId: 'mod-4', order: 3, blocks: ['Video', 'Text'], exams: 0, duration: '20 min', status: 'Published', updated: '5d ago' },
  { id: 'L-2095', title: 'Softmax & Output Layers', courseId: 'dl', moduleId: 'mod-5', order: 1, blocks: ['Video', 'PDF', 'Quiz'], exams: 1, duration: '22 min', status: 'Published', updated: '6d ago' },
  { id: 'L-2094', title: 'Python Variables & Types', courseId: 'py', moduleId: 'mod-6', order: 1, blocks: ['Text', 'Quiz'], exams: 1, duration: '14 min', status: 'Published', updated: '2w ago' },
  { id: 'L-2093', title: 'Pandas DataFrames', courseId: 'py', moduleId: 'mod-7', order: 1, blocks: ['Video', 'Text', 'Image', 'Quiz'], exams: 1, duration: '28 min', status: 'Draft', updated: '1d ago' },
  { id: 'L-2092', title: 'Confidence Intervals', courseId: 'stats', moduleId: 'mod-9', order: 1, blocks: ['Video', 'PDF', 'Quiz'], exams: 2, duration: '30 min', status: 'Published', updated: '1w ago' },
  { id: 'L-2091', title: 'The Central Limit Theorem', courseId: 'stats', moduleId: 'mod-8', order: 1, blocks: ['Text', 'PDF', 'Quiz'], exams: 1, duration: '16 min', status: 'Published', updated: '2w ago' },
  { id: 'L-2090', title: 'Hypothesis Tests in Practice', courseId: 'stats', moduleId: 'mod-9', order: 2, blocks: ['Video', 'Text', 'Quiz'], exams: 1, duration: '32 min', status: 'Draft', updated: '4d ago' },
];

export const lessonsByModule = (moduleId: string) =>
  MOCK_LESSONS.filter(l => l.moduleId === moduleId).sort((a, b) => a.order - b.order);

export const lessonLabel = (id: string) => MOCK_LESSONS.find(l => l.id === id)?.title ?? String(id);