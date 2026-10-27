import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import {
  examService,
  type BankQuestionItem,
  type Difficulty,
} from "@/services/exam.service";
import { getApiErrorMessage } from "@/utils/apiError";

interface QuestionBankSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (items: { question: BankQuestionItem; weight: number }[]) => void;
  allowedQuestionTypes: string[];
  existingQuestionIds: Set<number>;
  courseName: string;
  moduleName: string;
  moduleId: number;
  loading?: boolean;
}

export function QuestionBankSelectModal({
  open,
  onClose,
  onSelect,
  allowedQuestionTypes,
  existingQuestionIds,
  courseName,
  moduleName,
  moduleId,
  loading = false,
}: QuestionBankSelectModalProps) {
  const [questions, setQuestions] = useState<BankQuestionItem[]>([]);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [questionType, setQuestionType] = useState<string>("all");
  const [defaultWeight, setDefaultWeight] = useState<number>(1);
  const [selectedMap, setSelectedMap] = useState<Map<number, BankQuestionItem>>(
    new Map(),
  );
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !moduleId) return;
    setFetching(true);
    setQuestionsError(null);
    const timer = setTimeout(() => {
      examService
        .getQuestions({
          search: search.trim() || undefined,
          moduleId,
          groupType: "NONE",
          difficulty: difficulty !== "all" ? difficulty : undefined,
          questionType: questionType !== "all" ? questionType : undefined,
          questionTypes: questionType === "all" ? allowedQuestionTypes : undefined,
          status: "ACTIVE",
          page,
          size: 10,
        })
        .then((res) => {
          setQuestions(res.content);
          setTotalPages(res.totalPages || 1);
          setTotalElements(res.totalElements || res.content.length);
        })
        .catch((err) => {
          setQuestions([]);
          setQuestionsError(getApiErrorMessage(err, "Failed to load questions."));
        })
        .finally(() => {
          setFetching(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    open,
    search,
    moduleId,
    difficulty,
    questionType,
    page,
    allowedQuestionTypes,
  ]);

  useEffect(() => {
    if (open) {
      setSelectedMap(new Map());
      setPage(0);
    }
  }, [open]);

  const toggleSelect = (q: BankQuestionItem) => {
    if (existingQuestionIds.has(q.questionId)) return;
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(q.questionId)) {
        next.delete(q.questionId);
      } else {
        next.set(q.questionId, q);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleQuestions = questions.filter(
      (q) => !existingQuestionIds.has(q.questionId),
    );
    setSelectedMap((prev) => {
      const next = new Map(prev);
      visibleQuestions.forEach((q) => next.set(q.questionId, q));
      return next;
    });
  };

  const handleConfirm = () => {
    const list = Array.from(selectedMap.values()).map((q) => ({
      question: q,
      weight: Number(defaultWeight) > 0 ? Number(defaultWeight) : 1,
    }));
    onSelect(list);
  };

  const typeOptions = [
    { label: "All Allowed Types", value: "all" },
    ...allowedQuestionTypes.map((t) => ({
      label: t.replace("_", " "),
      value: t,
    })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select Questions from Question Bank"
      size="xl"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm text-content-secondary font-medium">
              Default Weight:
            </span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              value={defaultWeight}
              onChange={(e) =>
                setDefaultWeight(Math.max(0.01, Number(e.target.value) || 0.01))
              }
              className="w-16 px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
            />
            <span className="text-xs text-content-subtle ml-2">
              Selected:{" "}
              <strong className="text-content">{selectedMap.size}</strong>{" "}
              questions
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedMap.size === 0 || loading}
              loading={loading}
              icon={<Icon.Plus className="w-4 h-4" />}
            >
              Add Selected ({selectedMap.size})
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {questionsError && <Alert type="error" title="Could not load questions" message={questionsError} />}
        <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 sm:col-span-2 lg:col-span-2">
            <SearchInput
              placeholder="Search question text…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            className="min-w-0"
            value={courseName}
            onChange={() => {}}
            disabled
            options={[{ label: courseName, value: courseName }]}
          />
          <Select
            className="min-w-0"
            value={moduleName}
            onChange={() => {}}
            disabled
            options={[{ label: moduleName, value: moduleName }]}
          />
          <Select
            className="min-w-0 lg:col-span-2"
            value={difficulty}
            onChange={(v) => {
              setDifficulty(v as Difficulty | "all");
              setPage(0);
            }}
            options={[
              { label: "All Difficulties", value: "all" },
              { label: "Easy", value: "EASY" },
              { label: "Medium", value: "MEDIUM" },
              { label: "Hard", value: "HARD" },
            ]}
          />
          <Select
            className="min-w-0 lg:col-span-2"
            value={questionType}
            onChange={(v) => {
              setQuestionType(v);
              setPage(0);
            }}
            options={typeOptions}
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            disabled={
              fetching ||
              questions.every((q) => existingQuestionIds.has(q.questionId))
            }
          >
            Select All
          </Button>
        </div>

        <div className="border border-line rounded-[10px] overflow-hidden max-h-[380px] overflow-y-auto divide-y divide-line-faint">
          {fetching ? (
            <div className="py-12 text-center text-sm text-content-subtle">
              Loading questions from bank…
            </div>
          ) : questionsError ? (
            <div className="py-12 text-center text-sm text-danger">
              Questions could not be loaded. Retry by changing a filter.
            </div>
          ) : questions.length === 0 ? (
            <div className="py-12 text-center text-sm text-content-subtle">
              No matching ACTIVE questions found for this module and filters.
            </div>
          ) : (
            questions.map((q) => {
              const isAlreadyInExam = existingQuestionIds.has(q.questionId);
              const isChecked = selectedMap.has(q.questionId);

              return (
                <div
                  key={q.questionId}
                  onClick={() => !isAlreadyInExam && toggleSelect(q)}
                  className={`flex items-start gap-3 p-3.5 transition-colors select-none ${
                    isAlreadyInExam
                      ? "bg-surface-muted/60 opacity-60 cursor-not-allowed"
                      : isChecked
                        ? "bg-primary-light/40 cursor-pointer"
                        : "hover:bg-surface-hover cursor-pointer"
                  }`}
                >
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isChecked || isAlreadyInExam}
                      disabled={isAlreadyInExam}
                      onChange={() => toggleSelect(q)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content leading-snug line-clamp-2">
                      {q.content}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <Badge
                        variant="default"
                        className="text-2xs font-semibold"
                      >
                        {q.questionType.replace("_", " ")}
                      </Badge>
                      <Badge
                        variant={
                          q.difficulty === "EASY"
                            ? "success"
                            : q.difficulty === "MEDIUM"
                              ? "warning"
                              : "danger"
                        }
                        className="text-2xs"
                      >
                        {q.difficulty}
                      </Badge>
                      {q.moduleName && (
                        <span className="text-2xs text-content-subtle">
                          Module: {q.moduleName}
                        </span>
                      )}
                      {q.optionCount !== undefined && q.optionCount > 0 && (
                        <span className="text-2xs text-content-subtle">
                          · {q.optionCount} options
                        </span>
                      )}
                      {isAlreadyInExam && (
                        <span className="text-2xs font-medium text-warning bg-warning-light px-1.5 py-0.5 rounded">
                          Already added to exam
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-content-subtle px-1">
          <span>
            Total: {totalElements} questions · Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded border border-line hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 rounded border border-line hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
