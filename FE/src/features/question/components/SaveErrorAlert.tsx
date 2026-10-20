import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { SaveError } from '../saveError';

/** A failed save: the backend's field errors as a list, and a Reload button when the question changed on the server. */
export function SaveErrorAlert({ error, onReload }: { error: SaveError; onReload?: () => void }) {
  return (
    <div className="space-y-2">
      <Alert
        type="error"
        title={error.conflict ? 'This question was changed by someone else' : 'Could not save'}
        message={error.conflict ? 'Reload to get the latest version, then apply your changes again.' : error.message}
      />
      {error.details && error.details.length > 0 && (
        <ul className="list-disc pl-9 space-y-0.5 text-sm text-danger-strong">
          {error.details.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
      {error.conflict && onReload && <Button variant="secondary" size="sm" onClick={onReload}>Reload question</Button>}
    </div>
  );
}
