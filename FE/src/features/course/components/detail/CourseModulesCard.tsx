import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import type { CourseModuleResponse } from "@/services/course.service";

interface CourseModulesCardProps {
  modules: CourseModuleResponse[];
  canCreateModule: boolean;
  reorderingModuleId: number | null;
  onAddModule: () => void;
  onMoveModule: (moduleId: number, direction: -1 | 1) => void;
  onEditModule: (mod: CourseModuleResponse) => void;
  onRemoveModule: (mod: CourseModuleResponse) => void;
}

export function CourseModulesCard({
  modules,
  canCreateModule,
  reorderingModuleId,
  onAddModule,
  onMoveModule,
  onEditModule,
  onRemoveModule,
}: CourseModulesCardProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line-faint">
        <div>
          <h4 className="text-lg font-semibold text-content">Modules</h4>
          <p className="text-xs text-content-subtle mt-0.5">
            Manage curriculum modules, their display order, and associated exams.
          </p>
        </div>

        {canCreateModule && (
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={onAddModule}>
            Add Module
          </Button>
        )}
      </div>

      {modules.length === 0 ? (
        <div className="p-10 text-center text-content-soft">
          <Icon.Folder className="w-9 h-9 mx-auto text-content-subtle mb-2" />
          <p className="text-base font-medium text-content">No modules added yet</p>
          <p className="text-xs text-content-subtle mt-1 max-w-sm mx-auto">
            {canCreateModule
              ? 'Click the "Add Module" button to create the first curriculum module for this course.'
              : "No modules have been created for this course yet."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line-faint">
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-surface-alt text-xs font-semibold text-content-soft">
            <span className="col-span-1">Order</span>
            <span className={canCreateModule ? "col-span-3" : "col-span-4"}>Module Name</span>
            <span className={canCreateModule ? "col-span-2" : "col-span-4"}>Description</span>
            <span className="col-span-2 text-center">Status</span>
            <span className="col-span-1 text-center">Content</span>
            {canCreateModule && <span className="col-span-3 text-right">Actions</span>}
          </div>

          {[...modules]
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((mod, index, orderedModules) => (
              <div
                key={mod.moduleId}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-3.5 items-center hover:bg-surface-alt transition-colors"
              >
                <div className="col-span-1 flex items-center gap-1">
                  <span className="w-6 h-6 rounded-full bg-primary-light text-brand-ink text-xs font-bold flex items-center justify-center">
                    {mod.orderIndex}
                  </span>
                  {canCreateModule && (
                    <div className="flex flex-col -my-1">
                      <button
                        type="button"
                        aria-label={`Move ${mod.title} up`}
                        title="Move up"
                        disabled={index === 0 || reorderingModuleId !== null}
                        onClick={() => onMoveModule(mod.moduleId, -1)}
                        className="rounded p-0.5 text-content-soft hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Icon.ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${mod.title} down`}
                        title="Move down"
                        disabled={
                          index === orderedModules.length - 1 || reorderingModuleId !== null
                        }
                        onClick={() => onMoveModule(mod.moduleId, 1)}
                        className="rounded p-0.5 text-content-soft hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Icon.ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className={canCreateModule ? "col-span-3 min-w-0" : "col-span-4 min-w-0"}>
                  <p className="text-base font-semibold text-content truncate">{mod.title}</p>
                  <p className="text-2xs text-content-subtle sm:hidden">
                    {mod.examCount} exams · {mod.questionCount} questions · {mod.deckCount}{" "}
                    flashcard decks
                  </p>
                </div>

                <div className={canCreateModule ? "col-span-2 min-w-0" : "col-span-4 min-w-0"}>
                  <p className="text-sm text-content-soft truncate">
                    {mod.description || (
                      <span className="italic text-content-subtle">No description</span>
                    )}
                  </p>
                </div>

                <div className="col-span-2 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant={mod.status === "VISIBLE" ? "success" : "default"}>
                    {mod.status === "VISIBLE" ? "Visible" : "Hidden"}
                  </Badge>
                  {mod.status === "HIDDEN" && (mod.publicContentCount ?? 0) > 0 && (
                    <p
                      className="w-full text-center text-2xs text-warning"
                      title="Students don't see a hidden module or anything in it. Make the module visible to show this content."
                    >
                      {mod.publicContentCount} public item
                      {mod.publicContentCount === 1 ? "" : "s"} hidden from students
                    </p>
                  )}
                </div>

                <div className="col-span-1 hidden text-center text-xs text-content-soft sm:block">
                  <div>{mod.examCount} exams</div>
                  <div>{mod.questionCount} questions</div>
                  <div>{mod.deckCount} flashcard decks</div>
                </div>

                {canCreateModule && (
                  <div className="col-span-3 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Icon.Edit className="w-3.5 h-3.5" />}
                      onClick={() => onEditModule(mod)}
                      title="Edit Module"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-light hover:text-danger"
                      icon={<Icon.Trash className="w-3.5 h-3.5" />}
                      onClick={() => onRemoveModule(mod)}
                      title="Remove Module"
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
