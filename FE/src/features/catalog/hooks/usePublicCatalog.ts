import { useEffect, useState } from 'react';
import { courseService, type CategoryResponse, type PageResponse } from '@/services/course.service';
import { studentCourseService, type StudentCourseCard, type StudentSort } from '@/services/studentCourse.service';
import { getApiErrorMessage } from '@/utils/apiError';

/**
 * Public catalog data — every course screen a guest can reach (header search,
 * Popular Courses, /courses, hero figures) reads the backend through here:
 *   GET /api/v1/categories        (PUB-01)
 *   GET /api/v1/student/courses   (CL-01, public; `isEnrolled` filled in when signed in)
 */

// Categories rarely change during a visit — one request shared by every caller.
let categoriesPromise: Promise<CategoryResponse[]> | null = null;

function loadCategories(): Promise<CategoryResponse[]> {
  categoriesPromise ??= courseService.getCategories().catch((err) => {
    categoriesPromise = null;
    throw err;
  });
  return categoriesPromise;
}

export function usePublicCategories() {
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCategories()
      .then((res) => {
        if (!cancelled) setCategories(res);
      })
      .catch(() => {
        // The chips just stay hidden — the course list still works without them.
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading };
}

export interface CatalogQuery {
  keyword?: string;
  categoryId?: number;
  sort?: StudentSort;
  /** 0-based. */
  page?: number;
  size?: number;
  /** Skip the request (e.g. an empty search box). */
  enabled?: boolean;
}

/** One page of CL-01. `reload()` re-runs the same query. */
export function useCatalogCourses({ keyword, categoryId, sort, page = 0, size = 12, enabled = true }: CatalogQuery) {
  const [data, setData] = useState<PageResponse<StudentCourseCard> | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getCourses({ keyword: keyword?.trim() || undefined, categoryId, sort, page, size })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load courses.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyword, categoryId, sort, page, size, enabled, nonce]);

  return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}

export interface CatalogOverview {
  courseCount: number;
  examCount: number;
  categoryNames: string[];
}

/** Upper bound on CL-01 pages walked for the hero figures (100 courses each). */
const OVERVIEW_MAX_PAGES = 10;

/**
 * Figures for the landing hero, derived from the live catalog so the page
 * never advertises a number the backend can't back up. `null` while loading
 * or if the catalog is unreachable.
 */
export function useCatalogOverview(): CatalogOverview | null {
  const [overview, setOverview] = useState<CatalogOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const categories = await loadCategories().catch(() => [] as CategoryResponse[]);
        let courseCount = 0;
        let examCount = 0;
        for (let page = 0; page < OVERVIEW_MAX_PAGES; page++) {
          const res = await studentCourseService.getCourses({ page, size: 100 });
          courseCount = res.totalElements;
          examCount += res.content.reduce((sum, c) => sum + (c.publishedExamCount ?? 0), 0);
          if (res.last || res.content.length === 0) break;
        }
        if (!cancelled) setOverview({ courseCount, examCount, categoryNames: categories.map((c) => c.name) });
      } catch {
        if (!cancelled) setOverview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return overview;
}
