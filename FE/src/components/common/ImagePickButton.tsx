import React, { useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { IMAGE_ACCEPT, imageFileError } from '@/services/upload.service';

/** A button that opens the image picker; invalid files are reported through onError and never reach onPick. */
export function ImagePickButton({
  onPick,
  onError,
  loading,
  disabled,
  children = 'Upload image',
  variant = 'outline',
  size = 'sm',
  className,
}: {
  onPick: (file: File) => void;
  onError: (message: string) => void;
  loading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const error = imageFileError(file);
          if (error) onError(error);
          else onPick(file);
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        icon={<Icon.Image className="w-4 h-4" />}
        loading={loading}
        disabled={disabled || loading}
        onClick={() => input.current?.click()}
      >
        {children}
      </Button>
    </>
  );
}
