import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/assets/icons";
import type { AiQuestionDraft, Difficulty } from "@/services/exam.service";
import type { CourseModuleResponse } from "@/services/course.service";
import { DraftDiagramPreview } from "./DraftDiagramPreview";

interface AiDraftQuestionCardProps {
  question: AiQuestionDraft;
  index: number;
  modules: CourseModuleResponse[];
  scorePoints: number;
  validationErr: string | null;
  actionsDisabled: boolean;
  onUpdate: (updated: Partial<AiQuestionDraft>) => void;
  onEdit: () => void;
  onRemove: () => void;
  onOpenDiagramEditor: () => void;
  onOpenRubricEditor: () => void;
}

export function AiDraftQuestionCard({
  question: q,
  index: idx,
  modules,
  scorePoints,
  validationErr,
  actionsDisabled,
  onUpdate,
  onEdit,
  onRemove,
  onOpenDiagramEditor,
  onOpenRubricEditor,
}: AiDraftQuestionCardProps) {
  return (
    <div
      className={`card p-4 space-y-3 transition-colors ${
        validationErr ? "border-danger bg-danger-light/10" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold">
            #{idx + 1}
          </span>
          <Badge variant="default" className="text-2xs font-semibold">
            {q.questionType.replace("_", " ")}
          </Badge>
          {q.questionMetadata?.skillTag && (
            <Badge variant="purple" className="text-2xs">
              {q.questionMetadata.skillTag}
            </Badge>
          )}
          <label className="text-2xs text-content-secondary inline-flex items-center gap-1.5">
            Weight
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              className="w-20 px-2 py-1 rounded border border-line bg-surface text-content"
              value={q.defaultPoints ?? 1}
              onChange={(e) => onUpdate({ defaultPoints: Number(e.target.value) || 0 })}
            />
          </label>
          <span className="text-2xs text-brand-ink font-semibold">Score: {scorePoints} pts</span>
          <Select
            className="w-28 text-xs"
            value={q.difficulty}
            onChange={(v) => onUpdate({ difficulty: v as Difficulty })}
            options={[
              { label: "EASY", value: "EASY" },
              { label: "MEDIUM", value: "MEDIUM" },
              { label: "HARD", value: "HARD" },
            ]}
          />
          {modules.length > 0 && (
            <Select
              className="w-44 text-xs"
              value={q.moduleId ? String(q.moduleId) : ""}
              onChange={(v) => onUpdate({ moduleId: v ? Number(v) : undefined })}
              options={[
                { label: "Select module *", value: "" },
                ...modules.map((m) => ({
                  label: m.title,
                  value: String(m.moduleId),
                })),
              ]}
            />
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={actionsDisabled}
            className="rounded-[6px] p-1.5 text-content-subtle hover:bg-accent hover:text-content-secondary disabled:cursor-not-allowed disabled:opacity-30"
            title="Edit question"
            aria-label={`Edit question ${idx + 1}`}
          >
            <Icon.Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={actionsDisabled}
            className="rounded-[6px] p-1.5 text-content-subtle hover:bg-danger-light hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
            title="Remove Question from Draft"
            aria-label={`Delete question ${idx + 1}`}
          >
            <Icon.Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-content-secondary block mb-1">
          Question Prompt
        </label>
        <textarea
          rows={2}
          className="w-full px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
          value={q.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
        />
      </div>

      {q.options && q.options.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-content-secondary block">
            Options & Correct Answers
          </span>
          <div className="space-y-1.5">
            {q.options.map((opt, oIdx) => (
              <div
                key={oIdx}
                className={`flex items-center gap-2 p-2 rounded-[8px] border text-xs ${
                  opt.isCorrect
                    ? "border-success-line bg-success-light/40"
                    : "border-line bg-surface"
                }`}
              >
                <input
                  type={
                    q.questionType === "SINGLE_CHOICE" || q.questionType === "TRUE_FALSE"
                      ? "radio"
                      : "checkbox"
                  }
                  name={`correct-${idx}`}
                  checked={opt.isCorrect}
                  onChange={(e) => {
                    const newOpts = [...(q.options ?? [])];
                    if (q.questionType === "SINGLE_CHOICE" || q.questionType === "TRUE_FALSE") {
                      newOpts.forEach((o, i) => {
                        o.isCorrect = i === oIdx;
                      });
                    } else {
                      newOpts[oIdx].isCorrect = e.target.checked;
                    }
                    onUpdate({ options: newOpts });
                  }}
                  className="cursor-pointer"
                />
                <input
                  type="text"
                  className="flex-1 px-2 py-1 text-xs rounded border border-line-soft bg-surface focus:outline-none"
                  value={opt.optionText}
                  onChange={(e) => {
                    const newOpts = [...(q.options ?? [])];
                    newOpts[oIdx].optionText = e.target.value;
                    onUpdate({ options: newOpts });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {q.answerKey?.blanks && (
        <div className="text-xs space-y-1">
          <span className="font-medium text-content-secondary block">Accepted answers</span>
          {q.answerKey.blanks.map((b) => (
            <p key={b.index}>
              <span className="font-semibold">{`{{${b.index}}}`}</span>: {b.accepted.join(" / ")}
            </p>
          ))}
        </div>
      )}

      {q.answerKey?.pairs && (
        <div className="text-xs space-y-1">
          <span className="font-medium text-content-secondary block">Matching pairs</span>
          {q.answerKey.pairs.map((pair, pIdx) => (
            <p key={pIdx}>
              {pair.left} → {pair.right}
            </p>
          ))}
        </div>
      )}

      {q.questionType === "CODE" && (
        <div className="p-3 rounded-[8px] border border-line bg-surface-muted/40 text-xs space-y-2">
          <p className="text-content-secondary">
            <span className="font-medium">Languages: </span>
            {(q.codeConfig?.allowedLanguages ?? []).join(", ") || "—"}
            {q.codeConfig?.timeLimitMs != null && ` · Time limit ${q.codeConfig.timeLimitMs} ms`}
          </p>
          {(q.testCases ?? []).map((t, tIdx) => (
            <div key={tIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <span className="font-medium text-content-secondary block">
                  Test case {tIdx + 1} input{t.hidden ? " (hidden)" : " (sample)"}
                </span>
                <pre className="whitespace-pre-wrap break-words font-mono text-content">
                  {t.inputData || "—"}
                </pre>
              </div>
              <div className="min-w-0">
                <span className="font-medium text-content-secondary block">Expected output</span>
                <pre className="whitespace-pre-wrap break-words font-mono text-content">
                  {t.expectedOutput || "—"}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {["DIAGRAM", "DIAGRAM_ESSAY"].includes(q.questionType) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-content-secondary">Model answer diagram</span>
            <Button
              size="sm"
              variant="outline"
              icon={<Icon.Edit className="w-3.5 h-3.5" />}
              onClick={onOpenDiagramEditor}
            >
              Edit Diagram
            </Button>
          </div>
          <DraftDiagramPreview question={q} index={idx} />
        </div>
      )}

      {["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"].includes(q.questionType) && (
        <div className="p-3 rounded-[8px] border border-line bg-surface-muted/40 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-content-secondary">Grading rubric</span>
            <Button size="sm" variant="outline" onClick={onOpenRubricEditor}>
              Edit Rubric
            </Button>
          </div>
          {q.essayGradingRubric?.criteria.map((c, cIdx) => (
            <div key={cIdx}>
              <p className="font-semibold text-content">
                {c.name} — Weight {c.weight ?? c.maxScore ?? "—"}
              </p>
              {c.descriptors && <p className="text-content-subtle">{c.descriptors}</p>}
            </div>
          ))}
          {q.essayGradingRubric?.notes && (
            <p className="text-content-subtle">
              <span className="font-medium">Model answer: </span>
              {q.essayGradingRubric.notes}
            </p>
          )}
          {!q.essayGradingRubric && (
            <p className="text-content-subtle">No rubric is attached to this draft yet.</p>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-content-secondary block mb-1">
          Explanation / Key Points
        </label>
        <textarea
          rows={3}
          className="w-full px-2.5 py-1 text-xs rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
          value={q.explanation || ""}
          onChange={(e) => onUpdate({ explanation: e.target.value })}
          placeholder="Rationale behind correct response..."
        />
      </div>

      {validationErr && <p className="text-xs text-danger font-medium">⚠️ {validationErr}</p>}
    </div>
  );
}
