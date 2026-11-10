import React, { useState } from 'react';
import { ImagePickButton } from '@/components/common/ImagePickButton';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { uploadService } from '@/services/upload.service';
import { getApiErrorMessage } from '@/utils/apiError';

/**
 * Images inside question text are stored as markdown `![alt](url)`. Only Cloudinary URLs (what D3 upload
 * returns) become <img>; anything else stays plain text. React renders it, never innerHTML, so no XSS.
 */
const IMAGE = /!\[([^\]\n]*)\]\((https:\/\/res\.cloudinary\.com\/[^\s)]+)\)/g;
/** An image together with the line break that puts it on its own line. */
const IMAGE_LINE = new RegExp(`\\n?${IMAGE.source}`, 'g');

export function hasQuestionImage(content: string): boolean {
  return new RegExp(IMAGE.source).test(content);
}

/** One-line previews (tables, pickers): an image becomes "[Image]". */
export function questionPlainText(content: string): string {
  return content.replace(IMAGE, '[Image]');
}

/**
 * Splits stored question content into the text the author types and its images. The editor keeps the
 * textarea image-free; {@link withQuestionImage} puts the image back on its own line at the end.
 */
export function splitQuestionImage(content: string): { text: string; images: { url: string; alt: string }[] } {
  const images = [...content.matchAll(IMAGE)].map((m) => ({ url: m[2], alt: m[1] }));
  if (!images.length) return { text: content, images };
  const text = content.replace(IMAGE_LINE, '');
  return { text: content.startsWith('![') ? text.replace(/^\n/, '') : text, images };
}

/** The stored content: the typed text, then the image (if any) on its own last line. */
export function withQuestionImage(text: string, url: string | null): string {
  if (!url) return text;
  return text ? `${text}\n![image](${url})` : `![image](${url})`;
}

function QuestionImage({ url, alt }: { url: string; alt: string }) {
  return (
    <img
      src={url}
      alt={alt || 'Question image'}
      loading="lazy"
      className="block my-2 max-w-full max-h-96 rounded-[10px] border border-line"
    />
  );
}

/** Question text with its images, which always come after the text. Put it inside the element that carries the text styles. */
export function QuestionContent({ text }: { text: string }) {
  const { text: body, images } = splitQuestionImage(text);
  return (
    <>
      {body}
      {images.map((img, i) => (
        <QuestionImage key={i} url={img.url} alt={img.alt} />
      ))}
    </>
  );
}

/** Preview of a question being edited: its text, then its image with an X that removes it. */
export function QuestionImagePreview({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { text, images } = splitQuestionImage(value);
  if (!images.length) return null;
  return (
    <div className="mt-2 rounded-[10px] border border-line-faint bg-surface-alt p-3">
      <p className="text-2xs font-semibold uppercase text-content-subtle mb-1">Preview</p>
      {text && <p className="text-sm text-content whitespace-pre-line break-words">{text}</p>}
      {images.map((img, i) => (
        <div key={i} className="relative w-fit max-w-full">
          <QuestionImage url={img.url} alt={img.alt} />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(withQuestionImage(text, null))}
              className="absolute top-3.5 right-1.5 p-1 rounded-full bg-surface/90 border border-line text-content-soft shadow-sm hover:text-danger"
              aria-label="Remove image"
              title="Remove image"
            >
              <Icon.X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Uploads an image (D3) and attaches it to the end of the question; a new image replaces the old one. */
export function InsertImageButton({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const insert = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadService.uploadMedia(file);
      onChange(withQuestionImage(splitQuestionImage(value).text, url));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not upload the image.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ImagePickButton variant="ghost" loading={uploading} disabled={disabled} onPick={insert} onError={(m) => toast.error(m)}>
      {hasQuestionImage(value) ? 'Replace image' : 'Insert image'}
    </ImagePickButton>
  );
}
