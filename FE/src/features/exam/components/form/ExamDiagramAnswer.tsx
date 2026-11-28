import React, { useEffect, useState } from "react";
import { DiagramAnswer } from "@/features/question/components/DiagramAnswer";
import { fromDetail, toUpdateRequest, type QuestionDraft } from "@/features/question/model";
import { questionService, type QuestionDetail } from "@/services/question.service";
import { getApiErrorMessage } from "@/utils/apiError";

export function ExamDiagramAnswer({
  questionId,
  readOnly,
}: {
  questionId: number;
  readOnly: boolean;
}) {
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    questionService
      .getQuestionById(questionId)
      .then((detail) => {
        if (!active) return;
        setQuestion(detail);
        setDraft(fromDetail(detail));
      })
      .catch((err) => {
        if (active) {
          setError(getApiErrorMessage(err, "Could not load the model answer diagram."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [questionId]);

  const saveDiagram = async (patch: Partial<QuestionDraft>) => {
    if (!question || !draft || readOnly || saving) return;
    const updatedDraft = { ...draft, ...patch };
    setDraft(updatedDraft);
    setSaving(true);
    setError("");
    try {
      const updated = await questionService.updateQuestion(
        questionId,
        toUpdateRequest(updatedDraft, question.moduleId, {
          status: question.status,
        }),
      );
      setQuestion(updated);
      setDraft(fromDetail(updated));
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Could not save the model answer diagram. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="mt-3 text-xs text-content-subtle">Loading model answer diagram…</div>;
  }
  if (!draft) {
    return (
      <div className="mt-3 text-xs text-danger">
        {error || "Could not load the model answer diagram."}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <DiagramAnswer q={draft} set={saveDiagram} readOnly={readOnly || saving} />
      {saving && <p className="mt-2 text-xs text-content-subtle">Saving model answer diagram…</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
