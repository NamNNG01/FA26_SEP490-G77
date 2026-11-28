import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useToast } from "@/components/ui/ToastHost";
import { ROUTES } from "@/app/routes";
import {
  examService,
  type ExamConfig,
  type ExamGroup,
  type ExamMode,
  type ExamQuestion,
  type ExamStatus,
  type GenerationType,
  type QuestionOrder,
} from "@/services/exam.service";
import {
  questionService,
  type QuestionDetail,
  type QuestionListItem,
} from "@/services/question.service";
import type { QuestionGroup } from "@/services/questionGroup.service";
import {
  courseService,
  type CourseModuleResponse,
  type CourseSummaryItem,
} from "@/services/course.service";
import { isDraftValid, toCreateRequest, type QuestionDraft } from "@/features/question/model";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  buildExamOrderPayload,
  buildUnifiedItems,
  getNextTopOrder,
  reorderGroupQuestions,
  reorderUnifiedItems,
  type ImportedQuestionDraft,
  type UnifiedExamItem,
} from "../utils/examUnifiedOrder";

export type RemoveConfirmTarget =
  | { type: "question"; examQuestionId: number; title: string }
  | { type: "group"; examGroupId: number; title: string }
  | null;

interface UseExamFormOptions {
  formKind?: "QUIZ" | "ESSAY" | "DIAGRAM" | "CODE";
  mode?: "create" | "edit";
}

