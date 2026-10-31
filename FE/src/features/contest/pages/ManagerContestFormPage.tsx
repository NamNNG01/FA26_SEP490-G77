import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { ROUTES, managerContestPath } from '@/app/routes';
import { courseService, type CourseSummaryItem } from '@/services/course.service';
import {
  managerContestService,
  quizExamIds,
  contestErrorCode,
  contestErrorIssues,
  contestFieldErrors,
  CONTEST_DESCRIPTION_MAX,
  CONTEST_TITLE_MAX,
  MAX_PRIZE_RANKS,
  type ContestDetail,
  type ContestDiscountOption,
  type ContestExamOption,
  type ContestWrite,
} from '@/services/managerContest.service';
import { CONTEST_ERROR_TEXT, ContestStatusBadge, hcmInputToIso, issueText, prizeValue, toHcmInput } from '../components/contestUi';

type FormState = {
  title: string;
  description: string;
  courseId: string;
  examId: string;
  start: string;
  end: string;
  /** Rank = index + 1; ranks always run 1, 2, 3, … */
  rewards: string[];
};
const blankForm = (): FormState => ({ title: '', description: '', courseId: '', examId: '', start: '', end: '', rewards: [] });

/** Discount shown in the picker; `note` marks a current prize that API 12 no longer offers. */
type DiscountChoice = ContestDiscountOption & { note?: string };

/**
 * What API 4 lets change in each status:
 *   DRAFT / UPCOMING — everything; ONGOING — title, description, a later end;
 *   PENDING_REWARD — title, description and the discount of each existing rank.
 */
function editScope(contest: ContestDetail | null) {
  const status = contest?.status;
  const full = !contest || status === 'DRAFT' || status === 'UPCOMING';
  return {
    full,
    end: full || status === 'ONGOING',
    discounts: full || status === 'PENDING_REWARD',
    locked: status === 'REWARDED' || status === 'CANCELLED',
  };
}

