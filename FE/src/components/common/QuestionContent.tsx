import React, { useState } from 'react';
import { ImagePickButton } from '@/components/common/ImagePickButton';
import { useToast } from '@/components/ui/ToastHost';
import { uploadService } from '@/services/upload.service';
import { getApiErrorMessage } from '@/utils/apiError';

/**
 * Images inside question text are stored as markdown `![alt](url)`. Only Cloudinary URLs (what D3 upload
 * returns) become <img>; anything else stays plain text. React renders it, never innerHTML, so no XSS.
 */
const IMAGE = /!\[([^\]\n]*)\]\((https:\/\/res\.cloudinary\.com\/[^\s)]+)\)/g;

export function hasQuestionImage(content: string): boolean {
  return new RegExp(IMAGE.source).test(content);
}

/** One-line previews (tables, pickers): an image becomes "[Image]". */
export function questionPlainText(content: string): string {
  return content.replace(IMAGE, '[Image]');
}

/** Question text with its images. Put it inside the element that carries the text styles. */
export function QuestionContent({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(IMAGE)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <img
        key={m.index}
        src={m[2]}
        alt={m[1] || 'Question image'}
        loading="lazy"
        className="block my-2 max-w-full max-h-96 rounded-[10px] border border-line"
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Uploads an image (D3) and inserts its markdown at the cursor of the question textarea. */
export function InsertImageButton({
  textarea,
  value,
  onChange,
  disabled,
}: {
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const insert = async (file: File) => {
    // Read the cursor before the await: the textarea may lose focus while uploading.
    const start = textarea.current?.selectionStart ?? value.length;
    const end = textarea.current?.selectionEnd ?? value.length;
    setUploading(true);
    try {
      const { url } = await uploadService.uploadMedia(file);
      const before = value.slice(0, start);
      const marker = `${before && !before.endsWith('\n') ? '\n' : ''}![image](${url})\n`;
      onChange(before + marker + value.slice(end));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not upload the image.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ImagePickButton variant="ghost" loading={uploading} disabled={disabled} onPick={insert} onError={(m) => toast.error(m)}>
      Insert image
    </ImagePickButton>
  );
}
