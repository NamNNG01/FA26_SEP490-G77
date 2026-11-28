import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import type { TableColumn } from "@/components/ui/Table";
import { Icon } from "@/assets/icons";
import type { ExamListItem, ExamStatus } from "@/services/exam.service";

const asExam = (row: Record<string, unknown>) => row as unknown as ExamListItem;

interface ExamListColumnActions {
  onEdit: (exam: ExamListItem) => void;
  onChangeStatus: (exam: ExamListItem, targetStatus: ExamStatus) => void;
  onDelete: (exam: ExamListItem) => void;
}

export function buildExamListColumns({
  onEdit,
  onChangeStatus,
  onDelete,
}: ExamListColumnActions): TableColumn[] {
  return [
    {
      key: "title",
      label: "Exam title",
      render: (value) => (
        <span
          className="line-clamp-2 whitespace-normal font-medium text-content"
          title={asExam(value).title}
        >
          {asExam(value).title}
        </span>
      ),
    },
    {
      key: "courseName",
      label: "Course",
      render: (value) => (
        <span className="block truncate" title={asExam(value).courseName}>
          {asExam(value).courseName}
        </span>
      ),
    },
    {
      key: "moduleName",
      label: "Module",
      render: (value) => asExam(value).moduleName || "—",
    },
    {
      key: "examKind",
      label: "Kind",
      render: (value) => {
        const kind = asExam(value).examKind;
        return (
          <Badge
            variant={kind === "QUIZ" ? "purple" : kind === "CODE" ? "warning" : "default"}
            className="whitespace-nowrap text-2xs"
          >
            {kind === "DIAGRAM" || !kind ? "ESSAY" : kind}
          </Badge>
        );
      },
    },
    {
      key: "questionCount",
      label: "Questions",
      className: "whitespace-nowrap",
      render: (value) => asExam(value).questionCount,
    },
    {
      key: "maxScore",
      label: "Max score",
      className: "whitespace-nowrap",
      render: (value) => {
        const exam = asExam(value);
        return exam.maxScore ?? exam.totalPoints ?? 0;
      },
    },
    {
      key: "durationMinutes",
      label: "Duration",
      className: "whitespace-nowrap",
      render: (value) => `${asExam(value).durationMinutes}m`,
    },
    {
      key: "status",
      label: "Status",
      render: (value) => {
        const status = asExam(value).status;
        return (
          <Badge
            variant={
              status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "default" : "warning"
            }
            className="whitespace-nowrap text-2xs"
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </Badge>
        );
      },
    },
    {
      key: "createdAt",
      label: "Created",
      className: "whitespace-nowrap",
      render: (value) => new Date(asExam(value).createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      label: "Actions",
      className: "whitespace-nowrap",
      render: (value) => {
        const exam = asExam(value);
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${exam.title}`}
                  className="rounded-[6px] p-1.5 text-content-subtle hover:bg-surface-hover hover:text-content"
                >
                  <Icon.MoreHorizontal className="h-4 w-4" />
                </button>
              }
              items={[
                {
                  label: "Edit",
                  icon: <Icon.Edit className="h-4 w-4" />,
                  onClick: () => onEdit(exam),
                },
                ...(exam.status === "DRAFT"
                  ? [
                      {
                        label: "Publish",
                        icon: <Icon.CheckCircle className="h-4 w-4" />,
                        disabled: exam.questionCount === 0 && exam.generationType === "STATIC",
                        onClick: () => onChangeStatus(exam, "PUBLISHED"),
                      },
                    ]
                  : []),
                {
                  label: "Archive",
                  icon: <Icon.Archive className="h-4 w-4" />,
                  disabled: exam.status === "ARCHIVED",
                  onClick: () => onChangeStatus(exam, "ARCHIVED"),
                },
                { divider: true } as { label: string; divider: true },
                {
                  label: "Delete",
                  icon: <Icon.Trash className="h-4 w-4" />,
                  danger: true,
                  onClick: () => onDelete(exam),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];
}
