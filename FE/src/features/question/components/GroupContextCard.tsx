import React, { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/assets/icons";
import type { QuestionGroup } from "@/services/questionGroup.service";
import {
  GROUP_KIND_LABELS,
  GROUP_KIND_OPTIONS,
  asGroupKind,
  typesOfKind,
  type GroupKind,
} from "../model";
import { groupKindLabel, groupLabel, groupOptionLabel } from "./QuestionGroupPicker";

/** standalone = independent questions; existing / new = every question shares one passage (e.g. an IELTS reading). */
export type GroupMode = "standalone" | "existing" | "new";

export interface GroupContextValue {
  mode: GroupMode;
  existingGroupId: string;
  newTitle: string;
  newPassage: string;
  /** The one kind of question the new group holds. */
  newKind: GroupKind;
}

export const emptyGroupContext = (): GroupContextValue => ({
  mode: "standalone",
  existingGroupId: "",
  newTitle: "",
  newPassage: "",
  newKind: "QUIZ",
});

export function groupContextErrors(v: GroupContextValue): {
  group?: string;
  title?: string;
  passage?: string;
} {
  if (v.mode === "existing" && !v.existingGroupId)
    return { group: "Select an existing question group or create a new one." };
  if (v.mode === "new") {
    return {
      ...(v.newTitle.trim() ? {} : { title: "Enter a group title." }),
      ...(v.newPassage.trim() ? {} : { passage: "Enter the shared passage." }),
    };
  }
  return {};
}

/** Groups a batch in `moduleId` ('' = none) can be saved into (Q-03 allows groups without a module). */
export const groupsForModule = (groups: QuestionGroup[], moduleId: string) =>
  groups.filter((g) => !moduleId || g.moduleId == null || String(g.moduleId) === moduleId);

/**
 * The kind every question of the batch must be: the new group's, or the picked
 * group's. null = any type (standalone, or a group made before kinds existed).
 */
export function contextKind(v: GroupContextValue, groups: QuestionGroup[]): GroupKind | null {
  if (v.mode === "new") return v.newKind;
  if (v.mode === "existing")
    return asGroupKind(groups.find((g) => String(g.groupId) === v.existingGroupId)?.questionType);
  return null;
}

/** Active group metadata (for display and AI passage context), or null in standalone / unselected mode. */
export function contextGroupMeta(
  v: GroupContextValue,
  groups: QuestionGroup[],
): { title: string; passage: string; kind: GroupKind | null } | null {
  if (v.mode === "new") {
    return { title: v.newTitle.trim(), passage: v.newPassage.trim(), kind: v.newKind };
  }
  if (v.mode === "existing" && v.existingGroupId) {
    const selected = groups.find((g) => String(g.groupId) === v.existingGroupId);
    if (!selected) return null;
    return {
      title: selected.title?.trim() || `Group #${selected.groupId}`,
      passage: selected.passageText?.trim() || "",
      kind: asGroupKind(selected.questionType),
    };
  }
  return null;
}

function groupStatusBadge(g: QuestionGroup): {
  label: string;
  variant: "success" | "warning" | "default";
} {
  const total = g.questionCount ?? 0;
  const pub = g.publishedQuestionCount;
  if (total === 0) return { label: "0 questions", variant: "default" };
  if (pub == null)
    return { label: `${total} question${total === 1 ? "" : "s"}`, variant: "default" };
  if (pub >= total) return { label: `Published (${pub}/${total})`, variant: "success" };
  if (pub > 0) return { label: `Partially Published (${pub}/${total})`, variant: "warning" };
  return { label: `Draft (0/${total} published)`, variant: "default" };
}

const MODES: { value: "standalone" | "group"; label: string; hint: string }[] = [
  { value: "standalone", label: "Standalone questions", hint: "Each question stands on its own." },
  { value: "group", label: "Question group", hint: "Questions share one passage or scenario." },
];

/**
 * Top of the New Questions column (shared by both Manual and AI Generate):
 * lets the manager build standalone questions, add questions to an existing group,
 * or author a brand-new group inline (which requires at least 1 question before saving).
 */
export function GroupContextCard({
  value,
  onChange,
  groups,
  loadingGroups,
  courseSelected,
  moduleId,
  questionKinds = [],
  draftQuestionCount = 0,
  onAddQuestion,
  showErrors,
  kindInvalid,
  disabled,
}: {
  value: GroupContextValue;
  onChange: (v: GroupContextValue) => void;
  groups: QuestionGroup[];
  loadingGroups?: boolean;
  courseSelected: boolean;
  /** The batch's module ('' = none) — only groups the batch can join are offered. */
  moduleId: string;
  /** Kinds of the manual questions already written (used to warn or filter). */
  questionKinds?: GroupKind[];
  /** Number of unsaved questions (manual rows or accepted AI drafts) currently attached to this context. */
  draftQuestionCount?: number;
  /** Manual mode helper: adds a question directly from inside the group panel. */
  onAddQuestion?: () => void;
  showErrors?: boolean;
  /** Some questions don't fit the new group's type. */
  kindInvalid?: boolean;
  disabled?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const set = (patch: Partial<GroupContextValue>) => onChange({ ...value, ...patch });
  const errors = showErrors ? groupContextErrors(value) : {};
  const mixed = questionKinds.length > 1;
  const writtenKind = questionKinds.length === 1 ? questionKinds[0] : null;
  const kindNames = questionKinds.map((k) => GROUP_KIND_LABELS[k]).join(" and ");
  const offered = mixed
    ? []
    : groupsForModule(groups, moduleId).filter(
        (g) => !writtenKind || !g.questionType || g.questionType === writtenKind,
      );
  const hiddenByKind = writtenKind ? groupsForModule(groups, moduleId).length - offered.length : 0;
  const isGroup = value.mode !== "standalone";
  const isNew = value.mode === "new";
  const selected = isNew
    ? undefined
    : groups.find((g) => String(g.groupId) === value.existingGroupId);
  const selectedKind = isNew ? value.newKind : asGroupKind(selected?.questionType);
  const passage = selected?.passageText;
  const newKindMismatch = isNew && questionKinds.some((k) => k !== value.newKind);
  const kindHint = GROUP_KIND_OPTIONS.find((o) => o.value === value.newKind)?.hint;

  const pickMode = (m: "standalone" | "group") => {
    setCollapsed(false);
    if (m === "standalone") {
      set({ mode: "standalone" });
      return;
    }
    if (!isGroup) {
      const hasDraftGroup = Boolean(value.newTitle.trim() || value.newPassage.trim());
      set({ mode: hasDraftGroup ? "new" : "existing", newKind: writtenKind ?? value.newKind });
    }
  };

  const openNewGroup = () => {
    setCollapsed(false);
    set({
      mode: "new",
      newKind: writtenKind ?? value.newKind,
    });
  };

  const statusInfo = selected ? groupStatusBadge(selected) : null;

  return (
    <section aria-labelledby="group-context-title" className="card px-4 py-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="group-context-title"
          className="flex items-center gap-1.5 text-base font-semibold text-content"
        >
          <Icon.Layers className="w-4 h-4 text-brand-ink" /> Question Context
        </h3>
        {isGroup && selected && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-xs font-medium text-brand-ink hover:underline"
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show passage" : "Hide passage"}
          </button>
        )}
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Question context"
      >
        {MODES.map((m) => {
          const active = m.value === "group" ? isGroup : !isGroup;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => pickMode(m.value)}
              className={`text-left rounded-[10px] border px-3 py-2 transition-all disabled:opacity-60 ${
                active
                  ? "border-brand-600 bg-brand-600/5 ring-2 ring-brand-600/15"
                  : "border-line hover:border-brand-600/50"
              }`}
            >
              <span
                className={`block text-sm font-semibold ${active ? "text-brand-ink" : "text-content"}`}
              >
                {m.label}
              </span>
              <span className="block text-xs text-content-subtle mt-0.5">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {isGroup && !isNew && (
        <div className="space-y-3 rounded-[10px] border border-line bg-surface-alt/40 p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <SearchableSelect
              className="flex-1 min-w-0"
              label="Existing question group *"
              value={value.existingGroupId}
              onChange={(v) => set({ mode: "existing", existingGroupId: v })}
              disabled={disabled || !courseSelected || loadingGroups}
              invalid={Boolean(errors.group)}
              placeholder={
                !courseSelected
                  ? "Select a course on the right first"
                  : loadingGroups
                    ? "Loading groups…"
                    : "Select an existing group"
              }
              searchPlaceholder="Search groups…"
              emptyText={
                mixed
                  ? "No group fits mixed question types"
                  : writtenKind
                    ? `No ${GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups here yet`
                    : "No groups in this course/module yet — create one"
              }
              options={offered.map((g) => ({
                label: groupOptionLabel(g),
                value: String(g.groupId),
              }))}
            />
            <Button
              type="button"
              variant="secondary"
              icon={<Icon.Plus className="w-4 h-4" />}
              onClick={openNewGroup}
              disabled={disabled}
            >
              Create New Group
            </Button>
          </div>

          {errors.group && <p className="text-xs text-danger">{errors.group}</p>}
          {mixed && (
            <p className="flex items-start gap-1.5 text-xs text-danger">
              <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Your questions mix {kindNames} types — a group holds one kind. Remove or change some
              questions first.
            </p>
          )}
          {writtenKind && !selected && courseSelected && !loadingGroups && (
            <p className="text-xs text-content-subtle">
              Only {GROUP_KIND_LABELS[writtenKind].toLowerCase()} groups are listed — they match the
              questions you’ve written
              {hiddenByKind > 0
                ? ` (${hiddenByKind} group${hiddenByKind === 1 ? "" : "s"} of other types hidden)`
                : ""}
              .
            </p>
          )}

          {selected && (
            <div className="rounded-[10px] border border-line bg-surface p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-content truncate">
                    {groupLabel(selected)}
                  </span>
                  {groupKindLabel(selected) && (
                    <Badge variant="purple">{groupKindLabel(selected)}</Badge>
                  )}
                  {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
                </div>
                <span className="text-xs text-content-subtle">
                  Adding {draftQuestionCount} new question{draftQuestionCount === 1 ? "" : "s"}
                </span>
              </div>

              {!collapsed && (
                <div className="max-h-[240px] overflow-y-auto rounded-[8px] bg-surface-alt px-3 py-2.5 text-sm text-content-secondary whitespace-pre-wrap">
                  {passage?.trim() || (
                    <span className="text-content-subtle italic">
                      This group has no passage text.
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-content-subtle">
                  {selectedKind
                    ? `Only ${typesOfKind(selectedKind).length === 1 ? GROUP_KIND_LABELS[selectedKind].toLowerCase() : GROUP_KIND_LABELS[selectedKind].toLowerCase()} questions fit this group.`
                    : "This group takes the kind of the first questions saved into it."}
                </p>
                {onAddQuestion && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={<Icon.Plus className="w-3.5 h-3.5" />}
                    onClick={onAddQuestion}
                    disabled={disabled}
                  >
                    Add Question to Group
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isGroup && isNew && (
        <div className="space-y-3 rounded-[10px] border border-brand-600/30 bg-surface-alt/40 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="purple">New Question Group</Badge>
              <Badge variant={draftQuestionCount > 0 ? "info" : "warning"}>
                {draftQuestionCount} question{draftQuestionCount === 1 ? "" : "s"}
              </Badge>
            </div>
            <button
              type="button"
              onClick={() => set({ mode: "existing" })}
              disabled={disabled}
              className="text-xs font-medium text-brand-ink hover:underline disabled:opacity-50"
            >
              Select existing group instead
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <Input
              label="Group title *"
              value={value.newTitle}
              onChange={(e) => set({ newTitle: e.target.value })}
              maxLength={255}
              placeholder="e.g. Reading Passage 1 — Distributed Consensus"
              error={errors.title}
              disabled={disabled}
            />
            <Select
              label="Group type *"
              value={value.newKind}
              onChange={(k) => set({ newKind: k as GroupKind })}
              invalid={Boolean(kindInvalid || newKindMismatch)}
              disabled={disabled}
              options={GROUP_KIND_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            />
          </div>

          <p
            className={`text-xs -mt-1 ${kindInvalid || newKindMismatch ? "text-danger" : "text-content-subtle"}`}
          >
            {kindHint}.{" "}
            {newKindMismatch
              ? "Some questions you already wrote use another type — switch them or change Group type."
              : "Questions in this group must use a matching type."}
          </p>

          <div>
            <label
              htmlFor="inline-new-group-passage"
              className="block text-sm font-medium text-content-secondary mb-1"
            >
              Shared passage *
            </label>
            <textarea
              id="inline-new-group-passage"
              value={value.newPassage}
              onChange={(e) => set({ newPassage: e.target.value })}
              disabled={disabled}
              placeholder="Paste the reading passage, listening transcript, problem statement or scenario shared by all questions in this group…"
              className={`w-full h-[150px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
                errors.passage
                  ? "border-danger-solid focus:ring-danger-solid/20"
                  : "border-line focus:ring-brand-600/20 focus:border-brand-600"
              }`}
            />
            {errors.passage && <p className="text-xs text-danger mt-1">{errors.passage}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-line-soft">
            {draftQuestionCount === 0 ? (
              <p
                className={`flex items-center gap-1.5 text-xs font-medium ${showErrors ? "text-danger" : "text-warning"}`}
              >
                <Icon.AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                A question group must have at least 1 question before it can be created.
              </p>
            ) : (
              <p className="text-xs text-content-subtle">
                This group will be created together with its {draftQuestionCount} question
                {draftQuestionCount === 1 ? "" : "s"} when saved.
              </p>
            )}
            {onAddQuestion && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Icon.Plus className="w-3.5 h-3.5" />}
                onClick={onAddQuestion}
                disabled={disabled}
              >
                Add Question to Group
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
