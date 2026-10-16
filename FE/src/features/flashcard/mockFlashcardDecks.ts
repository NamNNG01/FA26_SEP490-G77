import { MOCK_COURSES } from '@/features/module/mockModules';

/**
 * Mock flashcard decks for the Course Manager's Flashcard Management screen.
 * Stands in for the backend until the flashcard API exists — swap the import
 * in FlashcardManagementPage for a service call when it does.
 */

export type DeckStatus = 'Published' | 'Draft' | 'Archived';

export const DECK_STATUSES: DeckStatus[] = ['Published', 'Draft', 'Archived'];

export interface FlashcardDeck {
  id: string;
  name: string;
  courseId: string;
  cards: number;
  creator: string;
  status: DeckStatus;
  /** ISO 8601 timestamp of the last modification. */
  updatedAt: string;
}

export const FLASHCARD_COURSES = MOCK_COURSES.map(c => ({ id: c.id as string, title: c.title }));

export const MOCK_FLASHCARD_DECKS: FlashcardDeck[] = [
  { id: 'FD-1024', name: 'Gradient Descent Essentials', courseId: 'ml', cards: 32, creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-16T08:42:00' },
  { id: 'FD-1023', name: 'Bias-Variance Tradeoff', courseId: 'ml', cards: 18, creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-15T16:10:00' },
  { id: 'FD-1022', name: 'Activation Functions Cheat Sheet', courseId: 'dl', cards: 24, creator: 'Marcus Reid', status: 'Draft', updatedAt: '2026-10-15T09:25:00' },
  { id: 'FD-1021', name: 'Backpropagation Step by Step', courseId: 'dl', cards: 40, creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-14T14:03:00' },
  { id: 'FD-1020', name: 'Pandas DataFrame Basics', courseId: 'py', cards: 45, creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-10-13T11:47:00' },
  { id: 'FD-1019', name: 'Hypothesis Testing Terms', courseId: 'stats', cards: 28, creator: 'Linh Tran', status: 'Draft', updatedAt: '2026-10-12T19:30:00' },
  { id: 'FD-1018', name: 'Regularization: L1 vs L2', courseId: 'ml', cards: 16, creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-11T10:15:00' },
  { id: 'FD-1017', name: 'CNN Building Blocks', courseId: 'dl', cards: 36, creator: 'Marcus Reid', status: 'Archived', updatedAt: '2026-10-10T08:00:00' },
  { id: 'FD-1016', name: 'Python Built-in Data Structures', courseId: 'py', cards: 30, creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-09T15:22:00' },
  { id: 'FD-1015', name: 'Probability Distributions', courseId: 'stats', cards: 50, creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-08T13:40:00' },
  { id: 'FD-1014', name: 'Model Evaluation Metrics', courseId: 'ml', cards: 22, creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-10-07T17:05:00' },
  { id: 'FD-1013', name: 'Batch Normalization & Dropout', courseId: 'dl', cards: 14, creator: 'Linh Tran', status: 'Published', updatedAt: '2026-10-06T09:50:00' },
  { id: 'FD-1012', name: 'NumPy Array Operations', courseId: 'py', cards: 38, creator: 'Marcus Reid', status: 'Archived', updatedAt: '2026-10-04T12:12:00' },
  { id: 'FD-1011', name: 'Confidence Intervals', courseId: 'stats', cards: 20, creator: 'Priya Nair', status: 'Published', updatedAt: '2026-10-03T16:33:00' },
  { id: 'FD-1010', name: 'Decision Trees & Ensembles', courseId: 'ml', cards: 34, creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-10-01T10:00:00' },
  { id: 'FD-1009', name: 'Recurrent Networks Overview', courseId: 'dl', cards: 26, creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-09-29T14:45:00' },
  { id: 'FD-1008', name: 'Data Cleaning Patterns', courseId: 'py', cards: 19, creator: 'Linh Tran', status: 'Published', updatedAt: '2026-09-27T08:20:00' },
  { id: 'FD-1007', name: 'Type I & Type II Errors', courseId: 'stats', cards: 12, creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-09-25T11:11:00' },
  { id: 'FD-1006', name: 'Feature Engineering Tricks', courseId: 'ml', cards: 27, creator: 'Linh Tran', status: 'Archived', updatedAt: '2026-09-22T15:58:00' },
  { id: 'FD-1005', name: 'Optimizers: SGD, Momentum, Adam', courseId: 'dl', cards: 21, creator: 'Marcus Reid', status: 'Published', updatedAt: '2026-09-20T09:30:00' },
  { id: 'FD-1004', name: 'Matplotlib Plot Types', courseId: 'py', cards: 15, creator: 'Priya Nair', status: 'Draft', updatedAt: '2026-09-18T13:07:00' },
  { id: 'FD-1003', name: 'Bayes Theorem in Practice', courseId: 'stats', cards: 17, creator: 'Linh Tran', status: 'Published', updatedAt: '2026-09-15T10:40:00' },
];

export const courseTitle = (id: string) => FLASHCARD_COURSES.find(c => c.id === id)?.title ?? id;

/** "Oct 16, 2026, 08:42" — stable, locale-independent display format. */
export function formatDeckTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = d.toLocaleString('en-US', { month: 'short' });
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${month} ${d.getDate()}, ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
