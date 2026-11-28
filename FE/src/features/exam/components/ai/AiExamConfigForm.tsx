import React, { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Icon } from "@/assets/icons";
import { useToast } from "@/components/ui/ToastHost";
import {
  EXAM_MATERIAL_EXTENSIONS,
  EXAM_MATERIAL_MAX_BYTES,
  EXAM_MODE_OPTIONS,
  type ExamMode,
} from "@/services/exam.service";
import type { CourseModuleResponse, CourseSummaryItem } from "@/services/course.service";

interface AiExamConfigFormProps {
  courses: CourseSummaryItem[];
  modules: CourseModuleResponse[];
  courseId: string;
  onCourseChange: (v: string) => void;
  selectedModuleIds: number[];
  onSetSelectedModuleIds: (ids: number[]) => void;
  onToggleModuleId: (mid: number) => void;
  title: string;
  onTitleChange: (v: string) => void;
  durationMinutes: number;
  onDurationChange: (v: number) => void;
  maxScore: number;
  onMaxScoreChange: (v: number) => void;
  mode: ExamMode;
  onModeChange: (v: ExamMode) => void;
  language: "en" | "vi";
  onLanguageChange: (v: "en" | "vi") => void;
  materialFile: File | null;
  onMaterialFileChange: (f: File | null) => void;
  context: string;
  onContextChange: (v: string) => void;
  diffDist: { EASY: number; MEDIUM: number; HARD: number };
  onDiffDistChange: React.Dispatch<
    React.SetStateAction<{ EASY: number; MEDIUM: number; HARD: number }>
  >;
  allowedTypes: string[];
  typeCounts: Record<string, number>;
  onTypeCountsChange: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  totalDiff: number;
  totalTypes: number;
  isDiffMatch: boolean;
  isTypeMatch: boolean;
  questionCount: number;
  canGenerate: boolean;
  generating: boolean;
  editingDisabled: boolean;
  fieldErrors: Record<string, string>;
  onClearContextError: () => void;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onCancel: () => void;
}

const MSG06 = "AI is generating questions, please wait...";

