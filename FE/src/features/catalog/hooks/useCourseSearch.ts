import { useState } from 'react';
import { useDebounce } from '@/hooks';
import { useCatalogCourses } from './usePublicCatalog';

/**
 * useCourseSearch
 *
 * Debounced course-only search for the public header search bar. Matches by
 * course title via CL-01 (`keyword`) — questions, exams, users, modules and
 * the question bank are never searched from here.
 */
export function useCourseSearch(initialQuery = '', { delay = 250, size = 6 }: { delay?: number; size?: number } = {}) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, delay);
  const trimmed = debouncedQuery.trim();

  const { data, loading, error } = useCatalogCourses({ keyword: trimmed, size, enabled: trimmed.length > 0 });

  const results = data?.content ?? [];
  const total = data?.totalElements ?? 0;

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    total,
    loading,
    error,
    /** True once the typed query has settled and actually matches nothing. */
    isEmptyResult: trimmed.length > 0 && !loading && !error && results.length === 0,
  };
}
