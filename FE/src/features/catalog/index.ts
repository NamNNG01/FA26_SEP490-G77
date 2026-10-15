/**
 * Public catalog feature — guest-facing exam preparation course discovery.
 *
 * Covers the header course search, the Popular Courses grid, /courses and the
 * public course detail page. Everything here works without an account.
 */

export { PopularCoursesSection } from './sections/PopularCoursesSection';
export { PublicCoursesPage } from './pages/PublicCoursesPage';
export { PublicCourseDetailPage } from './pages/PublicCourseDetailPage';

export { CourseSearchBar } from './components/CourseSearchBar';
export { CourseCatalogCard } from './components/CourseCatalogCard';
export { CourseFilterChips } from './components/CourseFilterChips';
export { FeaturedCourseCard } from './components/FeaturedCourseCard';
export { ProviderLogo } from './components/ProviderLogo';

export { PUBLIC_COURSES, featuredCourse, findCourseBySlug, searchCourses } from './data/publicCourses';
export { COURSE_PROVIDERS, getProvider } from './data/providers';
export { useCourseSearch } from './hooks/useCourseSearch';

export type { PublicCourse, CourseProvider, CourseProviderId, CourseDifficulty } from './types';