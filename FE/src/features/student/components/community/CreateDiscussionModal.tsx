import React, { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DiscussionImageAttachment } from "@/components/common/DiscussionImageAttachment";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  studentCommunityService,
  type DiscussionDetail as DiscussionDetailItem,
  type DiscussionItem,
} from "@/services/studentCommunity.service";
import { getApiErrorMessage } from "@/utils/apiError";

export function CreateDiscussionModal({
  open,
  defaultTag,
  initialItem,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultTag: "question" | "tip";
  initialItem?: DiscussionDetailItem | null;
  onClose: () => void;
  onCreated: (item: DiscussionItem) => void;
}) {
  const isResubmit = Boolean(initialItem);
  const [tag, setTag] = useState<"question" | "tip">(defaultTag);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (open) {
      setTag(initialItem?.tag === "tip" ? "tip" : defaultTag);
      setTitle(initialItem?.title ?? "");
      setContent(initialItem?.content ?? "");
      setAnonymous(false);
      setImageUrl(initialItem?.imageUrl ?? "");
      setError(null);
    }
  }, [open, defaultTag, initialItem]);

  const hasDraft = Boolean(
    !isResubmit && (title.trim() || content.trim() || anonymous || imageUrl),
  );

  const requestClose = () => {
    if (busy) return;
    if (hasDraft) setConfirmDiscard(true);
    else onClose();
  };

  const discard = () => {
    setTitle("");
    setContent("");
    setAnonymous(false);
    setImageUrl("");
    setError(null);
    setConfirmDiscard(false);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!title.trim() || !content.trim()) {
      setError("Complete the title and content.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        tag,
        title: title.trim(),
        content: content.trim(),
        isAnonymous: anonymous,
        imageUrl: imageUrl || null,
      };
      const item =
        isResubmit && initialItem
          ? await studentCommunityService.resubmitDiscussion(initialItem.discussionId, payload)
          : await studentCommunityService.createDiscussion(payload);
      onCreated(item);
      setTitle("");
      setContent("");
      setAnonymous(false);
      setImageUrl("");
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          isResubmit ? "Could not resubmit this post." : "Could not create this post.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={isResubmit ? "Edit & resubmit post" : "Create a community post"}
        size="lg"
        error={error && <Alert type="error" message={error} />}
        footer={
          <>
            <Button variant="outline" onClick={requestClose} disabled={busy}>
              Cancel
            </Button>
            <Button form="create-discussion-form" type="submit" loading={busy}>
              {isResubmit ? "Resubmit for approval" : "Publish"}
            </Button>
          </>
        }
      >
        <form id="create-discussion-form" onSubmit={submit} className="space-y-4">
          <Select
            label="Post type"
            value={tag}
            options={[
              { label: "Question", value: "question" },
              { label: "Tip", value: "tip" },
            ]}
            onChange={(value) => setTag(value as "question" | "tip")}
          />
          <Input
            label="Title"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What would you like to discuss?"
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
            Details
            <textarea
              required
              maxLength={10000}
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="Add context, what you tried, or the steps behind your tip."
            />
            <span className="text-xs font-normal text-content-subtle">{content.length}/10,000</span>
          </label>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-content-secondary">
              Image attachment <span className="font-normal text-content-subtle">Optional</span>
            </p>
            <DiscussionImageAttachment imageUrl={imageUrl} onChange={setImageUrl} />
          </div>
          <Checkbox checked={anonymous} onChange={setAnonymous} label="Post anonymously" />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={discard}
        tone="warning"
        title="Discard this post?"
        description="Your draft will be cleared and cannot be recovered."
        confirmLabel="Discard draft"
      />
    </>
  );
}
