import React, { useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/assets/icons";
import type { CourseDetailResponse, CourseManagerItem } from "@/services/course.service";
import type { ManagerOption } from "../../hooks/useCourseDetail";

export function CourseManagerList({
  course,
  canEdit,
  managerOptions,
  selectedManagerIds,
  onSelectedManagerIdsChange,
  loadingManagers,
  saving,
}: Readonly<{
  course: CourseDetailResponse & { managers?: CourseManagerItem[] };
  canEdit: boolean;
  managerOptions: ManagerOption[];
  selectedManagerIds: string[];
  onSelectedManagerIdsChange: (ids: string[]) => void;
  loadingManagers: boolean;
  saving: boolean;
}>) {
  const INITIAL_SHOW = 3;
  const [expanded, setExpanded] = useState(false);
  const managerList: CourseManagerItem[] =
    course.managers && course.managers.length > 0
      ? course.managers
      : [
          {
            userId: course.managerId,
            fullName: course.managerName || `Manager #${course.managerId}`,
            email: undefined,
          },
        ];

  const availableManagers = [
    ...managerOptions,
    ...managerList
      .filter((manager) => !managerOptions.some((option) => option.id === manager.userId))
      .map((manager) => ({
        id: manager.userId,
        name: manager.fullName,
        email: manager.email,
      })),
  ];
  const selectedManagers = selectedManagerIds
    .map((id) => availableManagers.find((manager) => String(manager.id) === id))
    .filter((manager): manager is ManagerOption => Boolean(manager));
  const hasMore = managerList.length > INITIAL_SHOW;
  const visible = expanded || !hasMore ? managerList : managerList.slice(0, INITIAL_SHOW);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-content-secondary">
          Course Managers
          <span className="ml-1.5 text-xs font-normal text-content-soft">
            ({managerList.length})
          </span>
        </label>
      </div>
      {canEdit && (
        <Dropdown
          multi
          search
          searchPlaceholder="Search course managers..."
          values={selectedManagerIds}
          onSelectMulti={(values) => onSelectedManagerIdsChange(values.map(String))}
          trigger={
            <button
              type="button"
              disabled={loadingManagers || saving}
              className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] border border-line bg-surface text-sm text-left hover:border-primary disabled:opacity-60"
            >
              <span className="truncate text-content-secondary">
                {loadingManagers
                  ? "Loading course managers…"
                  : selectedManagerIds.length > 0
                    ? `${selectedManagerIds.length} manager${selectedManagerIds.length === 1 ? "" : "s"} selected`
                    : "Select course managers…"}
              </span>
              <Icon.ChevronDown className="w-4 h-4 text-content-soft shrink-0 ml-2" />
            </button>
          }
          items={availableManagers.map((manager) => ({
            label: manager.email ? `${manager.name} (${manager.email})` : manager.name,
            value: String(manager.id),
          }))}
        />
      )}
      {canEdit && selectedManagers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedManagers.map((manager) => (
            <span
              key={manager.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
            >
              {manager.name}
              <button
                type="button"
                onClick={() =>
                  onSelectedManagerIdsChange(
                    selectedManagerIds.filter((id) => id !== String(manager.id)),
                  )
                }
                className="hover:text-danger transition-colors"
                aria-label={`Remove ${manager.name}`}
              >
                <Icon.X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {!canEdit && (
        <div className="rounded-[10px] border border-line overflow-hidden">
          {visible.map((manager, idx) => (
            <div
              key={manager.userId}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm ${idx > 0 ? "border-t border-line-faint" : ""} bg-surface-alt`}
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">
                  {manager.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content truncate">{manager.fullName}</p>
                {manager.email && (
                  <p className="text-xs text-content-soft truncate">{manager.email}</p>
                )}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-content-soft hover:text-primary hover:bg-primary/5 border-t border-line-faint transition-colors"
            >
              {expanded ? (
                <>
                  <Icon.ChevronDown className="w-3.5 h-3.5 rotate-180" />
                  Show less
                </>
              ) : (
                <>
                  <Icon.ChevronDown className="w-3.5 h-3.5" />
                  Show {managerList.length - INITIAL_SHOW} more manager
                  {managerList.length - INITIAL_SHOW !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
