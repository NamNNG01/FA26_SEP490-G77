import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/assets/icons";
import type { AiExamDraftResponse, AiQuestionDraft } from "@/services/exam.service";
import type { CourseModuleResponse } from "@/services/course.service";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import type { EditableQuestionType } from "@/features/question/model";
import { toEditorDraft } from "../../utils/aiDraftConverters";
import type { EditingQuestionState } from "../../hooks/useExamAiGenerate";
import { AiDraftQuestionCard } from "./AiDraftQuestionCard";

interface AiDraftReviewPanelProps {
  draft: AiExamDraftResponse;
  modules: CourseModuleResponse[];
  bulkModuleId: string;
  onApplyModuleToAll: (midStr: string) => void;
  allowedTypes: string[];
  saving: boolean;
  savedQuestionIds: number[];
  editingQuestion: EditingQuestionState | null;
  onSetEditingQuestion: React.Dispatch<React.SetStateAction<EditingQuestionState | null>>;
  onFinishQuestionEdit: () => void;
  onUpdateQuestion: (index: number, updated: Partial<AiQuestionDraft>) => void;
  onRemoveQuestion: (index: number) => void;
  onOpenDiagramEditor: (index: number) => void;
  onOpenRubricEditor: (index: number, question: AiQuestionDraft) => void;
  scoreForWeight: (weight: number) => number;
  validateDraftQuestion: (q: AiQuestionDraft) => string | null;
  onBack: () => void;
  onCreateExam: () => void;
}

export function AiDraftReviewPanel({
  draft,
  modules,
  bulkModuleId,
  onApplyModuleToAll,
  allowedTypes,
  saving,
  savedQuestionIds,
  editingQuestion,
  onSetEditingQuestion,
  onFinishQuestionEdit,
  onUpdateQuestion,
  onRemoveQuestion,
  onOpenDiagramEditor,
  onOpenRubricEditor,
  scoreForWeight,
  validateDraftQuestion,
  onBack,
  onCreateExam,
}: AiDraftReviewPanelProps) {
  const actionsDisabled = editingQuestion !== null || saving || savedQuestionIds.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-surface rounded-[12px] border border-line shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="purple" className="text-xs font-bold">
              AI Draft
            </Badge>
            <h3 className="text-base font-bold text-content">{draft.title}</h3>
          </div>
          <p className="text-xs text-content-subtle mt-1">
            {draft.questions.length} questions synthesized · {draft.durationMinutes} min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack} disabled={saving || editingQuestion !== null}>
            Back
          </Button>
          <Button
            icon={<Icon.Check className="w-4 h-4" />}
            loading={saving}
            disabled={saving || editingQuestion !== null || draft.questions.length === 0}
            onClick={onCreateExam}
          >
            Create Exam
          </Button>
        </div>
      </div>

      {modules.length > 0 && savedQuestionIds.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[10px] border border-line bg-surface">
          <span className="text-xs text-content-secondary">
            Each question must belong to a module before saving to the Question Bank.
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-content-secondary whitespace-nowrap">
              Apply module to all:
            </span>
            <Select
              className="w-56 text-xs"
              value={bulkModuleId}
              onChange={onApplyModuleToAll}
              options={[
                { label: "Choose module...", value: "" },
                ...modules.map((m) => ({
                  label: m.title,
                  value: String(m.moduleId),
                })),
              ]}
            />
          </div>
        </div>
      )}

      <div
        className={`space-y-4 ${savedQuestionIds.length > 0 ? "pointer-events-none opacity-70" : ""}`}
      >
        {draft.questions.map((q, idx) => {
          if (editingQuestion?.index === idx) {
            return (
              <QuestionForm
                key={`edit-${idx}`}
                q={editingQuestion.draft}
                index={idx}
                heading={`Edit generated question ${idx + 1}`}
                onChange={(updated) =>
                  onSetEditingQuestion((current) =>
                    current ? { ...current, draft: updated } : current,
                  )
                }
                showErrors
                allowedTypes={allowedTypes as EditableQuestionType[]}
                actions={
                  <Button size="sm" onClick={onFinishQuestionEdit} disabled={saving}>
                    Done
                  </Button>
                }
              />
            );
          }

          return (
            <AiDraftQuestionCard
              key={idx}
              question={q}
              index={idx}
              modules={modules}
              scorePoints={scoreForWeight(q.defaultPoints ?? 1)}
              validationErr={validateDraftQuestion(q)}
              actionsDisabled={actionsDisabled}
              onUpdate={(updated) => onUpdateQuestion(idx, updated)}
              onEdit={() => onSetEditingQuestion({ index: idx, draft: toEditorDraft(q) })}
              onRemove={() => onRemoveQuestion(idx)}
              onOpenDiagramEditor={() => onOpenDiagramEditor(idx)}
              onOpenRubricEditor={() => onOpenRubricEditor(idx, q)}
            />
          );
        })}
      </div>
    </div>
  );
}
