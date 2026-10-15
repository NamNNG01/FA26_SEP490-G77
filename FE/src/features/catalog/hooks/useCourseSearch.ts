import { useMemo, useState } from 'react';
import { useDebounce } from '@/hooks';
import { searchCourses } from '../data/publicCourses';
import type { PublicCourse } from '../types';

/**
 * useCourseSearch
 *
 * Debounced course-only search state, shared by the public header search bar
 * and the /courses page so both filter identically.
 *
 * Scope guardrail: the matcher is `searchCourses`, which only ever looks at
 * course name / provider / description. Questions, exams, users, modules,
 * lessons and the question bank are never searched from here.
 */
export function useCourseSearch(initialQuery = '', delay = 200) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, delay);

  const results: PublicCourse[] = useMemo(() => searchCourses(debouncedQuery), [debouncedQuery]);

  return {
    query,
    setQuery,
    debouncedQuery,
    /** True once the typed query has settled and actually matches nothing. */
    isEmptyResult: debouncedQuery.trim().length > 0 && results.length === 0,
    results,
  };
}