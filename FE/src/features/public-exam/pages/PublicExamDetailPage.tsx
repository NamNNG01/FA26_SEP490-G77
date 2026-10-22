import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';
import { useAuth } from '@/auth/authContext';
import { useToast } from '@/components/ui/ToastHost';
import { ROUTES, publicExamListPathFor } from '@/app/routes';
import { Role } from '@/utils/permissions';
import { useExamEditor } from '../examStore';
import { AttemptHistory } from '../components/AttemptHistory';
import {
  NoQuestionsCard,
  QuestionEditorCard,
  QuestionGroupCard,
} from '../components/QuestionEditorCard';
import {
  DIFFICULTY_ACCENT,
  EXAM_TYPE_META,
  PUBLIC_EXAMS,
  PUBLIC_EXAM_COURSES,
  STATUS_META,
  courseMeta,
  examSubtitle,
} from '../mockPublicExams';
import type { ExamQuestion } from '../mockExamQuestions';

/**
 * PublicExamDetailPage
 *
 * ONE page, two roles. `canEdit` is the single switch that drives everything:
 *
 *   COURSE_MANAGER → every field editable, all inputs enabled, every dropdown
 *                    enabled, question content editable, Add/Remove Question
 *                    plus Save and Cancel visible.
 *   STUDENT (and ADMIN, which has no edit grant) → identical layout, every text
 *                    field read-only, every dropdown disabled, no editing
 *                    controls, and correct answers never rendered.
 *
 * Student-facing actions stay in the sticky panel for both roles:
 * available → Start Practice, in-progress → Continue Exam,
 * completed → View Result + Retake Exam. Save/Cancel sit above them for authors.
 *
 * Follows PublicCourseDetailPage for the shell: read the id off the route, look
 * the record up, bail out with a not-found block before rendering anything else.
 */

const OVERVIEW_TAB = 'Overview';
const HISTORY_TAB = 'History';

const COURSE_FILTER_OPTIONS = [
  { label: 'All Courses', value: '' },
  ...PUBLIC_EXAM_COURSES.map(c => ({ label: c.shortName ?? c.name, value: c.name })),
];

const DIFFICULTY_FILTER_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Easy', value: 'Easy' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Hard', value: 'Hard' },
];

const EXAM_STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Not Started', value: 'available' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
];

const EXAM_PUBLICATION_STATUS_OPTIONS = [
  { label: 'Draft', value: 'Draft' },
  { label: 'Public', value: 'Public' },
  { label: 'Private', value: 'Private' },
] as const;

/** <Select> trigger sizes: the editor's form fields, and the big values in the stats row. */
const FIELD_SELECT = 'w-full h-9 pl-3 pr-9 rounded-[10px] text-sm';
const STAT_SELECT = 'w-full h-9 pl-3 pr-9 rounded-[10px] text-lg font-semibold';

