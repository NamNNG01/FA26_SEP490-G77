import React from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  EXAM_MODE_OPTIONS,
  type ExamMode,
  type QuestionOrder,
} from "@/services/exam.service";
import type { CourseModuleResponse, CourseSummaryItem } from "@/services/course.service";

const QUESTION_ORDER_OPTIONS: { label: string; value: QuestionOrder }[] = [
  { label: "Manual (Fixed Order)", value: "MANUAL" },
  { label: "Random (Keep Groups Together)", value: "RANDOM" },
];

interface ExamSettingsSectionProps {
  courses: CourseSummaryItem[];
  modules: CourseModuleResponse[];
  courseId: string;
  onCourseChange: (v: string) => void;
  moduleId: string;
  onModuleChange: (v: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  durationMinutes: number;
  onDurationChange: (v: number) => void;
  maxScore: number;
  onMaxScoreChange: (v: number) => void;
  mode: ExamMode;
  onModeChange: (v: ExamMode) => void;
  questionOrder: QuestionOrder;
  onQuestionOrderChange: (v: QuestionOrder) => void;
  isReadOnly: boolean;
  hasAddedQuestions: boolean;
  fieldErrors: Record<string, string>;
}

export function ExamSettingsSection({
  courses,
  modules,
  courseId,
  onCourseChange,
  moduleId,
  onModuleChange,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  durationMinutes,
  onDurationChange,
  maxScore,
  onMaxScoreChange,
  mode,
  onModeChange,
  questionOrder,
  onQuestionOrderChange,
  isReadOnly,
  hasAddedQuestions,
  fieldErrors,
}: ExamSettingsSectionProps) {
  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-base font-bold text-content border-b border-line-soft pb-2.5">
        Exam Basic Information
      </h3>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <SearchableSelect
              label="Course *"
              value={courseId}
              disabled={isReadOnly || hasAddedQuestions}
              onChange={onCourseChange}
              options={[
                { label: "Select Course", value: "" },
                ...courses.map((c) => ({
                  label: c.title,
                  value: String(c.courseId),
                })),
              ]}
              placeholder="Select course"
              searchPlaceholder="Search courses…"
              emptyText="No courses found"
            />
            {fieldErrors.courseId && (
              <p className="text-xs text-danger mt-1">{fieldErrors.courseId}</p>
            )}
          </div>

          <div>
            <SearchableSelect
              label="Module *"
              value={moduleId}
              disabled={isReadOnly || !courseId || hasAddedQuestions}
              onChange={onModuleChange}
              options={[
                { label: "Select Module", value: "" },
                ...modules.map((m) => ({
                  label: m.title,
                  value: String(m.moduleId),
                })),
              ]}
              placeholder={!courseId ? "Select a course first" : "Select module"}
              searchPlaceholder="Search modules…"
              emptyText="No modules found"
            />
            {fieldErrors.moduleId && (
              <p className="text-xs text-danger mt-1">{fieldErrors.moduleId}</p>
            )}
          </div>
        </div>
        {hasAddedQuestions && !isReadOnly && (
          <p className="text-xs text-content-subtle -mt-2">
            Remove all added questions before changing the course or module.
          </p>
        )}

        <div>
          <Input
            label="Exam Title *"
            placeholder="Enter exam title..."
            maxLength={255}
            value={title}
            disabled={isReadOnly}
            onChange={(e) => onTitleChange(e.target.value)}
          />
          {fieldErrors.title && <p className="text-xs text-danger mt-1">{fieldErrors.title}</p>}
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
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              onChange={(e) => onDurationChange(Number(e.target.value) || 0)}
            />
            {fieldErrors.durationMinutes && (
              <p className="text-2xs text-danger mt-0.5">{fieldErrors.durationMinutes}</p>
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
              onChange={(e) => onMaxScoreChange(Number(e.target.value) || 0)}
            />
            {fieldErrors.maxScore && (
              <p className="text-2xs text-danger mt-0.5">{fieldErrors.maxScore}</p>
            )}
          </div>

          <Select
            label="Mode"
            value={mode}
            disabled={isReadOnly}
            onChange={(v) => onModeChange(v as ExamMode)}
            options={EXAM_MODE_OPTIONS}
          />

          <Select
            label="Question Order"
            value={questionOrder}
            disabled={isReadOnly}
            onChange={(v) => onQuestionOrderChange(v as QuestionOrder)}
            options={QUESTION_ORDER_OPTIONS}
          />
        </div>
      </div>
    </div>
  );
}
