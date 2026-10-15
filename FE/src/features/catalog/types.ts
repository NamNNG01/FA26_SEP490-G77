/**
 * Public catalog types
 *
 * The public catalog is presentation-only data for guests: it powers the
 * header course search, the Popular Courses grid, the /courses page and the
 * public course detail page. No backend endpoint exists for courses yet, so
 * this module is the single source of truth for all of them.
 */

export type CourseProviderId = 'aws' | 'microsoft' | 'google-cloud' | 'comptia' | 'cisco';

export type CourseDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/** Price presentation — PrepExam is a preparation platform, nothing more. */
export type CoursePriceLabel = 'Free' | 'Included in Plan';

export interface PublicCourse {
  /** URL segment — /courses/:slug. */
  slug: string;
  name: string;
  providerId: CourseProviderId;
  /** Full provider name, e.g. "Amazon Web Services". */
  provider: string;
  /** One-line hook shown on cards. */
  tagline: string;
  /** Two-line summary shown on cards and the detail page. */
  description: string;
  difficulty: CourseDifficulty;
  questionCount: number;
  examCount: number;
  topicCount: number;
  rating: number;
  ratingCount: number;
  /** Pre-formatted for display, e.g. "Sep 2026". */
  updatedAt: string;
  priceLabel: CoursePriceLabel;
  /** Capability chips, e.g. "AI Review", "Flashcards". */
  features: string[];
  /** Curriculum topic names shown on the detail page. */
  topics: string[];
}

export interface CourseProvider {
  id: CourseProviderId;
  label: string;
  /** Short label used inside compact chips and filter chips. */
  shortLabel: string;
}