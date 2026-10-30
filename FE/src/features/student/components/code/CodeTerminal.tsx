import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { CodeRunResult } from '@/services/studentCodeExam.service';

export type TerminalTab = 'Output' | 'Input';
const TABS: TerminalTab[] = ['Output', 'Input'];

/** Bottom panel under the editor, like the VS Code terminal: last run's output, and the stdin to run with. */
export function CodeTerminal({
  tab,
  onTabChange,
  result,
  error,
  running,
  stdin,
  sampleInput,
  onStdinChange,
}: {
  tab: TerminalTab;
  onTabChange: (tab: TerminalTab) => void;
  result: CodeRunResult | null;
  error: string | null;
  running: boolean;
  stdin: string;
  sampleInput: string | null;
  onStdinChange: (value: string) => void;
}) {
  const failed = result?.status === 'FAILED';
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line-soft px-2">
        <div role="tablist" className="flex">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTabChange(t)}
              className={`px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide border-b-2 -mb-px ${
                tab === t ? 'border-primary text-content' : 'border-transparent text-content-subtle hover:text-content-secondary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'Output' && result && !running && (
          <div className="ml-auto flex items-center gap-2">
            <Badge size="sm" variant={failed ? 'danger' : 'success'}>
              {result.status}
            </Badge>
            {result.executionTimeMs != null && <span className="text-2xs text-content-subtle">{result.executionTimeMs} ms</span>}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'Output' ? (
          running ? (
            <p className="flex items-center gap-2 p-3 text-xs text-content-soft">
              <Spinner size="sm" /> Running…
            </p>
          ) : error ? (
            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs text-danger">{error}</pre>
          ) : result ? (
            <div className="p-3 font-mono text-xs leading-relaxed">
              {result.stdout && <pre className="whitespace-pre-wrap break-words text-content">{result.stdout}</pre>}
              {result.stderr && <pre className="mt-1 whitespace-pre-wrap break-words text-danger">{result.stderr}</pre>}
              {!result.stdout && !result.stderr && <p className="text-content-subtle">(no output)</p>}
            </div>
          ) : (
            <p className="p-3 text-xs text-content-subtle">Press Run (Ctrl+Enter) to execute your code on the sample input.</p>
          )
        ) : (
          <div className="flex h-full flex-col gap-2 p-2">
            <textarea
              aria-label="Standard input"
              value={stdin}
              onChange={e => onStdinChange(e.target.value)}
              spellCheck={false}
              className="min-h-0 flex-1 resize-none rounded-[6px] border border-line bg-surface-alt p-2 font-mono text-xs text-content focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {sampleInput != null && stdin !== sampleInput && (
              <button type="button" onClick={() => onStdinChange(sampleInput)} className="self-start text-2xs font-medium text-primary hover:underline">
                Reset to sample
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
