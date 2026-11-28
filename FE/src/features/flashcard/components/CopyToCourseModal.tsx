import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/ToastHost";
import { deckService, type Deck } from "@/services/deck.service";
import { NO_COURSE, errorMessage, useCourseModules, useManagedCourses } from "./DeckEditor";

interface CopyToCourseModalProps {
  deck: Deck | null;
  onClose: () => void;
  onCopied: (created: Deck) => void;
}

export function CopyToCourseModal({ deck, onClose, onCopied }: CopyToCourseModalProps) {
  const toast = useToast();
  const { courses } = useManagedCourses();
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { modules } = useCourseModules(courseId || NO_COURSE);

  if (!deck) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      setError("Please select a target course.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await deckService.copyToCourse(deck.deckId, {
        courseId: Number(courseId),
        moduleId: moduleId ? Number(moduleId) : undefined,
        title: title.trim() || deck.title,
      });
      toast.success(`Copied "${created.title}" into course.`);
      onCopied(created);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not copy community deck to course."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(deck)}
      onClose={saving ? () => {} : onClose}
      title="Copy Community Deck to Course"
      description={`Clone "${deck.title}" (${deck.cardCount} cards) as an official deck in one of your courses.`}
      error={error ? <Alert type="error" message={error} /> : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            form="copy-to-course-form"
            type="submit"
            loading={saving}
            disabled={saving || !courseId}
          >
            Copy to Course
          </Button>
        </>
      }
    >
      <form id="copy-to-course-form" onSubmit={submit} className="space-y-4">
        <SearchableSelect
          label="Target Course *"
          value={courseId}
          onChange={(v) => {
            setCourseId(v);
            setModuleId("");
            setError("");
          }}
          options={[
            { label: "Select course", value: "" },
            ...courses.map((c) => ({ label: c.title, value: String(c.courseId) })),
          ]}
          placeholder="Select course"
        />

        <SearchableSelect
          label="Module (optional)"
          value={moduleId}
          onChange={setModuleId}
          disabled={!courseId}
          options={[
            { label: "Course-level (no module)", value: "" },
            ...modules.map((m) => ({ label: m.title, value: String(m.moduleId) })),
          ]}
          placeholder={courseId ? "Select module (optional)" : "Select a course first"}
        />

        <Input
          label="Deck Title"
          placeholder={deck.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </form>
    </Modal>
  );
}
