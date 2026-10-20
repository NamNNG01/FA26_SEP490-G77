import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { hasDiagramContent, plantUmlSvgUrl } from '../diagram';
import type { QuestionDraft } from '../model';
import { DrawioEditorModal } from './DrawioEditorModal';

/** DIAGRAM answer: the model answer drawn in draw.io, shown as a snapshot. */
export function DiagramAnswer({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const [editing, setEditing] = useState(false);
  const plantUml = typeof q.metadata.plantUmlSource === 'string' ? q.metadata.plantUmlSource : '';
  const hasDiagram = hasDiagramContent(q.diagramXml);
  // A diagram loaded from PlantUML has no snapshot until it's opened once — render the source instead.
  const previewSrc = q.diagramSvg || (hasDiagram && plantUml ? plantUmlSvgUrl(plantUml) : '');

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-content-secondary">Model Answer Diagram *</span>
        <Button type="button" variant="outline" size="sm" icon={<Icon.Edit className="w-3.5 h-3.5" />} onClick={() => setEditing(true)}>
          {hasDiagram ? 'Edit in draw.io' : 'Draw in draw.io'}
        </Button>
      </div>

      {hasDiagram ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`w-full rounded-[10px] border bg-white p-3 flex items-center justify-center min-h-[140px] hover:border-brand-600 transition-colors ${error ? 'border-danger-solid' : 'border-line'}`}
          aria-label="Edit the model answer diagram"
        >
          {previewSrc ? (
            <img src={previewSrc} alt="Model answer diagram" className="max-h-[260px] max-w-full object-contain" />
          ) : (
            <span className="text-sm text-content-soft">Diagram saved — open it to view.</span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`w-full rounded-[10px] border border-dashed p-6 text-sm text-content-soft flex flex-col items-center gap-1.5 hover:border-brand-600 hover:text-content-secondary transition-colors ${error ? 'border-danger-solid' : 'border-line'}`}
        >
          <Icon.Layers className="w-5 h-5" />
          No diagram yet — click to draw the model answer.
        </button>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}

      {plantUml && (
        <details className="mt-2 text-xs text-content-soft">
          <summary className="cursor-pointer select-none">PlantUML source suggested by AI</summary>
          <pre className="mt-1.5 p-2 rounded-[8px] bg-surface-alt overflow-x-auto whitespace-pre-wrap">{plantUml}</pre>
        </details>
      )}
      <p className="text-xs text-content-subtle mt-2">Students draw their own diagram; this one is the reference used for grading.</p>

      <DrawioEditorModal
        open={editing}
        xml={q.diagramXml}
        onClose={() => setEditing(false)}
        onSave={(diagramXml, diagramSvg) => {
          set({ diagramXml, diagramSvg });
          setEditing(false);
        }}
      />
    </div>
  );
}
