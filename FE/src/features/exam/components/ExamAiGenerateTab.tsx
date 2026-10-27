import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/assets/icons";
import { useToast } from "@/components/ui/ToastHost";
import {
  examService,
  type AiExamDraftResponse,
  type AiQuestionDraft,
  type AiRubricCriterion,
  type Difficulty,
  type ExamDetail,
} from "@/services/exam.service";
import {
  courseService,
  type CourseSummaryItem,
  type CourseModuleResponse,
} from "@/services/course.service";
import {
  questionService,
  type QuestionCreateRequest,
} from "@/services/question.service";
import { plantUmlToDrawioXml } from "@/features/question/diagram";
import { DrawioEditorModal } from "@/features/question/components/DrawioEditorModal";
import { useDrawioSnapshot } from "@/features/question/components/useDrawioSnapshot";
import { getApiErrorMessage } from "@/utils/apiError";

function DraftDiagramPreview({
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
          <span className="self-center text-sm text-content-soft">
            Rendering the diagram…
          </span>
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
interface ExamAiGenerateTabProps {
  formKind: "QUIZ" | "ESSAY" | "DIAGRAM";
  onCreated: (createdExam: ExamDetail) => void;
  onCancel: () => void;
}

export function ExamAiGenerateTab({
  formKind,
  onCreated,
  onCancel,
}: ExamAiGenerateTabProps) {
  const toast = useToast();
  const abortCtrlRef = useRef<AbortController | null>(null);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [courseId, setCourseId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [language, setLanguage] = useState<"en" | "vi">("en");
  const [context, setContext] = useState("");

  const [diffDist, setDiffDist] = useState<{
    EASY: number;
    MEDIUM: number;
    HARD: number;
  }>({
    EASY: 4,
    MEDIUM: 4,
    HARD: 2,
  });

  const allowedTypes =
    formKind === "QUIZ"
      ? [
          "SINGLE_CHOICE",
          "MULTIPLE_CHOICE",
          "TRUE_FALSE",
          "FILL_BLANK",
          "MATCHING",
        ]
      : ["ESSAY", "DIAGRAM"];

  const [typeCounts, setTypeCounts] = useState<Record<string, number>>(
    formKind === "QUIZ"
      ? {
          SINGLE_CHOICE: 6,
          MULTIPLE_CHOICE: 2,
          TRUE_FALSE: 2,
          FILL_BLANK: 0,
          MATCHING: 0,
        }
      : { ESSAY: 10, DIAGRAM: 0 },
  );

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AiExamDraftResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<number[]>([]);
  const [rubricEditor, setRubricEditor] = useState<{
    questionIndex: number;
    rubric: NonNullable<AiQuestionDraft["essayGradingRubric"]>;
  } | null>(null);
  const [diagramEditorQuestionIndex, setDiagramEditorQuestionIndex] = useState<
    number | null
  >(null);

  const MSG01 = "This field is required.";
  const MSG06 = "AI is generating questions, please wait...";
  const MSG08 =
    "Failed to generate exam with AI. Please try again or reduce the requested question distribution.";

  useEffect(() => {
    courseService
      .getCourses()
      .then((res) => {
        setCourses(res.content || []);
        if (res.content?.length > 0 && !courseId) {
          setCourseId(String(res.content[0].courseId));
        }
      })
      .catch((err) => {
        toast.error(getApiErrorMessage(err, "Failed to load courses."), {
          title: "Could not load courses",
          duration: null,
        });
      });
  }, [toast]);

  useEffect(() => {
    if (courseId) {
      courseService
        .getCourseModules(courseId)
        .then((mods) => {
          setModules(mods || []);
        })
        .catch((err) => {
          setModules([]);
          toast.error(
            getApiErrorMessage(err, "Failed to load course modules."),
            { title: "Could not load course modules", duration: null },
          );
        });
    } else {
      setModules([]);
      setModuleId("");
    }
  }, [courseId, toast]);

  const totalDiff =
    Number(diffDist.EASY || 0) +
    Number(diffDist.MEDIUM || 0) +
    Number(diffDist.HARD || 0);
  const totalTypes = Object.values(typeCounts).reduce(
    (sum, count) => sum + (Number(count) || 0),
    0,
  );
  const isDiffMatch = totalDiff > 0 && totalDiff <= 50;
  const isTypeMatch = totalTypes === totalDiff;
  const questionCount = totalDiff;
  const canGenerate =
    courseId !== "" &&
    isDiffMatch &&
    isTypeMatch &&
    maxScore > 0 &&
    maxScore <= 10000 &&
    (String(maxScore).split(".")[1]?.length ?? 0) <= 2;
  const draftTotalWeight =
    draft?.questions.reduce(
      (sum, question) => sum + (question.defaultPoints ?? 1),
      0,
    ) ?? 0;
  const scoreForWeight = (weight: number) =>
    draftTotalWeight > 0
      ? Number(((maxScore * weight) / draftTotalWeight).toFixed(2))
      : 0;

  const handleGenerate = async () => {
    const errors: Record<string, string> = {};
    if (!courseId) errors.courseId = MSG01;
    if (!context.trim()) errors.context = MSG01;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setGenerating(true);

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    const payloadQuestionTypes = Object.entries(typeCounts)
      .filter(([_, count]) => count > 0)
      .map(([questionType, count]) => ({ questionType, count }));

    try {
      const result = await examService.generateAiExam(
        {
          courseId: Number(courseId),
          moduleId: moduleId ? Number(moduleId) : undefined,
          title: title.trim() || undefined,
          questionCount,
          difficultyDistribution: diffDist,
          questionTypes: payloadQuestionTypes,
          durationMinutes:
            Number(durationMinutes) > 0 ? Number(durationMinutes) : undefined,
          language,
          context: context.trim() || undefined,
        },
        abortCtrl.signal,
      );
      setDraft(result);
      setSavedQuestionIds([]);
      if (result.warnings?.length) {
        toast.warning(result.warnings.join(" "), {
          title: "AI draft warnings",
          duration: null,
        });
      }
    } catch (err: unknown) {
      const errorObj = err as {
        name?: string;
        response?: { status?: number; data?: { message?: string } };
      };
      if (
        errorObj?.name === "CanceledError" ||
        errorObj?.name === "AbortError"
      ) {
        return;
      }
      if (errorObj?.response?.status === 429) {
        toast.error(
          "Daily AI generation quota exceeded for your course. Please try again tomorrow.",
          { title: "AI generation limit reached", duration: null },
        );
      } else if (errorObj?.response?.status === 502) {
        toast.error(MSG08, {
          title: "AI generation failed",
          duration: null,
          action: {
            label: "Retry",
            onClick: () => {
              void handleGenerate();
            },
          },
        });
      } else if (errorObj?.response?.status === 504) {
        toast.error("AI request timed out after 90 seconds. " + MSG08, {
          title: "AI generation timed out",
          duration: null,
          action: {
            label: "Retry",
            onClick: () => {
              void handleGenerate();
            },
          },
        });
      } else if (errorObj?.response?.status === 400) {
        toast.error(
          errorObj.response.data?.message ||
            "Invalid parameters for AI generation.",
          { title: "Could not generate exam", duration: null },
        );
      } else {
        toast.error(getApiErrorMessage(err, MSG08), {
          title: "AI generation failed",
          duration: null,
          action: {
            label: "Retry",
            onClick: () => {
              void handleGenerate();
            },
          },
        });
      }
    } finally {
      setGenerating(false);
      abortCtrlRef.current = null;
    }
  };

  const handleCancelGenerate = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    setGenerating(false);
  };

  const updateDraftQuestion = (
    index: number,
    updated: Partial<AiQuestionDraft>,
  ) => {
    if (!draft) return;
    const questions = [...draft.questions];
    questions[index] = { ...questions[index], ...updated };
    setDraft({ ...draft, questions });
  };

  const openRubricEditor = (
    questionIndex: number,
    question: AiQuestionDraft,
  ) => {
    const rubric = question.essayGradingRubric;
    setRubricEditor({
      questionIndex,
      rubric: {
        criteria: rubric?.criteria.map((criterion) => ({
          ...criterion,
          weight: criterion.weight ?? criterion.maxScore ?? 1,
        })) ?? [{ name: "", weight: 1, descriptors: "" }],
        totalPoints: rubric?.totalPoints,
        notes: rubric?.notes ?? "",
      },
    });
  };

  const updateRubricCriterion = (
    index: number,
    update: Partial<AiRubricCriterion>,
  ) => {
    setRubricEditor((current) =>
      current
        ? {
            ...current,
            rubric: {
              ...current.rubric,
              criteria: current.rubric.criteria.map(
                (criterion, criterionIndex) =>
                  criterionIndex === index
                    ? { ...criterion, ...update }
                    : criterion,
              ),
            },
          }
        : current,
    );
  };

  const saveRubricEditor = () => {
    if (!rubricEditor) return;
    updateDraftQuestion(rubricEditor.questionIndex, {
      essayGradingRubric: rubricEditor.rubric,
    });
    setRubricEditor(null);
  };

  const removeDraftQuestion = (index: number) => {
    if (!draft) return;
    const questions = draft.questions.filter((_, i) => i !== index);
    setDraft({ ...draft, questions, questionCount: questions.length });
  };

  // Mirrors the Q-03 rules the backend applies on save.
  const validateDraftQuestion = (q: AiQuestionDraft): string | null => {
    if (!q.content.trim()) return "Question content cannot be empty";
    const weight = q.defaultPoints ?? 1;
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 1000 ||
      (String(weight).split(".")[1]?.length ?? 0) > 2
    )
      return "Weight must be greater than 0, no more than 1,000, and have up to 2 decimal places";
    const options = q.options ?? [];
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (
      ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
        q.questionType,
      ) &&
      (options.length < 2 || options.length > 10)
    )
      return "Choice questions must have 2 to 10 options";
    if (q.questionType === "SINGLE_CHOICE" && correctCount !== 1)
      return "Single choice must have exactly 1 correct answer";
    if (
      q.questionType === "MULTIPLE_CHOICE" &&
      (correctCount < 2 || correctCount === options.length)
    )
      return "Multiple choice needs at least 2 correct and 1 incorrect answer";
    if (
      q.questionType === "TRUE_FALSE" &&
      (options.length !== 2 || correctCount !== 1)
    )
      return "True/False question must have exactly 2 options and 1 correct answer";
    if (q.questionType === "FILL_BLANK" && !/\{\{\d+\}\}/.test(q.content))
      return "Fill blank content needs placeholders like {{1}}";
    return null;
  };

  const handleConfirmSave = async () => {
    if (!draft || draft.questions.length === 0) return;
    if (
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      maxScore > 10000 ||
      (String(maxScore).split(".")[1]?.length ?? 0) > 2
    ) {
      toast.error(
        "Max score must be greater than 0, no more than 10,000, and have up to 2 decimal places.",
        { title: "Invalid max score" },
      );
      return;
    }
    for (let i = 0; i < draft.questions.length; i++) {
      const err = validateDraftQuestion(draft.questions[i]);
      if (err) {
        toast.error(`Question #${i + 1} validation failed: ${err}`, {
          title: "Review generated questions",
        });
        return;
      }
    }

    setSaving(true);

    let finalQuestionIds = [...savedQuestionIds];

    try {
      if (finalQuestionIds.length === 0) {
        const questionsToSave = draft.questions.map(
          ({
            plantUmlSource: _plantUmlPreview,
            diagramSvg: _diagramPreview,
            ...q
          }) => ({
            ...q,
            courseId: Number(courseId),
            moduleId: moduleId ? Number(moduleId) : null,
            status: "ACTIVE",
          }),
        ) as QuestionCreateRequest[];

        const batchRes = await questionService.createQuestionsBatch(
          Number(courseId),
          moduleId ? Number(moduleId) : null,
          questionsToSave,
        );

        finalQuestionIds = batchRes.map((r) => r.questionId);
        setSavedQuestionIds(finalQuestionIds);
      }

      const created = await examService.createExam({
        title: draft.title || title || "AI Generated Exam",
        description: draft.description,
        courseId: Number(courseId),
        moduleId: moduleId ? Number(moduleId) : undefined,
        durationMinutes: draft.durationMinutes || durationMinutes || 45,
        isPractice: false,
        generationType: "STATIC",
        questionIds: finalQuestionIds.map((qid, idx) => ({
          questionId: qid,
          weight: draft.questions[idx]?.defaultPoints ?? 1,
          orderIndex: idx,
        })),
        maxScore,
      });

      toast.success("Exam successfully created from AI draft.");
      onCreated(created);
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      if (finalQuestionIds.length > 0) {
        toast.error(
          "Questions have already been saved to the Question Bank. Saving the exam failed. You can click Confirm & Save again to retry creating the exam without duplicating questions.",
          { title: "Questions saved, exam not created", duration: null },
        );
      } else {
        toast.error(
          getApiErrorMessage(
            err,
            "Failed to save generated questions or create exam.",
          ),
          { title: "Could not create exam", duration: null },
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!draft ? (
        <div className="card p-6 space-y-5 max-w-4xl">
          <div className="border-b border-line-soft pb-3">
            <h3 className="text-lg font-bold text-content flex items-center gap-2">
              <Icon.Zap className="w-5 h-5 text-brand-ink" />
              Configure AI Exam Generation
            </h3>
            <p className="text-xs text-content-subtle mt-1">
              Specify your syllabus requirements and AI will generate an
              editable exam draft without saving to database.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label="Target Course *"
                value={courseId}
                onChange={(v) => {
                  setCourseId(v);
                  setModuleId("");
                  setModules([]);
                  setFieldErrors((prev) => ({
                    ...prev,
                    courseId: "",
                    moduleId: "",
                  }));
                }}
                options={[
                  { label: "Select Course", value: "" },
                  ...courses.map((c) => ({
                    label: c.title,
                    value: String(c.courseId),
                  })),
                ]}
              />
              {fieldErrors.courseId && (
                <p className="text-xs text-danger mt-1">
                  {fieldErrors.courseId}
                </p>
              )}
            </div>

            <div>
              <Select
                label="Module (optional)"
                value={moduleId}
                onChange={(value) => {
                  setModuleId(value);
                  if (fieldErrors.moduleId)
                    setFieldErrors((prev) => ({ ...prev, moduleId: "" }));
                }}
                disabled={!courseId}
                options={[
                  { label: "Select Module", value: "" },
                  ...modules.map((m) => ({
                    label: m.title,
                    value: String(m.moduleId),
                  })),
                ]}
              />
              {fieldErrors.moduleId && (
                <p className="text-xs text-danger mt-1">
                  {fieldErrors.moduleId}
                </p>
              )}
            </div>

            <Input
              label="Suggested Exam Title"
              placeholder="e.g. Midterm Comprehensive Quiz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="w-full px-3 py-1.5 text-sm rounded-[10px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                  value={durationMinutes}
                  onChange={(e) =>
                    setDurationMinutes(
                      Math.max(1, Math.min(600, Number(e.target.value) || 1)),
                    )
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">
                  Max Score *
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={10000}
                  step={0.01}
                  className="w-full px-3 py-1.5 text-sm rounded-[10px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <Select
              label="Language"
              value={language}
              onChange={(v) => setLanguage(v as "en" | "vi")}
              options={[
                { label: "English (en)", value: "en" },
                { label: "Tiếng Việt (vi)", value: "vi" },
              ]}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-content-secondary block mb-1">
              Instructions for AI <span className="text-danger">*</span>
            </label>
            <textarea
              rows={3}
              maxLength={2000}
              required
              aria-invalid={Boolean(fieldErrors.context)}
              className={`w-full px-3 py-1.5 text-sm rounded-[10px] border bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink ${fieldErrors.context ? "border-danger-line" : "border-line"}`}
              placeholder="e.g. Focus on recursion and Big-O, for second-year students, use real-world scenarios."
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
                if (e.target.value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, context: "" }));
                }
              }}
            />
            {fieldErrors.context && (
              <p className="text-2xs text-danger mt-1">{fieldErrors.context}</p>
            )}
            <p className="text-2xs text-content-subtle mt-1">
              Describe the topics, audience, or constraints for the generated
              exam. {context.length}/2000
            </p>
          </div>

          <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-content">
                Difficulty Distribution
              </h4>
              <span
                className={`text-xs font-semibold ${
                  isDiffMatch ? "text-success" : "text-danger"
                }`}
              >
                Total questions: {totalDiff}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">
                  Easy
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.EASY}
                  onChange={(e) =>
                    setDiffDist((prev) => ({
                      ...prev,
                      EASY: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">
                  Medium
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.MEDIUM}
                  onChange={(e) =>
                    setDiffDist((prev) => ({
                      ...prev,
                      MEDIUM: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">
                  Hard
                </label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.HARD}
                  onChange={(e) =>
                    setDiffDist((prev) => ({
                      ...prev,
                      HARD: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-content">
                Question Types Breakdown
              </h4>
              <span
                className={`text-xs font-semibold ${
                  isTypeMatch ? "text-success" : "text-danger"
                }`}
              >
                Total questions: {totalTypes}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {allowedTypes.map((qt) => (
                <div key={qt}>
                  <label className="text-xs font-medium text-content-secondary block mb-1">
                    {qt.replace("_", " ")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                    value={typeCounts[qt] ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setTypeCounts((prev) => ({ ...prev, [qt]: val }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
            <Button variant="outline" onClick={onCancel} disabled={generating}>
              Cancel
            </Button>
            {generating ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-subtle animate-pulse">
                  {MSG06}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleCancelGenerate}
                >
                  Cancel Generation
                </Button>
              </div>
            ) : (
              <Button
                icon={<Icon.Zap className="w-4 h-4" />}
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                Generate Draft ({questionCount} Questions)
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-surface rounded-[12px] border border-line shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="purple" className="text-xs font-bold">
                  AI Draft
                </Badge>
                <h3 className="text-base font-bold text-content">
                  {draft.title}
                </h3>
              </div>
              <p className="text-xs text-content-subtle mt-1">
                {draft.questions.length} questions synthesized ·{" "}
                {draft.durationMinutes} min
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setDraft(null)}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                icon={<Icon.Check className="w-4 h-4" />}
                loading={saving}
                disabled={saving || draft.questions.length === 0}
                onClick={handleConfirmSave}
              >
                Confirm & Create Exam
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {draft.questions.map((q, idx) => {
              const validationErr = validateDraftQuestion(q);

              return (
                <div
                  key={idx}
                  className={`card p-4 space-y-3 transition-colors ${
                    validationErr ? "border-danger bg-danger-light/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold">
                        #{idx + 1}
                      </span>
                      <Badge
                        variant="default"
                        className="text-2xs font-semibold"
                      >
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
                          onChange={(e) =>
                            updateDraftQuestion(idx, {
                              defaultPoints: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <span className="text-2xs text-brand-ink font-semibold">
                        Score: {scoreForWeight(q.defaultPoints ?? 1)} pts
                      </span>
                      <Select
                        className="w-28 text-xs"
                        value={q.difficulty}
                        onChange={(v) =>
                          updateDraftQuestion(idx, {
                            difficulty: v as Difficulty,
                          })
                        }
                        options={[
                          { label: "EASY", value: "EASY" },
                          { label: "MEDIUM", value: "MEDIUM" },
                          { label: "HARD", value: "HARD" },
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraftQuestion(idx)}
                      className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer"
                      title="Remove Question from Draft"
                    >
                      <Icon.Trash className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-content-secondary block mb-1">
                      Question Prompt
                    </label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                      value={q.content}
                      onChange={(e) =>
                        updateDraftQuestion(idx, { content: e.target.value })
                      }
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
                                q.questionType === "SINGLE_CHOICE" ||
                                q.questionType === "TRUE_FALSE"
                                  ? "radio"
                                  : "checkbox"
                              }
                              name={`correct-${idx}`}
                              checked={opt.isCorrect}
                              onChange={(e) => {
                                const newOpts = [...(q.options ?? [])];
                                if (
                                  q.questionType === "SINGLE_CHOICE" ||
                                  q.questionType === "TRUE_FALSE"
                                ) {
                                  newOpts.forEach((o, i) => {
                                    o.isCorrect = i === oIdx;
                                  });
                                } else {
                                  newOpts[oIdx].isCorrect = e.target.checked;
                                }
                                updateDraftQuestion(idx, { options: newOpts });
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
                                updateDraftQuestion(idx, { options: newOpts });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.answerKey?.blanks && (
                    <div className="text-xs space-y-1">
                      <span className="font-medium text-content-secondary block">
                        Accepted answers
                      </span>
                      {q.answerKey.blanks.map((b) => (
                        <p key={b.index}>
                          <span className="font-semibold">{`{{${b.index}}}`}</span>
                          : {b.accepted.join(" / ")}
                        </p>
                      ))}
                    </div>
                  )}

                  {q.answerKey?.pairs && (
                    <div className="text-xs space-y-1">
                      <span className="font-medium text-content-secondary block">
                        Matching pairs
                      </span>
                      {q.answerKey.pairs.map((pair, pIdx) => (
                        <p key={pIdx}>
                          {pair.left} → {pair.right}
                        </p>
                      ))}
                    </div>
                  )}

                  {q.questionType === "DIAGRAM" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-content-secondary">
                          Model answer diagram
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Edit className="w-3.5 h-3.5" />}
                          onClick={() => setDiagramEditorQuestionIndex(idx)}
                        >
                          Edit Diagram
                        </Button>
                      </div>
                      <DraftDiagramPreview question={q} index={idx} />
                    </div>
                  )}

                  {["ESSAY", "DIAGRAM"].includes(q.questionType) && (
                    <div className="p-3 rounded-[8px] border border-line bg-surface-muted/40 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-content-secondary">
                          Grading rubric
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRubricEditor(idx, q)}
                        >
                          Edit Rubric
                        </Button>
                      </div>
                      {q.essayGradingRubric?.criteria.map((c, cIdx) => (
                        <div key={cIdx}>
                          <p className="font-semibold text-content">
                            {c.name} — Weight {c.weight ?? c.maxScore ?? "—"}
                          </p>
                          {c.descriptors && (
                            <p className="text-content-subtle">
                              {c.descriptors}
                            </p>
                          )}
                        </div>
                      ))}
                      {q.essayGradingRubric?.notes && (
                        <p className="text-content-subtle">
                          <span className="font-medium">Model answer: </span>
                          {q.essayGradingRubric.notes}
                        </p>
                      )}
                      {!q.essayGradingRubric && (
                        <p className="text-content-subtle">
                          No rubric is attached to this draft yet.
                        </p>
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
                      onChange={(e) =>
                        updateDraftQuestion(idx, {
                          explanation: e.target.value,
                        })
                      }
                      placeholder="Rationale behind correct response..."
                    />
                  </div>

                  {validationErr && (
                    <p className="text-xs text-danger font-medium">
                      ⚠️ {validationErr}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={rubricEditor !== null}
        onClose={() => setRubricEditor(null)}
        title="Edit Grading Rubric"
        size="lg"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setRubricEditor(null)}>
              Cancel
            </Button>
            <Button onClick={saveRubricEditor}>Save Rubric to Draft</Button>
          </div>
        }
      >
        {rubricEditor && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-content">
                Evaluation Criteria
              </p>
              <Button
                size="sm"
                variant="secondary"
                icon={<Icon.Plus className="w-3.5 h-3.5" />}
                onClick={() =>
                  setRubricEditor((current) =>
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
                          updateRubricCriterion(criterionIndex, {
                            name: event.target.value,
                          })
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
                          updateRubricCriterion(criterionIndex, {
                            weight: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={rubricEditor.rubric.criteria.length <= 1}
                      onClick={() =>
                        setRubricEditor((current) =>
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
                        updateRubricCriterion(criterionIndex, {
                          descriptors: event.target.value,
                        })
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
                  setRubricEditor((current) =>
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

      <DrawioEditorModal
        open={diagramEditorQuestionIndex !== null}
        xml={(() => {
          const question =
            diagramEditorQuestionIndex === null
              ? undefined
              : draft?.questions[diagramEditorQuestionIndex];
          if (!question) return "";
          const existingXml = question.questionMetadata?.drawioXml;
          if (typeof existingXml === "string" && existingXml.trim())
            return existingXml;
          return question.plantUmlSource
            ? plantUmlToDrawioXml(question.plantUmlSource)
            : "";
        })()}
        onClose={() => setDiagramEditorQuestionIndex(null)}
        onSave={(diagramXml, diagramSvg) => {
          if (diagramEditorQuestionIndex === null || !draft) return;
          const question = draft.questions[diagramEditorQuestionIndex];
          if (!question) return;
          updateDraftQuestion(diagramEditorQuestionIndex, {
            questionMetadata: {
              ...question.questionMetadata,
              drawioXml: diagramXml,
            },
            diagramSvg,
            plantUmlSource: undefined,
          });
          setDiagramEditorQuestionIndex(null);
        }}
      />
    </div>
  );
}
