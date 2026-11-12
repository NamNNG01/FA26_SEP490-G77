import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function ImageViewer({ src, alt, className = '' }: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  const close = () => {
    setOpen(false);
    setZoom(1);
  };

  return <>
    <button
      type="button"
      onClick={() => { setZoom(1); setOpen(true); }}
      aria-label={`Open image full screen: ${alt}`}
      title="Open image full screen"
      className={`block max-w-full cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${className}`}
    >
      <img src={src} alt={alt} className="block max-h-72 max-w-full rounded-lg border border-line bg-surface-muted object-contain" />
    </button>

    <Modal open={open} onClose={close} title={alt || 'Image viewer'} size="screen">
      <div className="flex h-full min-h-[60vh] flex-col bg-black/95">
        <div className="flex items-center justify-center gap-2 border-b border-white/15 px-3 py-2 text-white">
          <Button type="button" size="sm" variant="secondary" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(value => clampZoom(value - ZOOM_STEP))} aria-label="Zoom out">−</Button>
          <span className="min-w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="sm" variant="secondary" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(value => clampZoom(value + ZOOM_STEP))} aria-label="Zoom in">+</Button>
          <Button type="button" size="sm" variant="secondary" disabled={zoom === 1} onClick={() => setZoom(1)}>Reset</Button>
          <span className="hidden text-xs text-white/70 sm:inline">Scroll to zoom</span>
        </div>
        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-6"
          onWheel={event => {
            event.preventDefault();
            setZoom(value => clampZoom(value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `scale(${zoom})` }}
            className="max-h-[72vh] max-w-full origin-center object-contain transition-transform duration-150"
          />
        </div>
      </div>
    </Modal>
  </>;
}