export function PublicExamDetailPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const roleCode = user?.role;
  const canEdit = roleCode === Role.COURSE_MANAGER;
  const listPath = publicExamListPathFor(roleCode);

  const [tab, setTab] = useState(OVERVIEW_TAB);
  const [publicationStatus, setPublicationStatus] = useState<(typeof EXAM_PUBLICATION_STATUS_OPTIONS)[number]['value']>('Draft');
  // Content managers author exams; they have no attempt history of their own, so
  // the History tab is withheld from them entirely rather than shown empty.
  const tabs = useMemo(() => (canEdit ? [OVERVIEW_TAB] : [OVERVIEW_TAB, HISTORY_TAB]), [canEdit]);
  // Derived rather than synced by an effect, so a role change can never leave
  // someone on a tab that is no longer in the list.
  const activeTab = tabs.includes(tab) ? tab : OVERVIEW_TAB;

  const exam = PUBLIC_EXAMS.find(e => e.id === examId);
  // Hook is called before the not-found early return so hook order stays stable
  // across the render; the return below guarantees `editor.draft` is unused
  // when the id is unknown.
  const editor = useExamEditor(examId ?? '', !canEdit);

  if (!exam) {
    return (
      <div className="mx-auto w-full max-w-[1400px] py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary-light dark:bg-primary/15">
            <Icon.Search className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-foreground">Exam not found</h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            We couldn’t find that exam. It may have been retired from the catalogue.
          </p>
          <Button className="mt-6" onClick={() => navigate(listPath)}>
            Back to Public Exam
          </Button>
        </div>
      </div>
    );
  }

  const draft = editor.draft;
  const course = courseMeta(draft.course);
  const status = STATUS_META[draft.status];
  const type = EXAM_TYPE_META[draft.examType];
  const difficulty = DIFFICULTY_ACCENT[draft.difficulty];
  const completed = draft.status === 'completed';
  const moduleOptions = course.modules.map(m => ({ label: m, value: m }));

  /** Primary student-facing action, plus the retake only a completed exam offers. */
  const primary = completed
    ? { label: 'View Result', route: ROUTES.studentExamResult, icon: <Icon.BarChart className="h-4 w-4" /> }
    : draft.status === 'in-progress'
      ? { label: 'Continue Exam', route: ROUTES.studentExam, icon: <Icon.RefreshCw className="h-4 w-4" /> }
      : { label: 'Start Practice', route: ROUTES.studentExam, icon: <Icon.Zap className="h-4 w-4" /> };

  const handleSave = () => {
    editor.save();
    toast.success(`Saved “${draft.title}”`);
  };

  const handleCancel = () => {
    editor.cancel();
    toast.info('Changes discarded');
  };

  /**
   * Partition the flat question list into groups and standalones.
   *
   * `position` is the 1-based index in `draft.questions`, so a grouped question
   * keeps its global number instead of restarting at 1 inside its card. Groups
   * are ordered by first appearance; members keep the array's order within the
   * group, which is what the move up/down buttons reorder.
   */
  const { usedGroups, singles } = useMemo(() => {
    const positioned = draft.questions.map((question, i) => ({ question, position: i + 1 }));
    const byGroup = new Map<string, { question: ExamQuestion; position: number }[]>();
    const singles: { question: ExamQuestion; position: number }[] = [];

    for (const item of positioned) {
      if (item.question.groupId) {
        const list = byGroup.get(item.question.groupId) ?? [];
        list.push(item);
        byGroup.set(item.question.groupId, list);
      } else {
        singles.push(item);
      }
    }

    // Follow the question order rather than the group list so the cards appear
    // where their first question sits.
    const usedGroups = draft.groups
      .filter(group => (byGroup.get(group.id)?.length ?? 0) > 0)
      .map(group => ({ group, members: byGroup.get(group.id) ?? [] }));

    return { usedGroups, singles };
  }, [draft.groups, draft.questions]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <Breadcrumb
        items={[
          { label: 'Public Exam', onClick: () => navigate(listPath) },
          { label: canEdit ? 'Edit Exam' : draft.title },
        ]}
      />

      <div
        className={`grid grid-cols-1 gap-6 ${
          // The author panel carries a form, so it needs a little more room than
          // the student's action card. Same shell, one track wider.
          canEdit ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'lg:grid-cols-[minmax(0,1fr)_20rem]'
        }`}
      >
        <div className="space-y-6">
          {/* Hero — identity, badges and subtitle. Student-only: for content
              managers every fact it carried lives in the Exam Information
              panel instead, so the left column is left holding just questions. */}
          {!canEdit && (
          <section className="rounded-[14px] border border-line bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[12px] text-base font-bold tracking-tight"
                style={{ background: `${course.accent}1A`, color: course.accent }}
                title={course.name}
              >
                {course.monogram}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={status.badge}>{status.label}</Badge>
                  <Badge variant={type.badge}>{type.label}</Badge>
                </div>

                <h1 className="mt-2.5 text-2xl font-bold leading-tight tracking-tight text-foreground">
                  {draft.title}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">{examSubtitle({ ...exam, course: draft.course })}</p>
              </div>
            </div>
          </section>
          )}

          {/* Tab strip — sits directly under the exam header. A one-item tab bar
              is noise, so it is omitted entirely when there is nothing to switch
              to (content managers get Overview only). */}
          {tabs.length > 1 && (
            <Tabs tabs={tabs} active={activeTab} onChange={setTab} variant="underline" />
          )}

          {/* key={activeTab} remounts this wrapper on every switch so the
              .animate-fade-in transition replays. Only the panel below the tabs
              changes — the route, the header and the sticky action panel stay put. */}
          <div key={activeTab} role="tabpanel" className="animate-fade-in space-y-6">
            {activeTab === HISTORY_TAB ? (
              <AttemptHistory exam={exam} />
            ) : (
              <>
          {/* At-a-glance facts */}
          {!canEdit && <section aria-label="Exam details" className="rounded-[14px] border border-line bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Exam details</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Exam Type</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">{type.label}</dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  {canEdit ? (
                    <input
                      type="number"
                      min={1}
                      value={draft.duration}
                      onChange={e => editor.setField('duration', Math.max(1, Number(e.target.value) || 1))}
                      aria-label="Time limit in minutes"
                      className="h-9 w-24 rounded-[10px] border border-line bg-surface px-3 text-lg font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-foreground">{draft.duration} min</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Questions</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">{exam.questions}</dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Difficulty</dt>
                <dd className="mt-1">
                  {canEdit ? (
                    <Select
                      value={draft.difficulty}
                      onChange={v => editor.setField('difficulty', v as typeof draft.difficulty)}
                      aria-label="Difficulty"
                      triggerClassName={STAT_SELECT}
                      options={DIFFICULTY_FILTER_OPTIONS.filter(o => o.value)}
                    />
                  ) : (
                    <span className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: difficulty }} />
                      {draft.difficulty}
                    </span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="mt-1">
                  {canEdit ? (
                    <Select
                      value={draft.status}
                      onChange={v => editor.setField('status', v as typeof draft.status)}
                      aria-label="Status"
                      triggerClassName={STAT_SELECT}
                      options={EXAM_STATUS_OPTIONS.filter(o => o.value)}
                    />
                  ) : (
                    <span className="text-lg font-semibold text-foreground">{status.label}</span>
                  )}
                </dd>
              </div>

              {completed && exam.score !== undefined && (
                <div>
                  <dt className="text-xs text-muted-foreground">Your Score</dt>
                  <dd className="mt-1 text-lg font-semibold text-foreground">{exam.score}%</dd>
                </div>
              )}
            </dl>
          </section>}

          {/* Score — completed exams only */}
          {!canEdit && completed && exam.score !== undefined && (
            <section className="rounded-[14px] border border-line bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Your result</h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                You scored {exam.score}% on this attempt. Review every question with its explanation, or retake it
                to improve your score.
              </p>
              {/* Hand-rolled bar rather than <Progress>: that component hard-codes
                  #F3F4F6 / #374151, and the .dark remaps in styles/index.css don't
                  cover every one of them, so its percentage text goes invisible in
                  dark mode. bg-accent + text-foreground follow the theme instead. */}
              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Score</span>
                  <span className="text-xl font-bold text-foreground">{exam.score}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${exam.score}%`,
                      background: exam.score >= 70 ? '#16A34A' : '#D97706',
                    }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Questions */}
          <section aria-label="Questions" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Questions</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {canEdit ? `Showing ${draft.questions.length} questions` : `Showing ${draft.questions.length} of ${exam.questions}`}
                </p>
              </div>
            </div>

            {draft.questions.length === 0 ? (
              canEdit ? (
                <NoQuestionsCard onAdd={editor.addQuestion} />
              ) : (
                <p className="rounded-[14px] border border-line bg-surface px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
                  This exam has no questions yet. Check back soon.
                </p>
              )
            ) : (
              <>
                {/* One card per group. Groups are ordered by first appearance, and
                    a group whose members were all removed or reassigned drops out. */}
                {usedGroups.map(({ group, members }) => (
                  <QuestionGroupCard
                    key={group.id}
                    group={group}
                    canEdit={canEdit}
                    count={members.length}
                    onChange={patch => editor.setGroup(group.id, patch)}
                  >
                    {members.map(member => (
                      <QuestionEditorCard
                        key={member.question.id}
                        question={member.question}
                        index={member.position}
                        total={draft.questions.length}
                        groups={draft.groups}
                        canEdit={canEdit}
                        nested
                        onChange={patch => editor.setQuestion(member.question.id, patch)}
                        onRemove={() => editor.removeQuestion(member.question.id)}
                        onMove={direction => editor.moveQuestion(member.question.id, direction)}
                      />
                    ))}
                  </QuestionGroupCard>
                ))}

                {/* Standalone questions sit in their own section so grouped and
                    ungrouped items are scannable at a glance. */}
                {singles.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-foreground">Single Questions</h3>
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-xs text-muted-foreground">
                        {singles.length}
                      </span>
                    </div>

                    {singles.map(({ question, position }) => (
                      <QuestionEditorCard
                        key={question.id}
                        question={question}
                        index={position}
                        total={draft.questions.length}
                        groups={draft.groups}
                        canEdit={canEdit}
                        onChange={patch => editor.setQuestion(question.id, patch)}
                        onRemove={() => editor.removeQuestion(question.id)}
                        onMove={direction => editor.moveQuestion(question.id, direction)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
              </>
            )}
          </div>
        </div>

        {/* Action panel — sticky on wide viewports */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
            {canEdit && (
              <div className="mb-4 space-y-4">
                <h2 className="text-lg font-semibold text-foreground">Exam Information</h2>
                <label className="flex flex-col gap-1.5"><span className="text-xs text-muted-foreground">Exam Name</span><input value={draft.title} onChange={e => editor.setField('title', e.target.value)} aria-label="Exam Name" className="h-9 rounded-[10px] border border-line bg-surface px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
                <div className="flex flex-col gap-1.5"><span className="text-xs text-muted-foreground">Course</span><Select value={draft.course} onChange={v => editor.setField('course', v)} aria-label="Course" triggerClassName={FIELD_SELECT} options={COURSE_FILTER_OPTIONS.filter(o => o.value)} /></div>
                <div className="flex flex-col gap-1.5"><span className="text-xs text-muted-foreground">Module</span><Select value={draft.module} onChange={v => editor.setField('module', v)} aria-label="Module" triggerClassName={FIELD_SELECT} options={moduleOptions} /></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Time (minutes)</span><input type="number" min={1} value={draft.duration} onChange={e => editor.setField('duration', Math.max(1, Number(e.target.value) || 1))} aria-label="Time in minutes" className="h-9 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>
                  <label className="flex min-w-0 flex-col gap-1.5"><span className="text-xs text-muted-foreground">Number of Questions</span><input value={draft.questions.length} readOnly aria-label="Number of Questions" className="h-9 w-full rounded-[10px] border border-line bg-accent px-3 text-sm text-muted-foreground outline-none" /></label>
                </div>
                <div className="flex flex-col gap-1.5"><span className="text-xs text-muted-foreground">Status</span><Select value={publicationStatus} onChange={v => setPublicationStatus(v as typeof publicationStatus)} aria-label="Status" triggerClassName={FIELD_SELECT} options={[...EXAM_PUBLICATION_STATUS_OPTIONS]} /></div>
                <Button className="w-full" icon={<Icon.Plus className="h-4 w-4" />} onClick={editor.addQuestion}>Add Question</Button>
              </div>
            )}
            {canEdit && (
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSave} disabled={!editor.dirty}>
                  Save
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={!editor.dirty}>
                  Cancel
                </Button>
              </div>
            )}

            {!canEdit && <>
            <p className="text-sm text-muted-foreground">
              {completed ? 'Finished' : draft.status === 'in-progress' ? 'Partially complete' : 'Ready when you are'}
            </p>
            <Button className="mt-3 w-full" icon={primary.icon} onClick={() => navigate(primary.route)}>
              {primary.label}
            </Button>
            {completed && (
              <Button
                className="mt-2 w-full"
                variant="outline"
                icon={<Icon.RefreshCw className="h-4 w-4" />}
                onClick={() => navigate(ROUTES.studentExam)}
              >
                Retake Exam
              </Button>
            )}

            <dl className="mt-5 space-y-2.5 border-t border-line pt-4">
              {[
                { label: 'Duration', value: `${draft.duration} min` },
                { label: 'Questions', value: String(exam.questions) },
                { label: 'Exam type', value: type.label },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-semibold text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
            </>}

            {false && (
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-content-subtle">
                Answer keys and correct options are only visible to you — learners never see them on this page.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