export function useExamForm({ formKind: propFormKind, mode: propMode }: UseExamFormOptions) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isEdit = propMode === "edit" || (Boolean(id) && id !== "new");
  const isEssayFromPath = location.pathname.includes("/essay");
  const isCodeFromPath = location.pathname.includes("/exams/code");
  const requestedFormKind =
    propFormKind || (isCodeFromPath ? "CODE" : isEssayFromPath ? "ESSAY" : "QUIZ");
  const formKind: "QUIZ" | "ESSAY" | "CODE" =
    requestedFormKind === "DIAGRAM" ? "ESSAY" : requestedFormKind;
  const isAssessment = formKind !== "QUIZ";
  const formLabel = formKind === "QUIZ" ? "Quiz" : formKind === "CODE" ? "Code" : "Essay";
  const examPathKind = formKind.toLowerCase();

  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [mode, setMode] = useState<ExamMode>("EXAM");
  const [generationType, setGenerationType] = useState<GenerationType>("STATIC");
  const [questionOrder, setQuestionOrder] = useState<QuestionOrder>("MANUAL");
  const [status, setStatus] = useState<ExamStatus>("DRAFT");
  const [orderSaving, setOrderSaving] = useState(false);

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const savedWeightsRef = useRef<Map<number, number>>(new Map());
  const [groups, setGroups] = useState<ExamGroup[]>([]);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importedQuestionDrafts, setImportedQuestionDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [importedQuestionsSubmitted, setImportedQuestionsSubmitted] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(() => new Set());
  const [configs, setConfigs] = useState<ExamConfig[]>([]);

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [rubricModalQuestion, setRubricModalQuestion] = useState<{
    id: number;
    content: string;
  } | null>(null);
  const [questionEditTarget, setQuestionEditTarget] = useState<ExamQuestion | null>(null);
  const [removeConfirmTarget, setRemoveConfirmTarget] = useState<RemoveConfirmTarget>(null);

  const [archiveCloneModalOpen, setArchiveCloneModalOpen] = useState(false);
  const [archiveCloning, setArchiveCloning] = useState(false);
  const [saveDescriptionOnly, setSaveDescriptionOnly] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const isPublished = status === "PUBLISHED";
  const isArchived = status === "ARCHIVED";
  const isReadOnly = isPublished || isArchived;
  const canManageExamQuestions = !isArchived;

  const allowedQuestionTypes =
    formKind === "QUIZ"
      ? ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "ORDERING"]
      : formKind === "CODE"
        ? ["CODE"]
        : ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"];

  const totalQuestionCount =
    questions.length +
    importedQuestionDrafts.length +
    configs.reduce((sum, config) => sum + config.numberOfQuestions, 0);
  const hasAddedQuestions = questions.length > 0 || importedQuestionDrafts.length > 0;
  const unifiedItems = buildUnifiedItems(questions, importedQuestionDrafts, groups);

  const totalWeight =
    generationType === "RANDOM"
      ? configs.reduce(
          (sum, config) => sum + config.numberOfQuestions * (config.weightEach ?? 1),
          0,
        )
      : questions.reduce((acc, q) => acc + (q.weight ?? q.points ?? 1), 0) +
        importedQuestionDrafts.reduce((sum, item) => sum + item.weight, 0);

  const scoreForWeight = (weight: number) =>
    totalWeight > 0 ? Number(((maxScore * weight) / totalWeight).toFixed(2)) : 0;
  const formatScore = (score: number) => Number(score.toFixed(2)).toString();
  const withoutRubricWarnings = (warnings: string[]) =>
    warnings.filter((warning) => !/\b(?:no|missing) rubrics?\b/i.test(warning));
  const reportExamError = (message: string, errTitle = "Exam update failed") =>
    toast.error(message, { title: errTitle, duration: null });

  useEffect(() => {
    courseService
      .getCourses()
      .then((res) => setCourses(res.content || []))
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
        .then((mods) => setModules(mods || []))
        .catch((err) => {
          setModules([]);
          toast.error(getApiErrorMessage(err, "Failed to load course modules."), {
            title: "Could not load course modules",
            duration: null,
          });
        });
    } else {
      setModules([]);
      setModuleId("");
    }
  }, [courseId, toast]);

  const loadExamDetail = async (examIdNum: number) => {
    setLoading(true);
    try {
      const data = await examService.getExamById(examIdNum);
      if (
        (data.examKind === "CODE") !== (formKind === "CODE") &&
        (data.examKind === "CODE" || data.examKind === "ESSAY")
      ) {
        navigate(`/manager/exams/${data.examKind.toLowerCase()}/${examIdNum}`, {
          replace: true,
        });
        return;
      }
      setTitle(data.title || "");
      setDescription(data.description || "");
      setCourseId(data.courseId ? String(data.courseId) : "");
      setModuleId(data.moduleId ? String(data.moduleId) : "");
      setDurationMinutes(data.durationMinutes || 60);
      setMaxScore(data.maxScore || 100);
      setMode(data.mode === "CONTEST" ? "CONTEST" : "EXAM");
      setGenerationType(
        data.generationType === "MIXED" ? "STATIC" : data.generationType || "STATIC",
      );
      setQuestionOrder(data.questionOrder || "RANDOM");
      setStatus(data.status || "DRAFT");
      setConfigs(data.generationType === "MIXED" ? [] : data.configs || []);
      setGroups(data.groups || []);
      const detailWarnings = withoutRubricWarnings(data.warnings || []);
      if (detailWarnings.length > 0) {
        toast.warning(detailWarnings.join(" "), { title: "Exam warnings", duration: null });
      }

      const loadedQuestions = [...(data.questions || [])];
      savedWeightsRef.current = new Map(
        loadedQuestions.map((q) => [q.examQuestionId, q.weight ?? q.points ?? 1]),
      );
      setQuestions(loadedQuestions);

      if (isAssessment) {
        const missingRubricQuestions = loadedQuestions.filter(
          (q) =>
            ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"].includes(q.questionType) &&
            q.hasRubric === undefined,
        );
        if (missingRubricQuestions.length > 0) {
          Promise.allSettled(
            missingRubricQuestions
              .slice(0, 5)
              .map((q) => questionService.getQuestionById(q.questionId)),
          ).then((results) => {
            setQuestions((prev) =>
              prev.map((pq) => {
                const foundRes = results.find(
                  (r) => r.status === "fulfilled" && r.value.questionId === pq.questionId,
                );
                if (foundRes && foundRes.status === "fulfilled") {
                  return { ...pq, hasRubric: !!foundRes.value.essayGradingRubric };
                }
                return pq;
              }),
            );
          });
        }
      }
      setIsDirty(false);
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number } };
      if (errorObj?.response?.status === 404) {
        toast.error("Exam not found. Returning to exam list.");
        navigate(ROUTES.managerExams);
      } else {
        reportExamError(
          getApiErrorMessage(err, "Failed to load exam details. Please try again."),
          "Could not load exam details",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isEdit && id) {
      const numId = Number(id);
      if (!isNaN(numId)) {
        loadExamDetail(numId);
      }
    }
  }, [id, isEdit, formKind]);

  const persistUnifiedOrder = async (
    nextItems: UnifiedExamItem[],
    nextQuestions: ExamQuestion[],
    nextGroups: ExamGroup[],
  ) => {
    if (!isEdit || !id) return;
    setOrderSaving(true);
    try {
      const payloadItems = buildExamOrderPayload(nextItems, nextQuestions);
      const updated = await examService.updateExamOrder(Number(id), { items: payloadItems });
      setQuestions(updated.questions || nextQuestions);
      setGroups(updated.groups || nextGroups);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update question order."));
      loadExamDetail(Number(id));
    } finally {
      setOrderSaving(false);
    }
  };

  const moveUnifiedItem = async (index: number, delta: -1 | 1) => {
    if (isReadOnly || orderSaving) return;
    const result = reorderUnifiedItems(
      unifiedItems,
      questions,
      groups,
      importedQuestionDrafts,
      index,
      delta,
    );
    if (!result) return;
    setQuestions(result.nextQuestions);
    setGroups(result.nextGroups);
    setImportedQuestionDrafts(result.nextImported);
    if (!isEdit) {
      setIsDirty(true);
    } else {
      await persistUnifiedOrder(result.reordered, result.nextQuestions, result.nextGroups);
    }
  };

  const moveGroupQuestion = async (groupId: number, childIndex: number, delta: -1 | 1) => {
    if (isReadOnly || orderSaving) return;
    const nextQuestions = reorderGroupQuestions(questions, groupId, childIndex, delta);
    if (!nextQuestions) return;
    setQuestions(nextQuestions);
    if (!isEdit) {
      setIsDirty(true);
    } else {
      await persistUnifiedOrder(unifiedItems, nextQuestions, groups);
    }
  };

  const handlePublishStatusChange = async (targetStatus: ExamStatus) => {
    if (!id) return;
    if (targetStatus === "PUBLISHED") {
      if (generationType === "STATIC" && totalQuestionCount === 0) {
        toast.error("Exam must have at least 1 question to be published.");
        return;
      }
      if (!title.trim() || !courseId) {
        toast.error("Exam must have title and course before publishing.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await examService.patchPublishExam(Number(id), targetStatus);
      setStatus(res.status);
      const publishWarnings = withoutRubricWarnings(res.warnings || []);
      if (publishWarnings.length > 0) {
        toast.warning(publishWarnings.join(" "), { title: `Status updated to ${targetStatus}` });
      } else {
        toast.success(`Exam status successfully updated to ${targetStatus}.`);
      }
      loadExamDetail(Number(id));
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (errorObj?.response?.status === 400) {
        toast.error(
          errorObj.response.data?.message ||
            "Exam cannot be published. Ensure questions are attached.",
        );
      } else {
        toast.error(getApiErrorMessage(err, "Failed to update exam publish status."));
      }
    } finally {
      setSaving(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const MSG01 = "This field is required.";

    if (!title.trim()) errors.title = MSG01;
    else if (title.length > 255) errors.title = "Title must be 255 characters or fewer.";

    if (!courseId) errors.courseId = MSG01;
    if (!moduleId) errors.moduleId = MSG01;

    if (durationMinutes < 1 || durationMinutes > 600) {
      errors.durationMinutes = "Duration must be between 1 and 600 minutes.";
    }

    if (
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      maxScore > 10000 ||
      (String(maxScore).split(".")[1]?.length ?? 0) > 2
    ) {
      errors.maxScore =
        "Max score must be greater than 0 and no more than 10,000, with up to 2 decimal places.";
    }

    if (
      questions.some((question) => {
        const weight = question.weight ?? question.points ?? 1;
        return (
          !Number.isFinite(weight) ||
          weight <= 0 ||
          weight > 1000 ||
          (String(weight).split(".")[1]?.length ?? 0) > 2
        );
      }) ||
      importedQuestionDrafts.some(
        ({ weight }) =>
          !Number.isFinite(weight) ||
          weight <= 0 ||
          weight > 1000 ||
          (String(weight).split(".")[1]?.length ?? 0) > 2,
      )
    ) {
      errors.questions =
        "Every question weight must be greater than 0, no more than 1,000, and have up to 2 decimal places.";
    }

    if (generationType === "RANDOM") {
      if (configs.length === 0) {
        errors.configs = "Random exam requires at least one question draw configuration rule.";
      }
      if (questions.length > 0 || groups.length > 0 || importedQuestionDrafts.length > 0) {
        errors.configs =
          "Random exams use draw rules only. Remove attached questions and groups first.";
      }
      if (
        configs.some((config) => {
          const weight = config.weightEach ?? 1;
          return (
            !Number.isFinite(weight) ||
            weight <= 0 ||
            weight > 1000 ||
            (String(weight).split(".")[1]?.length ?? 0) > 2
          );
        })
      ) {
        errors.configs =
          "Each random question weight must be greater than 0, no more than 1,000, and have up to 2 decimal places.";
      }
    } else if (configs.length > 0) {
      errors.configs = "Static exams use attached questions and groups, not draw rules.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveExam = async () => {
    if (!validateForm()) return;
    if (
      !isEdit &&
      importedQuestionDrafts.some(({ draft }) => !isDraftValid(draft) || draft.importIssue)
    ) {
      setImportedQuestionsSubmitted(true);
      reportExamError(
        "Review the imported questions and fix any validation errors before creating the exam.",
        "Review imported questions",
      );
      return;
    }
    setSaving(true);

    try {
      if (!isEdit) {
        const payloadQuestionIds = questions
          .filter((q) => !q.groupId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((q) => ({
            questionId: q.questionId,
            weight: q.weight ?? q.points ?? 1,
            orderIndex: q.orderIndex,
          }));
        const importedQuestions = importedQuestionDrafts.map(({ draft, weight, orderIndex }) => ({
          question: {
            ...toCreateRequest(draft, Number(courseId), moduleId ? Number(moduleId) : null),
            status: "ACTIVE" as const,
          },
          weight,
          orderIndex,
        }));
        const payloadGroupIds = [...groups]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((g) => ({
            groupId: g.groupId,
            questions: questions
              .filter((q) => q.groupId === g.groupId)
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((q) => ({
                questionId: q.questionId,
                weight: q.weight ?? q.points ?? 1,
              })),
            orderIndex: g.orderIndex,
          }));

        const created = await examService.createExam({
          title: title.trim(),
          description: description.trim() || undefined,
          courseId: courseId ? Number(courseId) : undefined,
          moduleId: moduleId ? Number(moduleId) : undefined,
          durationMinutes,
          maxScore,
          mode,
          generationType,
          questionOrder,
          questionIds: payloadQuestionIds,
          importedQuestions,
          groupIds: payloadGroupIds,
          configs:
            generationType === "RANDOM"
              ? configs.map((config) => ({
                  ...config,
                  moduleId: moduleId ? Number(moduleId) : undefined,
                }))
              : [],
        });

        toast.success("Exam successfully created.");
        const targetRoute =
          formKind === "QUIZ"
            ? `/manager/exams/quiz/${created.examId}`
            : `/manager/exams/${examPathKind}/${created.examId}`;
        navigate(targetRoute, { replace: true });
      } else {
        await examService.updateExam(Number(id), {
          title: title.trim(),
          description: description.trim(),
          courseId: courseId ? Number(courseId) : undefined,
          moduleId: moduleId ? Number(moduleId) : undefined,
          durationMinutes,
          mode,
          generationType,
          questionOrder,
          maxScore,
          configs:
            generationType === "RANDOM"
              ? configs.map((config) => ({
                  ...config,
                  moduleId: moduleId ? Number(moduleId) : undefined,
                }))
              : [],
        });

        toast.success("Exam configuration updated successfully.");
        setIsDirty(false);
        loadExamDetail(Number(id));
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (isEdit && errorObj?.response?.status === 409) {
        setArchiveCloneModalOpen(true);
      } else if (errorObj?.response?.status === 400) {
        reportExamError(
          getApiErrorMessage(err, "Validation error while saving exam."),
          "Could not save exam",
        );
      } else {
        reportExamError(getApiErrorMessage(err, "Failed to save exam."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveAndClone = async () => {
    if (!id) return;
    setArchiveCloning(true);
    try {
      await examService.patchPublishExam(Number(id), "ARCHIVED");
      const cloned = await examService.createExam({
        title: `${title} (copy)`,
        description,
        courseId: courseId ? Number(courseId) : undefined,
        moduleId: moduleId ? Number(moduleId) : undefined,
        durationMinutes,
        mode,
        generationType,
        questionOrder,
        maxScore,
        questionIds: questions
          .filter((q) => !q.groupId)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((q) => ({
            questionId: q.questionId,
            weight: q.weight ?? q.points ?? 1,
            orderIndex: q.orderIndex,
          })),
        groupIds: [...groups]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((g) => ({
            groupId: g.groupId,
            questions: questions
              .filter((q) => q.groupId === g.groupId)
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((q) => ({
                questionId: q.questionId,
                weight: q.weight ?? q.points ?? 1,
              })),
            orderIndex: g.orderIndex,
          })),
        configs: configs.map((config) => ({
          ...config,
          moduleId: moduleId ? Number(moduleId) : undefined,
        })),
      });

      toast.success("Previous exam archived and new editable copy created.");
      setArchiveCloneModalOpen(false);
      const targetRoute =
        formKind === "QUIZ"
          ? `/manager/exams/quiz/${cloned.examId}`
          : `/manager/exams/${examPathKind}/${cloned.examId}`;
      navigate(targetRoute, { replace: true });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to execute Archive and Clone workflow."));
    } finally {
      setArchiveCloning(false);
    }
  };

  const handleSaveDescriptionOnly = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await examService.updateExam(Number(id), { description });
      toast.success("Exam description updated.");
      setArchiveCloneModalOpen(false);
      setSaveDescriptionOnly(false);
      loadExamDetail(Number(id));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update description."));
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestionsFromBank = async (
    items: { question: QuestionListItem; weight: number }[],
  ) => {
    if (items.length === 0) return;

    if (!isEdit) {
      const startOrder = getNextTopOrder(questions, importedQuestionDrafts, groups);
      const added: ExamQuestion[] = items.map((item, idx) => ({
        examQuestionId: Date.now() + idx,
        questionId: item.question.questionId,
        content: item.question.content,
        questionType: item.question.questionType,
        weight: item.weight,
        orderIndex: startOrder + idx,
        hasRubric: false,
      }));
      setQuestions((prev) => [...prev, ...added]);
      setIsDirty(true);
      setBankModalOpen(false);
      toast.success(`Added ${items.length} questions to draft exam.`);
    } else {
      setBankModalOpen(false);
      setLoading(true);
      let successCount = 0;
      const failures: string[] = [];
      let nextOrder = getNextTopOrder(questions, importedQuestionDrafts, groups);

      for (const item of items) {
        try {
          await examService.addQuestionToExam(Number(id), {
            questionId: item.question.questionId,
            weight: item.weight,
            orderIndex: nextOrder++,
          });
          successCount++;
        } catch (err: unknown) {
          const errObj = err as { response?: { status?: number; data?: { message?: string } } };
          if (errObj?.response?.status === 409) {
            failures.push(`Question #${item.question.questionId} already in exam.`);
          } else {
            failures.push(
              `Question #${item.question.questionId}: ${getApiErrorMessage(err, "Request failed.")}`,
            );
          }
        }
      }

      if (failures.length > 0) {
        toast.error(
          successCount > 0
            ? `Attached ${successCount} question(s); some questions failed: ${failures.join(" ")}`
            : failures.join(" "),
        );
      } else if (successCount > 0) {
        toast.success(`Successfully attached ${successCount} question(s).`);
      }
      loadExamDetail(Number(id));
    }
  };

  const handleImportedDrafts = (drafts: QuestionDraft[]) => {
    const supported = drafts.filter((draft) => allowedQuestionTypes.includes(draft.type));
    const unsupportedCount = drafts.length - supported.length;
    const remaining = Math.max(0, 50 - importedQuestionDrafts.length);
    const startOrder = getNextTopOrder(questions, importedQuestionDrafts, groups);
    const accepted = supported.slice(0, remaining).map((draft, idx) => ({
      draft,
      weight: 1,
      orderIndex: startOrder + idx,
    }));

    setImportPreviewOpen(false);
    if (unsupportedCount > 0) {
      toast.warning(
        `${unsupportedCount} imported question(s) did not match this exam’s question types and were skipped.`,
      );
    }
    if (accepted.length < supported.length) {
      toast.warning(
        `Only ${accepted.length} imported question(s) were added. Q-03 supports up to 50 questions per batch.`,
      );
    }
    if (accepted.length === 0) return;

    setImportedQuestionDrafts((prev) => [...prev, ...accepted]);
    setImportedQuestionsSubmitted(false);
    setIsDirty(true);
    toast.success(
      `Added ${accepted.length} question(s) from the import preview. They will be saved with the exam.`,
    );
  };

  const updateImportedDraft = (key: string, draft: QuestionDraft) => {
    setImportedQuestionDrafts((prev) =>
      prev.map((item) => (item.draft.key === key ? { ...item, draft } : item)),
    );
    setIsDirty(true);
  };

  const removeImportedDraft = (key: string) => {
    setImportedQuestionDrafts((prev) => prev.filter((item) => item.draft.key !== key));
    setIsDirty(true);
  };

  const updateImportedWeight = (key: string, weight: number) => {
    setImportedQuestionDrafts((prev) =>
      prev.map((current) => (current.draft.key === key ? { ...current, weight } : current)),
    );
    setIsDirty(true);
  };

  const handleRemoveQuestion = async (examQuestionId: number) => {
    if (!isEdit) {
      setQuestions((prev) => prev.filter((q) => q.examQuestionId !== examQuestionId));
      setIsDirty(true);
      setRemoveConfirmTarget(null);
    } else {
      setLoading(true);
      try {
        await examService.removeQuestionFromExam(Number(id), examQuestionId);
        toast.success("Question removed from exam.");
        setRemoveConfirmTarget(null);
        loadExamDetail(Number(id));
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, "Failed to remove question."));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoveAllQuestions = async () => {
    if (!isEdit) {
      setQuestions([]);
      setGroups([]);
      setImportedQuestionDrafts([]);
      setIsDirty(true);
      toast.success("All questions removed from the draft exam.");
      return;
    }

    if (!id || (questions.length === 0 && groups.length === 0)) return;
    setLoading(true);
    try {
      await examService.removeAllQuestionsFromExam(Number(id));
      toast.success("All questions removed from exam.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove the questions."));
    } finally {
      setLoading(false);
    }
    loadExamDetail(Number(id));
  };

  const handleQuestionWeightChange = (examQuestionId: number, weight: number) => {
    setQuestions((prev) =>
      prev.map((item) =>
        item.examQuestionId === examQuestionId ? { ...item, weight, points: undefined } : item,
      ),
    );
    if (!isEdit) {
      setIsDirty(true);
    }
  };

  const handleQuestionWeightBlur = async (
    question: ExamQuestion,
    weight = question.weight ?? question.points ?? 1,
  ) => {
    if (!isEdit || !question.examQuestionId) return;
    const savedWeight = savedWeightsRef.current.get(question.examQuestionId);
    if (savedWeight !== undefined && weight === savedWeight) return;
    if (
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 1000 ||
      Math.round(weight * 100) !== weight * 100
    ) {
      toast.error(
        "Question weight must be greater than 0, no more than 1,000, and have up to 2 decimal places.",
      );
      return;
    }
    try {
      const updated = await examService.updateQuestionWeight(
        Number(id),
        question.examQuestionId,
        weight,
      );
      savedWeightsRef.current.set(updated.examQuestionId, updated.weight ?? weight);
      setQuestions((prev) =>
        prev.map((item) =>
          item.examQuestionId === updated.examQuestionId
            ? { ...item, weight: updated.weight, points: undefined }
            : item,
        ),
      );
      toast.success("Question weight updated.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update question weight."));
      loadExamDetail(Number(id));
    }
  };

  const handleAddGroup = async (group: QuestionGroup) => {
    setGroupModalOpen(false);
    setLoading(true);
    try {
      const groupQuestions = await questionService.getQuestions({
        groupId: group.groupId,
        status: "ACTIVE",
        page: 0,
        size: 100,
      });
      const attachedQuestions = groupQuestions.content.map((question, idx) => ({
        examQuestionId: Date.now() + idx,
        questionId: question.questionId,
        content: question.content,
        questionType: question.questionType,
        weight: 1,
        orderIndex: idx,
        groupId: group.groupId,
        hasRubric: false,
      }));
      const topOrder = getNextTopOrder(questions, importedQuestionDrafts, groups);

      if (!isEdit) {
        const newExamGroupId = Date.now() + 99999;
        setQuestions((prev) => [...prev, ...attachedQuestions]);
        setGroups((prev) => [
          ...prev,
          {
            examGroupId: newExamGroupId,
            groupId: group.groupId,
            title: group.title ?? "",
            orderIndex: topOrder,
            passageText: group.passageText ?? undefined,
            questionCount: attachedQuestions.length,
          },
        ]);
        setExpandedGroupIds((curr) => new Set([...curr, newExamGroupId]));
        setIsDirty(true);
        toast.success(
          "Reading passage group added to draft. Set weights or arrange question order in the unified list below.",
        );
      } else {
        const createdGroup = await examService.addGroupToExam(Number(id), {
          groupId: group.groupId,
          orderIndex: topOrder,
          questions: groupQuestions.content.map((question) => ({
            questionId: question.questionId,
            weight: 1,
          })),
        });
        setExpandedGroupIds((curr) => new Set([...curr, createdGroup.examGroupId]));
        toast.success("Reading passage group attached to exam.");
        loadExamDetail(Number(id));
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (errorObj?.response?.status === 409) {
        toast.error("This question group is already attached to this exam.");
      } else {
        toast.error(getApiErrorMessage(err, "Failed to attach question group."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroup = async (examGroupId: number) => {
    if (!isEdit) {
      const groupId = groups.find((g) => g.examGroupId === examGroupId)?.groupId;
      setGroups((prev) => prev.filter((g) => g.examGroupId !== examGroupId));
      if (groupId) setQuestions((prev) => prev.filter((q) => q.groupId !== groupId));
      setIsDirty(true);
      setRemoveConfirmTarget(null);
    } else {
      setLoading(true);
      try {
        await examService.removeGroupFromExam(Number(id), examGroupId);
        toast.success("Question group removed from exam.");
        setRemoveConfirmTarget(null);
        loadExamDetail(Number(id));
      } catch (err: unknown) {
        toast.error(getApiErrorMessage(err, "Failed to remove group."));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleQuestionUpdated = (updated: QuestionDetail) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.questionId === updated.questionId
          ? { ...q, content: updated.content, questionType: updated.questionType }
          : q,
      ),
    );
  };

  const toggleGroupExpanded = (examGroupId: number) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(examGroupId)) next.delete(examGroupId);
      else next.add(examGroupId);
      return next;
    });
  };

  const handleCancelClick = () => {
    if (isDirty) setLeaveConfirmOpen(true);
    else navigate(ROUTES.managerExams);
  };

  return {
    id,
    navigate,
    isEdit,
    formKind,
    isAssessment,
    formLabel,
    examPathKind,
    activeTab,
    setActiveTab,
    courses,
    modules,
    loading,
    saving,
    isDirty,
    setIsDirty,
    fieldErrors,
    setFieldErrors,
    title,
    setTitle,
    description,
    setDescription,
    courseId,
    setCourseId,
    moduleId,
    setModuleId,
    setModules,
    durationMinutes,
    setDurationMinutes,
    maxScore,
    setMaxScore,
    mode,
    setMode,
    generationType,
    questionOrder,
    setQuestionOrder,
    status,
    orderSaving,
    questions,
    setQuestions,
    groups,
    importedQuestionDrafts,
    importedQuestionsSubmitted,
    expandedGroupIds,
    toggleGroupExpanded,
    importPreviewOpen,
    setImportPreviewOpen,
    bankModalOpen,
    setBankModalOpen,
    groupModalOpen,
    setGroupModalOpen,
    importModalOpen,
    setImportModalOpen,
    rubricModalQuestion,
    setRubricModalQuestion,
    questionEditTarget,
    setQuestionEditTarget,
    removeConfirmTarget,
    setRemoveConfirmTarget,
    archiveCloneModalOpen,
    setArchiveCloneModalOpen,
    archiveCloning,
    saveDescriptionOnly,
    setSaveDescriptionOnly,
    leaveConfirmOpen,
    setLeaveConfirmOpen,
    isPublished,
    isArchived,
    isReadOnly,
    canManageExamQuestions,
    allowedQuestionTypes,
    totalQuestionCount,
    hasAddedQuestions,
    unifiedItems,
    totalWeight,
    scoreForWeight,
    formatScore,
    existingQuestionIds: new Set(questions.map((q) => q.questionId)),
    existingGroupIds: new Set(groups.map((g) => g.groupId)),
    loadExamDetail,
    moveUnifiedItem,
    moveGroupQuestion,
    handlePublishStatusChange,
    handleSaveExam,
    handleArchiveAndClone,
    handleSaveDescriptionOnly,
    handleAddQuestionsFromBank,
    handleImportedDrafts,
    updateImportedDraft,
    removeImportedDraft,
    updateImportedWeight,
    handleRemoveQuestion,
    handleRemoveAllQuestions,
    handleQuestionWeightChange,
    handleQuestionWeightBlur,
    handleAddGroup,
    handleRemoveGroup,
    handleQuestionUpdated,
    handleCancelClick,
  };
}
