import React from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table } from "@/components/ui/Table";
import { Icon } from "@/assets/icons";
import type { ExamListItem } from "@/services/exam.service";
import { useExamList } from "../hooks/useExamList";
import { ExamListFilters } from "../components/list/ExamListFilters";
import { buildExamListColumns } from "../components/list/examListColumns";
import { ExamStatusDialog } from "../components/list/ExamStatusDialog";
import { ExamDeleteDialogs } from "../components/list/ExamDeleteDialogs";

export function ExamListPage() {
  const list = useExamList();

  const columns = buildExamListColumns({
    onEdit: list.handleEditExam,
    onChangeStatus: (exam, targetStatus) => list.setStatusDialogTarget({ exam, targetStatus }),
    onDelete: (exam) => {
      list.setDeleteConflict409(false);
      list.setDeleteDialogTarget(exam);
    },
  });

  const tableRows = list.exams.map((exam) => ({ ...exam, id: exam.examId }));

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">Exams</h2>
          <p className="text-xs text-content-subtle mt-0.5">
            Manage quizzes and assessments, including essays, diagrams, and other response types.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {list.selectedExamIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              loading={list.bulkDeleting}
              icon={<Icon.Trash className="w-4 h-4" />}
              onClick={() => list.setBulkDeleteConfirmOpen(true)}
            >
              Bulk Delete ({list.selectedExamIds.size})
            </Button>
          )}

          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            onClick={list.handleExportCsv}
          >
            Export CSV
          </Button>

          <Dropdown
            trigger={
              <Button icon={<Icon.Plus className="w-4 h-4" />}>
                New Exam <Icon.ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            }
            items={[
              {
                label: "Quiz Exam",
                icon: <Icon.HelpCircle className="w-4 h-4" />,
                onClick: () => list.handleNewExam("QUIZ"),
              },
              {
                label: "Assessment Exam",
                icon: <Icon.FileText className="w-4 h-4" />,
                onClick: () => list.handleNewExam("ESSAY"),
              },
              {
                label: "Code Exam",
                icon: <Icon.Code className="w-4 h-4" />,
                onClick: () => list.handleNewExam("CODE"),
              },
            ]}
          />
        </div>
      </div>

      <ExamListFilters
        activeTab={list.activeTab}
        onTabChange={list.handleTabChange}
        searchTerm={list.searchTerm}
        onSearchChange={list.handleSearchChange}
        selectedCourse={list.selectedCourse}
        onCourseChange={list.handleCourseChange}
        selectedModule={list.selectedModule}
        onModuleChange={list.handleModuleChange}
        selectedStatus={list.selectedStatus}
        onStatusChange={list.handleStatusChange}
        courses={list.courses}
        modules={list.modules}
        filtersActive={list.filtersActive}
        onClearFilters={list.clearFilters}
        totalElements={list.totalElements}
      />

      <div className="card overflow-hidden">
        {list.error ? (
          <div className="space-y-3 p-12 text-center">
            <p className="text-sm font-medium text-danger">
              Exam list could not be loaded. See the notification for details.
            </p>
            <Button size="sm" variant="outline" onClick={() => void list.fetchExams()}>
              Retry
            </Button>
          </div>
        ) : list.loading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        ) : list.exams.length === 0 ? (
          <div className="space-y-3 p-16 text-center">
            <Icon.ClipboardList className="mx-auto h-10 w-10 text-content-subtle" />
            <h4 className="text-base font-semibold text-content">No exams found</h4>
            <p className="mx-auto max-w-sm text-xs text-content-subtle">
              There are no exams matching your search criteria. Create a quiz or assessment to get
              started.
            </p>
            <div className="flex justify-center pt-2">
              {list.activeTab === "ASSESSMENT" ? (
                <Button
                  onClick={() => list.handleNewExam("ESSAY")}
                  icon={<Icon.Plus className="h-4 w-4" />}
                >
                  New Assessment
                </Button>
              ) : list.activeTab === "CODE" ? (
                <Button
                  onClick={() => list.handleNewExam("CODE")}
                  icon={<Icon.Plus className="h-4 w-4" />}
                >
                  New Code Exam
                </Button>
              ) : (
                <Button
                  onClick={() => list.handleNewExam("QUIZ")}
                  icon={<Icon.Plus className="h-4 w-4" />}
                >
                  New Exam
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Table
            columns={columns}
            data={tableRows}
            selectable
            selectedKeys={new Set([...list.selectedExamIds].map(String))}
            onSelectionChange={(keys) => list.setSelectedExamIds(new Set([...keys].map(Number)))}
            onRowClick={(row) => list.handleEditExam(row as unknown as ExamListItem)}
            isRowActive={(row) => list.selectedExamIds.has(Number(row.examId))}
            perPage={15}
            unit="exams"
            serverPagination={{
              page: list.page + 1,
              total: list.totalElements,
              onChange: list.handlePageChange,
            }}
          />
        )}
      </div>

      <ExamStatusDialog
        target={list.statusDialogTarget}
        updating={list.statusUpdating}
        warnings={list.statusWarnings}
        onClose={() => list.setStatusDialogTarget(null)}
        onConfirm={list.handleApplyStatusChange}
        onCloseWarnings={() => {
          list.setStatusDialogTarget(null);
          list.setStatusWarnings([]);
        }}
      />

      <ExamDeleteDialogs
        deleteTarget={list.deleteDialogTarget}
        deleteConflict409={list.deleteConflict409}
        deleting={list.deleting}
        onCloseDelete={() => list.setDeleteDialogTarget(null)}
        onConfirmDelete={list.handleDeleteExam}
        onCloseConflict={() => {
          list.setDeleteDialogTarget(null);
          list.setDeleteConflict409(false);
        }}
        onArchiveInstead={list.handleArchiveAfterConflict}
        bulkDeleteConfirmOpen={list.bulkDeleteConfirmOpen}
        bulkDeleting={list.bulkDeleting}
        selectedCount={list.selectedExamIds.size}
        onCloseBulkDelete={() => list.setBulkDeleteConfirmOpen(false)}
        onConfirmBulkDelete={list.handleBulkDelete}
        bulkDeleteSummary={list.bulkDeleteSummary}
        onCloseBulkSummary={() => list.setBulkDeleteSummary(null)}
      />
    </div>
  );
}
