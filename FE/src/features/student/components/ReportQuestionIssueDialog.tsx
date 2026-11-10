import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  ISSUE_TYPES,
  issueLabel,
  questionIssueService,
  type IssueType,
} from "@/services/questionIssue.service";
import { Icon } from "@/assets/icons";
import { ImagePickButton } from "@/components/common/ImagePickButton";
import { uploadService } from "@/services/upload.service";

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
  const [type, setType] = useState<IssueType>("WRONG_CONTENT");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [suggestedOptionIds, setSuggestedOptionIds] = useState<number[]>([]);
  const [suggestedAnswer, setSuggestedAnswer] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (description.trim().length < 10) {
      setError("Please describe the issue in at least 10 characters.");
      return;
    }
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
        ...(suggestedOptionIds.length ? { suggestedOptionIds } : {}),
        ...(suggestedAnswer.trim()
          ? { suggestedAnswer: suggestedAnswer.trim() }
          : {}),
      });
      onReported?.(result);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not submit your report."));
    } finally {
      setBusy(false);
    }
  }
  const isWorking = busy || uploading;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) =>
        e.target === e.currentTarget && !isWorking && onClose()
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-issue-title"
        className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="report-issue-title"
              className="text-lg font-bold text-content"
            >
              Report a question issue
            </h2>
            <p className="mt-1 text-sm text-content-secondary">
              Question #{questionId}. Your report will be visible to the course
              manager.
            </p>
          </div>
          <button
            type="button"
            className="text-content-secondary"
            onClick={onClose}
            disabled={isWorking}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Issue type
            <select
              className="rounded-lg border border-line bg-surface px-3 py-2.5"
              value={type}
              onChange={(e) => setType(e.target.value as IssueType)}
            >
              {ISSUE_TYPES.map((x) => (
                <option key={x} value={x}>
                  {issueLabel(x)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-2 text-sm">
            <legend className="font-medium">
              Correct answer, in your opinion{" "}
              <span className="font-normal text-content-secondary">
                Optional
              </span>
            </legend>
            {options.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <div
                    key={option.optionId}
                    className={`rounded-lg border px-3 py-2 transition-colors ${suggestedOptionIds.includes(option.optionId) ? "border-brand-line bg-primary-light" : "border-line bg-surface hover:bg-surface-hover"}`}
                  >
                    <Checkbox
                      label={option.optionText}
                      checked={suggestedOptionIds.includes(option.optionId)}
                      disabled={
                        !suggestedOptionIds.includes(option.optionId) &&
                        suggestedOptionIds.length >= 20
                      }
                      onChange={(checked) =>
                        setSuggestedOptionIds((current) =>
                          checked
                            ? [...current, option.optionId]
                            : current.filter((id) => id !== option.optionId),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <input
              maxLength={1000}
              value={suggestedAnswer}
              onChange={(event) => setSuggestedAnswer(event.target.value)}
              placeholder="Suggested answer for questions without options"
              className="rounded-lg border border-line bg-surface px-3 py-2.5 font-normal"
            />
            {suggestedAnswer.length > 0 && (
              <span className="text-right text-xs text-content-secondary">
                {suggestedAnswer.length}/1000
              </span>
            )}
          </fieldset>
          <label className="grid gap-1.5 text-sm font-medium">
            What seems wrong?
            <textarea
              required
              minLength={10}
              maxLength={3000}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what you noticed and what you expected to see."
              className="resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-normal"
            />
            <span className="text-right text-xs font-normal text-content-secondary">
              {description.length}/3000
            </span>
          </label>
          <div className="grid gap-1.5 text-sm font-medium">
            <span>
              Image attachment{" "}
              <span className="font-normal text-content-secondary">
                Optional · JPG, PNG, WEBP or GIF up to 5 MB
              </span>
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {attachmentUrl && (
                <>
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-16 w-16 overflow-hidden rounded-lg border border-line"
                  >
                    <img
                      src={attachmentUrl}
                      alt="Uploaded issue attachment"
                      className="h-full w-full object-cover"
                    />
                  </a>
                  <span className="max-w-48 truncate text-sm font-normal text-content-secondary">
                    {attachmentName}
                  </span>
                  <button
                    type="button"
                    className="text-sm font-medium text-danger hover:underline"
                    onClick={() => {
                      setAttachmentUrl("");
                      setAttachmentName("");
                    }}
                    disabled={isWorking}
                  >
                    Remove
                  </button>
                </>
              )}
              <ImagePickButton
                onPick={uploadAttachment}
                onError={setError}
                loading={uploading}
                disabled={busy}
              >
                {attachmentUrl ? "Replace image" : "Upload image"}
              </ImagePickButton>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isWorking}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={uploading}>
              Send report
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
