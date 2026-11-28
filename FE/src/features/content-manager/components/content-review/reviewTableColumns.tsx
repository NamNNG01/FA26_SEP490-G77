import React from "react";
import { Badge } from "@/components/ui/Badge";
import type { TableColumn } from "@/components/ui/Table";
import {
  idOf,
  isPending,
  questionTypeLabel,
  statusLabel,
  statusOf,
  type Kind,
  type Row,
} from "../../utils/contentReviewHelpers";

interface BuildReviewColumnsArgs {
  kind: Kind;
  studentNames: Map<string, string>;
  courseNameOf: (row: Row) => string;
  moduleNameOf: (row: Row) => string;
}

export function buildReviewTableColumns({
  kind,
  studentNames,
  courseNameOf,
  moduleNameOf,
}: BuildReviewColumnsArgs): TableColumn[] {
  return [
    {
      key: "submission",
      label: "Submission",
      width: "36%",
      render: (value) => {
        const row = value as Row;
        const id = idOf(row, kind);
        const title = row.title || row.contentPreview || row.content || `Submission #${id}`;
        const subtitle =
          kind === "decks"
            ? `${row.cardCount ?? 0} cards${row.moduleId != null || row.module?.title || row.module?.name || row.moduleName || row.moduleTitle ? ` · ${moduleNameOf(row)}` : ""}`
            : row.questionType
              ? questionTypeLabel(row.questionType)
              : `Submission #${id}`;
        return (
          <div className="min-w-0">
            <p className="line-clamp-2 whitespace-normal font-medium text-content" title={title}>
              {title}
            </p>
            <p className="mt-1 truncate text-xs text-content-secondary" title={subtitle}>
              {subtitle}
            </p>
          </div>
        );
      },
    },
    {
      key: "contributor",
      label: "Contributor",
      render: (value) => {
        const row = value as Row;
        const id = row.contributor?.userId ?? row.contributor?.id ?? row.contributorId;
        return (
          row.owner?.fullName ||
          row.contributor?.fullName ||
          row.contributor?.displayName ||
          row.contributor?.name ||
          studentNames.get(String(id)) ||
          row.contributorName ||
          (id ? `Contributor #${id}` : "—")
        );
      },
    },
    {
      key: "course",
      label: "Course",
      render: (value) => (
        <span className="block truncate" title={courseNameOf(value as Row)}>
          {courseNameOf(value as Row)}
        </span>
      ),
    },
    {
      key: "module",
      label: "Module",
      render: (value) => (
        <span className="block truncate" title={moduleNameOf(value as Row)}>
          {moduleNameOf(value as Row)}
        </span>
      ),
    },
    {
      key: "submittedAt",
      label: "Submitted",
      className: "whitespace-nowrap",
      render: (value) => {
        const submittedAt = (value as Row).submittedAt;
        return submittedAt ? new Date(submittedAt).toLocaleString() : "—";
      },
    },
    {
      key: "status",
      label: "Status",
      render: (value) => {
        const current = statusOf(value as Row, kind);
        const variant = isPending(kind, current)
          ? "warning"
          : current === "REJECTED"
            ? "danger"
            : "success";
        return <Badge variant={variant}>{statusLabel(current || "")}</Badge>;
      },
    },
  ];
}
