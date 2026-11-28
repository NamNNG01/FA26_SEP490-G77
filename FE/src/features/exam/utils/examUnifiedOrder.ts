import type { ExamGroup, ExamOrderEntry, ExamQuestion } from "@/services/exam.service";
import type { QuestionDraft } from "@/features/question/model";

export interface ImportedQuestionDraft {
  draft: QuestionDraft;
  weight: number;
  orderIndex: number;
}

export type UnifiedExamItem =
  | {
      kind: "question";
      key: string;
      orderIndex: number;
      typeRank: 0;
      idNum: number;
      question: ExamQuestion;
    }
  | {
      kind: "imported";
      key: string;
      orderIndex: number;
      typeRank: 1;
      idNum: number;
      item: ImportedQuestionDraft;
    }
  | {
      kind: "group";
      key: string;
      orderIndex: number;
      typeRank: 2;
      idNum: number;
      group: ExamGroup;
      groupQuestions: ExamQuestion[];
    };

export function buildUnifiedItems(
  questions: ExamQuestion[],
  importedQuestionDrafts: ImportedQuestionDraft[],
  groups: ExamGroup[],
): UnifiedExamItem[] {
  const standaloneQuestions = questions.filter((question) => !question.groupId);
  return [
    ...standaloneQuestions.map(
      (q): UnifiedExamItem => ({
        kind: "question",
        key: `q-${q.examQuestionId}`,
        orderIndex: q.orderIndex,
        typeRank: 0,
        idNum: q.examQuestionId,
        question: q,
      }),
    ),
    ...importedQuestionDrafts.map(
      (item, idx): UnifiedExamItem => ({
        kind: "imported",
        key: `imp-${item.draft.key}`,
        orderIndex: item.orderIndex,
        typeRank: 1,
        idNum: idx,
        item,
      }),
    ),
    ...groups.map(
      (g): UnifiedExamItem => ({
        kind: "group",
        key: `g-${g.examGroupId}`,
        orderIndex: g.orderIndex,
        typeRank: 2,
        idNum: g.examGroupId,
        group: g,
        groupQuestions: questions
          .filter((q) => q.groupId === g.groupId)
          .sort((a, b) => a.orderIndex - b.orderIndex || a.questionId - b.questionId),
      }),
    ),
  ].sort((a, b) => a.orderIndex - b.orderIndex || a.typeRank - b.typeRank || a.idNum - b.idNum);
}

export function getNextTopOrder(
  questions: ExamQuestion[],
  importedQuestionDrafts: ImportedQuestionDraft[],
  groups: ExamGroup[],
): number {
  const standaloneQuestions = questions.filter((q) => !q.groupId);
  const maxStandalone = standaloneQuestions.reduce((max, q) => Math.max(max, q.orderIndex), -1);
  const maxImported = importedQuestionDrafts.reduce((max, i) => Math.max(max, i.orderIndex), -1);
  const maxGroups = groups.reduce((max, g) => Math.max(max, g.orderIndex), -1);
  return Math.max(maxStandalone, maxImported, maxGroups) + 1;
}

export function buildExamOrderPayload(
  nextItems: UnifiedExamItem[],
  nextQuestions: ExamQuestion[],
): ExamOrderEntry[] {
  return nextItems.flatMap<ExamOrderEntry>((entry) => {
    if (entry.kind === "question") {
      return [{ itemType: "QUESTION", linkId: entry.question.examQuestionId }];
    }
    if (entry.kind === "group") {
      const childIds = nextQuestions
        .filter((q) => q.groupId === entry.group.groupId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((q) => q.questionId);
      return [
        {
          itemType: "GROUP",
          linkId: entry.group.examGroupId,
          questionIds: childIds,
        },
      ];
    }
    return [];
  });
}

export function reorderUnifiedItems(
  unifiedItems: UnifiedExamItem[],
  questions: ExamQuestion[],
  groups: ExamGroup[],
  importedQuestionDrafts: ImportedQuestionDraft[],
  index: number,
  delta: -1 | 1,
) {
  const target = index + delta;
  if (target < 0 || target >= unifiedItems.length) return null;

  const reordered = [...unifiedItems];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  const orderByKey = new Map<string, number>();
  reordered.forEach((entry, idx) => orderByKey.set(entry.key, idx));

  const nextQuestions = questions.map((q) =>
    !q.groupId && orderByKey.has(`q-${q.examQuestionId}`)
      ? { ...q, orderIndex: orderByKey.get(`q-${q.examQuestionId}`)! }
      : q,
  );
  const nextGroups = groups.map((g) =>
    orderByKey.has(`g-${g.examGroupId}`)
      ? { ...g, orderIndex: orderByKey.get(`g-${g.examGroupId}`)! }
      : g,
  );
  const nextImported = importedQuestionDrafts.map((it) =>
    orderByKey.has(`imp-${it.draft.key}`)
      ? { ...it, orderIndex: orderByKey.get(`imp-${it.draft.key}`)! }
      : it,
  );

  return { reordered, nextQuestions, nextGroups, nextImported };
}

export function reorderGroupQuestions(
  questions: ExamQuestion[],
  groupId: number,
  childIndex: number,
  delta: -1 | 1,
): ExamQuestion[] | null {
  const groupQs = questions
    .filter((q) => q.groupId === groupId)
    .sort((a, b) => a.orderIndex - b.orderIndex || a.questionId - b.questionId);
  const target = childIndex + delta;
  if (target < 0 || target >= groupQs.length) return null;

  const reorderedChildren = [...groupQs];
  [reorderedChildren[childIndex], reorderedChildren[target]] = [
    reorderedChildren[target],
    reorderedChildren[childIndex],
  ];
  const childOrderByQuestionId = new Map<number, number>();
  reorderedChildren.forEach((cq, idx) => childOrderByQuestionId.set(cq.questionId, idx));

  return questions.map((q) =>
    q.groupId === groupId && childOrderByQuestionId.has(q.questionId)
      ? { ...q, orderIndex: childOrderByQuestionId.get(q.questionId)! }
      : q,
  );
}
