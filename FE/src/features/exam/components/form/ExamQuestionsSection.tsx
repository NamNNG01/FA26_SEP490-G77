import React from "react";
import { QuestionContent } from "@/components/common/QuestionContent";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import type { ExamQuestion, QuestionOrder } from "@/services/exam.service";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import {
  validateDraft,
  type EditableQuestionType,
  type QuestionDraft,
} from "@/features/question/model";
import type { UnifiedExamItem } from "../../utils/examUnifiedOrder";
import type { RemoveConfirmTarget } from "../../hooks/useExamForm";
import { ExamDiagramAnswer } from "./ExamDiagramAnswer";

const isEssayQuestion = (question: ExamQuestion) =>
  ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"].includes(question.questionType);

interface ExamQuestionsSectionProps {
  unifiedItems: UnifiedExamItem[];
  questionOrder: QuestionOrder;
  courseId: string;
  moduleId: string;
  formKind: "QUIZ" | "ESSAY" | "CODE";
  isEdit: boolean;
  isReadOnly: boolean;
  isPublished: boolean;
  isAssessment: boolean;
  canManageExamQuestions: boolean;
  loading: boolean;
  orderSaving: boolean;
  hasAnyItems: boolean;
  totalQuestionCount: number;
  fieldError?: string;
  allowedQuestionTypes: string[];
  importedQuestionsSubmitted: boolean;
  expandedGroupIds: Set<number>;
  onToggleGroup: (examGroupId: number) => void;
  scoreForWeight: (weight: number) => number;
  formatScore: (score: number) => string;
  onRemoveAll: () => void;
  onOpenImportModal: () => void;
  onOpenImportPreview: () => void;
  onOpenGroupModal: () => void;
  onOpenBankModal: () => void;
  onMoveUnifiedItem: (index: number, delta: -1 | 1) => void;
  onMoveGroupQuestion: (groupId: number, childIndex: number, delta: -1 | 1) => void;
  onQuestionWeightChange: (examQuestionId: number, weight: number) => void;
  onQuestionWeightBlur: (question: ExamQuestion, weight: number) => void;
  onOpenRubricModal: (q: { id: number; content: string }) => void;
  onEditQuestion: (q: ExamQuestion) => void;
  onRequestRemove: (target: RemoveConfirmTarget) => void;
  onUpdateImportedDraft: (key: string, draft: QuestionDraft) => void;
  onRemoveImportedDraft: (key: string) => void;
  onImportedWeightChange: (key: string, weight: number) => void;
}

