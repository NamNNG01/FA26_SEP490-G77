import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useTheme } from '@/theme/ThemeProvider';
import { Skeleton } from '@/components/ui/Skeleton';
import type { CodeLanguage } from '@/services/studentCodeExam.service';

const MONACO_LANGUAGE: Record<string, string> = { JAVA: 'java', PYTHON: 'python', C: 'c', CPP: 'cpp' };

/**
 * Monaco (the VS Code editor), lazy-loaded by CodeQuestionWorkspace so it stays out of the main
 * bundle. Ctrl/Cmd+Enter runs the code.
 */
export default function CodeEditor({
  language,
  value,
  onChange,
  onRun,
}: {
  language: CodeLanguage;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  const { resolved } = useTheme();
  // The command is bound once on mount; the ref keeps it calling the latest onRun.
  const runRef = useRef(onRun);
  useEffect(() => {
    runRef.current = onRun;
  }, [onRun]);

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  return (
    <Editor
      height="100%"
      language={MONACO_LANGUAGE[language] ?? 'plaintext'}
      value={value}
      theme={resolved === 'dark' ? 'vs-dark' : 'vs'}
      onChange={v => onChange(v ?? '')}
      onMount={onMount}
      loading={<Skeleton className="h-full w-full" />}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        tabSize: 4,
        scrollBeyondLastLine: false,
        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      }}
    />
  );
}
