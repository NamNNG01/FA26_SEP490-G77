import type { AiQuestionDraft, Difficulty } from "@/services/exam.service";
import type { QuestionDifficulty, QuestionType } from "@/services/question.service";
import { blankIndexes, fromAiDraft, validateDraft, type QuestionDraft } from "@/features/question/model";

export function toEditorDraft(question: AiQuestionDraft): QuestionDraft {
  const editorDraft = fromAiDraft({
    content: question.content,
    questionType: question.questionType as QuestionType,
    difficulty: question.difficulty as QuestionDifficulty,
    options: (question.options ?? []).map((option, index) => ({
      optionText: option.optionText,
      isCorrect: option.isCorrect,
      orderIndex: option.orderIndex ?? index,
    })),
    answerKey: question.answerKey ?? null,
    explanation: question.explanation,
    questionMetadata: {
      ...question.questionMetadata,
      ...(question.plantUmlSource ? { plantUmlSource: question.plantUmlSource } : {}),
    },
    essayGradingRubric: question.essayGradingRubric,
    codeConfig: question.codeConfig
      ? {
          allowedLanguages: question.codeConfig.allowedLanguages ?? [],
          codeTemplate: question.codeConfig.codeTemplate ?? null,
          timeLimitMs: question.codeConfig.timeLimitMs ?? 5000,
          memoryLimitKb: question.codeConfig.memoryLimitKb ?? 262144,
        }
      : null,
    testCases:
      question.testCases?.map((testCase, index) => ({
        inputData: testCase.inputData,
        expectedOutput: testCase.expectedOutput,
        hidden: Boolean(testCase.hidden),
        orderIndex: testCase.orderIndex ?? index,
      })) ?? null,
  });
  return { ...editorDraft, diagramSvg: question.diagramSvg ?? editorDraft.diagramSvg };
}

export function fromEditorDraft(original: AiQuestionDraft, edited: QuestionDraft): AiQuestionDraft {
  const rubricType = ["ESSAY", "DIAGRAM", "DIAGRAM_ESSAY"].includes(edited.type);
  const isDiagram = edited.type === "DIAGRAM" || edited.type === "DIAGRAM_ESSAY";
  const questionMetadata = { ...original.questionMetadata };
  if (edited.skillTag.trim()) questionMetadata.skillTag = edited.skillTag.trim();
  else delete questionMetadata.skillTag;
  if (isDiagram) questionMetadata.drawioXml = edited.diagramXml;
  else delete questionMetadata.drawioXml;

  let answerKey: AiQuestionDraft["answerKey"];
  if (edited.type === "MATCHING") {
    answerKey = {
      pairs: edited.pairs
        .filter((pair) => pair.left.trim() || pair.right.trim())
        .map(({ left, right }) => ({ left: left.trim(), right: right.trim() })),
    };
  } else if (edited.type === "FILL_BLANK") {
    answerKey = {
      blanks: blankIndexes(edited.content).map((index) => ({
        index,
        accepted: (edited.blanks[index]?.accepted ?? "")
          .split(";")
          .map((value) => value.trim())
          .filter(Boolean),
        caseSensitive: edited.blanks[index]?.caseSensitive ?? false,
      })),
    };
  }

  return {
    ...original,
    content: edited.content,
    questionType: edited.type,
    difficulty: edited.difficulty as Difficulty,
    options: ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(edited.type)
      ? edited.options.map((option, orderIndex) => ({
          optionText: option.text,
          isCorrect: option.isCorrect,
          orderIndex,
        }))
      : [],
    answerKey,
    explanation: edited.explanation,
    questionMetadata,
    essayGradingRubric: rubricType
      ? {
          criteria: edited.rubric.map((criterion) => ({
            name: criterion.name,
            weight: Number(criterion.weight) || 0,
            maxScore: Number(criterion.weight) || 0,
            descriptors: criterion.descriptors,
          })),
          totalPoints: edited.rubric.reduce(
            (sum, criterion) => sum + (Number(criterion.weight) || 0),
            0,
          ),
          notes: edited.rubricNotes,
        }
      : undefined,
    codeConfig:
      edited.type === "CODE"
        ? {
            allowedLanguages: edited.code.languages,
            codeTemplate: edited.code.template || null,
            timeLimitMs: Number(edited.code.timeLimitMs),
            memoryLimitKb: Number(edited.code.memoryLimitKb),
          }
        : undefined,
    testCases:
      edited.type === "CODE"
        ? edited.code.testCases.map((testCase, orderIndex) => ({
            inputData: testCase.input,
            expectedOutput: testCase.expectedOutput,
            hidden: testCase.hidden,
            orderIndex,
          }))
        : undefined,
    plantUmlSource: undefined,
    diagramSvg: edited.diagramSvg,
  };
}

// Mirrors the Q-03 rules the backend applies on save.
export function validateAiDraftQuestion(q: AiQuestionDraft, requireModule: boolean): string | null {
  if (!q.content.trim()) return "Question content cannot be empty";
  const weight = q.defaultPoints ?? 1;
  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 1000 ||
    (String(weight).split(".")[1]?.length ?? 0) > 2
  ) {
    return "Weight must be greater than 0, no more than 1,000, and have up to 2 decimal places";
  }
  const options = q.options ?? [];
  const correctCount = options.filter((o) => o.isCorrect).length;
  if (
    ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(q.questionType) &&
    (options.length < 2 || options.length > 10)
  ) {
    return "Choice questions must have 2 to 10 options";
  }
  if (q.questionType === "SINGLE_CHOICE" && correctCount !== 1) {
    return "Single choice must have exactly 1 correct answer";
  }
  if (
    q.questionType === "MULTIPLE_CHOICE" &&
    (correctCount < 2 || correctCount === options.length)
  ) {
    return "Multiple choice needs at least 2 correct and 1 incorrect answer";
  }
  if (q.questionType === "TRUE_FALSE" && (options.length !== 2 || correctCount !== 1)) {
    return "True/False question must have exactly 2 options and 1 correct answer";
  }
  if (q.questionType === "FILL_BLANK" && !/\{\{\d+\}\}/.test(q.content)) {
    return "Fill blank content needs placeholders like {{1}}";
  }
  if (q.questionType === "CODE") {
    const cases = q.testCases ?? [];
    if (!q.codeConfig) return "Code question needs a code configuration";
    if (cases.some((t) => !t.expectedOutput?.trim())) {
      return "Every test case needs an expected output";
    }
    if (!cases.some((t) => !t.hidden)) return "Code question needs at least one sample test case";
    if (!cases.some((t) => t.hidden)) return "Code question needs at least one hidden test case";
  }
  const editorErrors = validateDraft(toEditorDraft(q));
  if (requireModule && !q.moduleId) {
    return (
      editorErrors.content ??
      editorErrors.answers ??
      editorErrors.type ??
      "Please assign a module to this question"
    );
  }
  return editorErrors.content ?? editorErrors.answers ?? editorErrors.type ?? null;
}
