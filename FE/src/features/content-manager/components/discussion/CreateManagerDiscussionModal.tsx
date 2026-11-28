import React, { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DiscussionImageAttachment } from "@/components/common/DiscussionImageAttachment";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { DiscussionTag } from "@/services/studentCommunity.service";
import { getApiErrorMessage } from "@/utils/apiError";

export function CreateManagerDiscussionModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    content: string;
    tag: DiscussionTag;
    imageUrl?: string | null;
    isPinned: boolean;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tag, setTag] = useState<DiscussionTag>("announcement");
  const [imageUrl, setImageUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setContent("");
      setTag("announcement");
      setImageUrl("");
      setPinned(false);
      setError("");
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("Enter a title and post content.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        tag,
        imageUrl: imageUrl || null,
        isPinned: pinned,
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create this post."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Create announcement"
      description="This post is visible immediately."
      size="lg"
      error={error && <Alert type="error" message={error} />}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button form="manager-discussion-form" type="submit" loading={busy}>
            Publish post
          </Button>
        </>
      }
    >
      <form id="manager-discussion-form" onSubmit={submit} className="space-y-4">
        <Select
          label="Post type"
          value={tag}
          options={[
            { label: "Announcement", value: "announcement" },
            { label: "Question", value: "question" },
            { label: "Tip", value: "tip" },
          ]}
          onChange={(value) => setTag(value as DiscussionTag)}
        />
        <Input
          label="Title"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Headline shown in Community"
        />
        <label className="grid gap-1.5 text-sm font-medium text-content-secondary">
          Content
          <textarea
            maxLength={10000}
            rows={5}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            placeholder="Write the post content…"
          />
        </label>
        <DiscussionImageAttachment imageUrl={imageUrl} onChange={setImageUrl} />
        <Checkbox checked={pinned} onChange={setPinned} label="Pin to top of Community" />
      </form>
    </Modal>
  );
}
