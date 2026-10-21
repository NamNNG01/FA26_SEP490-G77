import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import { examService, type BankQuestionItem } from "@/services/exam.service";
import {
  courseService,
  type CourseSummaryItem,
  type CourseModuleResponse,
} from "@/services/course.service";

interface QuestionBankSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (items: { question: BankQuestionItem; points: number }[]) => void;
  allowedQuestionTypes: string[];
  existingQuestionIds: Set<number>;
  initialCourseId?: number;
  initialModuleId?: number;
  loading?: boolean;
}

export function QuestionBankSelectModal({
  open,
  onClose,
  onSelect,
  allowedQuestionTypes,
  existingQuestionIds,
  initialCourseId,
  initialModuleId,
  loading = false,
}: QuestionBankSelectModalProps) {
  const [questions, setQuestions] = useState<BankQuestionItem[]>([]);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState<string>(
    initialCourseId ? String(initialCourseId) : "",
  );
  const [moduleId, setModuleId] = useState<string>(
    initialModuleId ? String(initialModuleId) : "",
  );
  const [difficulty, setDifficulty] = useState<string>("all");
  const [questionType, setQuestionType] = useState<string>("all");
  const [defaultPoints, setDefaultPoints] = useState<number>(1);
  const [selectedMap, setSelectedMap] = useState<Map<number, BankQuestionItem>>(
    new Map(),
  );
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);

  useEffect(() => {
    if (!open) return;
    courseService.getCourses().then((res) => {
      setCourses(res.content || []);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (courseId) {
      courseService.getCourseModules(courseId).then((mods) => {
        setModules(mods || []);
      });
    } else {
      setModules([]);
      setModuleId("");
    }
  }, [open, courseId]);

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    const timer = setTimeout(() => {
      examService
        .getQuestions({
          search: search.trim() || undefined,
          courseId: courseId ? Number(courseId) : undefined,
          moduleId: moduleId ? Number(moduleId) : undefined,
          difficulty: difficulty !== "all" ? difficulty : undefined,
          questionType: questionType !== "all" ? questionType : undefined,
          status: "ACTIVE",
          page,
          size: 10,
        })
        .then((res) => {
          const filtered = res.content.filter((q) =>
            allowedQuestionTypes.includes(q.questionType),
          );
          setQuestions(filtered);
          setTotalPages(res.totalPages || 1);
          setTotalElements(res.totalElements || filtered.length);
        })
        .catch(() => {
          setQuestions([]);
        })
        .finally(() => {
          setFetching(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    open,
    search,
    courseId,
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
      if (initialCourseId) setCourseId(String(initialCourseId));
      if (initialModuleId) setModuleId(String(initialModuleId));
    }
  }, [open, initialCourseId, initialModuleId]);

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
      points: Number(defaultPoints) > 0 ? Number(defaultPoints) : 1,
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
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-sm text-content-secondary font-medium">
              Default Points:
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={defaultPoints}
              onChange={(e) =>
                setDefaultPoints(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-16 px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
            />
            <span className="text-xs text-content-subtle ml-2">
              Selected:{" "}
              <strong className="text-content">{selectedMap.size}</strong>{" "}
              questions
            </span>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <SearchInput
            placeholder="Search question text…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <Select
            value={courseId}
            onChange={(v) => {
              setCourseId(v);
              setModuleId("");
              setPage(0);
            }}
            options={[
              { label: "All Courses", value: "" },
              ...courses.map((c) => ({
                label: c.title,
                value: String(c.courseId),
              })),
            ]}
          />
          <Select
            value={moduleId}
            onChange={(v) => {
              setModuleId(v);
              setPage(0);
            }}
            disabled={!courseId}
            options={[
              { label: "All Modules", value: "" },
              ...modules.map((m) => ({
                label: m.title,
                value: String(m.moduleId),
              })),
            ]}
          />
          <div className="flex gap-2">
            <Select
              className="flex-1"
              value={difficulty}
              onChange={(v) => {
                setDifficulty(v);
                setPage(0);
              }}
              options={[
                { label: "All Diff", value: "all" },
                { label: "Easy", value: "EASY" },
                { label: "Medium", value: "MEDIUM" },
                { label: "Hard", value: "HARD" },
              ]}
            />
            <Select
              className="flex-1"
              value={questionType}
              onChange={(v) => {
                setQuestionType(v);
                setPage(0);
              }}
              options={typeOptions}
            />
          </div>
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
          ) : questions.length === 0 ? (
            <div className="py-12 text-center text-sm text-content-subtle">
              No matching ACTIVE questions found for the selected filters.
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