export function ExamQuestionsSection({
  unifiedItems,
  questionOrder,
  courseId,
  moduleId,
  formKind,
  isEdit,
  isReadOnly,
  isPublished,
  isAssessment,
  canManageExamQuestions,
  loading,
  orderSaving,
  hasAnyItems,
  totalQuestionCount,
  fieldError,
  allowedQuestionTypes,
  importedQuestionsSubmitted,
  expandedGroupIds,
  onToggleGroup,
  scoreForWeight,
  formatScore,
  onRemoveAll,
  onOpenImportModal,
  onOpenImportPreview,
  onOpenGroupModal,
  onOpenBankModal,
  onMoveUnifiedItem,
  onMoveGroupQuestion,
  onQuestionWeightChange,
  onQuestionWeightBlur,
  onOpenRubricModal,
  onEditQuestion,
  onRequestRemove,
  onUpdateImportedDraft,
  onRemoveImportedDraft,
  onImportedWeightChange,
}: ExamQuestionsSectionProps) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2.5">
        <div>
          <h3 className="text-base font-bold text-content">
            Exam Questions &amp; Passage Groups ({unifiedItems.length})
          </h3>
          <p className="text-xs text-content-subtle">
            {questionOrder === "MANUAL"
              ? "Manual order: standalone questions and reading passage groups appear in this exact sequence (options inside questions still shuffle)."
              : "Random order: items shuffle per attempt, while questions inside each reading passage group stay contiguous and in order."}
          </p>
          {fieldError && <p className="mt-1 text-xs text-danger">{fieldError}</p>}
        </div>

        {canManageExamQuestions && (
          <div className="flex flex-wrap items-center gap-2">
            {!isReadOnly && hasAnyItems && (
              <Button
                size="sm"
                variant="outline"
                icon={<Icon.Trash className="w-3.5 h-3.5" />}
                onClick={onRemoveAll}
                disabled={loading || orderSaving}
              >
                Remove All
              </Button>
            )}
            {!isReadOnly && formKind === "QUIZ" && isEdit && (
              <Button
                size="sm"
                variant="outline"
                icon={<Icon.Upload className="w-3.5 h-3.5" />}
                onClick={onOpenImportModal}
              >
                Import Questions
              </Button>
            )}
            {!isReadOnly && !isEdit && (
              <Button
                size="sm"
                variant="outline"
                icon={<Icon.Upload className="w-3.5 h-3.5" />}
                onClick={onOpenImportPreview}
                disabled={!courseId || !moduleId}
                title={
                  !courseId
                    ? "Select a course before importing"
                    : !moduleId
                      ? "Select a module before importing"
                      : undefined
                }
              >
                Import Excel / Word / PDF
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              icon={<Icon.Plus className="w-3.5 h-3.5" />}
              onClick={onOpenGroupModal}
              disabled={!courseId || !moduleId}
              title={
                !courseId
                  ? "Select a course before adding a group"
                  : !moduleId
                    ? "Select a module before adding a group"
                    : undefined
              }
            >
              Add Group
            </Button>

            <Button
              size="sm"
              icon={<Icon.Plus className="w-3.5 h-3.5" />}
              onClick={onOpenBankModal}
              disabled={!courseId || !moduleId}
              title={
                !courseId
                  ? "Select a course before adding questions"
                  : !moduleId
                    ? "Select a module before adding questions"
                    : undefined
              }
            >
              Select Questions from Bank
            </Button>
          </div>
        )}
      </div>

      {unifiedItems.length === 0 ? (
        <div className="py-12 text-center text-sm text-content-subtle border-2 border-dashed border-line-soft rounded-[10px]">
          {!courseId || !moduleId
            ? "Select a Course and Module above first, then add questions or reading passage groups."
            : "No questions or reading passage groups attached yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {unifiedItems.map((entry, idx) => {
            const canReorderTop = !isReadOnly && questionOrder === "MANUAL" && !orderSaving;

            if (entry.kind === "question") {
              const q = entry.question;
              return (
                <div
                  key={entry.key}
                  className="p-3.5 rounded-[10px] border border-line bg-surface transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-content leading-snug whitespace-pre-line break-words">
                          <QuestionContent text={q.content} />
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="default" className="text-2xs font-semibold">
                            {q.questionType.replace("_", " ")}
                          </Badge>
                          <label className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-medium">
                            Weight
                            <input
                              type="number"
                              min={0}
                              max={1000}
                              step={1}
                              disabled={!canManageExamQuestions}
                              className="w-20 px-2 py-1 rounded border border-line bg-surface text-content disabled:opacity-60"
                              value={q.weight ?? q.points ?? 1}
                              onChange={(e) =>
                                onQuestionWeightChange(q.examQuestionId, Number(e.target.value) || 0)
                              }
                              onBlur={(e) =>
                                onQuestionWeightBlur(q, Number(e.currentTarget.value) || 0)
                              }
                            />
                          </label>
                          <span className="text-xs text-brand-ink font-semibold">
                            Score: {formatScore(scoreForWeight(q.weight ?? q.points ?? 1))} pts
                          </span>

                          {!isReadOnly && isAssessment && isEssayQuestion(q) && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenRubricModal({ id: q.questionId, content: q.content })
                              }
                              className="text-xs font-semibold text-brand-ink hover:underline cursor-pointer"
                            >
                              Edit Rubric
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {(canReorderTop || !isReadOnly || canManageExamQuestions) && (
                      <div className="flex items-center gap-1">
                        {canReorderTop && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => onMoveUnifiedItem(idx, -1)}
                              className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                              aria-label={`Move item ${idx + 1} up`}
                            >
                              <Icon.ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === unifiedItems.length - 1}
                              onClick={() => onMoveUnifiedItem(idx, 1)}
                              className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                              aria-label={`Move item ${idx + 1} down`}
                            >
                              <Icon.ArrowDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => onEditQuestion(q)}
                            className="text-content-subtle hover:text-brand-ink p-1 rounded hover:bg-surface-hover cursor-pointer"
                            title="Edit Question"
                            aria-label={`Edit question ${idx + 1}`}
                          >
                            <Icon.Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canManageExamQuestions && (
                          <button
                            type="button"
                            disabled={isPublished && totalQuestionCount <= 1}
                            onClick={() =>
                              onRequestRemove({
                                type: "question",
                                examQuestionId: q.examQuestionId,
                                title: q.content,
                              })
                            }
                            className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title={
                              isPublished && totalQuestionCount <= 1
                                ? "Published exam must keep at least one question"
                                : "Remove Question from Exam"
                            }
                            aria-label={`Remove question ${idx + 1} from exam`}
                          >
                            <Icon.Trash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {(q.questionType === "DIAGRAM" || q.questionType === "DIAGRAM_ESSAY") && (
                    <ExamDiagramAnswer questionId={q.questionId} readOnly={isReadOnly} />
                  )}
                </div>
              );
            }

            if (entry.kind === "imported") {
              const item = entry.item;
              return (
                <div
                  key={entry.key}
                  className="space-y-2 rounded-[10px] border border-brand-line/60 bg-surface p-3.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold">
                        #{idx + 1}
                      </span>
                      <Badge variant="info" className="text-2xs">
                        Imported Draft (saved with exam)
                      </Badge>
                    </div>
                    {canReorderTop && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveUnifiedItem(idx, -1)}
                          className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                          aria-label={`Move item ${idx + 1} up`}
                        >
                          <Icon.ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === unifiedItems.length - 1}
                          onClick={() => onMoveUnifiedItem(idx, 1)}
                          className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                          aria-label={`Move item ${idx + 1} down`}
                        >
                          <Icon.ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <QuestionForm
                    q={item.draft}
                    index={idx}
                    onChange={(draft) => onUpdateImportedDraft(item.draft.key, draft)}
                    showErrors={importedQuestionsSubmitted}
                    removable
                    onRemove={() => onRemoveImportedDraft(item.draft.key)}
                    allowedTypes={allowedQuestionTypes as EditableQuestionType[]}
                  />
                  <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-content-secondary">
                      Exam Weight
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step={1}
                        className="w-20 rounded border border-line bg-surface px-2 py-1 text-content disabled:opacity-60"
                        value={item.weight}
                        onChange={(e) =>
                          onImportedWeightChange(item.draft.key, Number(e.target.value) || 0)
                        }
                      />
                    </label>
                    <span className="text-xs font-semibold text-brand-ink">
                      Score: {formatScore(scoreForWeight(item.weight))} pts
                    </span>
                  </div>
                  {importedQuestionsSubmitted &&
                    Object.keys(validateDraft(item.draft)).length > 0 && (
                      <p className="text-xs text-danger">
                        Fix the question validation errors above before creating the exam.
                      </p>
                    )}
                </div>
              );
            }

            const g = entry.group;
            const groupQuestions = entry.groupQuestions;
            const isExpanded = expandedGroupIds.has(g.examGroupId);

            return (
              <div
                key={entry.key}
                className="rounded-[10px] border border-line bg-surface overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => onToggleGroup(g.examGroupId)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                  >
                    <span className="w-6 h-6 rounded-full bg-purple-light text-purple flex items-center justify-center text-xs font-bold flex-shrink-0">
                      #{idx + 1}
                    </span>
                    <Icon.ChevronDown
                      className={`w-4 h-4 flex-shrink-0 text-content-subtle transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                    <Badge variant="purple" className="text-2xs">
                      Group
                    </Badge>
                    <span className="truncate text-sm font-semibold text-content">{g.title}</span>
                    <span className="flex-shrink-0 text-xs text-content-secondary font-medium">
                      {groupQuestions.length || g.questionCount || 0} questions
                    </span>
                  </button>

                  <div className="flex items-center gap-1">
                    {canReorderTop && (
                      <>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveUnifiedItem(idx, -1)}
                          className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move group up"
                          aria-label={`Move ${g.title} up`}
                        >
                          <Icon.ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === unifiedItems.length - 1}
                          onClick={() => onMoveUnifiedItem(idx, 1)}
                          className="text-content-subtle hover:text-content p-1 rounded hover:bg-surface-hover cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move group down"
                          aria-label={`Move ${g.title} down`}
                        >
                          <Icon.ArrowDown className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {canManageExamQuestions && (
                      <button
                        type="button"
                        disabled={
                          isPublished &&
                          totalQuestionCount - (groupQuestions.length || g.questionCount || 0) < 1
                        }
                        onClick={() =>
                          onRequestRemove({
                            type: "group",
                            examGroupId: g.examGroupId,
                            title: g.title,
                          })
                        }
                        className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          isPublished &&
                          totalQuestionCount - (groupQuestions.length || g.questionCount || 0) < 1
                            ? "Published exam must keep at least one question"
                            : "Remove group"
                        }
                        aria-label={`Remove ${g.title}`}
                      >
                        <Icon.Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-3 border-t border-line-soft bg-surface-muted/20 p-3.5">
                    {g.passageText && (
                      <div className="rounded-[8px] border border-line-soft bg-surface p-3 text-xs text-content-secondary leading-relaxed whitespace-pre-wrap">
                        {g.passageText}
                      </div>
                    )}
                    {groupQuestions.length === 0 ? (
                      <p className="py-3 text-center text-xs text-content-subtle">
                        No questions are attached from this group.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {groupQuestions.map((q, questionIndex) => (
                          <div
                            key={q.examQuestionId || q.questionId}
                            className="rounded-[8px] border border-line-soft bg-surface p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 text-xs font-bold text-brand-ink">
                                    #{questionIndex + 1}
                                  </span>
                                  <p className="text-sm font-medium leading-snug text-content whitespace-pre-line break-words">
                                    <QuestionContent text={q.content} />
                                  </p>
                                </div>
                                <div className="ml-6 mt-2 flex flex-wrap items-center gap-2">
                                  <Badge variant="default" className="text-2xs font-semibold">
                                    {q.questionType.replace("_", " ")}
                                  </Badge>
                                  <label className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-medium">
                                    Weight
                                    <input
                                      type="number"
                                      min={0}
                                      max={1000}
                                      step={1}
                                      disabled={!canManageExamQuestions}
                                      className="w-20 rounded border border-line bg-surface px-2 py-1 text-content disabled:opacity-60"
                                      value={q.weight ?? q.points ?? 1}
                                      onChange={(e) =>
                                        onQuestionWeightChange(
                                          q.examQuestionId,
                                          Number(e.target.value) || 0,
                                        )
                                      }
                                      onBlur={(e) =>
                                        onQuestionWeightBlur(q, Number(e.currentTarget.value) || 0)
                                      }
                                    />
                                  </label>
                                  <span className="text-xs font-semibold text-brand-ink">
                                    Score: {formatScore(scoreForWeight(q.weight ?? q.points ?? 1))}{" "}
                                    pts
                                  </span>
                                  {!isReadOnly && isAssessment && isEssayQuestion(q) && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenRubricModal({ id: q.questionId, content: q.content })
                                      }
                                      className="text-xs font-semibold text-brand-ink hover:underline cursor-pointer"
                                    >
                                      Edit Rubric
                                    </button>
                                  )}
                                </div>
                              </div>
                              {!isReadOnly && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={orderSaving || questionIndex === 0}
                                    onClick={() =>
                                      onMoveGroupQuestion(g.groupId, questionIndex, -1)
                                    }
                                    className="rounded p-1 text-content-subtle hover:bg-surface-hover hover:text-content cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Move question up within group"
                                    aria-label={`Move question ${questionIndex + 1} in ${g.title} up`}
                                  >
                                    <Icon.ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      orderSaving || questionIndex === groupQuestions.length - 1
                                    }
                                    onClick={() => onMoveGroupQuestion(g.groupId, questionIndex, 1)}
                                    className="rounded p-1 text-content-subtle hover:bg-surface-hover hover:text-content cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Move question down within group"
                                    aria-label={`Move question ${questionIndex + 1} in ${g.title} down`}
                                  >
                                    <Icon.ArrowDown className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onEditQuestion(q)}
                                    className="rounded p-1 text-content-subtle hover:bg-surface-hover hover:text-brand-ink cursor-pointer"
                                    title="Edit Question"
                                    aria-label={`Edit question ${questionIndex + 1} in ${g.title}`}
                                  >
                                    <Icon.Edit className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {(q.questionType === "DIAGRAM" ||
                              q.questionType === "DIAGRAM_ESSAY") && (
                              <ExamDiagramAnswer questionId={q.questionId} readOnly={isReadOnly} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
