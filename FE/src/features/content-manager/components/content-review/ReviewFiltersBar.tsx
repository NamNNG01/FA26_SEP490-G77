import React from "react";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/common/SearchInput";
import {
  apiStatus,
  QUESTION_TYPES,
  questionTypeLabel,
  type Kind,
} from "../../utils/contentReviewHelpers";

interface Option {
  label: string;
  value: string;
}

interface ReviewFiltersBarProps {
  kind: Kind;
  onSwitchKind: (tab: Kind) => void;
  keyword: string;
  onKeywordChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  courseId: string;
  onCourseChange: (v: string) => void;
  moduleId: string;
  onModuleChange: (v: string) => void;
  contributorId: string;
  onContributorChange: (v: string) => void;
  onContributorSearchChange: (v: string) => void;
  studentsLoading: boolean;
  questionType: string;
  onQuestionTypeChange: (v: string) => void;
  difficulty: string;
  onDifficultyChange: (v: string) => void;
  submittedFrom: string;
  onSubmittedFromChange: (v: string) => void;
  submittedTo: string;
  onSubmittedToChange: (v: string) => void;
  courseOptions: Option[];
  moduleOptions: Option[];
  contributorOptions: Option[];
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onClear: () => void;
  onSubmit: () => void;
}

export function ReviewFiltersBar({
  kind,
  onSwitchKind,
  keyword,
  onKeywordChange,
  status,
  onStatusChange,
  courseId,
  onCourseChange,
  moduleId,
  onModuleChange,
  contributorId,
  onContributorChange,
  onContributorSearchChange,
  studentsLoading,
  questionType,
  onQuestionTypeChange,
  difficulty,
  onDifficultyChange,
  submittedFrom,
  onSubmittedFromChange,
  submittedTo,
  onSubmittedToChange,
  courseOptions,
  moduleOptions,
  contributorOptions,
  busy,
  refreshing,
  onRefresh,
  onClear,
  onSubmit,
}: ReviewFiltersBarProps) {
  return (
    <>
      <div className="flex gap-2 border-b border-line" role="tablist" aria-label="Review type">
        {(["contributions", "decks"] as Kind[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={kind === tab}
            onClick={() => onSwitchKind(tab)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${kind === tab ? "border-brand-600 text-brand-700" : "border-transparent text-content-secondary hover:text-content"}`}
          >
            {tab === "contributions" ? "Question contributions" : "Flashcard decks"}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="card space-y-3 px-4 py-4"
      >
        <SearchInput
          className="w-full"
          aria-label="Search submissions"
          placeholder="Search submissions…"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Status"
            value={status}
            onChange={(value) => onStatusChange(apiStatus(kind, value))}
            options={[
              { label: "Pending", value: kind === "contributions" ? "PENDING" : "PENDING_REVIEW" },
              {
                label: kind === "contributions" ? "Accepted" : "Approved",
                value: kind === "contributions" ? "ACCEPTED" : "APPROVED",
              },
              { label: "Rejected", value: "REJECTED" },
              { label: "All statuses", value: "ALL" },
            ]}
          />
          <SearchableSelect
            label="Course"
            options={courseOptions}
            value={courseId}
            onChange={onCourseChange}
            placeholder="All courses"
            searchPlaceholder="Search courses…"
          />
          <SearchableSelect
            label="Module"
            options={moduleOptions}
            value={moduleId}
            onChange={onModuleChange}
            disabled={!courseId}
            placeholder={courseId ? "All modules" : "Choose a course first"}
            searchPlaceholder="Search modules…"
          />
          <SearchableSelect
            label="Contributor"
            options={contributorOptions}
            value={contributorId}
            onChange={onContributorChange}
            onSearchChange={onContributorSearchChange}
            placeholder="Any contributor"
            searchPlaceholder="Search students by name…"
            emptyText={studentsLoading ? "Searching students…" : "No students found"}
          />
          {kind === "contributions" && (
            <>
              <Select
                label="Question type"
                triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm"
                value={questionType}
                onChange={onQuestionTypeChange}
                options={[
                  { label: "All question types", value: "" },
                  ...QUESTION_TYPES.map((type) => ({
                    label: questionTypeLabel(type),
                    value: type,
                  })),
                ]}
              />
              <Select
                label="Difficulty"
                triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm"
                value={difficulty}
                onChange={onDifficultyChange}
                options={[
                  { label: "All difficulties", value: "" },
                  { label: "Easy", value: "EASY" },
                  { label: "Medium", value: "MEDIUM" },
                  { label: "Hard", value: "HARD" },
                ]}
              />
            </>
          )}
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">
            Submitted after
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-content"
              value={submittedFrom}
              onChange={(e) => onSubmittedFromChange(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">
            Submitted before
            <input
              type="datetime-local"
              className="h-10 rounded-lg border border-line bg-surface px-3 text-content"
              value={submittedTo}
              onChange={(e) => onSubmittedToChange(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || refreshing}
            loading={refreshing}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onClear}>
            Clear filters
          </Button>
          <Button type="submit" loading={busy}>
            Apply filters
          </Button>
        </div>
      </form>
    </>
  );
}
