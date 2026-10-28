import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentDeckPath, studentExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import type { ExamKind } from '@/services/exam.service';
import {
  studentCourseService,
  type CourseExam,
  type StudentCourseDetail,
  type StudentDeck,
} from '@/services/studentCourse.service';
import { CourseThumb, ListSkeleton, LoadError, STUDENT_PAGE_CLASS, formatScore } from '../components/studentUi';
import type { DeckStudyState } from '../components/DeckCard';

/**
 * Student course detail — course info (CL-02), then the course content as a
 * tree: each module is a collapsible folder holding its exams (MC-02) and
 * flashcard decks (MC-03); anything not filed under a module sits at the
 * root, next to the modules. Leaves open the read-only exam / deck pages.
 * MC-02/03 only answer for an ACTIVE enrollment, so other states only list
 * the modules.
 */
export function StudentCourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /** Modules the content tree shows (empty ones are hidden); null until it has loaded. */
  const [shownModules, setShownModules] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShownModules(null);
    studentCourseService
      .getCourseDetail(courseId)
      .then(res => {
        if (!cancelled) setCourse(res);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the course.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, reload]);

  const breadcrumb = (
    <Breadcrumb
      items={[{ label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) }, { label: course?.title ?? 'Course' }]}
    />
  );

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <div className="card p-5 flex flex-col sm:flex-row gap-5">
          <Skeleton className="w-full sm:w-64 aspect-video" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error ?? 'Course not found.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  const enrollment = course.enrollment;
  const isActive = Boolean(enrollment?.isEnrolled && enrollment.status === 'ACTIVE');
  // Count what the page lists: the tree hides empty modules, the locked list shows them all.
  const moduleCount = isActive ? shownModules : course.modules.length;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      <div className="card p-[clamp(1rem,2vw,1.25rem)] flex flex-col sm:flex-row gap-5">
        <CourseThumb url={course.thumbnailUrl} title={course.title} className="sm:w-64 rounded-[10px] flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {course.category && <Badge>{course.category.name}</Badge>}
            {enrollment?.isEnrolled && (
              <Badge variant={enrollment.status === 'COMPLETED' ? 'success' : 'info'}>
                {enrollment.status === 'COMPLETED' ? 'Completed' : 'In progress'}
              </Badge>
            )}
          </div>
          <div>
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{course.title}</h1>
            {course.manager && <p className="text-sm text-content-subtle mt-0.5">by {course.manager.fullName}</p>}
          </div>
          {course.description && <p className="text-sm text-content-soft whitespace-pre-line">{course.description}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-content-soft">
            <span className="inline-flex items-center gap-1.5">
              <Icon.ClipboardList className="w-4 h-4" /> {course.stats.publishedExamCount} exams
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Layers className="w-4 h-4" /> {course.stats.deckCount} decks
            </span>
            {moduleCount != null && (
              <span className="inline-flex items-center gap-1.5">
                <Icon.Folder className="w-4 h-4" /> {moduleCount} module{moduleCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isActive && (
        <Alert
          type={enrollment?.status === 'COMPLETED' ? 'info' : 'warning'}
          title={enrollment?.status === 'COMPLETED' ? 'Course completed' : 'Not enrolled'}
          message={
            enrollment?.status === 'COMPLETED'
              ? 'Exams and flashcards are only available while your enrollment is active.'
              : 'Enroll in this course to take its exams and study its flashcards.'
          }
        />
      )}

      {isActive ? (
        <CourseTree course={course} onModuleCount={setShownModules} />
      ) : (
        <LockedModules course={course} />
      )}
    </div>
  );
}


function sortedModules(course: StudentCourseDetail) {
  return [...course.modules].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

type Leaf = { kind: 'exam'; exam: CourseExam } | { kind: 'deck'; deck: StudentDeck };

interface ModuleNode {
  moduleId: number;
  title: string;
  leaves: Leaf[];
}

/** Row geometry shared by the connector lines: rows are ROW px tall, lines meet at MID. */
const ROW = 36;
const MID = ROW / 2;
const LINE = 'border-dotted border-content-subtle';

function CourseTree({ course, onModuleCount }: { course: StudentCourseDetail; onModuleCount: (count: number) => void }) {
  const navigate = useNavigate();
  const [exams, setExams] = useState<CourseExam[]>([]);
  const [decks, setDecks] = useState<StudentDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([studentCourseService.getAllCourseExams(course.courseId), studentCourseService.getCourseDecks(course.courseId)])
      .then(([examRes, deckRes]) => {
        if (cancelled) return;
        setExams(examRes);
        setDecks(deckRes);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the course content.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [course.courseId, reload]);

  const { modules, loose } = useMemo(() => {
    const byModule = new Map<number, Leaf[]>(course.modules.map(m => [m.moduleId, []]));
    const rootLeaves: Leaf[] = [];
    // Unknown or missing module → the item sits at the root, next to the modules.
    const file = (moduleId: number | null | undefined, leaf: Leaf) => {
      const bucket = moduleId != null ? byModule.get(moduleId) : undefined;
      (bucket ?? rootLeaves).push(leaf);
    };
    exams.forEach(exam => file(exam.moduleId, { kind: 'exam', exam }));
    decks.forEach(deck => file(deck.moduleId, { kind: 'deck', deck }));
    return {
      // Empty modules are hidden — a student has nothing to open in them.
      modules: sortedModules(course)
        .map<ModuleNode>(m => ({
          moduleId: m.moduleId,
          title: m.title,
          leaves: byModule.get(m.moduleId) ?? [],
        }))
        .filter(m => m.leaves.length > 0),
      loose: rootLeaves,
    };
  }, [course, exams, decks]);

  // The header counts the modules shown here, not the empty ones hidden above.
  useEffect(() => {
    if (!loading && !error) onModuleCount(modules.length);
  }, [loading, error, modules.length, onModuleCount]);

  if (loading) return <ListSkeleton rows={4} />;
  if (error) return <LoadError message={error} onRetry={() => setReload(r => r + 1)} />;

  if (modules.length === 0 && loose.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Icon.Folder className="w-7 h-7" />}
          title="No content yet"
          message="This course has no exam or flashcard deck yet."
        />
      </div>
    );
  }

  const toggle = (id: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openLeaf = (leaf: Leaf) =>
    leaf.kind === 'exam'
      ? navigate(studentExamPath(leaf.exam.examId))
      : navigate(studentDeckPath(leaf.deck.deckId), {
          state: { deckTitle: leaf.deck.title, courseId: course.courseId, courseTitle: course.title } satisfies DeckStudyState,
        });

  const allCollapsed = modules.length > 0 && modules.every(m => collapsed.has(m.moduleId));
  const rootCount = modules.length + loose.length;

  return (
    <section className="card p-[clamp(0.75rem,2vw,1.25rem)] space-y-3" aria-label="Course content">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-content">Course content</h2>
        {modules.length > 0 && (
          <button
            type="button"
            className="text-sm text-brand-ink hover:underline"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(modules.map(m => m.moduleId)))}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </div>

      <ul role="tree" aria-label={course.title} className="overflow-x-auto">
        {modules.map((m, i) => {
          const open = !collapsed.has(m.moduleId);
          return (
            <TreeItem key={`m-${m.moduleId}`} last={i === rootCount - 1} expanded={open} onToggle={() => toggle(m.moduleId)}>
              <TreeRow
                onClick={() => toggle(m.moduleId)}
                icon={open ? <Icon.FolderOpen className="w-4 h-4 text-primary" /> : <Icon.Folder className="w-4 h-4 text-primary" />}
                label={m.title}
                strong
                meta={`${m.leaves.length} item${m.leaves.length === 1 ? '' : 's'}`}
              />
              {open && (
                <ul role="group">
                  {m.leaves.map((leaf, j) => (
                    <TreeItem key={leafKey(leaf)} last={j === m.leaves.length - 1}>
                      <LeafRow leaf={leaf} onOpen={() => openLeaf(leaf)} />
                    </TreeItem>
                  ))}
                </ul>
              )}
            </TreeItem>
          );
        })}
        {loose.map((leaf, j) => (
          <TreeItem key={leafKey(leaf)} last={modules.length + j === rootCount - 1}>
            <LeafRow leaf={leaf} onOpen={() => openLeaf(leaf)} />
          </TreeItem>
        ))}
      </ul>
    </section>
  );
}

function leafKey(leaf: Leaf) {
  return leaf.kind === 'exam' ? `e-${leaf.exam.examId}` : `d-${leaf.deck.deckId}`;
}

/**
 * One node with dotted connectors: a vertical line down the left (stopping at
 * the row for the last sibling) and a short horizontal tick into the row. A
 * node that can expand gets the boxed +/− toggle on the junction.
 */
function TreeItem({
  last,
  expanded,
  onToggle,
  children,
}: {
  last?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <li role="treeitem" aria-expanded={onToggle ? expanded : undefined} className="relative pl-7">
      <span aria-hidden="true" className={`absolute left-[9px] top-0 border-l ${LINE}`} style={last ? { height: MID } : { bottom: 0 }} />
      <span aria-hidden="true" className={`absolute left-[9px] w-4 border-t ${LINE}`} style={{ top: MID }} />
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="absolute left-[2px] z-10 w-[15px] h-[15px] flex items-center justify-center border border-content-soft bg-surface text-content text-[13px] font-bold leading-none hover:bg-accent"
          style={{ top: MID - 7.5 }}
        >
          {expanded ? '−' : '+'}
        </button>
      )}
      {children}
    </li>
  );
}

