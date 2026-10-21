import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { Spinner } from '@/components/ui/Spinner';
import { hasDiagramContent, plantUmlFromDrawioXml, plantUmlSvgUrl } from '../diagram';
import type { QuestionDraft } from '../model';
import { DrawioEditorModal } from './DrawioEditorModal';
import { useDrawioSnapshot } from './useDrawioSnapshot';

/** DIAGRAM answer: the model answer drawn in draw.io, shown as a snapshot. */
export function DiagramAnswer({ q, set, error, readOnly = false }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const plantUml = typeof q.metadata.plantUmlSource === 'string' ? q.metadata.plantUmlSource : '';
  const hasDiagram = hasDiagramContent(q.diagramXml);
  // The backend keeps only the XML, so a saved diagram has no snapshot: render a lone
  // PlantUML shape (AI drafts) from its source, anything else with a hidden draw.io.
  const plantUmlSource = hasDiagram && !q.diagramSvg ? plantUml || plantUmlFromDrawioXml(q.diagramXml) : '';
  const snapshot = useDrawioSnapshot(hasDiagram && !q.diagramSvg && !plantUmlSource ? q.diagramXml : '');
  const previewSrc = q.diagramSvg || (plantUmlSource ? plantUmlSvgUrl(plantUmlSource) : snapshot.svg);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-content-secondary">Model Answer Diagram *</span>
        {readOnly ? (
          <span className="text-xs text-content-subtle">Model answer</span>
        ) : (
          <Button type="button" variant="outline" size="sm" icon={<Icon.Edit className="w-3.5 h-3.5" />} onClick={() => setEditing(true)}>
            {hasDiagram ? 'Edit in draw.io' : 'Draw in draw.io'}
          </Button>
        )}
      </div>

      {hasDiagram ? (
        <button
          type="button"
          onClick={() => !readOnly && setEditing(true)}
          className={`w-full rounded-[10px] border bg-white p-3 flex items-center justify-center min-h-[140px] transition-colors ${!readOnly ? 'hover:border-brand-600' : ''} ${error ? 'border-danger-solid' : 'border-line'}`}
          aria-label="Edit the model answer diagram"
          disabled={readOnly}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Model answer diagram" className="max-h-[360px] max-w-full object-contain" />
          ) : snapshot.status === 'loading' ? (
            <span className="flex items-center gap-2 text-sm text-content-soft"><Spinner size="sm" /> Rendering the diagram…</span>
          ) : (
            <span className="text-sm text-content-soft">Couldn’t render a preview (is diagrams.net reachable?) — click to open the diagram.</span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => !readOnly && setEditing(true)}
          className={`w-full rounded-[10px] border border-dashed p-6 text-sm text-content-soft flex flex-col items-center gap-1.5 transition-colors ${!readOnly ? 'hover:border-brand-600 hover:text-content-secondary' : ''} ${error ? 'border-danger-solid' : 'border-line'}`}
          disabled={readOnly}
        >
          <Icon.Layers className="w-5 h-5" />
          {readOnly ? 'No model answer diagram has been added.' : 'No diagram yet — click to draw the model answer.'}
        </button>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      {snapshot.frame}

      {plantUml && (
        <details className="mt-2 text-xs text-content-soft">
          <summary className="cursor-pointer select-none">PlantUML source suggested by AI</summary>
          <pre className="mt-1.5 p-2 rounded-[8px] bg-surface-alt overflow-x-auto whitespace-pre-wrap">{plantUml}</pre>
        </details>
      )}
      <p className="text-xs text-content-subtle mt-2">Students draw their own diagram; this one is the reference used for grading.</p>

      {!readOnly && <DrawioEditorModal
        open={editing}
        xml={q.diagramXml}
        onClose={() => setEditing(false)}
        onSave={(diagramXml, diagramSvg) => {
          set({ diagramXml, diagramSvg });
          setEditing(false);
        }}
      />}
    </div>
  );
}