export function AiExamConfigForm({
  courses,
  modules,
  courseId,
  onCourseChange,
  selectedModuleIds,
  onSetSelectedModuleIds,
  onToggleModuleId,
  title,
  onTitleChange,
  durationMinutes,
  onDurationChange,
  maxScore,
  onMaxScoreChange,
  mode,
  onModeChange,
  language,
  onLanguageChange,
  materialFile,
  onMaterialFileChange,
  context,
  onContextChange,
  diffDist,
  onDiffDistChange,
  allowedTypes,
  typeCounts,
  onTypeCountsChange,
  totalDiff,
  totalTypes,
  isDiffMatch,
  isTypeMatch,
  questionCount,
  canGenerate,
  generating,
  editingDisabled,
  fieldErrors,
  onClearContextError,
  onGenerate,
  onCancelGenerate,
  onCancel,
}: AiExamConfigFormProps) {
  const toast = useToast();
  const materialInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card p-6 space-y-5 max-w-4xl">
      <div className="border-b border-line-soft pb-3">
        <h3 className="text-lg font-bold text-content flex items-center gap-2">
          <Icon.Zap className="w-5 h-5 text-brand-ink" />
          Configure AI Exam Generation
        </h3>
        <p className="text-xs text-content-subtle mt-1">
          Specify your syllabus requirements and AI will generate an editable exam draft without
          saving to database.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <SearchableSelect
            label="Target Course *"
            value={courseId}
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
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-content-secondary">
              Modules (optional, multi-select)
            </label>
            {modules.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  className="text-brand-ink hover:underline"
                  onClick={() => onSetSelectedModuleIds(modules.map((m) => m.moduleId))}
                >
                  Select all
                </button>
                {selectedModuleIds.length > 0 && (
                  <button
                    type="button"
                    className="text-content-subtle hover:underline"
                    onClick={() => onSetSelectedModuleIds([])}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
          {!courseId ? (
            <div className="px-3 py-2 text-xs text-content-subtle rounded-[10px] border border-line bg-surface-muted">
              Select a course first
            </div>
          ) : modules.length === 0 ? (
            <div className="px-3 py-2 text-xs text-content-subtle rounded-[10px] border border-line bg-surface-muted">
              No modules in this course (questions will use course scope)
            </div>
          ) : (
            <div className="max-h-32 overflow-y-auto rounded-[10px] border border-line bg-surface p-2 space-y-1">
              {modules.map((m) => {
                const checked = selectedModuleIds.includes(m.moduleId);
                return (
                  <label
                    key={m.moduleId}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-xs text-content"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleModuleId(m.moduleId)}
                      className="rounded border-line text-brand-ink focus:ring-brand-ink"
                    />
                    <span className="truncate">{m.title}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-2xs text-content-subtle mt-1">
            {selectedModuleIds.length === 0
              ? "Leave empty to generate across the whole course; you can assign each question's module in the draft."
              : `${selectedModuleIds.length} module(s) selected for AI generation.`}
          </p>
        </div>

        <Input
          label="Suggested Exam Title"
          placeholder="e.g. Midterm Comprehensive Quiz"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
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
                onDurationChange(Math.max(1, Math.min(600, Number(e.target.value) || 1)))
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
              onChange={(e) => onMaxScoreChange(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <Select
          label="Mode"
          value={mode}
          onChange={(v) => onModeChange(v as ExamMode)}
          options={EXAM_MODE_OPTIONS}
        />

        <Select
          label="Language"
          value={language}
          onChange={(v) => onLanguageChange(v as "en" | "vi")}
          options={[
            { label: "English (en)", value: "en" },
            { label: "Vietnamese (vi)", value: "vi" },
          ]}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-content-secondary block mb-1">
          Study Material <span className="font-normal text-content-subtle">(optional)</span>
        </label>
        <input
          ref={materialInputRef}
          type="file"
          accept={EXAM_MATERIAL_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (!file) return;
            const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
            if (!(EXAM_MATERIAL_EXTENSIONS as readonly string[]).includes(ext)) {
              toast.error("Upload a PDF or DOCX file.", { title: "Unsupported file" });
              return;
            }
            if (file.size > EXAM_MATERIAL_MAX_BYTES) {
              toast.error("The material must not exceed 10 MB.", { title: "File too large" });
              return;
            }
            onMaterialFileChange(file);
            onClearContextError();
          }}
        />
        {materialFile ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] border border-line bg-surface">
            <Icon.FileText className="w-4 h-4 text-brand-ink flex-shrink-0" />
            <span className="text-sm text-content truncate flex-1" title={materialFile.name}>
              {materialFile.name}
            </span>
            <span className="text-2xs text-content-subtle flex-shrink-0">
              {(materialFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <button
              type="button"
              onClick={() => onMaterialFileChange(null)}
              disabled={generating}
              className="p-1 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content-secondary"
              aria-label="Remove material"
            >
              <Icon.X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon.Upload className="w-4 h-4" />}
            onClick={() => materialInputRef.current?.click()}
            disabled={generating}
          >
            Upload Material (PDF/DOCX)
          </Button>
        )}
        <p className="text-2xs text-content-subtle mt-1">
          AI writes the questions from this file (first 30,000 characters, max 10 MB).
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-content-secondary block mb-1">
          Instructions for AI{" "}
          {materialFile ? (
            <span className="font-normal text-content-subtle">(optional)</span>
          ) : (
            <span className="text-danger">*</span>
          )}
        </label>
        <textarea
          rows={3}
          maxLength={2000}
          required={!materialFile}
          aria-invalid={Boolean(fieldErrors.context)}
          className={`w-full px-3 py-1.5 text-sm rounded-[10px] border bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink ${fieldErrors.context ? "border-danger-line" : "border-line"}`}
          placeholder="e.g. Focus on recursion and Big-O, for second-year students, use real-world scenarios."
          value={context}
          onChange={(e) => {
            onContextChange(e.target.value);
            if (e.target.value.trim()) {
              onClearContextError();
            }
          }}
        />
        {fieldErrors.context && (
          <p className="text-2xs text-danger mt-1">{fieldErrors.context}</p>
        )}
        <p className="text-2xs text-content-subtle mt-1">
          Describe the topics, audience, or constraints for the generated exam. {context.length}
          /2000
        </p>
      </div>

      <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-content">Difficulty Distribution</h4>
          <span
            className={`text-xs font-semibold ${isDiffMatch ? "text-success" : "text-danger"}`}
          >
            Total questions: {totalDiff}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(["EASY", "MEDIUM", "HARD"] as const).map((level) => (
            <div key={level}>
              <label className="text-xs font-medium text-content-secondary block mb-1">
                {level.charAt(0) + level.slice(1).toLowerCase()}
              </label>
              <input
                type="number"
                min={0}
                max={50}
                className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                value={diffDist[level]}
                onChange={(e) =>
                  onDiffDistChange((prev) => ({
                    ...prev,
                    [level]: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-content">Question Types Breakdown</h4>
          <span
            className={`text-xs font-semibold ${isTypeMatch ? "text-success" : "text-danger"}`}
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
                  onTypeCountsChange((prev) => ({ ...prev, [qt]: val }));
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
            <span className="text-xs text-content-subtle animate-pulse">{MSG06}</span>
            <Button variant="danger" size="sm" onClick={onCancelGenerate}>
              Cancel Generation
            </Button>
          </div>
        ) : (
          <Button
            icon={<Icon.Zap className="w-4 h-4" />}
            onClick={onGenerate}
            disabled={!canGenerate || editingDisabled}
          >
            Generate Draft ({questionCount} Questions)
          </Button>
        )}
      </div>
    </div>
  );
}
