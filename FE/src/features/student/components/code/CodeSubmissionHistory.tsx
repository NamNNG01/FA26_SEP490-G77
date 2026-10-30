import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table, type TableColumn } from '@/components/ui/Table';
import type { CodeLanguageInfo, CodeSubmission } from '@/services/studentCodeExam.service';
import { formatDateTime } from '../studentUi';

const ALL = 'ALL';

/** Newest CD-07 submission of a question made at or before `before` (the attempt's submit time). */
export function latestSubmissionBefore(subs: CodeSubmission[], questionId: number, before: string | null): CodeSubmission | null {
  const limit = before ? Date.parse(before) : Infinity;
  let best: CodeSubmission | null = null;
  for (const s of subs) {
    if (s.questionId !== questionId) continue;
    const at = Date.parse(s.createdAt);
    if (at > limit) continue;
    if (!best || at > Date.parse(best.createdAt)) best = s;
  }
  return best;
}

export function CodeTestCaseStatus({ submission }: { submission: CodeSubmission }) {
  const passed = submission.status === 'PASSED';
  return (
    <Badge variant={passed ? 'success' : 'danger'}>
      {submission.status} · {submission.testCasesPassed}/{submission.testCasesTotal} test cases
    </Badge>
  );
}

/** Every code submission of the exam (CD-07, all attempts), filtered by question, language and status. */
export function CodeSubmissionHistory({
  submissions,
  questions,
  languages,
}: {
  submissions: CodeSubmission[];
  /** CODE questions of the exam, in paper order; `label` is e.g. "Q3 · Reverse a string…". */
  questions: { questionId: number; label: string }[];
  languages: CodeLanguageInfo[];
}) {
  const [question, setQuestion] = useState(ALL);
  const [language, setLanguage] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const labelOfQuestion = (id: number) => questions.find(q => q.questionId === id)?.label ?? `Question #${id}`;
  const labelOfLanguage = (id: string) => languages.find(l => l.id === id)?.name ?? id;

  const languageOptions = useMemo(() => {
    const ids = [...new Set(submissions.map(s => s.language))];
    return [{ label: 'All languages', value: ALL }, ...ids.map(id => ({ label: labelOfLanguage(id), value: id }))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, languages]);

  const filtered = useMemo(
    () =>
      [...submissions]
        .filter(
          s =>
            (question === ALL || String(s.questionId) === question) &&
            (language === ALL || s.language === language) &&
            (status === ALL || s.status === status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [submissions, question, language, status],
  );

  const columns: TableColumn[] = [
    { key: 'question', label: 'Question', render: r => <span className="truncate">{labelOfQuestion(r.questionId as number)}</span> },
    { key: 'language', label: 'Language', width: '140px', render: r => labelOfLanguage(r.language as string) },
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: r => <Badge variant={r.status === 'PASSED' ? 'success' : 'danger'}>{r.status as string}</Badge>,
    },
    { key: 'tests', label: 'Test cases', width: '110px', render: r => `${r.testCasesPassed}/${r.testCasesTotal}` },
    { key: 'createdAt', label: 'Submitted at', width: '170px', render: r => formatDateTime(r.createdAt as string) },
  ];

  return (
    <section className="card p-[clamp(1rem,2vw,1.5rem)] space-y-4" aria-label="Code submissions">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-bold text-content">Code submissions</h2>
        <Select
          aria-label="Question"
          className="w-56"
          value={question}
          onChange={setQuestion}
          options={[{ label: 'All questions', value: ALL }, ...questions.map(q => ({ label: q.label, value: String(q.questionId) }))]}
        />
        <Select aria-label="Language" className="w-40" value={language} onChange={setLanguage} options={languageOptions} />
        <Select
          aria-label="Status"
          className="w-36"
          value={status}
          onChange={setStatus}
          options={[
            { label: 'All statuses', value: ALL },
            { label: 'Passed', value: 'PASSED' },
            { label: 'Failed', value: 'FAILED' },
          ]}
        />
      </div>
      <Table
        columns={columns}
        data={filtered.map(s => ({ ...s, id: s.submissionId }))}
        perPage={10}
        resetKey={`${question}|${language}|${status}`}
        unit="submissions"
        emptyState={<p className="py-8 text-center text-sm text-content-soft">No code submissions yet.</p>}
      />
    </section>
  );
}