function TreeRow({
  icon,
  label,
  meta,
  tag,
  aside,
  strong,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  /** Small chip right after the label (e.g. the exam kind). */
  tag?: React.ReactNode;
  aside?: React.ReactNode;
  strong?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-w-[16rem] flex items-center gap-2 px-2 rounded-[6px] text-left hover:bg-primary-light focus-visible:outline-2 focus-visible:outline-primary transition-colors"
      style={{ height: ROW }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className={`truncate text-sm text-content ${strong ? 'font-semibold' : ''}`}>{label}</span>
      {tag && <span className="flex-shrink-0">{tag}</span>}
      {meta && <span className="hidden sm:inline text-xs text-content-subtle flex-shrink-0">{meta}</span>}
      <span className="ml-auto flex items-center gap-2 flex-shrink-0">{aside}</span>
    </button>
  );
}

function LeafRow({ leaf, onOpen }: { leaf: Leaf; onOpen: () => void }) {
  if (leaf.kind === 'deck') {
    const d = leaf.deck;
    return (
      <TreeRow
        onClick={onOpen}
        icon={<Icon.Layers className="w-4 h-4 text-purple" />}
        label={d.title}
        meta={`Flashcards · ${d.cardCount} cards`}
        aside={
          <span className="text-xs text-content-subtle">
            {d.learnedCount}/{d.cardCount} learned
          </span>
        }
      />
    );
  }
  const e = leaf.exam;
  return (
    <TreeRow
      onClick={onOpen}
      icon={<Icon.ClipboardList className="w-4 h-4 text-primary" />}
      label={e.title}
      tag={e.examKind ? <ExamKindBadge kind={e.examKind} /> : undefined}
      meta={[`${e.questionCount} questions`, e.durationMinutes != null ? `${e.durationMinutes} min` : null].filter(Boolean).join(' · ')}
      aside={
        <>
          {e.hasActiveAttempt && (
            <Badge variant="warning" size="sm">
              In progress
            </Badge>
          )}
          {e.myAttemptCount > 0 && <span className="text-xs text-content-subtle">Best {formatScore(e.myBestScore, e.maxScore)}</span>}
        </>
      }
    />
  );
}

/** Not enrolled / completed: MC-02/03 refuse, so only the module names are shown. */
function LockedModules({ course }: { course: StudentCourseDetail }) {
  const modules = sortedModules(course);
  if (modules.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Icon.Folder className="w-7 h-7" />} title="No modules yet" />
      </div>
    );
  }
  return (
    <section className="card p-[clamp(0.75rem,2vw,1.25rem)] space-y-3" aria-label="Course content">
      <h2 className="text-base font-semibold text-content">Course content</h2>
      <ul role="tree" aria-label={course.title}>
        {modules.map((m, i) => (
          <TreeItem key={m.moduleId} last={i === modules.length - 1}>
            <span className="flex items-center gap-2 px-2 text-sm text-content-soft" style={{ height: ROW }}>
              <Icon.Lock className="w-4 h-4 text-content-subtle" /> {m.title}
            </span>
          </TreeItem>
        ))}
      </ul>
    </section>
  );
}

const EXAM_KIND: Record<ExamKind, { label: string; variant: 'info' | 'purple' | 'warning' | 'success' | 'default' }> = {
  QUIZ: { label: 'Quiz', variant: 'info' },
  ESSAY: { label: 'Essay', variant: 'purple' },
  CODE: { label: 'Code', variant: 'warning' },
  DIAGRAM: { label: 'Diagram', variant: 'success' },
  MIXED: { label: 'Mixed', variant: 'default' },
};

function ExamKindBadge({ kind }: { kind: ExamKind }) {
  const k = EXAM_KIND[kind] ?? { label: kind, variant: 'default' as const };
  return (
    <Badge variant={k.variant} size="sm">
      {k.label}
    </Badge>
  );
}
