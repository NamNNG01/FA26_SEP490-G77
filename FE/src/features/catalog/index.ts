/**
 * Public catalog feature — guest-facing exam preparation course discovery.
 *
 * Covers the header course search, the Popular Courses grid, /courses and the
 * public course detail page. Everything here works without an account and
 * reads the live catalog (CL-01 / CL-02 / PUB-01).
 */

export { PopularCoursesSection } from './sections/PopularCoursesSection';
export { PublicCoursesPage } from './pages/PublicCoursesPage';
export { PublicCourseDetailPage } from './pages/PublicCourseDetailPage';

export { CourseSearchBar } from './components/CourseSearchBar';
export { CourseCatalogCard, CourseCatalogCardSkeleton } from './components/CourseCatalogCard';
export { CourseFilterChips, type CategoryFilter } from './components/CourseFilterChips';
export { CourseLogo, formatPrice } from './components/CourseLogo';

export { useCourseSearch } from './hooks/useCourseSearch';
export { useCatalogCourses, useCatalogOverview, usePublicCategories } from './hooks/usePublicCatalog';
export type { CatalogOverview } from './hooks/usePublicCatalog';
