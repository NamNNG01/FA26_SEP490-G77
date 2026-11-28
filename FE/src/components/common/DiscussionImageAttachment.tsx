import { useRef, useState } from "react";
import { Icon } from "@/assets/icons";
import { ImageViewer } from "@/components/common/ImageViewer";
import { Button } from "@/components/ui/Button";
import { IMAGE_ACCEPT, imageFileError, uploadService } from "@/services/upload.service";

/** Uploads one discussion image and exposes its URL for the post/comment request. */
export function DiscussionImageAttachment({
  imageUrl,
  onChange,
  label = "Attach an image",
}: {
  imageUrl: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const chooseFile = async (file?: File) => {
    if (!file) return;
    const validation = imageFileError(file);
    if (validation) {
      setError(validation);
      return;
    }
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isPng =
      bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isGif = bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
    const isWebp =
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!(isPng || isJpeg || isGif || isWebp)) {
      setError(
        "This file does not appear to be a valid image. Choose a JPG, PNG, WEBP, or GIF file.",
      );
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadService.uploadMedia(file);
      onChange(uploaded.url);
    } catch {
      setError("Could not upload this image. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        aria-label={label}
        onChange={(event) => void chooseFile(event.target.files?.[0])}
      />
      {imageUrl && (
        <div className="flex flex-wrap items-start gap-3">
          <ImageViewer src={imageUrl} alt="Discussion attachment" imageClassName="max-h-48" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => onChange("")}
          >
            Remove image
          </Button>
        </div>
      )}
      {!imageUrl && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={uploading}
          disabled={uploading}
          icon={<Icon.Image className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
        >
          {label}
        </Button>
      )}
      {imageUrl && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={uploading}
          disabled={uploading}
          icon={<Icon.Image className="h-4 w-4" />}
          onClick={() => inputRef.current?.click()}
        >
          Replace image
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-content-subtle">JPG, PNG, WEBP, or GIF · Up to 5 MB</p>
    </div>
  );
}
