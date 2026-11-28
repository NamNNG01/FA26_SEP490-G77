import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/assets/icons";
import type { AiRubricCriterion } from "@/services/exam.service";
import type { RubricEditorState } from "../../hooks/useExamAiGenerate";

interface AiRubricEditorModalProps {
  rubricEditor: RubricEditorState | null;
  onChange: React.Dispatch<React.SetStateAction<RubricEditorState | null>>;
  onUpdateCriterion: (index: number, update: Partial<AiRubricCriterion>) => void;
  onSave: () => void;
  onClose: () => void;
}

export function AiRubricEditorModal({
  rubricEditor,
  onChange,
  onUpdateCriterion,
  onSave,
  onClose,
}: AiRubricEditorModalProps) {
  return (
    <Modal
      open={rubricEditor !== null}
      onClose={onClose}
      title="Edit Grading Rubric"
      size="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save Rubric to Draft</Button>
        </div>
      }
    >
      {rubricEditor && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-content">Evaluation Criteria</p>
            <Button
              size="sm"
              variant="secondary"
              icon={<Icon.Plus className="w-3.5 h-3.5" />}
              onClick={() =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        rubric: {
                          ...current.rubric,
                          criteria: [
                            ...current.rubric.criteria,
                            { name: "", weight: 1, descriptors: "" },
                          ],
                        },
                      }
                    : current,
                )
              }
            >
              Add Criterion
            </Button>
          </div>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {rubricEditor.rubric.criteria.map((criterion, criterionIndex) => (
              <div
                key={criterionIndex}
                className="space-y-2 rounded-[8px] border border-line p-3"
              >
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs font-medium text-content-secondary">
                    Criterion
                    <input
                      className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-sm"
                      value={criterion.name}
                      onChange={(event) =>
                        onUpdateCriterion(criterionIndex, { name: event.target.value })
                      }
                      placeholder="e.g. Understanding of the topic"
                    />
                  </label>
                  <label className="w-24 text-xs font-medium text-content-secondary">
                    Weight
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-sm"
                      value={criterion.weight ?? criterion.maxScore ?? 1}
                      onChange={(event) =>
                        onUpdateCriterion(criterionIndex, {
                          weight: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={rubricEditor.rubric.criteria.length <= 1}
                    onClick={() =>
                      onChange((current) =>
                        current
                          ? {
                              ...current,
                              rubric: {
                                ...current.rubric,
                                criteria: current.rubric.criteria.filter(
                                  (_, index) => index !== criterionIndex,
                                ),
                              },
                            }
                          : current,
                      )
                    }
                    className="mb-1 rounded p-2 text-content-subtle hover:bg-danger-light hover:text-danger disabled:pointer-events-none disabled:opacity-30"
                    aria-label={`Remove criterion ${criterionIndex + 1}`}
                  >
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
                <label className="block text-xs font-medium text-content-secondary">
                  Performance Descriptors
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-sm"
                    value={criterion.descriptors ?? ""}
                    onChange={(event) =>
                      onUpdateCriterion(criterionIndex, { descriptors: event.target.value })
                    }
                    placeholder="Describe expectations for this criterion."
                  />
                </label>
              </div>
            ))}
          </div>
          <label className="block text-xs font-medium text-content-secondary">
            General Notes / Model Answer
            <textarea
              rows={3}
              className="mt-1 w-full rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-sm"
              value={rubricEditor.rubric.notes ?? ""}
              onChange={(event) =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        rubric: {
                          ...current.rubric,
                          notes: event.target.value,
                        },
                      }
                    : current,
                )
              }
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
