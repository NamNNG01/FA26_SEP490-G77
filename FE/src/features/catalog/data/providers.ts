import type { CourseProvider, CourseProviderId } from '../types';

/**
 * Certification providers shown across the public catalog.
 *
 * Ordering here is the ordering of the "Popular Courses" filter chips, so
 * AWS / Microsoft / Google Cloud / CompTIA / Cisco read left to right.
 */
export const COURSE_PROVIDERS: CourseProvider[] = [
  { id: 'aws', label: 'Amazon Web Services', shortLabel: 'AWS' },
  { id: 'microsoft', label: 'Microsoft', shortLabel: 'Microsoft' },
  { id: 'google-cloud', label: 'Google Cloud', shortLabel: 'Google Cloud' },
  { id: 'comptia', label: 'CompTIA', shortLabel: 'CompTIA' },
  { id: 'cisco', label: 'Cisco', shortLabel: 'Cisco' },
];

const providerById: Record<CourseProviderId, CourseProvider> = COURSE_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  },
  {} as Record<CourseProviderId, CourseProvider>,
);

/** Provider metadata for a course — falls back to the raw id defensively. */
export function getProvider(id: CourseProviderId | string): CourseProvider {
  return providerById[id as CourseProviderId] ?? { id: id as CourseProviderId, label: String(id), shortLabel: String(id) };
}