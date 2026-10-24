import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES, coursePath } from '@/app/routes';
import { useCourseSearch } from '../hooks/useCourseSearch';
import { ProviderLogo } from './ProviderLogo';
import type { PublicCourse } from '../types';

/** Max rows rendered inline — the rest are reachable via "View all courses". */
const MAX_VISIBLE_RESULTS = 6;

/**
 * CourseSearchBar
 *
 * The public header's course finder. Searches COURSES ONLY — name, provider
 * and description (see searchCourses). Questions, exams, users, modules,
 * lessons and the question bank are intentionally out of scope.
 *
 * Behaves as an ARIA combobox: full keyboard support (↑ ↓ Home End Enter Esc),
 * outside-click dismissal, and results in a dropdown under the field. Works
 * for guests — no auth required.
 *
 * Enter (or "View all courses") falls through to /courses?q=… so a query is
 * never a dead end.
 */
export function CourseSearchBar({
  className = '',
  autoFocus = false,
  onNavigate,
}: {
  className?: string;
  autoFocus?: boolean;
  /** Called after the bar triggers a navigation (closes the mobile menu). */
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const listboxId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { query, setQuery, results, isEmptyResult } = useCourseSearch();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = query.trim();
  const expanded = open && trimmed.length > 0;
  const visibleResults = results.slice(0, MAX_VISIBLE_RESULTS);

  // Dismiss the dropdown on any outside interaction.
  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [expanded]);

  // Collapse after the route changes (result clicked, or a nav link used).
  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [location.pathname, location.search]);

  function goToCourse(course: PublicCourse) {
    setOpen(false);
    setActiveIndex(-1);
    onNavigate?.();
    navigate(coursePath(course.slug));
  }

  function goToAllResults() {
    setOpen(false);
    setActiveIndex(-1);
    onNavigate?.();
    navigate(trimmed ? `${ROUTES.courses}?q=${encodeURIComponent(trimmed)}` : ROUTES.courses);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = expanded ? visibleResults.length : 0;

    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (!count) {
        setActiveIndex(-1);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => (prev + step + count) % count);
      return;
    }

    if (event.key === 'Home' && count) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End' && count) {
      event.preventDefault();
      setActiveIndex(count - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const active = expanded && activeIndex >= 0 ? visibleResults[activeIndex] : undefined;
      if (active) goToCourse(active);
      else goToAllResults();
    }
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {/* Field — h-10 keeps it the most prominent control in the header */}
      <div
        className={`flex h-10 items-center gap-2 rounded-[12px] border bg-surface-alt pr-2 pl-3 transition-all ${
          expanded
            ? 'border-brand-600 ring-2 ring-brand-600/20'
            : 'border-line hover:border-line-strong'
        }`}
      >
        <Icon.Search className="w-4 h-4 flex-shrink-0 text-content-subtle" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-label="Search courses"
          autoFocus={autoFocus}
          value={query}
          placeholder="Search courses..."
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="h-full w-full min-w-0 bg-transparent text-base text-content outline-none placeholder:text-content-subtle [&::-webkit-search-cancel-button]:hidden"
        />
        {trimmed && (
          <button
            type="button"
            aria-label="Clear course search"
            onClick={() => {
              setQuery('');
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[6px] text-content-subtle transition-colors hover:bg-surface-pressed hover:text-content-secondary cursor-pointer"
          >
            <Icon.X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {expanded && (
        <div className="absolute top-[calc(100%+8px)] right-0 left-0 z-50 overflow-hidden rounded-[14px] border border-line bg-surface shadow-xl shadow-gray-900/10">
          <ul id={listboxId} role="listbox" aria-label="Course search results" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            {visibleResults.map((course, index) => (
              <li key={course.slug} role="option" aria-selected={index === activeIndex} id={`${listboxId}-${index}`}>
                <button
                  type="button"
                  // Keep the listbox open on hover so pointer users can move
                  // through results without the dropdown collapsing.
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => goToCourse(course)}
                  className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors cursor-pointer ${
                    index === activeIndex ? 'bg-primary-light' : 'hover:bg-surface-hover'
                  }`}
                >
                  <ProviderLogo providerId={course.providerId} provider={course.provider} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-content">
                      {course.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-content-subtle">
                      {course.provider}
                      <span className="mx-1.5 text-content-faint">·</span>
                      {course.questionCount.toLocaleString()} Questions
                      <span className="mx-1.5 text-content-faint">·</span>
                      {course.examCount} Exams
                    </span>
                  </span>
                  <Icon.ChevronRight className="h-4 w-4 flex-shrink-0 text-content-faint" />
                </button>
              </li>
            ))}

            {isEmptyResult && (
              <li className="px-3 py-6 text-center">
                <p className="text-sm font-medium text-content-secondary">No courses match “{trimmed}”</p>
                <p className="mt-1 text-xs text-content-subtle">Try a provider like AWS, Microsoft or CompTIA.</p>
              </li>
            )}
          </ul>

          <div className="border-t border-line-soft p-1.5">
            <button
              type="button"
              onClick={goToAllResults}
              className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-sm font-semibold text-brand-ink transition-colors hover:bg-primary-hover-tint cursor-pointer"
            >
              <span>
                {results.length > 0
                  ? `View all ${results.length} ${results.length === 1 ? 'course' : 'courses'}`
                  : 'Browse all courses'}
              </span>
              <Icon.ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
