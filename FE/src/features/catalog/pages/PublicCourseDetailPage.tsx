import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES, coursePath } from '@/app/routes';
import { Container } from '@/features/landing/components/Container';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Badge } from '@/components/ui/Badge';
import { CTAButton } from '@/features/landing/components/CTAButton';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { PUBLIC_COURSES, findCourseBySlug } from '../data/publicCourses';
import { CourseCatalogCard } from '../components/CourseCatalogCard';
import { ProviderLogo } from '../components/ProviderLogo';

/**
 * PublicCourseDetailPage  (/courses/:slug)
 *
 * Guest-accessible course page — the destination for every course link, search
 * result and "View Course" button on the landing page.
 *
 * The Start Learning / Start Practice / Take Exam actions all require an
 * account: a guest is sent to /login?redirect=<this course> and returned here
 * after signing in. PrepExam is a preparation platform, so the page never
 * promises a certificate.
 */
export function PublicCourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const requireAuth = useRequireAuth();

  const course = findCourseBySlug(slug);

  if (!course) {
    return (
      <Container className="py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#EFF6FF] dark:bg-[#2563EB]/15">
            <Icon.Search className="h-6 w-6 text-[#2563EB]" />
          </div>
          <h1 className="mt-5 text-[22px] font-bold text-[#111827] dark:text-[#F9FAFB]">Course not found</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">
            We couldn’t find that course. Browse the catalog to see everything available right now.
          </p>
          <CTAButton label="Browse Courses" to={ROUTES.courses} className="mt-6" withArrow />
        </div>
      </Container>
    );
  }

  // Returning to THIS course after login is what the guest guard promises.
  const actionTarget = coursePath(course.slug);

  const stats = [
    { value: course.questionCount.toLocaleString(), label: 'Practice Questions', icon: <Icon.ClipboardList className="h-4 w-4" /> },
    { value: String(course.examCount), label: 'Mock Exams', icon: <Icon.Clock className="h-4 w-4" /> },
    { value: String(course.topicCount), label: 'Topics', icon: <Icon.Layers className="h-4 w-4" /> },
    { value: course.rating.toFixed(1), label: `Rated by ${course.ratingCount.toLocaleString()} learners`, icon: <Icon.Star className="h-4 w-4" /> },
  ];

  const related = PUBLIC_COURSES.filter((c) => c.providerId === course.providerId && c.slug !== course.slug).slice(0, 2);

  return (
    <>
      {/* Hero strip — course identity */}
      <div className="border-b border-[#F3F4F6] bg-[#F9FAFB] dark:border-[#1F2937] dark:bg-[#0B1220]">
        <Container className="py-[clamp(1.75rem,4vw,2.75rem)]">
          <Breadcrumb
            items={[
              { label: 'Home', onClick: () => navigate(ROUTES.landing) },
              { label: 'Courses', onClick: () => navigate(ROUTES.courses) },
              { label: course.name },
            ]}
          />

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
            <ProviderLogo providerId={course.providerId} provider={course.provider} size={56} className="rounded-[14px]" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[clamp(1.375rem,1.1rem+1.2vw,1.75rem)] font-bold tracking-tight text-[#111827] dark:text-[#F9FAFB]">
                  {course.name}
                </h1>
                <Badge variant={course.difficulty === 'Beginner' ? 'success' : course.difficulty === 'Intermediate' ? 'warning' : 'danger'}>
                  {course.difficulty}
                </Badge>
              </div>
              <p className="mt-1.5 text-[14px] text-[#6B7280] dark:text-[#D1D5DB]">{course.provider}</p>
              <p className="mt-3 max-w-[min(46rem,100%)] text-[15px] leading-relaxed text-[#374151] dark:text-[#D1D5DB]">
                {course.description}
              </p>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-[clamp(2rem,4vw,3rem)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-[clamp(1.5rem,3vw,2.5rem)]">
          {/* Main column */}
          <div className="min-w-0">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="card p-4">
                  <span className="text-[#2563EB]">{stat.icon}</span>
                  <p className="mt-2 text-[20px] leading-none font-bold text-[#111827] dark:text-[#F9FAFB]">{stat.value}</p>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-[#9CA3AF]">{stat.label}</p>
                </div>
              ))}
            </div>

            <section className="mt-[clamp(1.5rem,3vw,2rem)]">
              <h2 className="text-[17px] font-bold text-[#111827] dark:text-[#F9FAFB]">What you’ll get</h2>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {course.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-[14px] text-[#374151] dark:text-[#D1D5DB]">
                    <Icon.CheckCircle className="h-4 w-4 flex-shrink-0 text-[#16A34A]" />
                    {feature}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-[14px] text-[#374151] dark:text-[#D1D5DB]">
                  <Icon.CheckCircle className="h-4 w-4 flex-shrink-0 text-[#16A34A]" />
                  Exam-style explanations for every question
                </li>
                <li className="flex items-center gap-2 text-[14px] text-[#374151] dark:text-[#D1D5DB]">
                  <Icon.CheckCircle className="h-4 w-4 flex-shrink-0 text-[#16A34A]" />
                  Weak-topic review after every attempt
                </li>
              </ul>
            </section>

            <section className="mt-[clamp(1.5rem,3vw,2rem)]">
              <h2 className="text-[17px] font-bold text-[#111827] dark:text-[#F9FAFB]">Topics covered</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {course.topics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-[13px] text-[#374151] dark:border-[#1F2937] dark:bg-[#111827] dark:text-[#D1D5DB]"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Action sidebar */}
          <aside className="min-w-0">
            <div className="card sticky top-24 p-5">
              <p className="text-[20px] font-bold text-[#2563EB]">{course.priceLabel}</p>
              <p className="mt-1 text-[12.5px] text-[#9CA3AF]">Last updated {course.updatedAt}</p>

              <div className="mt-4 space-y-2">
                <CTAButton label="Start Learning" onClick={() => requireAuth(actionTarget)} className="w-full" withArrow />
                <CTAButton label="Start Practice" onClick={() => requireAuth(actionTarget)} variant="secondary" className="w-full" />
                <CTAButton label="Take Exam" onClick={() => requireAuth(actionTarget)} variant="secondary" className="w-full" />
              </div>

              <ul className="mt-4 space-y-2 border-t border-[#F3F4F6] pt-4 dark:border-[#1F2937]">
                <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">
                  <Icon.Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#9CA3AF]" />
                  A free account is required to practise — you’ll come straight back to this course after signing in.
                </li>
                <li className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">
                  <Icon.Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#9CA3AF]" />
                  PrepExam is a preparation platform. It does not issue certificates — you take the official exam with
                  the exam provider.
                </li>
              </ul>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-[clamp(2.5rem,5vw,3.5rem)]">
            <h2 className="text-[17px] font-bold text-[#111827] dark:text-[#F9FAFB]">More from {course.provider}</h2>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
              {related.map((item) => (
                <CourseCatalogCard key={item.slug} course={item} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </>
  );
}