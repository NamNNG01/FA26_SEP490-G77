import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/ToastHost";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  ISSUE_TYPES,
  issueLabel,
  questionIssueService,
  type IssueType,
} from "@/services/questionIssue.service";
import { Icon } from "@/assets/icons";
import { ImagePickButton } from "@/components/common/ImagePickButton";
import { ImageViewer } from "@/components/common/ImageViewer";
import { uploadService } from "@/services/upload.service";

const MIN_DESCRIPTION = 10;
const MAX_DESCRIPTION = 3000;
const MAX_SUGGESTED_ANSWER = 1000;
const MAX_SUGGESTED_OPTIONS = 20;
const STUDENT_ISSUE_TYPES = ISSUE_TYPES.filter(
  (issueType) => issueType !== "AI_EXPLANATION_ERROR",
);

/** A short hint under each issue type, so students can pick without guessing what the name means. */
const TYPE_HINTS: Record<IssueType, string> = {
  WRONG_CONTENT: "Typo or unclear wording",
  WRONG_ANSWER: "The correct answer looks wrong",
  WRONG_EXPLANATION: "The explanation is off",
  AI_EXPLANATION_ERROR: "The AI explanation is inaccurate",
  MISSING_MEDIA: "An image or file is missing",
  OTHER: "Something else",
};

type ReportQuestionIssueProps = {
  questionId: number;
  className?: string;
  attemptId?: number;
  practiceSessionId?: number;
  source?: "NOTEBOOK" | "OTHER";
  options?: { optionId: number; optionText: string }[];
};

