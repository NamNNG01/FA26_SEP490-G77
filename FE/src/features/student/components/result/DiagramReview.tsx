import { Spinner } from '@/components/ui/Spinner';
import { useDrawioSnapshot } from '@/features/question/components/useDrawioSnapshot';

/** The submitted diagram, rendered to a picture by a hidden draw.io (the BE keeps only the XML). */
export function DiagramReview({ xml }: { xml: string }) {
  const snapshot = useDrawioSnapshot(xml);
  return (
    <div className="rounded-[10px] border border-line bg-white p-3 flex items-center justify-center min-h-[140px]">
      {snapshot.svg ? (
        <img src={snapshot.svg} alt="Your diagram" className="max-h-[420px] max-w-full object-contain" />
      ) : snapshot.status === 'loading' ? (
        <span className="flex items-center gap-2 text-sm text-content-soft">
          <Spinner size="sm" /> Rendering your diagram…
        </span>
      ) : (
        <span className="text-sm text-content-soft">
          Diagram submitted ({xml.length.toLocaleString()} characters of XML) — couldn’t render a preview.
        </span>
      )}
      {snapshot.frame}
    </div>
  );
}
