import { Badge } from '@/components/ui/Badge';
import { issueLabel } from '@/services/questionIssue.service';

export function Status({ value = '' }: { value?: string }) {
  const variant = value === 'RESOLVED' ? 'success' : value === 'REJECTED' ? 'danger' : value === 'IN_PROGRESS' ? 'info' : ['DUPLICATE', 'WITHDRAWN'].includes(value) ? 'default' : 'warning';
  return <Badge variant={variant}>{issueLabel(value)}</Badge>;
}

export function PriorityBadge({ priority = 'LOW', score }: { priority?: string; score?: number }) {
  const variant = priority === 'HIGH' ? 'danger' : priority === 'MEDIUM' ? 'warning' : 'default';
  return <Badge variant={variant}>{priority}{score != null ? ` · ${score}` : ''}</Badge>;
}
