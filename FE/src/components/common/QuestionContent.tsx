import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** The question's image right under the editor, with an X that removes it; a click opens it full screen. */
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
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  if (!images.length) return null;
  return (
    <div className="mt-2">
      {images.map((img, i) => (
        <div key={i} className="relative w-fit max-w-full">
          <button type="button" onClick={() => setOpenUrl(img.url)} className="block max-w-full cursor-zoom-in" aria-label="View image full screen" title="View full screen">
            <QuestionImage url={img.url} alt={img.alt} />
          </button>
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
      {openUrl && <ImageLightbox url={openUrl} onClose={() => setOpenUrl(null)} />}
    </div>
  );
}

/** An image over a dark full-screen backdrop; closes on the backdrop, the X or Esc. */
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    // Capture phase, so Esc closes only the image and not a modal it sits in.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Question image" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button type="button" onClick={onClose} autoFocus className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close" title="Close">
        <Icon.X className="w-5 h-5" />
      </button>
      <img src={url} alt="Question image" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
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