export function ReportQuestionIssueButton({
  questionId,
  className = "",
  ...context
}: ReportQuestionIssueProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className={className}
        size="sm"
        variant="outline"
        icon={<Icon.Flag className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Report issue
      </Button>
      {open && (
        <ReportQuestionIssueDialog
          questionId={questionId}
          {...context}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const fieldCls =
  "w-full rounded-[10px] border bg-surface px-3 py-2.5 text-sm text-content focus:outline-none focus:ring-2 transition-all";
const fieldOk = "border-line focus:ring-brand-600/20 focus:border-brand-600";
const fieldBad =
  "border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid";

export function ReportQuestionIssueDialog({
  questionId,
  attemptId,
  practiceSessionId,
  source,
  options = [],
  onClose,
  onReported,
}: ReportQuestionIssueProps & {
  onClose: () => void;
  onReported?: (result: any) => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<IssueType>("WRONG_CONTENT");
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [suggestedOptionIds, setSuggestedOptionIds] = useState<number[]>([]);
  const [suggestedAnswer, setSuggestedAnswer] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const formId = useId();
  const descriptionId = `${formId}-description`;
  const helpId = `${formId}-help`;
  const errorId = `${formId}-error`;
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const typeGroupRef = useRef<HTMLDivElement>(null);

  // The modal focuses its first control on open; start on the issue type instead, which is the first question.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      typeGroupRef.current
        ?.querySelector<HTMLInputElement>("input:checked")
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const isWorking = busy || uploading;
  const length = description.length;
  const trimmedLength = description.trim().length;
  const hasProgress =
    trimmedLength > 0 ||
    Boolean(attachmentUrl) ||
    suggestedOptionIds.length > 0 ||
    suggestedAnswer.trim().length > 0;

  /** Escape, backdrop, ✕ and Cancel all come here, so a half-written report is never dropped silently. */
  function requestClose() {
    if (isWorking) return;
    if (hasProgress) setConfirmDiscard(true);
    else onClose();
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    setError("");
    try {
      const image = await uploadService.uploadStudentAttachment(file);
      setAttachmentUrl(image.url);
      setAttachmentName(file.name);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not upload this image."));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isWorking) return;
    if (trimmedLength < MIN_DESCRIPTION) {
      setDescriptionError(
        `Please describe the issue in at least ${MIN_DESCRIPTION} characters.`,
      );
      descriptionRef.current?.focus();
      return;
    }
    setDescriptionError("");
    setBusy(true);
    setError("");
    try {
      const result = await questionIssueService.report({
        questionId,
        issueType: type,
        description: description.trim(),
        ...(attachmentUrl.trim()
          ? { attachmentUrl: attachmentUrl.trim() }
          : {}),
        ...(attemptId != null ? { attemptId } : {}),
        ...(practiceSessionId != null ? { practiceSessionId } : {}),
        ...(source ? { source } : {}),
        ...(type === "WRONG_ANSWER" && suggestedOptionIds.length
          ? { suggestedOptionIds }
          : {}),
        ...(type === "WRONG_ANSWER" && suggestedAnswer.trim()
          ? { suggestedAnswer: suggestedAnswer.trim() }
          : {}),
      });
      toast.success("Report sent. A course manager will take a look.");
      onReported?.(result);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your report."));
    } finally {
      setBusy(false);
    }
  }

  const footerNote = uploading
    ? "Uploading your image…"
    : busy
      ? "Sending your report…"
      : "";

  const counterHint =
    length === 0
      ? ""
      : trimmedLength < MIN_DESCRIPTION
        ? `${MIN_DESCRIPTION - trimmedLength} more to go`
        : length >= MAX_DESCRIPTION - 100
          ? `${MAX_DESCRIPTION - length} characters left`
          : "";

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        dismissible={!isWorking}
        size="lg"
        title="Report a question issue"
        description={
          <>
            Question #{questionId}. You are flagging a possible problem. This
            does not change the question or your answer, and your report is
            visible to the course manager.
          </>
        }
        error={error ? <Alert type="error" message={error} /> : undefined}
        footer={
          <>
            {footerNote && (
              <p
                role="status"
                className="basis-full text-sm text-content-secondary sm:mr-auto sm:basis-auto"
              >
                {footerNote}
              </p>
            )}
            <Button
              variant="outline"
              onClick={requestClose}
              disabled={isWorking}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              loading={busy}
              disabled={uploading}
            >
              Send report
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold text-content">
              What kind of issue is it?
            </legend>
            <div
              ref={typeGroupRef}
              className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
            >
              {STUDENT_ISSUE_TYPES.map((value) => {
                const checked = value === type;
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-[10px] border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600/30 ${checked ? "border-brand-600 bg-primary-light" : "border-line bg-surface hover:bg-surface-hover"}`}
                  >
                    <input
                      type="radio"
                      name={`${formId}-type`}
                      value={value}
                      className="sr-only"
                      checked={checked}
                      disabled={busy}
                      onChange={() => setType(value)}
                    />
                    <span className="font-medium text-content">
                      {issueLabel(value)}
                    </span>
                    <span className="text-xs text-content-secondary">
                      {TYPE_HINTS[value]}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {type === "WRONG_ANSWER" && (
            <fieldset className="space-y-2 rounded-xl border border-brand-line bg-primary-light/40 p-4">
              <legend className="px-1 text-sm font-semibold text-content">
                What do you think the correct answer is?{" "}
                <span className="font-normal text-content-secondary">
                  Optional
                </span>
              </legend>
              {options.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-content-secondary">
                      Select every choice you believe is correct. You can pick
                      more than one.
                    </p>
                    <span
                      aria-live="polite"
                      className="text-xs font-medium text-content-secondary"
                    >
                      {suggestedOptionIds.length} selected
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => {
                      const selected = suggestedOptionIds.includes(
                        option.optionId,
                      );
                      return (
                        <Checkbox
                          key={option.optionId}
                          label={option.optionText}
                          checked={selected}
                          disabled={
                            !selected &&
                            suggestedOptionIds.length >= MAX_SUGGESTED_OPTIONS
                          }
                          className={`w-full rounded-lg border px-3 py-2 transition-colors ${selected ? "border-brand-line bg-primary-light" : "border-line bg-surface hover:bg-surface-hover"}`}
                          onChange={(checked) =>
                            setSuggestedOptionIds((current) =>
                              checked
                                ? [...current, option.optionId]
                                : current.filter(
                                    (id) => id !== option.optionId,
                                  ),
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label
                    htmlFor={`${formId}-suggested`}
                    className="text-xs text-content-secondary"
                  >
                    There are no choices to select, so type the answer you
                    expected.
                  </label>
                  <input
                    id={`${formId}-suggested`}
                    maxLength={MAX_SUGGESTED_ANSWER}
                    value={suggestedAnswer}
                    onChange={(event) => setSuggestedAnswer(event.target.value)}
                    placeholder="Enter the correct answer"
                    className={`${fieldCls} ${fieldOk}`}
                  />
                  {suggestedAnswer.length > 0 && (
                    <p className="text-right text-xs text-content-secondary">
                      {suggestedAnswer.length}/{MAX_SUGGESTED_ANSWER}
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <label
                htmlFor={descriptionId}
                className="text-sm font-semibold text-content"
              >
                What seems wrong?{" "}
                <span className="font-normal text-content-secondary">
                  Required
                </span>
              </label>
              <span className="text-xs text-content-secondary">
                {MIN_DESCRIPTION}–{MAX_DESCRIPTION.toLocaleString()} characters
              </span>
            </div>
            <textarea
              id={descriptionId}
              ref={descriptionRef}
              rows={5}
              maxLength={MAX_DESCRIPTION}
              value={description}
              disabled={busy}
              aria-required="true"
              aria-invalid={Boolean(descriptionError)}
              aria-describedby={`${helpId}${descriptionError ? ` ${errorId}` : ""}`}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) setDescriptionError("");
              }}
              placeholder="Tell us what you noticed and what you expected to see."
              className={`${fieldCls} resize-y ${descriptionError ? fieldBad : fieldOk}`}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              <span className="flex-shrink-0 text-right text-xs tabular-nums text-content-secondary">
                {length}/{MAX_DESCRIPTION.toLocaleString()}
              </span>
            </div>
            {/* Only announces at the thresholds that matter, not on every keystroke. */}
            <span aria-live="polite" className="sr-only">
              {counterHint}
            </span>
            {descriptionError && (
              <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
                {descriptionError}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-content">
              Add a screenshot{" "}
              <span className="font-normal text-content-secondary">
                Optional
              </span>
            </p>
            <div className="mt-2 rounded-xl border border-dashed border-line-strong p-3">
              {uploading ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-content-secondary"
                >
                  <span className="spinner h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
                  Uploading your image…
                </p>
              ) : attachmentUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <ImageViewer
                    src={attachmentUrl}
                    alt={`Preview of ${attachmentName || "your attachment"}`}
                    imageClassName="max-h-24"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">
                      {attachmentName}
                    </p>
                    <p className="text-xs text-content-secondary">
                      Select the image to view it larger.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ImagePickButton
                        onPick={uploadAttachment}
                        onError={setError}
                        disabled={busy}
                      >
                        Replace image
                      </ImagePickButton>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={<Icon.Trash className="h-4 w-4" />}
                        disabled={busy}
                        onClick={() => {
                          setAttachmentUrl("");
                          setAttachmentName("");
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <ImagePickButton
                    onPick={uploadAttachment}
                    onError={setError}
                    disabled={busy}
                  >
                    Upload image
                  </ImagePickButton>
                  <p className="text-xs text-content-secondary">
                    A picture can help. JPG, PNG, WEBP or GIF, up to 5 MB.
                  </p>
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        size="sm"
        title="Discard this report?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={onClose}>
              Discard report
            </Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          You have started a report. If you close it now, what you wrote will be
          lost.
        </p>
      </Modal>
    </>
  );
}
