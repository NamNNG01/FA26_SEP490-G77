import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import type { CourseModuleResponse, CourseSummaryItem } from "@/services/course.service";
import type { ExamListTab } from "../../hooks/useExamList";

interface ExamListFiltersProps {
  activeTab: ExamListTab;
  onTabChange: (tab: ExamListTab) => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  selectedCourse: string;
  onCourseChange: (val: string) => void;
  selectedModule: string;
  onModuleChange: (val: string) => void;
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  courses: CourseSummaryItem[];
  modules: CourseModuleResponse[];
  filtersActive: boolean;
  onClearFilters: () => void;
  totalElements: number;
}

export function ExamListFilters({
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  selectedCourse,
  onCourseChange,
  selectedModule,
  onModuleChange,
  selectedStatus,
  onStatusChange,
  courses,
  modules,
  filtersActive,
  onClearFilters,
  totalElements,
}: ExamListFiltersProps) {
  return (
    <>
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => onTabChange("all")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "all"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          All Exams
        </button>
        <button
          type="button"
          onClick={() => onTabChange("QUIZ")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "QUIZ"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.HelpCircle className="w-4 h-4" />
          Quiz
        </button>
        <button
          type="button"
          onClick={() => onTabChange("ASSESSMENT")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "ASSESSMENT"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.FileText className="w-4 h-4" />
          Assessments
        </button>
        <button
          type="button"
          onClick={() => onTabChange("CODE")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "CODE"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.Code className="w-4 h-4" />
          Code
        </button>
      </div>

      <div className="card space-y-3 px-4 py-4">
        <SearchInput
          className="w-full"
          placeholder="Search exams…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search exams"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SearchableSelect
            label="Course"
            value={selectedCourse}
            onChange={onCourseChange}
            placeholder="All courses"
            searchPlaceholder="Search courses…"
            emptyText="No courses found"
            options={[
              { label: "All courses", value: "" },
              ...courses.map((course) => ({
                label: course.title,
                value: String(course.courseId),
              })),
            ]}
          />
          <SearchableSelect
            label="Module"
            value={selectedModule}
            disabled={!selectedCourse}
            onChange={onModuleChange}
            placeholder={selectedCourse ? "All modules" : "Select a course first"}
            searchPlaceholder="Search modules…"
            emptyText="No modules found"
            options={[
              {
                label: selectedCourse ? "All modules" : "Select a course first",
                value: "",
              },
              ...modules.map((module) => ({
                label: module.title,
                value: String(module.moduleId),
              })),
            ]}
          />
          <Select
            label="Status"
            value={selectedStatus}
            onChange={onStatusChange}
            options={[
              { label: "All statuses", value: "all" },
              { label: "Draft", value: "DRAFT" },
              { label: "Published", value: "PUBLISHED" },
              { label: "Archived", value: "ARCHIVED" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {filtersActive && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"
            >
              <Icon.X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
          <Badge variant="default" className="font-semibold text-xs">
            {totalElements} exams
          </Badge>
        </div>
      </div>
    </>
  );
}
