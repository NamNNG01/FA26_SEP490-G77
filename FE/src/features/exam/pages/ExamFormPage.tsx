import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/assets/icons";
import { useToast } from "@/components/ui/ToastHost";
import { ROUTES } from "@/app/routes";
import {
  examService,
  type ExamDetail,
  type ExamConfig,
  type ExamQuestion,
  type ExamGroup,
  type GenerationType,
  type ExamStatus,
  type BankQuestionItem,
  type QuestionGroupItem,
} from "@/services/exam.service";
import {
  courseService,
  type CourseSummaryItem,
  type CourseModuleResponse,
} from "@/services/course.service";
import { QuestionBankSelectModal } from "../components/QuestionBankSelectModal";
import { QuestionGroupModal } from "../components/QuestionGroupModal";
import { RubricDetailModal } from "../components/RubricDetailModal";
import { ImportQuestionsModal } from "../components/ImportQuestionsModal";
import { ImportPdfModal } from "@/features/question/components/ImportPdfModal";
import { QuestionForm as QuestionFormBlock } from "@/features/question/components/QuestionForm";
import { ExamAiGenerateTab } from "../components/ExamAiGenerateTab";
import { DiagramAnswer } from "@/features/question/components/DiagramAnswer";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import {
  fromDetail,
  isDraftValid,
  toCreateRequest,
  toUpdateRequest,
  validateDraft,
  type EditableQuestionType,
  type QuestionDraft,
} from "@/features/question/model";
import {
  questionService,
  type QuestionDetail,
} from "@/services/question.service";
import { getApiErrorMessage } from "@/utils/apiError";

