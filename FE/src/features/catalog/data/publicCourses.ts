import type { PublicCourse } from '../types';

/**
 * Public course catalog (front-end mock data).
 *
 * This is the ONLY course source used by guest-facing UI: the header search
 * bar, the Popular Courses grid, the /courses page and the public course
 * detail page. The authenticated course screens keep their own data
 * (features/course, features/module) — they are a different workflow.
 *
 * Counts are display values for the catalog UI; nothing here is persisted.
 */
export const PUBLIC_COURSES: PublicCourse[] = [
  {
    slug: 'aws-cloud-practitioner',
    name: 'AWS Certified Cloud Practitioner',
    providerId: 'aws',
    provider: 'Amazon Web Services',
    tagline: 'Build foundational AWS cloud knowledge.',
    description:
      'Covers AWS architecture, core services, billing, security and support so you can walk into the Cloud Practitioner exam with the fundamentals locked in.',
    difficulty: 'Beginner',
    questionCount: 1250,
    examCount: 15,
    topicCount: 12,
    rating: 4.8,
    ratingCount: 2431,
    updatedAt: 'Sep 2026',
    priceLabel: 'Included in Plan',
    features: ['AI Review', 'Flashcards', 'Progress Tracking', 'Full Mock Exams'],
    topics: [
      'Cloud Fundamentals',
      'AWS Global Infrastructure',
      'Compute & Storage',
      'Networking & Content Delivery',
      'Database Services',
      'Security & Compliance',
      'Cost Management',
      'Support Plans',
    ],
  },
  {
    slug: 'aws-solutions-architect',
    name: 'AWS Certified Solutions Architect Associate',
    providerId: 'aws',
    provider: 'Amazon Web Services',
    tagline: 'Design resilient, cost-aware AWS architectures.',
    description:
      'Scenario-heavy practice on VPC design, high availability, storage, databases and trade-offs — the exact format used in the SAA exam.',
    difficulty: 'Intermediate',
    questionCount: 980,
    examCount: 12,
    topicCount: 14,
    rating: 4.7,
    ratingCount: 1684,
    updatedAt: 'Sep 2026',
    priceLabel: 'Included in Plan',
    features: ['AI Review', 'Flashcards', 'Progress Tracking', 'Architecture Diagrams'],
    topics: [
      'Design Secure Architectures',
      'Resilient Architectures',
      'High-Performing Architectures',
      'Cost-Optimised Architectures',
      'VPC & Networking',
      'Storage & Database Selection',
      'Multi-Account Strategy',
      'Migration Planning',
    ],
  },
  {
    slug: 'azure-fundamentals-az-900',
    name: 'Microsoft Azure Fundamentals (AZ-900)',
    providerId: 'microsoft',
    provider: 'Microsoft',
    tagline: 'Master the Azure basics every admin touches.',
    description:
      'Azure concepts, core services, identity, governance and cost management, with practice questions mapped to the AZ-900 objectives.',
    difficulty: 'Beginner',
    questionCount: 1100,
    examCount: 14,
    topicCount: 11,
    rating: 4.6,
    ratingCount: 1975,
    updatedAt: 'Aug 2026',
    priceLabel: 'Free',
    features: ['AI Review', 'Flashcards', 'Progress Tracking'],
    topics: [
      'Cloud Concepts',
      'Azure Architecture',
      'Azure Services',
      'Azure Identity & Governance',
      'Azure Storage',
      'Azure Networking',
      'Databases & Analytics',
      'Cost Management',
    ],
  },
  {
    slug: 'azure-administrator-az-104',
    name: 'Microsoft Azure Administrator Associate (AZ-104)',
    providerId: 'microsoft',
    provider: 'Microsoft',
    tagline: 'Administer Azure identities, VMs and networking.',
    description:
      'Hands-on administration coverage: Entra ID, RBAC, virtual machines, storage accounts, networking and backup for the AZ-104 exam.',
    difficulty: 'Intermediate',
    questionCount: 860,
    examCount: 10,
    topicCount: 13,
    rating: 4.5,
    ratingCount: 1108,
    updatedAt: 'Aug 2026',
    priceLabel: 'Included in Plan',
    features: ['AI Review', 'Flashcards', 'Progress Tracking'],
    topics: [
      'Entra ID & Authentication',
      'Role-Based Access Control',
      'Azure Virtual Machines',
      'Storage & File Services',
      'Virtual Networks & Load Balancers',
      'Backup & Disaster Recovery',
      'Monitoring & Logging',
      'Azure Policy',
    ],
  },
  {
    slug: 'google-cloud-associate',
    name: 'Google Cloud Associate Cloud Engineer',
    providerId: 'google-cloud',
    provider: 'Google Cloud',
    tagline: 'Deploy and operate workloads on Google Cloud.',
    description:
      'GCP resource management, storage, compute, networking and IAM, with exam-length mock exams and weak-topic review built in.',
    difficulty: 'Beginner',
    questionCount: 720,
    examCount: 9,
    topicCount: 10,
    rating: 4.5,
    ratingCount: 863,
    updatedAt: 'Jul 2026',
    priceLabel: 'Free',
    features: ['AI Review', 'Flashcards', 'Progress Tracking'],
    topics: [
      'Google Cloud Fundamentals',
      'Cloud Identity & IAM',
      'Compute & App Engine',
      'Cloud Storage',
      'Networking & Load Balancing',
      'BigQuery & Data Analytics',
      'Monitoring & Logging',
      'Billing & Quotas',
    ],
  },
  {
    slug: 'comptia-security-plus',
    name: 'CompTIA Security+',
    providerId: 'comptia',
    provider: 'CompTIA',
    tagline: 'Build the security baseline employers look for.',
    description:
      'Threats, vulnerabilities, cryptography, identity management and security operations, aligned to the current Security+ objectives.',
    difficulty: 'Intermediate',
    questionCount: 1400,
    examCount: 18,
    topicCount: 12,
    rating: 4.7,
    ratingCount: 3210,
    updatedAt: 'Sep 2026',
    priceLabel: 'Included in Plan',
    features: ['AI Review', 'Flashcards', 'Progress Tracking', 'Performance-Based Practice'],
    topics: [
      'General Security Concepts',
      'Threats, Vulnerabilities & Mitigations',
      'Security Architecture',
      'Security Operations',
      'Security Program Management',
      'Identity & Access Management',
      'Cryptography & Network Security',
      'Cloud & Mobile Security',
    ],
  },
  {
    slug: 'cisco-ccna-200-301',
    name: 'Cisco CCNA 200-301',
    providerId: 'cisco',
    provider: 'Cisco',
    tagline: 'Get fluent in routing, switching and IP services.',
    description:
      'Network fundamentals, IP addressing, routing and switching, wireless and network security — the full CCNA 200-301 blueprint.',
    difficulty: 'Intermediate',
    questionCount: 1150,
    examCount: 16,
    topicCount: 9,
    rating: 4.4,
    ratingCount: 1422,
    updatedAt: 'Jul 2026',
    priceLabel: 'Included in Plan',
    features: ['AI Review', 'Flashcards', 'Progress Tracking', 'Full Mock Exams'],
    topics: [
      'Network Fundamentals',
      'Network Access',
      'IP Connectivity',
      'IP Services',
      'Security Fundamentals',
      'Automation & Programmability',
      'Wireless Networking',
      'Troubleshooting',
    ],
  },
];

