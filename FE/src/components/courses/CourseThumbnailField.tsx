import React from 'react';
import { Icon } from '@/assets/icons';
import { ImagePickButton } from '@/components/common/ImagePickButton';

/** Thumbnail preview + picker. The parent decides whether a picked file is uploaded now (edit) or after create. */
export function CourseThumbnailField({
  url,
  onPick,
  onError,
  onRemove,
  uploading,
  disabled,
}: {
  url: string | null | undefined;
  onPick: (file: File) => void;
  onError: (message: string) => void;
  onRemove?: () => void;
  uploading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-content-secondary block mb-1.5">Thumbnail</label>
      <div className="aspect-video w-full rounded-[10px] border border-line bg-surface-alt overflow-hidden flex items-center justify-center">
        {url ? (
          <img src={url} alt="Course thumbnail" className="w-full h-full object-cover" />
        ) : (
          <Icon.Image className="w-8 h-8 text-content-soft" />
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2 mt-2">
          <ImagePickButton loading={uploading} onPick={onPick} onError={onError}>
            {url ? 'Change image' : 'Upload image'}
          </ImagePickButton>
          {url && onRemove && (
            <button type="button" className="text-sm text-danger hover:underline" onClick={onRemove} disabled={uploading}>
              Remove
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-content-soft mt-1">JPG, PNG, WEBP or GIF, up to 5 MB.</p>
    </div>
  );
}