export function ManagerContestFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [exams, setExams] = useState<ContestExamOption[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'save' | 'publish' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const scope = editScope(contest);

  // Contest (edit), courses and prize discounts.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      mode === 'edit' && contestId ? managerContestService.get(contestId) : Promise.resolve(null),
      courseService.getCourses({ size: 100 }).then(r => r.content).catch(() => [] as CourseSummaryItem[]),
      managerContestService.allDiscountOptions().catch(() => [] as ContestDiscountOption[]),
    ]).then(([detail, courseList, discountList]) => {
      if (cancelled) return;
      setCourses(courseList);
      const choices: DiscountChoice[] = [...discountList];
      if (detail) {
        setContest(detail);
        // Current prizes may be expired or used up, so API 12 leaves them out — keep them selectable.
        detail.rewards.forEach(r => {
          if (!choices.some(d => d.discountId === r.discount.discountId)) {
            choices.push({ ...r.discount, remaining: 0, expiredAt: null, note: r.discount.validity.toLowerCase() });
          }
        });
        setForm({
          title: detail.title,
          description: detail.description ?? '',
          courseId: detail.course ? String(detail.course.courseId) : '',
          examId: String(detail.exam.examId),
          start: toHcmInput(detail.startTime),
          end: toHcmInput(detail.endTime),
          rewards: detail.rewards.map(r => String(r.discount.discountId)),
        });
      }
      setDiscounts(choices);
    }).catch(err => {
      if (cancelled) return;
      const code = contestErrorCode(err);
      setLoadError((code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not load the contest.'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contestId, mode]);

  // Eligible quiz exams of the chosen course (API 11 ∩ quiz exams). The contest's own exam is
  // "in an active contest", so API 11 leaves it out — add it back.
  useEffect(() => {
    if (!form.courseId) { setExams([]); return; }
    let cancelled = false;
    setExamsLoading(true);
    Promise.all([managerContestService.allExamOptions(Number(form.courseId)), quizExamIds(Number(form.courseId))])
      .then(([options, quizIds]) => {
        if (cancelled) return;
        let list = options.filter(e => (quizIds ? quizIds.has(e.examId) : !e.hasEssayQuestions));
        const own = contest?.exam;
        if (own && contest?.course && String(contest.course.courseId) === form.courseId && !list.some(e => e.examId === own.examId)) {
          list = [{ examId: own.examId, title: own.title, courseId: contest.course.courseId, durationMinutes: own.durationMinutes,
            maxScore: own.maxScore, questionCount: own.questionCount, hasEssayQuestions: false, publishedAt: null }, ...list];
        }
        setExams(list);
      })
      .catch(err => {
        if (cancelled) return;
        setExams([]);
        const code = contestErrorCode(err);
        toast.error((code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not load the exams of this course.'));
      })
      .finally(() => { if (!cancelled) setExamsLoading(false); });
    return () => { cancelled = true; };
  }, [contest, form.courseId, toast]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setFieldErrors(prev => {
      const field = key === 'start' ? 'startTime' : key === 'end' ? 'endTime' : key;
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const exam = exams.find(e => String(e.examId) === form.examId) ?? null;
  const startIso = hcmInputToIso(form.start);
  const endIso = hcmInputToIso(form.end);
  const windowMinutes = startIso && endIso ? (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000 : null;

  /** Ranks per discount vs. its remaining uses — the publish check (rule 8), shown early. */
  const quotaWarnings = useMemo(() => {
    const ranks = new Map<string, number[]>();
    form.rewards.forEach((id, i) => { if (id) ranks.set(id, [...(ranks.get(id) ?? []), i + 1]); });
    return [...ranks.entries()].flatMap(([id, list]) => {
      const d = discounts.find(x => String(x.discountId) === id);
      return d && list.length > d.remaining ? [`${d.code} is used by ${list.length} rank${list.length === 1 ? '' : 's'} (#${list.join(', #')}) but has ${d.remaining} use${d.remaining === 1 ? '' : 's'} left.`] : [];
    });
  }, [discounts, form.rewards]);

  const validate = (publishing: boolean): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = 'Title is required.';
    else if (form.title.trim().length > CONTEST_TITLE_MAX) errors.title = `At most ${CONTEST_TITLE_MAX} characters.`;
    if (!form.examId) errors.examId = 'Choose an exam.';
    if (!startIso) errors.startTime = 'Start time is required.';
    if (!endIso) errors.endTime = 'End time is required.';
    else if (windowMinutes != null && windowMinutes <= 0) errors.endTime = 'End time must be after the start time.';
    else if (windowMinutes != null && exam && windowMinutes < exam.durationMinutes) errors.endTime = `The contest must last at least the exam duration (${exam.durationMinutes} minutes).`;
    if (contest?.status === 'ONGOING' && endIso && new Date(endIso) < new Date(contest.endTime)) errors.endTime = 'While the contest runs the end time can only be extended.';
    if (form.rewards.some(id => !id)) errors.rewards = 'Pick a discount for every prize rank.';
    if (publishing) {
      if (startIso && new Date(startIso) <= new Date()) errors.startTime = 'The start time must be in the future to publish.';
      if (form.rewards.length === 0) errors.rewards = 'Add at least one prize before publishing.';
    }
    return errors;
  };

  const payload = (): ContestWrite => ({
    title: form.title.trim(),
    description: form.description.trim() || null,
    examId: Number(form.examId),
    startTime: startIso!,
    endTime: endIso!,
    rewards: form.rewards.map((id, i) => ({ rankPosition: i + 1, discountId: Number(id) })),
  });

  const showError = (err: unknown, fallback: string) => {
    const fields = contestFieldErrors(err);
    setFieldErrors(fields);
    const code = contestErrorCode(err);
    const issues = contestErrorIssues(err).map(issueText);
    toast.error(Object.keys(fields).length && code === 'VALIDATION_FAILED'
      ? 'Some fields are not valid.'
      : (code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, fallback),
    { details: issues.length ? issues : Object.values(fields), duration: issues.length ? null : undefined });
  };

  const submit = async (publish: boolean) => {
    const errors = validate(publish);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { toast.error('Please fix the highlighted fields.', { details: Object.values(errors) }); return; }
    setSaving(publish ? 'publish' : 'save');
    let saved: ContestDetail;
    try {
      saved = contest ? await managerContestService.update(contest.contestId, payload()) : await managerContestService.create(payload());
    } catch (err) {
      showError(err, 'Could not save the contest.');
      setSaving(null);
      return;
    }
    if (!publish) {
      toast.success(contest ? 'Contest updated.' : 'Contest saved as draft.');
      navigate(managerContestPath(saved.contestId));
      return;
    }
    try {
      await managerContestService.publish(saved.contestId);
      toast.success('Contest published.');
      navigate(managerContestPath(saved.contestId));
    } catch (err) {
      // Saved as a draft, publish refused: stay on the form (later saves update that draft) so the manager can fix it.
      setContest(saved);
      showError(err, 'The contest was saved as a draft but could not be published.');
      setSaving(null);
    }
  };

  const courseOptions = useMemo(() => {
    const list = courses.map(c => ({ label: c.title, value: String(c.courseId) }));
    if (contest?.course && !list.some(c => c.value === String(contest.course!.courseId))) {
      list.unshift({ label: contest.course.title, value: String(contest.course.courseId) });
    }
    return list;
  }, [contest, courses]);
  const discountOptions = discounts.map(d => ({
    value: String(d.discountId),
    label: `${d.code} · ${prizeValue(d.discountType, d.value)}${d.note ? ` (${d.note})` : ` · ${d.remaining} left`}`,
  }));

  const title = mode === 'create' ? 'New contest' : contest ? `Edit ${contest.title}` : 'Edit contest';
  const backTo = contest ? managerContestPath(contest.contestId) : ROUTES.managerContests;

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (loadError) return <div className="space-y-4 py-6"><Alert type="error" message={loadError} /><Button variant="outline" onClick={() => navigate(ROUTES.managerContests)}>Back to contests</Button></div>;
  if (scope.locked) {
    return (
      <div className="space-y-4 py-6">
        <Alert type="warning" message={CONTEST_ERROR_TEXT.CONTEST_LOCKED} />
        <Button variant="outline" onClick={() => navigate(backTo)}>Back to contest</Button>
      </div>
    );
  }

  const canPublish = !contest || contest.status === 'DRAFT';

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <Breadcrumb items={[
        { label: 'Contests', onClick: () => navigate(ROUTES.managerContests) },
        ...(contest ? [{ label: contest.title, onClick: () => navigate(backTo) }] : []),
        { label: mode === 'create' ? 'New' : 'Edit' },
      ]} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-content">{title}</h1>
        {contest && <ContestStatusBadge status={contest.status} />}
      </header>

      {contest?.status === 'ONGOING' && <Alert type="info" message="The contest is running: only the title, description and a later end time can change." />}
      {contest?.status === 'PENDING_REWARD' && <Alert type="info" message="The contest has ended: only the title, description and the discount of each prize rank can change." />}
      {contest?.status === 'UPCOMING' && <Alert type="info" message="Changing the exam, start time or prizes of a published contest re-runs the publish checks." />}

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-content">Details</h2>
        <Input label="Title" required maxLength={CONTEST_TITLE_MAX} value={form.title} error={fieldErrors.title}
          onChange={e => update('title', e.target.value)} placeholder="e.g. IELTS Weekly Contest #5" />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
          Description
          <textarea className="min-h-24 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            maxLength={CONTEST_DESCRIPTION_MAX} value={form.description} onChange={e => update('description', e.target.value)} />
          {fieldErrors.description && <span className="text-xs font-normal text-danger">{fieldErrors.description}</span>}
        </label>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold text-content">Exam and schedule</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableSelect label="Course" options={courseOptions} value={form.courseId} disabled={!scope.full}
            placeholder="Choose a course" onChange={v => { update('courseId', v); update('examId', ''); }} />
          <div className="flex flex-col gap-1.5">
            <SearchableSelect label="Exam" value={form.examId} disabled={!scope.full || !form.courseId || examsLoading}
              placeholder={!form.courseId ? 'Choose a course first' : examsLoading ? 'Loading exams…' : exams.length ? 'Choose an exam' : 'No eligible exams'}
              emptyText="No eligible exams" onChange={v => update('examId', v)}
              options={exams.map(e => ({ label: `${e.title} · ${e.durationMinutes} min · ${e.questionCount} questions`, value: String(e.examId) }))} />
            {fieldErrors.examId && <span className="text-xs text-danger">{fieldErrors.examId}</span>}
            {scope.full && form.courseId && !examsLoading && (
              <span className="text-xs text-content-soft">Only published quiz exams that are not in another active contest are listed.</span>
            )}
          </div>
        </div>
        {exam?.hasEssayQuestions && (
          <Alert type="warning" message="This exam has essay or diagram questions graded by AI, so ranking may take longer after the contest ends." />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Starts at (Ho Chi Minh City time)" type="datetime-local" required value={form.start} disabled={!scope.full}
            error={fieldErrors.startTime} onChange={e => update('start', e.target.value)} />
          <Input label="Ends at (Ho Chi Minh City time)" type="datetime-local" required value={form.end} disabled={!scope.end}
            error={fieldErrors.endTime} onChange={e => update('end', e.target.value)}
            hint={!fieldErrors.endTime && exam ? `At least ${exam.durationMinutes} minutes after the start (exam duration).` : undefined} />
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-content">Prizes</h2>
            <p className="text-sm text-content-soft">Each rank receives one discount. A draft may have no prizes; publishing needs at least one.</p>
          </div>
          {scope.full && (
            <Button size="sm" variant="outline" icon={<Icon.Plus className="h-4 w-4" />} disabled={form.rewards.length >= MAX_PRIZE_RANKS}
              onClick={() => update('rewards', [...form.rewards, ''])}>
              Add rank
            </Button>
          )}
        </div>
        {form.rewards.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-sm text-content-soft">No prizes yet.</p>
        ) : (
          <ul className="space-y-2">
            {form.rewards.map((discountId, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-9 w-12 flex-shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-sm font-semibold text-content">#{i + 1}</span>
                <SearchableSelect className="min-w-0 flex-1" aria-label={`Discount for rank ${i + 1}`} options={discountOptions} value={discountId}
                  disabled={!scope.discounts} placeholder="Choose a discount" emptyText="No usable discounts"
                  onChange={v => update('rewards', form.rewards.map((x, j) => (j === i ? v : x)))} />
                {scope.full && (
                  <button type="button" aria-label={`Remove rank ${i + 1}`} className="rounded-[6px] p-2 text-content-soft hover:bg-accent hover:text-danger"
                    onClick={() => update('rewards', form.rewards.filter((_, j) => j !== i))}>
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {fieldErrors.rewards && <p className="text-xs text-danger">{fieldErrors.rewards}</p>}
        {quotaWarnings.length > 0 && (
          <Alert type="warning" title="Not enough discount uses" message={`${quotaWarnings.join(' ')} Publishing will be refused until this is fixed.`} />
        )}
        {scope.full && discounts.length === 0 && (
          <p className="text-xs text-content-soft">No usable discounts: an admin must create an active discount for courses with uses left.</p>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={!!saving} onClick={() => navigate(backTo)}>Cancel</Button>
        <Button variant={canPublish ? 'outline' : 'primary'} loading={saving === 'save'} disabled={!!saving} onClick={() => void submit(false)}>
          {canPublish ? 'Save as draft' : 'Save changes'}
        </Button>
        {canPublish && (
          <Button loading={saving === 'publish'} disabled={!!saving} onClick={() => void submit(true)}>Save and publish</Button>
        )}
      </div>
    </div>
  );
}