/** Slug of the single course showcased in the hero. */
export const FEATURED_COURSE_SLUG = 'aws-cloud-practitioner';

export const featuredCourse: PublicCourse =
  PUBLIC_COURSES.find((c) => c.slug === FEATURED_COURSE_SLUG) ?? PUBLIC_COURSES[0];

const bySlug = new Map(PUBLIC_COURSES.map((c) => [c.slug, c]));

/** Course lookup by slug — undefined for unknown slugs (detail page 404s). */
export function findCourseBySlug(slug: string | undefined): PublicCourse | undefined {
  return slug ? bySlug.get(slug) : undefined;
}

/**
 * Lowercase + strip punctuation so "AWS." matches "AWS" and "Security+" is
 * searchable as either "security+" or "security plus".
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Course search — name, provider and short description only.
 *
 * Deliberately scoped to COURSES: questions, exams, users, modules, lessons
 * and the question bank are never searched from this entry point.
 *
 * Matching is token-based rather than plain substring, so a query like
 * "AWS Cloud Practitioner" still finds "AWS Certified Cloud Practitioner" —
 * every token must appear somewhere in the course, but not contiguously.
 * Ranking: name prefix > all tokens in name > all tokens in provider > rest.
 */
export function searchCourses(query: string): PublicCourse[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(' ');
  const scored: Array<{ course: PublicCourse; rank: number }> = [];

  for (const course of PUBLIC_COURSES) {
    const name = normalize(course.name);
    const provider = normalize(course.provider);
    const prose = normalize(`${course.tagline} ${course.description}`);
    const haystack = `${name} ${provider} ${prose}`;

    // Every token has to be present somewhere, otherwise no match.
    if (!tokens.every((token) => haystack.includes(token))) continue;

    let rank = 3;
    if (name.startsWith(normalizedQuery)) rank = 0;
    else if (tokens.every((token) => name.includes(token))) rank = 1;
    else if (tokens.every((token) => provider.includes(token))) rank = 2;

    scored.push({ course, rank });
  }

  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.course);
}