import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import {
  CODE_LANGUAGE_OPTIONS,
  CODE_MEMORY_LIMIT_KB,
  CODE_TIME_LIMIT_MS,
  MAX_TEST_CASES,
  emptyTestCase,
  type CodeDraft,
  type QuestionDraft,
  type TestCaseDraft,
} from '../model';

const MEMORY_OPTIONS = [64, 128, 256, 512].map(mb => ({ label: `${mb} MB`, value: String(mb * 1024) }));

const LABEL = 'block mb-1 text-xs font-medium text-content-subtle';
const MONO = (invalid: boolean) =>
  `w-full px-3 py-2 rounded-[10px] border font-mono text-sm leading-relaxed text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
    invalid ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
  }`;

/**
 * CODE answer settings: allowed languages, starter code, limits and test cases. The question is
 * graded only by the test cases (CD-05): every one passes = full points, otherwise 0.
 */
export function CodeAnswer({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const c = q.code;
  const setCode = (patch: Partial<CodeDraft>) => set({ code: { ...c, ...patch } });
  const setCase = (i: number, patch: Partial<TestCaseDraft>) =>
    setCode({ testCases: c.testCases.map((t, ti) => (ti === i ? { ...t, ...patch } : t)) });
  const toggleLanguage = (value: string, on: boolean) =>
    // Kept in the fixed option order, whatever order they were ticked in.
    setCode({ languages: CODE_LANGUAGE_OPTIONS.map(l => l.value).filter(v => (v === value ? on : c.languages.includes(v))) });
  const firstPublic = c.testCases.findIndex(t => !t.hidden);
  const timeBad = Boolean(error) && !(Number(c.timeLimitMs) >= CODE_TIME_LIMIT_MS.min && Number(c.timeLimitMs) <= CODE_TIME_LIMIT_MS.max);
  const memoryValue = MEMORY_OPTIONS.some(o => o.value === c.memoryLimitKb) ? c.memoryLimitKb : String(CODE_MEMORY_LIMIT_KB.default);

  return (
    <div className="space-y-4">
      <div>
        <span className="block text-sm font-medium text-content-secondary mb-1.5">Languages *</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CODE_LANGUAGE_OPTIONS.map(l => (
            <Checkbox key={l.value} label={l.label} checked={c.languages.includes(l.value)} onChange={on => toggleLanguage(l.value, on)} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className={LABEL}>Time limit (ms)</span>
          <input
            type="number"
            min={CODE_TIME_LIMIT_MS.min}
            max={CODE_TIME_LIMIT_MS.max}
            step={100}
            value={c.timeLimitMs}
            onChange={e => setCode({ timeLimitMs: e.target.value })}
            className={`w-full h-10 px-3 rounded-[10px] border text-base text-content bg-surface focus:outline-none focus:ring-2 ${
              timeBad ? 'border-danger-solid focus:ring-danger-solid/20' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
            }`}
          />
        </label>
        <div className="min-w-0">
          <span className={LABEL}>Memory limit</span>
          <Select aria-label="Memory limit" value={memoryValue} onChange={v => setCode({ memoryLimitKb: v })} options={MEMORY_OPTIONS} />
        </div>
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-content-secondary mb-1.5">
          Starter code <span className="font-normal text-content-subtle">(optional — shown in the editor for every language)</span>
        </span>
        <textarea
          value={c.template}
          onChange={e => setCode({ template: e.target.value })}
          rows={6}
          spellCheck={false}
          placeholder={'public class Main {\n    public static void main(String[] args) {\n        // ...\n    }\n}'}
          className={MONO(false)}
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-sm font-medium text-content-secondary">Test cases *</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon.Plus className="w-3.5 h-3.5" />}
            onClick={() => setCode({ testCases: [...c.testCases, emptyTestCase(c.testCases.length > 0)] })}
            disabled={c.testCases.length >= MAX_TEST_CASES}
          >
            Add Test Case
          </Button>
        </div>
        <div className="space-y-2">
          {c.testCases.map((t, i) => (
            <div key={t.key} className="rounded-[10px] border border-line-soft overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-surface-muted px-3 py-1.5 border-b border-line-soft">
                <span className="text-xs font-bold text-content-soft">Test case {i + 1}</span>
                {i === firstPublic && <span className="text-2xs font-medium text-brand-ink">Sample shown to students</span>}
                <div className="ml-auto flex items-center gap-3">
                  <Checkbox label="Hidden" checked={t.hidden} onChange={hidden => setCase(i, { hidden })} />
                  <button
                    type="button"
                    onClick={() => setCode({ testCases: c.testCases.filter((_, ti) => ti !== i) })}
                    disabled={c.testCases.length <= 1}
                    aria-label={`Delete test case ${i + 1}`}
                    title="Delete test case"
                    className="p-1 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Icon.Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 p-2.5 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className={LABEL}>Input (stdin)</span>
                  <textarea value={t.input} onChange={e => setCase(i, { input: e.target.value })} rows={3} spellCheck={false} className={MONO(false)} />
                </label>
                <label className="block min-w-0">
                  <span className={LABEL}>Expected output</span>
                  <textarea
                    value={t.expectedOutput}
                    onChange={e => setCase(i, { expectedOutput: e.target.value })}
                    rows={3}
                    spellCheck={false}
                    className={MONO(Boolean(error) && !t.expectedOutput.trim())}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
        <p className="text-xs text-content-subtle mt-2">
          Students run their code on the first public test case. On submit, every test case (public and hidden) is run: all
          pass = full points, otherwise 0.
        </p>
      </div>
    </div>
  );
}
