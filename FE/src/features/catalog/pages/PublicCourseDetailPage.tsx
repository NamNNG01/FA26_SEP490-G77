import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES, coursePath, studentCoursePath } from '@/app/routes';
import { Container } from '@/features/landing/components/Container';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Badge } from '@/components/ui/Badge';
import { CTAButton } from '@/features/landing/components/CTAButton';
import { useAuth } from '@/auth/authContext';
import { Role } from '@/utils/permissions';
import { getApiErrorMessage } from '@/utils/apiError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { studentCourseService, type StudentCourseDetail } from '@/services/studentCourse.service';
import { CourseCatalogCard } from '../components/CourseCatalogCard';
import { CourseLogo, formatPrice } from '../components/CourseLogo';
import { useCatalogCourses } from '../hooks/usePublicCatalog';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastHost';
import { PaymentCheckoutModal, type PaymentItem } from '@/features/payment/components/PaymentCheckoutModal';

/**
 * PublicCourseDetailPage  (/courses/:courseId)
 *
 * Guest-accessible course page (CL-02) — the destination for every course
 * link, search result and "View Course" button.
 *
 * Actions:
 *  - guest                 → sign in, then come back here;
 *  - enrolled student      → open the course in My Courses;
 *  - student, free course  → EN-02 enroll, then open the course;
 *  - student, paid course  → PaymentCheckoutModal (PY-01 + PayOS), access once PY-04 says SUCCEEDED;
 *  - other roles           → enrollment is for students.
 * PrepExam is a preparation platform, so the page never promises a certificate.
 */
