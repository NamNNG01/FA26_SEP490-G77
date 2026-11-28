import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import {
  EXAM_MODE_OPTIONS,
  type ExamMode,
  type ExamStatus,
  type QuestionOrder,
} from "@/services/exam.service";

interface ExamSummarySidebarProps {
  formLabel: string;
  status: ExamStatus;
  mode: ExamMode;
  questionOrder: QuestionOrder;
  durationMinutes: number;
  totalQuestionCount: number;
  totalWeight: number;
  maxScore: number;
  formatScore: (score: number) => string;
  isEdit: boolean;
  isReadOnly: boolean;
  isDirty: boolean;
  saving: boolean;
  loading: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function ExamSummarySidebar({
  formLabel,
  status,
  mode,
  questionOrder,
  durationMinutes,
  totalQuestionCount,
  totalWeight,
  maxScore,
  formatScore,
  isEdit,
  isReadOnly,
  isDirty,
  saving,
  loading,
  onSave,
  onCancel,
}: ExamSummarySidebarProps) {
  return (
    <div className="lg:col-span-1 card p-4 space-y-3.5 self-start h-fit lg:sticky lg:top-4">
      <h4 className="text-sm font-bold text-content uppercase tracking-wider text-content-subtle border-b border-line-soft pb-2">
        Exam Summary
      </h4>

      <div className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Exam Type:</span>
          <Badge variant="purple">{formLabel}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Status:</span>
          <Badge
            variant={
              status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "default" : "warning"
            }
          >
            {status}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Mode:</span>
          <span className="font-semibold text-content">
            {EXAM_MODE_OPTIONS.find((o) => o.value === mode)?.label}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Question Order:</span>
          <span className="font-semibold text-content">
            {questionOrder === "MANUAL" ? "Manual" : "Random"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Duration:</span>
          <span className="font-semibold text-content">{durationMinutes} min</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Total Questions:</span>
          <span className="font-bold text-content">{totalQuestionCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Total Weight:</span>
          <span className="font-semibold text-content">{formatScore(totalWeight)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-content-subtle">Max Score:</span>
          <span className="font-bold text-brand-ink">{formatScore(maxScore)} pts</span>
        </div>
      </div>

      <div className="pt-3 border-t border-line-soft space-y-2">
        {!isReadOnly && (
          <Button
            className="w-full"
            icon={<Icon.Check className="w-4 h-4" />}
            onClick={onSave}
            loading={saving}
            disabled={saving || loading || (isEdit && !isDirty)}
          >
            {isEdit ? "Save Changes" : "Create Exam"}
          </Button>
        )}
        <Button className="w-full" variant="outline" onClick={onCancel} disabled={saving}>
          Back to List
        </Button>
      </div>
    </div>
  );
}