export function ExamFormPage({
  formKind: propFormKind,
  mode: propMode,
}: {
  formKind?: "QUIZ" | "ESSAY" | "DIAGRAM";
  mode?: "create" | "edit";
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const isEdit = propMode === "edit" || (Boolean(id) && id !== "new");
  const isEssayFromPath = location.pathname.includes("/essay");
  const requestedFormKind =
    propFormKind || (isEssayFromPath ? "ESSAY" : "QUIZ");
  const formKind =
    requestedFormKind === "DIAGRAM" ? "ESSAY" : requestedFormKind;
  const isAssessment = formKind !== "QUIZ";
  const formLabel = formKind === "QUIZ" ? "Quiz" : "Essay";
  const examPathKind = formKind === "QUIZ" ? "quiz" : "essay";
  const isEssayQuestion = (question: ExamQuestion) =>
    ["ESSAY", "DIAGRAM"].includes(question.questionType);

  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [courseLoadError, setCourseLoadError] = useState("");
  const [moduleLoadError, setModuleLoadError] = useState("");
  const [warningsList, setWarningsList] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [maxScore, setMaxScore] = useState<number>(100);
  const [isPractice, setIsPractice] = useState<boolean>(false);
  const [generationType, setGenerationType] =
    useState<GenerationType>("STATIC");
  const [status, setStatus] = useState<ExamStatus>("DRAFT");

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [groups, setGroups] = useState<ExamGroup[]>([]);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importedQuestionDrafts, setImportedQuestionDrafts] = useState<
    { draft: QuestionDraft; weight: number }[]
  >([]);
  const [importedQuestionIds, setImportedQuestionIds] = useState<
    number[] | null
  >(null);
  const [importedQuestionsSubmitted, setImportedQuestionsSubmitted] =
    useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [configs, setConfigs] = useState<ExamConfig[]>([]);

  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [rubricModalQuestion, setRubricModalQuestion] = useState<{
    id: number;
    content: string;
  } | null>(null);
  const [questionEditTarget, setQuestionEditTarget] =
    useState<ExamQuestion | null>(null);
  const [questionEditDraft, setQuestionEditDraft] =
    useState<QuestionDraft | null>(null);
  const [questionEditLoading, setQuestionEditLoading] = useState(false);
  const [questionEditSaving, setQuestionEditSaving] = useState(false);
  const [questionEditSubmitted, setQuestionEditSubmitted] = useState(false);
  const [questionEditError, setQuestionEditError] = useState("");

  const [removeConfirmTarget, setRemoveConfirmTarget] = useState<
    | { type: "question"; examQuestionId: number; title: string }
    | { type: "group"; examGroupId: number; title: string }
    | null
  >(null);

  const [archiveCloneModalOpen, setArchiveCloneModalOpen] = useState(false);
  const [archiveCloning, setArchiveCloning] = useState(false);
  const [saveDescriptionOnly, setSaveDescriptionOnly] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const isPublished = status === "PUBLISHED";
  const isArchived = status === "ARCHIVED";
  const isReadOnly = isPublished || isArchived;

  const allowedQuestionTypes =
    formKind === "QUIZ"
      ? [
          "SINGLE_CHOICE",
          "MULTIPLE_CHOICE",
          "TRUE_FALSE",
          "FILL_BLANK",
          "MATCHING",
          "ORDERING",
        ]
      : ["ESSAY", "DIAGRAM"];

  useEffect(() => {
    if (!questionEditTarget) {
      setQuestionEditDraft(null);
      return;
    }
    let active = true;
    setQuestionEditDraft(null);
    setQuestionEditLoading(true);
    setQuestionEditError("");
    setQuestionEditSubmitted(false);
    questionService
      .getQuestionById(questionEditTarget.questionId)
      .then((detail) => {
        if (active) setQuestionEditDraft(fromDetail(detail));
      })
      .catch((err) => {
        if (active)
          setQuestionEditError(
            getApiErrorMessage(err, "Could not load this question."),
          );
      })
      .finally(() => {
        if (active) setQuestionEditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [questionEditTarget]);

  const handleSaveQuestionEdit = async () => {
    if (!questionEditTarget || !questionEditDraft || questionEditSaving) return;
    setQuestionEditSubmitted(true);
    setQuestionEditError("");
    if (!isDraftValid(questionEditDraft)) return;
    setQuestionEditSaving(true);
    try {
      const detail = await questionService.getQuestionById(
        questionEditTarget.questionId,
      );
      const updated = await questionService.updateQuestion(
        questionEditTarget.questionId,
        toUpdateRequest(
          { ...questionEditDraft, lockVersion: detail.lockVersion },
          detail.moduleId,
          { status: detail.status },
        ),
      );
      setQuestions((prev) =>
        prev.map((q) =>
          q.questionId === updated.questionId
            ? {
                ...q,
                content: updated.content,
                questionType: updated.questionType,
              }
            : q,
        ),
      );
      toast.success("Question updated.");
      setQuestionEditTarget(null);
      setQuestionEditSubmitted(false);
    } catch (err) {
      setQuestionEditError(
        getApiErrorMessage(err, "Could not save this question."),
      );
    } finally {
      setQuestionEditSaving(false);
    }
  };

  const totalQuestionCount =
    questions.length +
    importedQuestionDrafts.length +
    configs.reduce((sum, config) => sum + config.numberOfQuestions, 0);
  const standaloneQuestions = questions.filter((question) => !question.groupId);
  const totalWeight =
    generationType === "RANDOM"
      ? configs.reduce(
          (sum, config) =>
            sum + config.numberOfQuestions * (config.weightEach ?? 1),
          0,
        )
      : questions.reduce((acc, q) => acc + (q.weight ?? q.points ?? 1), 0) +
        importedQuestionDrafts.reduce((sum, item) => sum + item.weight, 0);
  const scoreForWeight = (weight: number) =>
    totalWeight > 0
      ? Number(((maxScore * weight) / totalWeight).toFixed(2))
      : 0;
  const formatScore = (score: number) => Number(score.toFixed(2)).toString();
  const withoutRubricWarnings = (warnings: string[]) =>
    warnings.filter((warning) => !/\b(?:no|missing) rubrics?\b/i.test(warning));

  useEffect(() => {
    courseService
      .getCourses()
      .then((res) => {
        setCourses(res.content || []);
        setCourseLoadError("");
      })
      .catch((err) => {
        setCourseLoadError(getApiErrorMessage(err, "Failed to load courses."));
      });
  }, []);

  useEffect(() => {
    if (courseId) {
      courseService
        .getCourseModules(courseId)
        .then((mods) => {
          setModules(mods || []);
          setModuleLoadError("");
        })
        .catch((err) => {
          setModules([]);
          setModuleLoadError(
            getApiErrorMessage(err, "Failed to load course modules."),
          );
        });
    } else {
      setModules([]);
      setModuleLoadError("");
      setModuleId("");
    }
  }, [courseId]);

  const loadExamDetail = async (examIdNum: number) => {
    setLoading(true);
    setErrorBanner("");
    try {
      const data = await examService.getExamById(examIdNum);
      setTitle(data.title || "");
      setDescription(data.description || "");
      setCourseId(data.courseId ? String(data.courseId) : "");
      setModuleId(data.moduleId ? String(data.moduleId) : "");
      setDurationMinutes(data.durationMinutes || 60);
      setMaxScore(data.maxScore || 100);
      setIsPractice(!!data.isPractice);
      setGenerationType(
        data.generationType === "MIXED"
          ? "STATIC"
          : data.generationType || "STATIC",
      );
      setStatus(data.status || "DRAFT");
      setConfigs(data.generationType === "MIXED" ? [] : data.configs || []);
      setGroups(data.groups || []);
      setWarningsList(withoutRubricWarnings(data.warnings || []));

      const loadedQuestions = [...(data.questions || [])];
      setQuestions(loadedQuestions);

      if (isAssessment) {
        const missingRubricQuestions = loadedQuestions.filter(
          (q) =>
            isAssessment &&
            ["ESSAY", "DIAGRAM"].includes(q.questionType) &&
            q.hasRubric === undefined,
        );
        if (missingRubricQuestions.length > 0) {
          Promise.allSettled(
            missingRubricQuestions
              .slice(0, 5)
              .map((q) => examService.getQuestionById(q.questionId)),
          ).then((results) => {
            setQuestions((prev) =>
              prev.map((pq) => {
                const foundRes = results.find(
                  (r) =>
                    r.status === "fulfilled" &&
                    r.value.questionId === pq.questionId,
                );
                if (foundRes && foundRes.status === "fulfilled") {
                  return {
                    ...pq,
                    hasRubric: !!foundRes.value.essayGradingRubric,
                  };
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
        setErrorBanner(
          getApiErrorMessage(
            err,
            "Failed to load exam details. Please try again.",
          ),
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
  }, [id, isEdit]);

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
    setErrorBanner("");
    try {
      const res = await examService.patchPublishExam(Number(id), targetStatus);
      setStatus(res.status);
      const publishWarnings = withoutRubricWarnings(res.warnings || []);
      if (publishWarnings.length > 0) {
        setWarningsList(publishWarnings);
        toast.warning(`Status updated to ${targetStatus} with warnings.`);
      } else {
        setWarningsList([]);
        toast.success(`Exam status successfully updated to ${targetStatus}.`);
      }
      loadExamDetail(Number(id));
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      if (errorObj?.response?.status === 400) {
        toast.error(
          errorObj.response.data?.message ||
            "Exam cannot be published. Ensure questions are attached.",
        );
      } else {
        toast.error(
          getApiErrorMessage(err, "Failed to update exam publish status."),
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const MSG01 = "This field is required.";

    if (!title.trim()) {
      errors.title = MSG01;
    } else if (title.length > 255) {
      errors.title = "Title must be 255 characters or fewer.";
    }

    if (!courseId) errors.courseId = MSG01;
    if (!moduleId) errors.moduleId = "Select a module.";

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
        errors.configs =
          "Random exam requires at least one question draw configuration rule.";
      }
      if (
        questions.length > 0 ||
        groups.length > 0 ||
        importedQuestionDrafts.length > 0
      ) {
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
      errors.configs =
        "Static exams use attached questions and groups, not draw rules.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveExam = async () => {
    if (!validateForm()) return;
    if (
      !isEdit &&
      importedQuestionDrafts.some(
        ({ draft }) => !isDraftValid(draft) || draft.importIssue,
      )
    ) {
      setImportedQuestionsSubmitted(true);
      setErrorBanner(
        "Review the imported questions and fix any validation errors before creating the exam.",
      );
      return;
    }
    setSaving(true);
    setErrorBanner("");
    let savedImportIds = importedQuestionIds;

    try {
      if (!isEdit) {
        if (importedQuestionDrafts.length > 0 && !savedImportIds) {
          const savedQuestions = await questionService.createQuestionsBatch(
            Number(courseId),
            moduleId ? Number(moduleId) : null,
            importedQuestionDrafts.map(({ draft }) => ({
              ...toCreateRequest(
                draft,
                Number(courseId),
                moduleId ? Number(moduleId) : null,
              ),
              status: "ACTIVE",
            })),
          );
          savedImportIds = savedQuestions.map(
            (question) => question.questionId,
          );
          setImportedQuestionIds(savedImportIds);
        }

        const payloadQuestionIds = questions
          .filter((q) => !q.groupId)
          .map((q, idx) => ({
            questionId: q.questionId,
            weight: q.weight ?? q.points ?? 1,
            orderIndex: idx,
          }));
        const importedQuestionLinks = (savedImportIds ?? []).map(
          (questionId, idx) => ({
            questionId,
            weight: importedQuestionDrafts[idx]?.weight ?? 1,
            orderIndex: payloadQuestionIds.length + idx,
          }),
        );

        const payloadGroupIds = groups.map((g, idx) => ({
          groupId: g.groupId,
          questions: questions
            .filter((q) => q.groupId === g.groupId)
            .map((q) => ({
              questionId: q.questionId,
              weight: q.weight ?? q.points ?? 1,
            })),
          orderIndex: idx,
        }));

        const created = await examService.createExam({
          title: title.trim(),
          description: description.trim() || undefined,
          courseId: courseId ? Number(courseId) : undefined,
          moduleId: moduleId ? Number(moduleId) : undefined,
          durationMinutes,
          maxScore,
          isPractice,
          generationType,
          questionIds: [...payloadQuestionIds, ...importedQuestionLinks],
          groupIds: payloadGroupIds,
          configs: generationType === "STATIC" ? [] : configs,
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
          isPractice,
          generationType,
          maxScore,
          configs: generationType === "STATIC" ? [] : configs,
        });

        toast.success("Exam configuration updated successfully.");
        setIsDirty(false);
        loadExamDetail(Number(id));
      }
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      // A new exam can't have attempts; create-time 409s are duplicate questions/groups.
      if (isEdit && errorObj?.response?.status === 409) {
        setArchiveCloneModalOpen(true);
      } else if (!isEdit && savedImportIds?.length) {
        setErrorBanner(
          "Questions were saved to the Question Bank, but the exam could not be created. Retry to create the exam without duplicating those questions.",
        );
      } else if (errorObj?.response?.status === 400) {
        setErrorBanner(
          getApiErrorMessage(err, "Validation error while saving exam."),
        );
      } else {
        setErrorBanner(getApiErrorMessage(err, "Failed to save exam."));
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
        isPractice,
        generationType,
        maxScore,
        questionIds: questions
          .filter((q) => !q.groupId)
          .map((q, idx) => ({
            questionId: q.questionId,
            weight: q.weight ?? q.points ?? 1,
            orderIndex: idx,
          })),
        groupIds: groups.map((g, idx) => ({
          groupId: g.groupId,
          questions: questions
            .filter((q) => q.groupId === g.groupId)
            .map((q) => ({
              questionId: q.questionId,
              weight: q.weight ?? q.points ?? 1,
            })),
          orderIndex: idx,
        })),
        configs,
      });

      toast.success("Previous exam archived and new editable copy created.");
      setArchiveCloneModalOpen(false);
      const targetRoute =
        formKind === "QUIZ"
          ? `/manager/exams/quiz/${cloned.examId}`
          : `/manager/exams/${examPathKind}/${cloned.examId}`;
      navigate(targetRoute, { replace: true });
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          "Failed to execute Archive and Clone workflow.",
        ),
      );
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
    items: { question: BankQuestionItem; weight: number }[],
  ) => {
    if (items.length === 0) return;

    if (!isEdit) {
      const added: ExamQuestion[] = items.map((item, idx) => ({
        examQuestionId: Date.now() + idx,
        questionId: item.question.questionId,
        content: item.question.content,
        questionType: item.question.questionType,
        weight: item.weight,
        orderIndex: questions.length + idx,
        hasRubric: !!item.question.essayGradingRubric,
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

      for (const item of items) {
        try {
          await examService.addQuestionToExam(Number(id), {
            questionId: item.question.questionId,
            weight: item.weight,
          });
          successCount++;
        } catch (err: unknown) {
          const errObj = err as {
            response?: { status?: number; data?: { message?: string } };
          };
          if (errObj?.response?.status === 409) {
            failures.push(
              `Question #${item.question.questionId} already in exam.`,
            );
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
    const supported = drafts.filter((draft) =>
      allowedQuestionTypes.includes(draft.type),
    );
    const unsupportedCount = drafts.length - supported.length;
    const remaining = Math.max(0, 50 - importedQuestionDrafts.length);
    const accepted = supported
      .slice(0, remaining)
      .map((draft) => ({ draft, weight: 1 }));

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
    setImportedQuestionDrafts((prev) =>
      prev.filter((item) => item.draft.key !== key),
    );
    setIsDirty(true);
  };

  const handleRemoveQuestion = async (examQuestionId: number) => {
    if (!isEdit) {
      setQuestions((prev) =>
        prev.filter((q) => q.examQuestionId !== examQuestionId),
      );
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
        const errorObj = err as { response?: { status?: number } };
        if (errorObj?.response?.status === 409) {
          toast.error(
            "Cannot remove questions from a published exam. Please unpublish first.",
          );
        } else {
          toast.error(getApiErrorMessage(err, "Failed to remove question."));
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleQuestionWeightBlur = async (
    question: ExamQuestion,
    weight = question.weight ?? question.points ?? 1,
  ) => {
    const currentWeight = question.weight ?? question.points ?? 1;
    if (weight === currentWeight) return;
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
    if (!isEdit || !question.examQuestionId) return;
    try {
      const updated = await examService.updateQuestionWeight(
        Number(id),
        question.examQuestionId,
        weight,
      );
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

  const handleAddGroup = async (group: QuestionGroupItem) => {
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
        orderIndex: questions.length + idx,
        groupId: group.groupId,
        hasRubric: false,
      }));

      if (!isEdit) {
        setQuestions((prev) => [...prev, ...attachedQuestions]);
        setGroups((prev) => [
          ...prev,
          {
            examGroupId: Date.now(),
            groupId: group.groupId,
            title: group.title,
            orderIndex: prev.length,
            passageText: group.passageText,
            questionCount: attachedQuestions.length,
          },
        ]);
        setIsDirty(true);
        toast.success(
          "Reading passage group added to draft. Set each question's weight in the question list.",
        );
      } else {
        await examService.addGroupToExam(Number(id), {
          groupId: group.groupId,
          questions: groupQuestions.content.map((question) => ({
            questionId: question.questionId,
            weight: 1,
          })),
        });
        toast.success("Reading passage group attached to exam.");
        loadExamDetail(Number(id));
      }
    } catch (err: unknown) {
      const errorObj = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      if (errorObj?.response?.status === 409) {
        toast.error("This question group is already attached to this exam.");
      } else {
        toast.error(
          getApiErrorMessage(err, "Failed to attach question group."),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroup = async (examGroupId: number) => {
    if (!isEdit) {
      const groupId = groups.find(
        (g) => g.examGroupId === examGroupId,
      )?.groupId;
      setGroups((prev) => prev.filter((g) => g.examGroupId !== examGroupId));
      if (groupId)
        setQuestions((prev) => prev.filter((q) => q.groupId !== groupId));
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
        const errorObj = err as { response?: { status?: number } };
        if (errorObj?.response?.status === 409) {
          toast.error(
            "Cannot remove groups from a published exam. Unpublish first.",
          );
        } else {
          toast.error(getApiErrorMessage(err, "Failed to remove group."));
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddConfigRow = () => {
    setConfigs((prev) => [
      ...prev,
      {
        questionType: allowedQuestionTypes[0],
        numberOfQuestions: 5,
        moduleId: moduleId ? Number(moduleId) : undefined,
        difficulty: "MEDIUM",
        weightEach: 1,
      },
    ]);
    setIsDirty(true);
  };

  const handleRemoveConfigRow = (index: number) => {
    setConfigs((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleConfigChange = (
    index: number,
    field: keyof ExamConfig,
    val: unknown,
  ) => {
    setConfigs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
    setIsDirty(true);
  };

  const handleCancelClick = () => {
    if (isDirty) {
      setLeaveConfirmOpen(true);
    } else {
      navigate(ROUTES.managerExams);
    }
  };

  const existingQuestionIds = new Set(questions.map((q) => q.questionId));
  const existingGroupIds = new Set(groups.map((g) => g.groupId));

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb
        items={[
          { label: "Exams", onClick: () => navigate(ROUTES.managerExams) },
          {
            label: isEdit ? `Edit ${formLabel} Exam` : `New ${formLabel} Exam`,
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-content">
            {isEdit ? `Edit ${formLabel} Exam` : `Create ${formLabel} Exam`}
          </h2>
          <Badge
            variant={
              status === "PUBLISHED"
                ? "success"
                : status === "ARCHIVED"
                  ? "default"
                  : "warning"
            }
          >
            {status}
          </Badge>
          <Badge variant="purple">{formLabel}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {isEdit && (
            <>
              {status === "PUBLISHED" ? (
                <Button
                  variant="outline"
                  icon={<Icon.EyeOff className="w-4 h-4" />}
                  onClick={() => handlePublishStatusChange("DRAFT")}
                  disabled={saving || loading}
                >
                  Unpublish to Draft
                </Button>
              ) : (
                <Button
                  variant="outline"
                  icon={<Icon.CheckCircle className="w-4 h-4" />}
                  onClick={() => handlePublishStatusChange("PUBLISHED")}
                  disabled={
                    saving ||
                    loading ||
                    (generationType === "STATIC" && totalQuestionCount === 0)
                  }
                >
                  Publish Exam
                </Button>
              )}

              {status !== "ARCHIVED" && (
                <Button
                  variant="outline"
                  icon={<Icon.Archive className="w-4 h-4" />}
                  onClick={() => handlePublishStatusChange("ARCHIVED")}
                  disabled={saving || loading}
                >
                  Archive
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isPublished && (
        <div className="p-4 bg-info-light/40 border border-brand-line/60 rounded-[12px] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon.Info className="w-5 h-5 text-brand-ink flex-shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Đề đã xuất bản, gỡ xuất bản để chỉnh sửa.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handlePublishStatusChange("DRAFT")}
            disabled={saving}
          >
            Unpublish
          </Button>
        </div>
      )}

      {isArchived && (
        <div className="p-4 bg-surface-muted border border-line rounded-[12px] flex items-center gap-2.5">
          <Icon.Archive className="w-5 h-5 text-content-subtle flex-shrink-0" />
          <span className="text-sm font-medium text-content-secondary">
            This exam is archived and read-only.
          </span>
        </div>
      )}

      {warningsList.length > 0 && (
        <div className="p-4 bg-warning-light/40 border border-warning-line rounded-[12px] space-y-1 text-xs text-warning-strong">
          <p className="font-semibold">Publish Warnings:</p>
          {warningsList.map((w, idx) => (
            <p key={idx}>• {w}</p>
          ))}
        </div>
      )}

      {errorBanner && (
        <div className="p-4 bg-danger-light border border-danger-line rounded-[12px] text-xs text-danger font-medium flex items-center justify-between">
          <span>{errorBanner}</span>
          <button onClick={() => setErrorBanner("")} className="cursor-pointer">
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
      )}
      {courseLoadError && (
        <div className="mb-4 rounded-lg border border-danger-line bg-danger-light p-3 text-sm text-danger">
          {courseLoadError}
        </div>
      )}
      {moduleLoadError && (
        <div className="mb-4 rounded-lg border border-danger-line bg-danger-light p-3 text-sm text-danger">
          {moduleLoadError}
        </div>
      )}

      {!isEdit && (
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              activeTab === "manual"
                ? "border-brand-ink text-brand-ink"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            Manual Exam Setup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "ai"
                ? "border-brand-ink text-brand-ink"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            <Icon.Zap className="w-4 h-4" />
            AI Generate
          </button>
        </div>
      )}

      {!isEdit && activeTab === "ai" ? (
        <ExamAiGenerateTab
          formKind={formKind}
          onCreated={(created) => {
            const targetRoute =
              formKind === "QUIZ"
                ? `/manager/exams/quiz/${created.examId}`
                : `/manager/exams/${examPathKind}/${created.examId}`;
            navigate(targetRoute, { replace: true });
          }}
          onCancel={() => setActiveTab("manual")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-5 space-y-4">
              <h3 className="text-base font-bold text-content border-b border-line-soft pb-2.5">
                Exam Basic Information
              </h3>

              <div className="space-y-4">
                <div>
                  <Input
                    label="Exam Title *"
                    placeholder="Enter exam title..."
                    value={title}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setIsDirty(true);
                      if (fieldErrors.title)
                        setFieldErrors((p) => ({ ...p, title: "" }));
                    }}
                  />
                  {fieldErrors.title && (
                    <p className="text-xs text-danger mt-1">
                      {fieldErrors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-content-secondary block mb-1">
                    Description / Instructions (optional)
                  </label>
                  <textarea
                    rows={3}
                    disabled={isReadOnly}
                    className="w-full px-3 py-2 text-sm rounded-[10px] border border-line bg-surface disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                    placeholder="Provide guidance, permitted materials, or exam objectives..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Select
                      label="Course *"
                      value={courseId}
                      disabled={isReadOnly || Boolean(importedQuestionIds)}
                      onChange={(v) => {
                        setCourseId(v);
                        setModuleId("");
                        setModules([]);
                        setIsDirty(true);
                        setFieldErrors((p) => ({
                          ...p,
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
                      label="Module *"
                      value={moduleId}
                      disabled={
                        isReadOnly || !courseId || Boolean(importedQuestionIds)
                      }
                      onChange={(v) => {
                        setModuleId(v);
                        setIsDirty(true);
                        if (fieldErrors.moduleId)
                          setFieldErrors((p) => ({ ...p, moduleId: "" }));
                      }}
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-content-secondary block mb-1">
                      Duration (min) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      disabled={isReadOnly}
                      className="w-full px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface disabled:opacity-60"
                      value={durationMinutes}
                      onChange={(e) => {
                        setDurationMinutes(Number(e.target.value) || 0);
                        setIsDirty(true);
                      }}
                    />
                    {fieldErrors.durationMinutes && (
                      <p className="text-2xs text-danger mt-0.5">
                        {fieldErrors.durationMinutes}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-content-secondary block mb-1">
                      Max Score *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      disabled={isReadOnly}
                      className="w-full px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface disabled:opacity-60"
                      value={maxScore}
                      onChange={(e) => {
                        setMaxScore(Number(e.target.value) || 0);
                        setIsDirty(true);
                      }}
                    />
                    {fieldErrors.maxScore && (
                      <p className="text-2xs text-danger mt-0.5">
                        {fieldErrors.maxScore}
                      </p>
                    )}
                  </div>

                  <Select
                    label="Generation"
                    value={generationType}
                    disabled={isReadOnly}
                    onChange={(v) => {
                      setGenerationType(v as GenerationType);
                      setIsDirty(true);
                    }}
                    options={[
                      { label: "STATIC", value: "STATIC" },
                      { label: "RANDOM", value: "RANDOM" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {generationType === "RANDOM" && (
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-line-soft pb-2.5">
                  <div>
                    <h3 className="text-base font-bold text-content">
                      Random Question Draw Matrix
                    </h3>
                    <p className="text-xs text-content-subtle mt-0.5">
                      Define rules for sampling questions dynamically from the
                      question bank.
                    </p>
                  </div>
                  {!isReadOnly && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Icon.Plus className="w-3.5 h-3.5" />}
                      onClick={handleAddConfigRow}
                    >
                      Add Rule
                    </Button>
                  )}
                </div>

                {fieldErrors.configs && (
                  <p className="text-xs text-danger font-medium">
                    {fieldErrors.configs}
                  </p>
                )}

                {configs.length === 0 ? (
                  <p className="text-xs text-content-subtle py-4 text-center">
                    No random sampling rules configured yet. Click "Add Rule" to
                    define criteria.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {configs.map((c, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-[10px] border border-line bg-surface-muted/40 flex flex-wrap items-center gap-3"
                      >
                        <div className="w-40">
                          <label className="text-2xs text-content-subtle block mb-1">
                            Type
                          </label>
                          <Select
                            value={c.questionType}
                            disabled={isReadOnly}
                            onChange={(v) =>
                              handleConfigChange(idx, "questionType", v)
                            }
                            options={allowedQuestionTypes.map((t) => ({
                              label: t.replace("_", " "),
                              value: t,
                            }))}
                          />
                        </div>

                        <div className="w-24">
                          <label className="text-2xs text-content-subtle block mb-1">
                            Count
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            disabled={isReadOnly}
                            className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                            value={c.numberOfQuestions}
                            onChange={(e) =>
                              handleConfigChange(
                                idx,
                                "numberOfQuestions",
                                Math.max(1, Number(e.target.value) || 1),
                              )
                            }
                          />
                        </div>

                        <div className="w-28">
                          <label className="text-2xs text-content-subtle block mb-1">
                            Weight Each
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step={1}
                            disabled={isReadOnly}
                            className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                            value={c.weightEach ?? 1}
                            onChange={(e) =>
                              handleConfigChange(
                                idx,
                                "weightEach",
                                Number(e.target.value) || 0,
                              )
                            }
                          />
                          <span className="mt-1 block text-2xs text-content-subtle">
                            {formatScore(scoreForWeight(c.weightEach ?? 1))} pts
                            each
                          </span>
                        </div>

                        <div className="w-32">
                          <label className="text-2xs text-content-subtle block mb-1">
                            Difficulty
                          </label>
                          <Select
                            value={c.difficulty || "ANY"}
                            disabled={isReadOnly}
                            onChange={(v) =>
                              handleConfigChange(idx, "difficulty", v)
                            }
                            options={[
                              { label: "Any Difficulty", value: "ANY" },
                              { label: "EASY", value: "EASY" },
                              { label: "MEDIUM", value: "MEDIUM" },
                              { label: "HARD", value: "HARD" },
                            ]}
                          />
                        </div>

                        <div className="flex-1 min-w-[140px]">
                          <label className="text-2xs text-content-subtle block mb-1">
                            Module
                          </label>
                          <Select
                            value={c.moduleId ? String(c.moduleId) : ""}
                            disabled={isReadOnly || !courseId}
                            onChange={(v) =>
                              handleConfigChange(
                                idx,
                                "moduleId",
                                v ? Number(v) : undefined,
                              )
                            }
                            options={[
                              { label: "All Modules", value: "" },
                              ...modules.map((m) => ({
                                label: m.title,
                                value: String(m.moduleId),
                              })),
                            ]}
                          />
                        </div>

                        {!isReadOnly && (
                          <div className="pt-4">
                            <button
                              type="button"
                              onClick={() => handleRemoveConfigRow(idx)}
                              className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer"
                              title="Delete rule"
                            >
                              <Icon.Trash className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2.5">
                <div>
                  <h3 className="text-base font-bold text-content">
                    Attached Questions ({standaloneQuestions.length})
                  </h3>
                  <p className="text-xs text-content-subtle">
                    {formKind === "QUIZ"
                      ? "Objective questions linked directly to this exam."
                      : "Essay and diagram questions can be combined in this exam. Each question includes its required grading rubric."}
                  </p>
                  {fieldErrors.questions && (
                    <p className="mt-1 text-xs text-danger">
                      {fieldErrors.questions}
                    </p>
                  )}
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-2">
                    {formKind === "QUIZ" && isEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Icon.Upload className="w-3.5 h-3.5" />}
                        onClick={() => setImportModalOpen(true)}
                      >
                        Import Questions
                      </Button>
                    )}
                    {!isEdit && generationType === "STATIC" && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Icon.Upload className="w-3.5 h-3.5" />}
                        onClick={() => setImportPreviewOpen(true)}
                        disabled={
                          !courseId || !moduleId || Boolean(importedQuestionIds)
                        }
                        title={
                          !courseId || !moduleId
                            ? "Select a course and module before importing"
                            : undefined
                        }
                      >
                        Import PDF / Word
                      </Button>
                    )}

                    <Button
                      size="sm"
                      icon={<Icon.Plus className="w-3.5 h-3.5" />}
                      onClick={() => setBankModalOpen(true)}
                    >
                      Select Questions from Bank
                    </Button>
                  </div>
                )}
              </div>

              {isEdit && (
                <div className="text-2xs text-content-subtle bg-surface-muted/50 p-2 rounded border border-line-soft">
                  Note: Adding, removing, and changing question weights in edit
                  mode updates the exam through backend APIs immediately.
                </div>
              )}

              {standaloneQuestions.length === 0 ? (
                <div className="py-12 text-center text-sm text-content-subtle border-2 border-dashed border-line-soft rounded-[10px]">
                  No standalone questions attached. Add questions here or attach
                  a reading passage group below.
                </div>
              ) : (
                <div className="space-y-3">
                  {standaloneQuestions
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((q, idx) => (
                      <div
                        key={q.examQuestionId || idx}
                        className="p-3.5 rounded-[10px] border border-line bg-surface transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                              #{idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-content leading-snug">
                                {q.content}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <Badge
                                  variant="default"
                                  className="text-2xs font-semibold"
                                >
                                  {q.questionType.replace("_", " ")}
                                </Badge>
                                <label className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-medium">
                                  Weight
                                  <input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    step={1}
                                    disabled={isReadOnly}
                                    className="w-20 px-2 py-1 rounded border border-line bg-surface text-content disabled:opacity-60"
                                    value={q.weight ?? q.points ?? 1}
                                    onChange={(e) => {
                                      const weight =
                                        Number(e.target.value) || 0;
                                      setQuestions((prev) =>
                                        prev.map((item) =>
                                          item.examQuestionId ===
                                          q.examQuestionId
                                            ? {
                                                ...item,
                                                weight,
                                                points: undefined,
                                              }
                                            : item,
                                        ),
                                      );
                                      setIsDirty(true);
                                    }}
                                    onBlur={(e) =>
                                      handleQuestionWeightBlur(
                                        q,
                                        Number(e.currentTarget.value) || 0,
                                      )
                                    }
                                  />
                                </label>
                                <span className="text-xs text-brand-ink font-semibold">
                                  Score:{" "}
                                  {formatScore(
                                    scoreForWeight(q.weight ?? q.points ?? 1),
                                  )}{" "}
                                  pts
                                </span>

                                {isAssessment && isEssayQuestion(q) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRubricModalQuestion({
                                        id: q.questionId,
                                        content: q.content,
                                      })
                                    }
                                    className="text-xs font-semibold text-brand-ink hover:underline cursor-pointer"
                                  >
                                    Edit Rubric
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {!isReadOnly && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQuestionEditTarget(q)}
                                className="text-content-subtle hover:text-brand-ink p-1 rounded hover:bg-surface-hover cursor-pointer"
                                title="Edit Question"
                                aria-label={`Edit question ${idx + 1}`}
                              >
                                <Icon.Edit className="w-4 h-4" />
                              </button>
                              {!q.groupId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRemoveConfirmTarget({
                                      type: "question",
                                      examQuestionId: q.examQuestionId,
                                      title: q.content,
                                    })
                                  }
                                  className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer"
                                  title="Remove Question from Exam"
                                  aria-label={`Remove question ${idx + 1} from exam`}
                                >
                                  <Icon.Trash className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {q.questionType === "DIAGRAM" && (
                          <ExamDiagramAnswer
                            questionId={q.questionId}
                            readOnly={isReadOnly}
                          />
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {importedQuestionDrafts.length > 0 && (
              <div className="card space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2.5">
                  <div>
                    <h3 className="text-base font-bold text-content">
                      Questions from Import Preview (
                      {importedQuestionDrafts.length})
                    </h3>
                    <p className="text-xs text-content-subtle">
                      Review and edit these questions before creating the exam.
                      They will be saved to the Question Bank with the exam.
                    </p>
                  </div>
                  {importedQuestionIds && (
                    <Badge variant="info" className="text-2xs">
                      Saved to Question Bank · retry exam creation to continue
                    </Badge>
                  )}
                </div>
                {importedQuestionDrafts.map((item, index) => (
                  <div
                    key={item.draft.key}
                    className="space-y-2 rounded-[10px] border border-line p-3"
                  >
                    {importedQuestionIds ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-content">
                            {item.draft.content}
                          </p>
                          <Badge variant="default" className="mt-2 text-2xs">
                            {item.draft.type.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <QuestionFormBlock
                        q={item.draft}
                        index={index}
                        onChange={(draft) =>
                          updateImportedDraft(item.draft.key, draft)
                        }
                        showErrors={importedQuestionsSubmitted}
                        removable
                        onRemove={() => removeImportedDraft(item.draft.key)}
                        allowedTypes={
                          allowedQuestionTypes as EditableQuestionType[]
                        }
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-2">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-content-secondary">
                        Exam Weight
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step={1}
                          disabled={Boolean(importedQuestionIds)}
                          className="w-20 rounded border border-line bg-surface px-2 py-1 text-content disabled:opacity-60"
                          value={item.weight}
                          onChange={(e) => {
                            const weight = Number(e.target.value) || 0;
                            setImportedQuestionDrafts((prev) =>
                              prev.map((current) =>
                                current.draft.key === item.draft.key
                                  ? { ...current, weight }
                                  : current,
                              ),
                            );
                            setIsDirty(true);
                          }}
                        />
                      </label>
                      <span className="text-xs font-semibold text-brand-ink">
                        Score: {formatScore(scoreForWeight(item.weight))} pts
                      </span>
                    </div>
                    {importedQuestionsSubmitted &&
                      Object.keys(validateDraft(item.draft)).length > 0 && (
                        <p className="text-xs text-danger">
                          Fix the question validation errors above before
                          creating the exam.
                        </p>
                      )}
                  </div>
                ))}
              </div>
            )}

            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line-soft pb-2.5">
                <div>
                  <h3 className="text-base font-bold text-content">
                    Reading Passage Groups ({groups.length})
                  </h3>
                  <p className="text-xs text-content-subtle">
                    Attach comprehension passages with their bundled questions.
                  </p>
                </div>
                {!isReadOnly && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Icon.Plus className="w-3.5 h-3.5" />}
                    onClick={() => setGroupModalOpen(true)}
                  >
                    Add Group
                  </Button>
                )}
              </div>

              {groups.length === 0 ? (
                <div className="py-8 text-center text-xs text-content-subtle border border-line-soft rounded-[10px]">
                  No reading passage groups attached.
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map((g, idx) => {
                    const groupQuestions = questions
                      .filter((question) => question.groupId === g.groupId)
                      .sort((a, b) => a.orderIndex - b.orderIndex);
                    const isExpanded = expandedGroupIds.has(g.examGroupId);

                    return (
                      <div
                        key={g.examGroupId || idx}
                        className="rounded-[10px] border border-line bg-surface overflow-hidden"
                      >
                        <div className="flex items-center justify-between gap-3 p-3.5">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedGroupIds((current) => {
                                const next = new Set(current);
                                if (next.has(g.examGroupId))
                                  next.delete(g.examGroupId);
                                else next.add(g.examGroupId);
                                return next;
                              })
                            }
                            className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                          >
                            <Icon.ChevronDown
                              className={`w-4 h-4 flex-shrink-0 text-content-subtle transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                            <Badge variant="purple" className="text-2xs">
                              Group #{idx + 1}
                            </Badge>
                            <span className="truncate text-sm font-semibold text-content">
                              {g.title}
                            </span>
                            <span className="flex-shrink-0 text-xs text-content-secondary font-medium">
                              {groupQuestions.length || g.questionCount || 0}{" "}
                              questions
                            </span>
                          </button>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                setRemoveConfirmTarget({
                                  type: "group",
                                  examGroupId: g.examGroupId,
                                  title: g.title,
                                })
                              }
                              className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer"
                              title="Remove group"
                              aria-label={`Remove ${g.title}`}
                            >
                              <Icon.Trash className="w-4 h-4" />
                            </button>
                          )}
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
                                          <p className="text-sm font-medium leading-snug text-content">
                                            {q.content}
                                          </p>
                                        </div>
                                        <div className="ml-6 mt-2 flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant="default"
                                            className="text-2xs font-semibold"
                                          >
                                            {q.questionType.replace("_", " ")}
                                          </Badge>
                                          <label className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-medium">
                                            Weight
                                            <input
                                              type="number"
                                              min={0}
                                              max={1000}
                                              step={1}
                                              disabled={isReadOnly}
                                              className="w-20 rounded border border-line bg-surface px-2 py-1 text-content disabled:opacity-60"
                                              value={q.weight ?? q.points ?? 1}
                                              onChange={(e) => {
                                                const weight =
                                                  Number(e.target.value) || 0;
                                                setQuestions((prev) =>
                                                  prev.map((item) =>
                                                    item.examQuestionId ===
                                                    q.examQuestionId
                                                      ? {
                                                          ...item,
                                                          weight,
                                                          points: undefined,
                                                        }
                                                      : item,
                                                  ),
                                                );
                                                setIsDirty(true);
                                              }}
                                              onBlur={(e) =>
                                                handleQuestionWeightBlur(
                                                  q,
                                                  Number(
                                                    e.currentTarget.value,
                                                  ) || 0,
                                                )
                                              }
                                            />
                                          </label>
                                          <span className="text-xs font-semibold text-brand-ink">
                                            Score:{" "}
                                            {formatScore(
                                              scoreForWeight(
                                                q.weight ?? q.points ?? 1,
                                              ),
                                            )}{" "}
                                            pts
                                          </span>
                                          {isAssessment &&
                                            isEssayQuestion(q) && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setRubricModalQuestion({
                                                    id: q.questionId,
                                                    content: q.content,
                                                  })
                                                }
                                                className="text-xs font-semibold text-brand-ink hover:underline cursor-pointer"
                                              >
                                                Edit Rubric
                                              </button>
                                            )}
                                        </div>
                                      </div>
                                      {!isReadOnly && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setQuestionEditTarget(q)
                                          }
                                          className="rounded p-1 text-content-subtle hover:bg-surface-hover hover:text-brand-ink cursor-pointer"
                                          title="Edit Question"
                                          aria-label={`Edit question ${questionIndex + 1} in ${g.title}`}
                                        >
                                          <Icon.Edit className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                    {q.questionType === "DIAGRAM" && (
                                      <ExamDiagramAnswer
                                        questionId={q.questionId}
                                        readOnly={isReadOnly}
                                      />
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
          </div>

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
                    status === "PUBLISHED"
                      ? "success"
                      : status === "ARCHIVED"
                        ? "default"
                        : "warning"
                  }
                >
                  {status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-subtle">Mode:</span>
                <span className="font-semibold text-content">
                  {isPractice ? "Practice" : "Real Exam"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-subtle">Duration:</span>
                <span className="font-semibold text-content">
                  {durationMinutes} min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-subtle">Total Questions:</span>
                <span className="font-bold text-content">
                  {totalQuestionCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-subtle">Total Weight:</span>
                <span className="font-semibold text-content">
                  {formatScore(totalWeight)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-content-subtle">Max Score:</span>
                <span className="font-bold text-brand-ink">
                  {formatScore(maxScore)} pts
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-line-soft space-y-2">
              {!isReadOnly && (
                <Button
                  className="w-full"
                  icon={<Icon.Check className="w-4 h-4" />}
                  onClick={handleSaveExam}
                  loading={saving}
                  disabled={saving || loading || (isEdit && !isDirty)}
                >
                  {isEdit ? "Save Changes" : "Create Exam"}
                </Button>
              )}
              <Button
                className="w-full"
                variant="outline"
                onClick={handleCancelClick}
                disabled={saving}
              >
                Back to List
              </Button>
            </div>
          </div>
        </div>
      )}

      <QuestionBankSelectModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        onSelect={handleAddQuestionsFromBank}
        allowedQuestionTypes={allowedQuestionTypes}
        existingQuestionIds={existingQuestionIds}
        initialCourseId={courseId ? Number(courseId) : undefined}
        initialModuleId={moduleId ? Number(moduleId) : undefined}
        loading={loading}
      />

      <QuestionGroupModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSelectGroup={handleAddGroup}
        existingGroupIds={existingGroupIds}
        courseId={courseId ? Number(courseId) : undefined}
        moduleId={moduleId ? Number(moduleId) : undefined}
        questionType={formKind}
        loading={loading}
      />

      <Modal
        open={questionEditTarget !== null}
        onClose={() => !questionEditSaving && setQuestionEditTarget(null)}
        title="Edit Question"
        size="2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setQuestionEditTarget(null)}
              disabled={questionEditSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveQuestionEdit}
              loading={questionEditSaving}
              disabled={questionEditLoading || !questionEditDraft}
            >
              Save Question
            </Button>
          </div>
        }
      >
        {questionEditLoading ? (
          <p className="py-8 text-center text-sm text-content-subtle">
            Loading question…
          </p>
        ) : questionEditError && !questionEditDraft ? (
          <div role="alert" className="py-5 text-sm text-danger">
            {questionEditError}
          </div>
        ) : questionEditDraft ? (
          <div className="space-y-3">
            {questionEditError && (
              <div
                role="alert"
                className="rounded border border-danger-line bg-danger-light p-3 text-sm text-danger"
              >
                {questionEditError}
              </div>
            )}
            <QuestionForm
              q={questionEditDraft}
              index={0}
              onChange={setQuestionEditDraft}
              showErrors={questionEditSubmitted}
              allowedTypes={allowedQuestionTypes as EditableQuestionType[]}
            />
            <p className="text-xs text-content-subtle">
              Saving updates this question in the Question Bank as well as in
              this exam.
            </p>
          </div>
        ) : null}
      </Modal>

      <RubricDetailModal
        open={rubricModalQuestion !== null}
        questionId={rubricModalQuestion?.id || null}
        questionContent={rubricModalQuestion?.content}
        questionPoints={scoreForWeight(
          questions.find((q) => q.questionId === rubricModalQuestion?.id)
            ?.weight ??
            questions.find((q) => q.questionId === rubricModalQuestion?.id)
              ?.points ??
            1,
        )}
        onClose={() => setRubricModalQuestion(null)}
        onSaved={(qid) => {
          setQuestions((prev) =>
            prev.map((q) =>
              q.questionId === qid ? { ...q, hasRubric: true } : q,
            ),
          );
        }}
      />

      {!isEdit && (
        <ImportPdfModal
          open={importPreviewOpen}
          onClose={() => setImportPreviewOpen(false)}
          onImported={handleImportedDrafts}
          courseId={courseId}
          moduleId={moduleId}
          lockLocation
        />
      )}

      {isEdit && id && (
        <ImportQuestionsModal
          open={importModalOpen}
          examId={Number(id)}
          onClose={() => setImportModalOpen(false)}
          onSuccess={() => loadExamDetail(Number(id))}
        />
      )}

      <Modal
        open={removeConfirmTarget !== null}
        onClose={() => setRemoveConfirmTarget(null)}
        title="Confirm Removal"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => setRemoveConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (removeConfirmTarget?.type === "question") {
                  handleRemoveQuestion(removeConfirmTarget.examQuestionId);
                } else if (removeConfirmTarget?.type === "group") {
                  handleRemoveGroup(removeConfirmTarget.examGroupId);
                }
              }}
            >
              Confirm Remove
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-content">
          <p>
            Are you sure you want to remove{" "}
            <strong>"{removeConfirmTarget?.title}"</strong> from this exam?
          </p>
          <p className="text-xs text-content-subtle">
            Note: This only unlinks the item from this exam. The original item
            in the Question Bank is preserved.
          </p>
        </div>
      </Modal>

      <Modal
        open={archiveCloneModalOpen}
        onClose={() => setArchiveCloneModalOpen(false)}
        title="Exam Already Has Student Attempts (409)"
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setArchiveCloneModalOpen(false)}
            >
              Cancel
            </Button>
            {saveDescriptionOnly ? (
              <Button onClick={handleSaveDescriptionOnly} loading={saving}>
                Save Description
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setSaveDescriptionOnly(true)}
                >
                  Edit Description Only
                </Button>
                <Button
                  onClick={handleArchiveAndClone}
                  loading={archiveCloning}
                  icon={<Icon.Copy className="w-4 h-4" />}
                >
                  Archive and Clone
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="space-y-3 text-sm text-content">
          <p className="text-danger font-medium">
            This exam already has student submission attempts. Structure,
            duration, and question matrix cannot be directly modified.
          </p>
          <p className="text-xs text-content-subtle leading-relaxed">
            You can either update only the description, or execute{" "}
            <strong>Archive and Clone</strong> to archive the current exam
            (preserving score records) and generate a new editable draft copy.
          </p>
        </div>
      </Modal>

      <Modal
        open={leaveConfirmOpen}
        onClose={() => setLeaveConfirmOpen(false)}
        title="Unsaved Changes"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => setLeaveConfirmOpen(false)}
            >
              Continue Editing
            </Button>
            <Button
              variant="danger"
              onClick={() => navigate(ROUTES.managerExams)}
            >
              Discard Changes
            </Button>
          </div>
        }
      >
        <p className="text-sm text-content">
          You have unsaved changes in this exam form. Are you sure you want to
          leave?
        </p>
      </Modal>
    </div>
  );
}

function ExamDiagramAnswer({
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
          setError(
            getApiErrorMessage(err, "Could not load the model answer diagram."),
          );
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
        getApiErrorMessage(
          err,
          "Could not save the model answer diagram. Please try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="mt-3 text-xs text-content-subtle">
        Loading model answer diagram…
      </div>
    );
  if (!draft)
    return (
      <div className="mt-3 text-xs text-danger">
        {error || "Could not load the model answer diagram."}
      </div>
    );

  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <DiagramAnswer
        q={draft}
        set={saveDiagram}
        readOnly={readOnly || saving}
      />
      {saving && (
        <p className="mt-2 text-xs text-content-subtle">
          Saving model answer diagram…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
