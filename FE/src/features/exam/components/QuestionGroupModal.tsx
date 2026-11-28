import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import { useToast } from "@/components/ui/ToastHost";
import type { ExamKind } from "@/services/exam.service";
import { questionGroupService, type QuestionGroup } from "@/services/questionGroup.service";
import { ROUTES, managerQuestionCreateWithContextPath } from "@/app/routes";
import { getApiErrorMessage } from "@/utils/apiError";

interface QuestionGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSelectGroup: (group: QuestionGroup) => void;
  existingGroupIds: Set<number>;
  courseId?: number;
  moduleId?: number;
  questionType: ExamKind;
  loading?: boolean;
}

export function QuestionGroupModal({
  open,
  onClose,
  onSelectGroup,
  existingGroupIds,
  courseId,
  moduleId,
  questionType,
  loading = false,
}: QuestionGroupModalProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<QuestionGroup | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    questionGroupService
      .getQuestionGroups({
        courseId,
        moduleId,
        questionType: questionType === "ESSAY" ? undefined : questionType,
        search: search.trim() || undefined,
        size: 100,
      })
      .then((res) => {
        const types =
          questionType === "ESSAY" ? ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"] : [questionType];
        setGroups(
          (res.content || []).filter(
            (group) => group.questionType != null && types.includes(group.questionType),
          ),
        );
      })
      .catch((err) => {
        setGroups([]);
        toast.error(getApiErrorMessage(err, "Failed to load question groups."), {
          title: "Could not load question groups",
          duration: null,
        });
      })
      .finally(() => {
        setFetching(false);
      });
  }, [open, search, courseId, moduleId, questionType, toast]);

  useEffect(() => {
    if (open) {
      setSelectedGroup(null);
    }
  }, [open]);

  const handleConfirmSelect = () => {
    if (!selectedGroup) return;
    onSelectGroup(selectedGroup);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Question Group"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon.Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              onClose();
              navigate(
                courseId != null
                  ? managerQuestionCreateWithContextPath({
                      context: "new-group",
                      courseId,
                      moduleId,
                    })
                  : ROUTES.managerQuestions,
              );
            }}
          >
            New Group in Question Bank
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSelect}
              disabled={!selectedGroup || loading}
              loading={loading}
              icon={<Icon.Plus className="w-4 h-4" />}
            >
              Add Group
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {!courseId && (
          <Alert
            type="info"
            title="Course required"
            message="Select a course for the exam first to filter question groups of that course."
          />
        )}

        <SearchInput
          placeholder="Search passage title or text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="border border-line rounded-[10px] overflow-hidden max-h-[320px] overflow-y-auto divide-y divide-line-faint">
          {fetching ? (
            <div className="py-10 text-center text-sm text-content-subtle">Loading groups…</div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-sm text-content-subtle px-4">
              No question groups with questions found. Use “New Group in Question Bank” to create a
              group with at least 1 question.
            </div>
          ) : (
            groups.map((g) => {
              const isAttached = existingGroupIds.has(g.groupId);
              const isEmptyGroup = (g.questionCount ?? 0) === 0;
              const disabledRow = isAttached || isEmptyGroup;
              const isSelected = selectedGroup?.groupId === g.groupId;

              return (
                <div
                  key={g.groupId}
                  onClick={() => !disabledRow && setSelectedGroup(g)}
                  className={`p-3.5 transition-colors ${
                    disabledRow
                      ? "bg-surface-muted/60 opacity-60 cursor-not-allowed"
                      : isSelected
                        ? "bg-primary-light border-l-4 border-brand-ink cursor-pointer"
                        : "hover:bg-surface-hover cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-content">{g.title}</h4>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="purple" className="text-2xs">
                        {g.questionCount} question{g.questionCount === 1 ? "" : "s"}
                      </Badge>
                      {isAttached && (
                        <Badge variant="warning" className="text-2xs">
                          Already added
                        </Badge>
                      )}
                      {isEmptyGroup && !isAttached && (
                        <Badge variant="default" className="text-2xs">
                          No questions yet
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-content-subtle mt-1.5 line-clamp-2 leading-relaxed">
                    {g.passageText}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
