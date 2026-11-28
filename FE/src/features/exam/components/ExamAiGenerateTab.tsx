import React from "react";
import type { ExamDetail } from "@/services/exam.service";
import { plantUmlToDrawioXml } from "@/features/question/diagram";
import { DrawioEditorModal } from "@/features/question/components/DrawioEditorModal";
import { useExamAiGenerate } from "../hooks/useExamAiGenerate";
import { AiExamConfigForm } from "./ai/AiExamConfigForm";
import { AiDraftReviewPanel } from "./ai/AiDraftReviewPanel";
import { AiRubricEditorModal } from "./ai/AiRubricEditorModal";

interface ExamAiGenerateTabProps {
  formKind: "QUIZ" | "ESSAY" | "DIAGRAM" | "CODE";
  onCreated: (createdExam: ExamDetail) => void;
  onCancel: () => void;
}

export function ExamAiGenerateTab({ formKind, onCreated, onCancel }: ExamAiGenerateTabProps) {
  const ai = useExamAiGenerate(formKind, onCreated);

  const activeDiagramXml = (() => {
    const question =
      ai.diagramEditorQuestionIndex === null
        ? undefined
        : ai.draft?.questions[ai.diagramEditorQuestionIndex];
    if (!question) return "";
    const existingXml = question.questionMetadata?.drawioXml;
    if (typeof existingXml === "string" && existingXml.trim()) return existingXml;
    return question.plantUmlSource ? plantUmlToDrawioXml(question.plantUmlSource) : "";
  })();

  return (
    <div className="space-y-6">
      {!ai.draft ? (
        <AiExamConfigForm
          courses={ai.courses}
          modules={ai.modules}
          courseId={ai.courseId}
          onCourseChange={ai.handleCourseChange}
          selectedModuleIds={ai.selectedModuleIds}
          onSetSelectedModuleIds={ai.setSelectedModuleIds}
          onToggleModuleId={ai.toggleModuleId}
          title={ai.title}
          onTitleChange={ai.setTitle}
          durationMinutes={ai.durationMinutes}
          onDurationChange={ai.setDurationMinutes}
          maxScore={ai.maxScore}
          onMaxScoreChange={ai.setMaxScore}
          mode={ai.mode}
          onModeChange={ai.setMode}
          language={ai.language}
          onLanguageChange={ai.setLanguage}
          materialFile={ai.materialFile}
          onMaterialFileChange={ai.setMaterialFile}
          context={ai.context}
          onContextChange={ai.setContext}
          diffDist={ai.diffDist}
          onDiffDistChange={ai.setDiffDist}
          allowedTypes={ai.allowedTypes}
          typeCounts={ai.typeCounts}
          onTypeCountsChange={ai.setTypeCounts}
          totalDiff={ai.totalDiff}
          totalTypes={ai.totalTypes}
          isDiffMatch={ai.isDiffMatch}
          isTypeMatch={ai.isTypeMatch}
          questionCount={ai.questionCount}
          canGenerate={ai.canGenerate}
          generating={ai.generating}
          editingDisabled={ai.editingQuestion !== null}
          fieldErrors={ai.fieldErrors}
          onClearContextError={() => ai.setFieldErrors((prev) => ({ ...prev, context: "" }))}
          onGenerate={ai.handleGenerate}
          onCancelGenerate={ai.handleCancelGenerate}
          onCancel={onCancel}
        />
      ) : (
        <AiDraftReviewPanel
          draft={ai.draft}
          modules={ai.modules}
          bulkModuleId={ai.bulkModuleId}
          onApplyModuleToAll={ai.applyModuleToAll}
          allowedTypes={ai.allowedTypes}
          saving={ai.saving}
          savedQuestionIds={ai.savedQuestionIds}
          editingQuestion={ai.editingQuestion}
          onSetEditingQuestion={ai.setEditingQuestion}
          onFinishQuestionEdit={ai.finishQuestionEdit}
          onUpdateQuestion={ai.updateDraftQuestion}
          onRemoveQuestion={ai.removeDraftQuestion}
          onOpenDiagramEditor={(idx) => ai.setDiagramEditorQuestionIndex(idx)}
          onOpenRubricEditor={ai.openRubricEditor}
          scoreForWeight={ai.scoreForWeight}
          validateDraftQuestion={ai.validateDraftQuestion}
          onBack={() => ai.setDraft(null)}
          onCreateExam={ai.handleCreateExam}
        />
      )}

      <AiRubricEditorModal
        rubricEditor={ai.rubricEditor}
        onChange={ai.setRubricEditor}
        onUpdateCriterion={ai.updateRubricCriterion}
        onSave={ai.saveRubricEditor}
        onClose={() => ai.setRubricEditor(null)}
      />

      <DrawioEditorModal
        open={ai.diagramEditorQuestionIndex !== null}
        xml={activeDiagramXml}
        onClose={() => ai.setDiagramEditorQuestionIndex(null)}
        onSave={(diagramXml, diagramSvg) => {
          if (ai.diagramEditorQuestionIndex === null || !ai.draft) return;
          const question = ai.draft.questions[ai.diagramEditorQuestionIndex];
          if (!question) return;
          ai.updateDraftQuestion(ai.diagramEditorQuestionIndex, {
            questionMetadata: {
              ...question.questionMetadata,
              drawioXml: diagramXml,
            },
            diagramSvg,
            plantUmlSource: undefined,
          });
          ai.setDiagramEditorQuestionIndex(null);
        }}
      />
    </div>
  );
}
