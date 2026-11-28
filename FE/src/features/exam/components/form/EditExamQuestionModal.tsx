import React, { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastHost";
import type { ExamQuestion } from "@/services/exam.service";
import { questionService, type QuestionDetail } from "@/services/question.service";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import {
  fromDetail,
  isDraftValid,
  toUpdateRequest,
  type EditableQuestionType,
  type QuestionDraft,
} from "@/features/question/model";
import { getApiErrorMessage } from "@/utils/apiError";
import { focusFirstInvalidAfter } from "@/utils/focusFirstInvalid";

interface EditExamQuestionModalProps {
  target: ExamQuestion | null;
  allowedQuestionTypes: string[];
  onClose: () => void;
  onUpdated: (updated: QuestionDetail) => void;
}

export function EditExamQuestionModal({
  target,
  allowedQuestionTypes,
  onClose,
  onUpdated,
}: EditExamQuestionModalProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) {
      setDraft(null);
      return;
    }
    let active = true;
    setDraft(null);
    setLoading(true);
    setError("");
    setSubmitted(false);
    questionService
      .getQuestionById(target.questionId)
      .then((detail) => {
        if (active) setDraft(fromDetail(detail));
      })
      .catch((err) => {
        if (active) setError(getApiErrorMessage(err, "Could not load this question."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target]);

  const handleSave = async () => {
    if (!target || !draft || saving) return;
    setError("");
    if (!isDraftValid(draft)) {
      focusFirstInvalidAfter(() => setSubmitted(true));
      return;
    }
    setSubmitted(true);
    setSaving(true);
    try {
      const detail = await questionService.getQuestionById(target.questionId);
      const updated = await questionService.updateQuestion(
        target.questionId,
        toUpdateRequest(
          { ...draft, lockVersion: detail.lockVersion },
          detail.moduleId,
          { status: detail.status },
        ),
      );
      toast.success("Question updated.");
      onUpdated(updated);
      onClose();
      setSubmitted(false);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save this question."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      onClose={() => !saving && onClose()}
      title="Edit Question"
      size="2xl"
      error={error && draft && <Alert type="error" message={error} />}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loading || !draft}>
            Save Question
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-content-subtle">Loading question…</p>
      ) : error && !draft ? (
        <div role="alert" className="py-5 text-sm text-danger">
          {error}
        </div>
      ) : draft ? (
        <div className="space-y-3">
          <QuestionForm
            q={draft}
            index={0}
            onChange={setDraft}
            showErrors={submitted}
            allowedTypes={allowedQuestionTypes as EditableQuestionType[]}
          />
          <p className="text-xs text-content-subtle">
            Saving updates this question in the Question Bank as well as in this exam.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