export function PublicCourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const requireAuth = useRequireAuth();
  const { isAuthenticated, user } = useAuth();

  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reload, setReload] = useState(0);
  const [buying, setBuying] = useState<PaymentItem | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    // A refresh after a purchase keeps the page on screen.
    if (reload === 0) setLoading(true);
    setError(null);
    setNotFound(false);
    studentCourseService
      .getCourseDetail(courseId)
      .then((res) => {
        if (!cancelled) setCourse(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 400) setNotFound(true);
        else setError(getApiErrorMessage(err, 'Failed to load the course.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, reload]);

  if (loading) return <DetailSkeleton />;

  if (notFound || error || !course) {
    return (
      <Container className="py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary-light">
            <Icon.Search className="h-6 w-6 text-brand-ink" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-content">{error ? 'Could not load the course' : 'Course not found'}</h1>
          <p className="mt-2 text-base leading-relaxed text-content-soft">
            {error ?? 'We couldn’t find that course. Browse the catalog to see everything available right now.'}
          </p>
          <CTAButton label="Browse Courses" to={ROUTES.courses} className="mt-6" withArrow />
        </div>
      </Container>
    );
  }

  const price = formatPrice(course.price);
  const isFree = !Number(course.price ?? 0);
  const enrollment = course.enrollment;
  const isStudent = user?.role === Role.STUDENT;

  /** PY-04 said SUCCEEDED: the webhook has enrolled the student — refresh CL-02 for "Go to course". */
  function handlePaid(item: PaymentItem) {
    toast.success(`You are enrolled in ${item.title}`);
    setReload((r) => r + 1);
  }

  /** EN-02 — a free course is joined right away. */
  async function handleEnrollFree() {
    if (!course) return;
    setEnrolling(true);
    try {
      await studentCourseService.enrollFree(course.courseId);
      toast.success(`You are enrolled in ${course.title}`);
      navigate(studentCoursePath(course.courseId));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) navigate(studentCoursePath(course.courseId));
      else toast.error(getApiErrorMessage(err, 'Could not enroll in the course.'));
    } finally {
      setEnrolling(false);
    }
  }
  const modules = [...course.modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const stats = [
    { value: String(course.stats.publishedExamCount), label: 'Mock Exams', icon: <Icon.ClipboardList className="h-4 w-4" /> },
    { value: String(course.stats.deckCount), label: 'Flashcard Decks', icon: <Icon.Layers className="h-4 w-4" /> },
    { value: String(modules.length), label: 'Modules', icon: <Icon.Folder className="h-4 w-4" /> },
  ];

  return (
    <>
      {/* Hero strip — course identity */}
      <div className="border-b border-line-soft bg-surface-alt">
        <Container className="py-[clamp(1.75rem,4vw,2.75rem)]">
          <Breadcrumb
            items={[
              { label: 'Home', onClick: () => navigate(ROUTES.landing) },
              { label: 'Courses', onClick: () => navigate(ROUTES.courses) },
              { label: course.title },
            ]}
          />

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
            <CourseLogo title={course.title} thumbnailUrl={course.thumbnailUrl} size={56} className="rounded-[14px]" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[clamp(1.375rem,1.1rem+1.2vw,1.75rem)] font-bold tracking-tight text-content">
                  {course.title}
                </h1>
                {enrollment?.isEnrolled && <Badge variant="success">Enrolled</Badge>}
              </div>
              <p className="mt-1.5 text-base text-content-soft">
                {course.category?.name ?? 'Uncategorized'}
                {course.manager && <> · by {course.manager.fullName}</>}
              </p>
              {course.description && (
                <p className="mt-3 max-w-[min(46rem,100%)] text-lg leading-relaxed whitespace-pre-line text-content-secondary">
                  {course.description}
                </p>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-[clamp(2rem,4vw,3rem)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-[clamp(1.5rem,3vw,2.5rem)]">
          {/* Main column */}
          <div className="min-w-0">
            <div className="grid grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="card p-4">
                  <span className="text-brand-ink">{stat.icon}</span>
                  <p className="mt-2 text-xl leading-none font-bold text-content">{stat.value}</p>
                  <p className="mt-1.5 text-2xs leading-snug text-content-subtle">{stat.label}</p>
                </div>
              ))}
            </div>

            <section className="mt-[clamp(1.5rem,3vw,2rem)]">
              <h2 className="text-lg font-bold text-content">Course modules</h2>
              {modules.length > 0 ? (
                <ol className="mt-3 card divide-y divide-line">
                  {modules.map((m, i) => (
                    <li key={m.moduleId} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-content-secondary">
                        {i + 1}
                      </span>
                      <span className="text-base text-content-secondary">{m.title}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-base text-content-soft">Modules are being prepared.</p>
              )}
            </section>
          </div>

          {/* Action sidebar */}
          <aside className="min-w-0">
            <div className="card sticky top-24 p-5">
              <p className={`text-xl font-bold ${price === 'Free' ? 'text-success' : 'text-brand-ink'}`}>{price}</p>

              <div className="mt-4 space-y-2">
                {!isAuthenticated ? (
                  <CTAButton
                    label="Sign in to enroll"
                    onClick={() => requireAuth(coursePath(course.courseId))}
                    className="w-full"
                    withArrow
                  />
                ) : enrollment?.isEnrolled && isStudent ? (
                  <CTAButton
                    label="Go to course"
                    onClick={() => navigate(studentCoursePath(course.courseId))}
                    className="w-full"
                    withArrow
                  />
                ) : isStudent && isFree ? (
                  <Button size="lg" className="w-full" loading={enrolling} onClick={handleEnrollFree}>
                    Enroll for free
                  </Button>
                ) : isStudent ? (
                  <Button size="lg" className="w-full" onClick={() => setBuying(coursePaymentItem(course))}>
                    Buy course
                  </Button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-[10px] bg-surface-muted px-4 text-sm font-semibold text-content-subtle"
                  >
                    Enrollment is for students
                  </button>
                )}
              </div>

              <ul className="mt-4 space-y-2 border-t border-line-soft pt-4">
                {!isAuthenticated && (
                  <li className="flex items-start gap-2 text-xs leading-relaxed text-content-soft">
                    <Icon.Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-content-subtle" />
                    A free account is required to practise — you’ll come straight back to this course after signing in.
                  </li>
                )}
                <li className="flex items-start gap-2 text-xs leading-relaxed text-content-soft">
                  <Icon.Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-content-subtle" />
                  PrepExam is a preparation platform. It does not issue certificates — you take the official exam with
                  the exam provider.
                </li>
              </ul>
            </div>
          </aside>
        </div>

        {course.category?.categoryId != null && (
          <RelatedCourses categoryId={course.category.categoryId} categoryName={course.category.name} excludeId={course.courseId} />
        )}
      </Container>
      <PaymentCheckoutModal item={buying} onClose={() => setBuying(null)} onPaid={handlePaid} />
    </>
  );
}

function coursePaymentItem(course: StudentCourseDetail): PaymentItem {
  return {
    target: { courseId: course.courseId },
    type: 'COURSE',
    refId: course.courseId,
    title: course.title,
    subtitle: course.category?.name,
    price: Number(course.price ?? 0),
  };
}

/** Up to three other courses of the same category (CL-01). */
function RelatedCourses({ categoryId, categoryName, excludeId }: { categoryId: number; categoryName: string; excludeId: number }) {
  const { data } = useCatalogCourses({ categoryId, size: 4 });
  const related = (data?.content ?? []).filter((c) => c.courseId !== excludeId).slice(0, 3);
  if (related.length === 0) return null;
  return (
    <section className="mt-[clamp(2.5rem,5vw,3.5rem)]">
      <h2 className="text-lg font-bold text-content">More in {categoryName}</h2>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
        {related.map((item) => (
          <CourseCatalogCard key={item.courseId} course={item} />
        ))}
      </div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="border-b border-line-soft bg-surface-alt">
        <Container className="py-[clamp(1.75rem,4vw,2.75rem)]">
          <div className="flex gap-5" aria-hidden>
            <div className="h-14 w-14 animate-pulse rounded-[14px] bg-surface-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-2/3 animate-pulse rounded bg-surface-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface-muted" />
              <div className="h-16 w-full animate-pulse rounded bg-surface-muted" />
            </div>
          </div>
        </Container>
      </div>
      <Container className="py-[clamp(2rem,4vw,3rem)]">
        <div className="h-40 animate-pulse rounded-[14px] bg-surface-muted" aria-hidden />
      </Container>
    </>
  );
}
