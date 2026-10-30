import { useEffect, useState, type ReactNode } from 'react';
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
import { studentCourseService, type CourseModuleSummary, type StudentCourseDetail } from '@/services/studentCourse.service';
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
  // Empty modules (no exam, no flashcard deck) are neither listed nor counted.
  const modules = course.modules
    .filter(hasContent)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  // A signed-in student sees this page inside the dashboard shell, which owns the gutter and the gap
  // under the header (.dashboard-content) — so no hero strip and no Container padding there.
  const inDashboard = isStudent;

  const stats = [
    { label: plural(course.stats.publishedExamCount, 'mock exam'), icon: <Icon.ClipboardList className="h-3.5 w-3.5" /> },
    { label: plural(course.stats.deckCount, 'flashcard deck'), icon: <Icon.Layers className="h-3.5 w-3.5" /> },
    { label: plural(modules.length, 'module'), icon: <Icon.Folder className="h-3.5 w-3.5" /> },
  ];

  const header = (
    <>
      <Breadcrumb
        items={[
          { label: 'Home', onClick: () => navigate(ROUTES.landing) },
          { label: 'Courses', onClick: () => navigate(ROUTES.courses) },
          { label: course.title },
        ]}
      />

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
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
          <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-subtle">
            {stats.map((stat) => (
              <li key={stat.label} className="inline-flex items-center gap-1.5">
                <span className="text-brand-ink">{stat.icon}</span>
                {stat.label}
              </li>
            ))}
          </ul>
          {course.description && (
            <p className="mt-3 max-w-[min(46rem,100%)] text-base leading-relaxed whitespace-pre-line text-content-secondary">
              {course.description}
            </p>
          )}
        </div>
      </div>
    </>
  );

  const body = (
    <>
      <div className="grid grid-cols-1 gap-[clamp(1.5rem,3vw,2.5rem)] lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          {/* Main column — 70 % */}
          <section className="min-w-0">
            <h2 className="text-lg font-bold text-content">Course modules</h2>
            {modules.length > 0 ? (
              <ol className="mt-3 card divide-y divide-line overflow-hidden">
                {modules.map((m, i) => (
                  <ModuleRow key={m.moduleId} module={m} index={i + 1} />
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-base text-content-soft">Modules are being prepared.</p>
            )}
          </section>

          {/* Action sidebar — 30 % */}
          <aside className="min-w-0">
            <div className="card sticky top-6 p-5">
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
    </>
  );

  return (
    <>
      {inDashboard ? (
        <div>
          <div className="border-b border-line-soft pb-[clamp(1.25rem,2.5vw,1.75rem)]">{header}</div>
          <div className="pt-[clamp(1.25rem,2.5vw,1.75rem)]">{body}</div>
        </div>
      ) : (
        <>
          {/* Hero strip — course identity */}
          <div className="border-b border-line-soft bg-surface-alt">
            <Container className="py-[clamp(1.75rem,4vw,2.75rem)]">{header}</Container>
          </div>
          <Container className="py-[clamp(2rem,4vw,3rem)]">{body}</Container>
        </>
      )}
      <PaymentCheckoutModal item={buying} onClose={() => setBuying(null)} onPaid={handlePaid} />
    </>
  );
}

/** A module with at least one exam or flashcard deck. Without the counts (an older BE) it is kept. */
function hasContent(m: CourseModuleSummary): boolean {
  if (m.examCount == null && m.deckCount == null) return true;
  return (m.examCount ?? 0) + (m.deckCount ?? 0) > 0;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** One module — expands to its description and its exam / flashcard deck counts. */
function ModuleRow({ module, index }: { module: CourseModuleSummary; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `module-${module.moduleId}`;
  const counts = [
    module.examCount != null && { icon: <Icon.ClipboardList className="h-4 w-4" />, label: plural(module.examCount, 'mock exam') },
    module.deckCount != null && { icon: <Icon.Layers className="h-4 w-4" />, label: plural(module.deckCount, 'flashcard deck') },
  ].filter(Boolean) as { icon: ReactNode; label: string }[];

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-content-secondary">
          {index}
        </span>
        <span className="min-w-0 flex-1 text-base font-medium text-content-secondary">{module.title}</span>
        <Icon.ChevronDown className={`h-4 w-4 flex-shrink-0 text-content-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 px-4 pb-4 pl-14">
          <p className="text-sm leading-relaxed whitespace-pre-line text-content-soft">
            {module.description?.trim() || 'No description for this module yet.'}
          </p>
          {counts.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-content-secondary">
              {counts.map((c) => (
                <li key={c.label} className="inline-flex items-center gap-1.5">
                  <span className="text-brand-ink">{c.icon}</span>
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
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
