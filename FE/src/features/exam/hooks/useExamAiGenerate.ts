import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastHost";
import {
  examService,
  type AiExamDraftResponse,
  type AiQuestionDraft,
  type AiRubricCriterion,
  type ExamDetail,
  type ExamMode,
} from "@/services/exam.service";
import {
  courseService,
  type CourseModuleResponse,
  type CourseSummaryItem,
} from "@/services/course.service";
import { questionService, type QuestionCreateRequest } from "@/services/question.service";
import type { QuestionDraft } from "@/features/question/model";
import { getApiErrorMessage } from "@/utils/apiError";
import { fromEditorDraft, validateAiDraftQuestion } from "../utils/aiDraftConverters";

export interface RubricEditorState {
  questionIndex: number;
  rubric: NonNullable<AiQuestionDraft["essayGradingRubric"]>;
}

export interface EditingQuestionState {
  index: number;
  draft: QuestionDraft;
}

const MSG01 = "This field is required.";
const MSG08 =
  "Failed to generate exam with AI. Please try again or reduce the requested question distribution.";

export function useExamAiGenerate(
  formKind: "QUIZ" | "ESSAY" | "DIAGRAM" | "CODE",
  onCreated: (createdExam: ExamDetail) => void,
) {
  const toast = useToast();
  const abortCtrlRef = useRef<AbortController | null>(null);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [courseId, setCourseId] = useState<string>("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<number[]>([]);
  const [bulkModuleId, setBulkModuleId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [mode, setMode] = useState<ExamMode>("EXAM");
  const [language, setLanguage] = useState<"en" | "vi">("en");
  const [context, setContext] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);

  const [diffDist, setDiffDist] = useState<{
    EASY: number;
    MEDIUM: number;
    HARD: number;
  }>(formKind === "CODE" ? { EASY: 1, MEDIUM: 1, HARD: 1 } : { EASY: 4, MEDIUM: 4, HARD: 2 });

  const allowedTypes =
    formKind === "QUIZ"
      ? ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING"]
      : formKind === "CODE"
        ? ["CODE"]
        : ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"];

  const [typeCounts, setTypeCounts] = useState<Record<string, number>>(
    formKind === "QUIZ"
      ? {
          SINGLE_CHOICE: 6,
          MULTIPLE_CHOICE: 2,
          TRUE_FALSE: 2,
          FILL_BLANK: 0,
          MATCHING: 0,
        }
      : formKind === "CODE"
        ? { CODE: 3 }
        : { ESSAY: 10, DIAGRAM: 0, DIAGRAM_ESSAY: 0 },
  );

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AiExamDraftResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<number[]>([]);
  const [questionsPublished, setQuestionsPublished] = useState(false);
  const [rubricEditor, setRubricEditor] = useState<RubricEditorState | null>(null);
  const [diagramEditorQuestionIndex, setDiagramEditorQuestionIndex] = useState<number | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestionState | null>(null);

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
          toast.error(getApiErrorMessage(err, "Failed to load course modules."), {
            title: "Could not load course modules",
            duration: null,
          });
        });
    } else {
      setModules([]);
      setSelectedModuleIds([]);
      setBulkModuleId("");
    }
  }, [courseId, toast]);

  const handleCourseChange = (v: string) => {
    setCourseId(v);
    setSelectedModuleIds([]);
    setBulkModuleId("");
    setModules([]);
    setFieldErrors((prev) => ({ ...prev, courseId: "" }));
  };

  const toggleModuleId = (mid: number) => {
    setSelectedModuleIds((prev) =>
      prev.includes(mid) ? prev.filter((id) => id !== mid) : [...prev, mid],
    );
  };

  const applyModuleToAll = (midStr: string) => {
    setBulkModuleId(midStr);
    if (!draft || !midStr) return;
    const mid = Number(midStr);
    setDraft({
      ...draft,
      questions: draft.questions.map((q) => ({ ...q, moduleId: mid })),
    });
  };

  const totalDiff =
    Number(diffDist.EASY || 0) + Number(diffDist.MEDIUM || 0) + Number(diffDist.HARD || 0);
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
    draft?.questions.reduce((sum, question) => sum + (question.defaultPoints ?? 1), 0) ?? 0;
  const scoreForWeight = (weight: number) =>
    draftTotalWeight > 0 ? Number(((maxScore * weight) / draftTotalWeight).toFixed(2)) : 0;

  const handleGenerate = async () => {
    const errors: Record<string, string> = {};
    if (!courseId) errors.courseId = MSG01;
    if (!context.trim() && !materialFile) {
      errors.context = "Write instructions for the AI, or upload a material.";
    }
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
      const request = {
        courseId: Number(courseId),
        moduleId: selectedModuleIds.length === 1 ? selectedModuleIds[0] : undefined,
        moduleIds: selectedModuleIds.length > 0 ? selectedModuleIds : undefined,
        title: title.trim() || undefined,
        questionCount,
        difficultyDistribution: diffDist,
        questionTypes: payloadQuestionTypes,
        durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : undefined,
        language,
        context: context.trim() || undefined,
      };
      const generated = materialFile
        ? await examService.generateAiExamFromMaterial(materialFile, request, abortCtrl.signal)
        : await examService.generateAiExam(request, abortCtrl.signal);
      // The material endpoint takes no title or duration: the form's own values win.
      const result = materialFile
        ? {
            ...generated,
            title: title.trim() || generated.title,
            durationMinutes:
              Number(durationMinutes) > 0 ? Number(durationMinutes) : generated.durationMinutes,
          }
        : generated;
      setDraft({
        ...result,
        questions: (result.questions ?? []).map((q, index) => ({
          ...q,
          moduleId:
            q.moduleId ??
            (selectedModuleIds.length > 0
              ? selectedModuleIds[index % selectedModuleIds.length]
              : undefined),
        })),
      });
      setBulkModuleId(selectedModuleIds.length === 1 ? String(selectedModuleIds[0]) : "");
      setEditingQuestion(null);
      setSavedQuestionIds([]);
      setQuestionsPublished(false);
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
      if (errorObj?.name === "CanceledError" || errorObj?.name === "AbortError") {
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
          action: { label: "Retry", onClick: () => void handleGenerate() },
        });
      } else if (errorObj?.response?.status === 504) {
        toast.error("AI request timed out after 90 seconds. " + MSG08, {
          title: "AI generation timed out",
          duration: null,
          action: { label: "Retry", onClick: () => void handleGenerate() },
        });
      } else if (errorObj?.response?.status === 400) {
        toast.error(errorObj.response.data?.message || "Invalid parameters for AI generation.", {
          title: "Could not generate exam",
          duration: null,
        });
      } else {
        toast.error(getApiErrorMessage(err, MSG08), {
          title: "AI generation failed",
          duration: null,
          action: { label: "Retry", onClick: () => void handleGenerate() },
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

  const updateDraftQuestion = (index: number, updated: Partial<AiQuestionDraft>) => {
    if (!draft) return;
    const questions = [...draft.questions];
    questions[index] = { ...questions[index], ...updated };
    setDraft({ ...draft, questions });
  };

  const finishQuestionEdit = () => {
    if (!editingQuestion || !draft) return;
    updateDraftQuestion(
      editingQuestion.index,
      fromEditorDraft(draft.questions[editingQuestion.index], editingQuestion.draft),
    );
    setEditingQuestion(null);
  };

  const openRubricEditor = (questionIndex: number, question: AiQuestionDraft) => {
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

  const updateRubricCriterion = (index: number, update: Partial<AiRubricCriterion>) => {
    setRubricEditor((current) =>
      current
        ? {
            ...current,
            rubric: {
              ...current.rubric,
              criteria: current.rubric.criteria.map((criterion, criterionIndex) =>
                criterionIndex === index ? { ...criterion, ...update } : criterion,
              ),
            },
          }
        : current,
    );
  };

  const saveRubricEditor = () => {
    if (!rubricEditor) return;
    updateDraftQuestion(rubricEditor.questionIndex, { essayGradingRubric: rubricEditor.rubric });
    setRubricEditor(null);
  };

  const removeDraftQuestion = (index: number) => {
    if (!draft) return;
    if (editingQuestion) setEditingQuestion(null);
    const questions = draft.questions.filter((_, i) => i !== index);
    setDraft({ ...draft, questions, questionCount: questions.length });
  };

  const validateDraftQuestion = (q: AiQuestionDraft) =>
    validateAiDraftQuestion(q, modules.length > 0);

  const validateDraftForSave = () => {
    if (!draft || draft.questions.length === 0) return false;
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
      return false;
    }
    for (let i = 0; i < draft.questions.length; i++) {
      const err = validateDraftQuestion(draft.questions[i]);
      if (err) {
        toast.error(`Question #${i + 1} validation failed: ${err}`, {
          title: "Review generated questions",
        });
        return false;
      }
    }
    return true;
  };

  const handleCreateExam = async () => {
    if (!draft || draft.questions.length === 0) return;
    if (savedQuestionIds.length === 0 && !validateDraftForSave()) return;

    setSaving(true);
    let questionIds = [...savedQuestionIds];
    let published = questionsPublished;
    try {
      if (questionIds.length === 0) {
        const questionsToSave = draft.questions.map(
          ({ plantUmlSource: _plantUmlPreview, diagramSvg: _diagramPreview, ...q }) => ({
            ...q,
            courseId: Number(courseId),
            moduleId: q.moduleId ?? null,
          }),
        ) as QuestionCreateRequest[];

        const batchRes = await questionService.createQuestionsBatch(
          Number(courseId),
          null,
          questionsToSave,
        );
        questionIds = batchRes.map((r) => r.questionId);
        if (questionIds.length !== draft.questions.length) {
          throw new Error("Not all generated questions were saved.");
        }
        // Retain IDs before activation/exam creation so a retry will not duplicate the batch.
        setSavedQuestionIds(questionIds);
      }

      if (!published) {
        await questionService.batchUpdateStatus(questionIds, "ACTIVE");
        published = true;
        setQuestionsPublished(true);
      }

      const uniqueModuleIds = Array.from(
        new Set(
          draft.questions
            .map((q) => q.moduleId)
            .filter((mid): mid is number => typeof mid === "number" && mid > 0),
        ),
      );
      const examModuleId = uniqueModuleIds.length === 1 ? uniqueModuleIds[0] : undefined;

      const created = await examService.createExam({
        title: draft.title || title || "AI Generated Exam",
        description: draft.description,
        courseId: Number(courseId),
        moduleId: examModuleId,
        durationMinutes: draft.durationMinutes || durationMinutes || 45,
        mode,
        generationType: "STATIC",
        questionIds: questionIds.map((qid, idx) => ({
          questionId: qid,
          weight: draft.questions[idx]?.defaultPoints ?? 1,
          orderIndex: idx,
        })),
        maxScore,
      });

      toast.success("Exam successfully created from AI draft.");
      onCreated(created);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to create exam."), {
        title: "Could not create exam",
        duration: null,
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    courses,
    modules,
    courseId,
    handleCourseChange,
    selectedModuleIds,
    setSelectedModuleIds,
    toggleModuleId,
    bulkModuleId,
    applyModuleToAll,
    title,
    setTitle,
    durationMinutes,
    setDurationMinutes,
    maxScore,
    setMaxScore,
    mode,
    setMode,
    language,
    setLanguage,
    context,
    setContext,
    materialFile,
    setMaterialFile,
    diffDist,
    setDiffDist,
    allowedTypes,
    typeCounts,
    setTypeCounts,
    totalDiff,
    totalTypes,
    isDiffMatch,
    isTypeMatch,
    questionCount,
    canGenerate,
    generating,
    saving,
    draft,
    setDraft,
    fieldErrors,
    setFieldErrors,
    savedQuestionIds,
    rubricEditor,
    setRubricEditor,
    diagramEditorQuestionIndex,
    setDiagramEditorQuestionIndex,
    editingQuestion,
    setEditingQuestion,
    scoreForWeight,
    handleGenerate,
    handleCancelGenerate,
    updateDraftQuestion,
    finishQuestionEdit,
    openRubricEditor,
    updateRubricCriterion,
    saveRubricEditor,
    removeDraftQuestion,
    validateDraftQuestion,
    handleCreateExam,
  };
}
