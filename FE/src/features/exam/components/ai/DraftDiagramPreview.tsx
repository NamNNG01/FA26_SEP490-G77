import React from "react";
import type { AiQuestionDraft } from "@/services/exam.service";
import { useDrawioSnapshot } from "@/features/question/components/useDrawioSnapshot";

export function DraftDiagramPreview({
  question,
  index,
}: {
  question: AiQuestionDraft;
  index: number;
}) {
  const drawioXml =
    typeof question.questionMetadata?.drawioXml === "string"
      ? question.questionMetadata.drawioXml
      : "";
  const snapshot = useDrawioSnapshot(question.diagramSvg ? "" : drawioXml);
  const previewSrc = question.diagramSvg || snapshot.svg;

  return (
    <>
      <div className="p-3 rounded-[8px] border border-line bg-white flex justify-center min-h-24">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={`Model answer diagram for question ${index + 1}`}
            className="max-h-[300px] max-w-full object-contain"
          />
        ) : snapshot.status === "loading" ? (
          <span className="self-center text-sm text-content-soft">Rendering the diagram…</span>
        ) : (
          <span className="self-center text-sm text-content-soft">
            Couldn’t render a preview (is diagrams.net reachable?)
          </span>
        )}
      </div>
      {snapshot.frame}
    </>
  );
}
