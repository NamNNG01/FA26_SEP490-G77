import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';

export function AuditLogsPage() {
  const logs = [
    { user: 'Tom Williams', action: 'User role changed', target: 'priya.nair@institute.edu → Content Manager', time: '2026-09-21 14:32', type: 'permission' },
    { user: 'Tom Williams', action: 'Exam published', target: 'ML Fundamentals Final Examination', time: '2026-09-21 13:15', type: 'content' },
    { user: 'System', action: 'AI model updated', target: 'certifyai-ai-v3.2 deployed', time: '2026-09-21 11:00', type: 'system' },
    { user: 'Priya Nair', action: 'Bulk import completed', target: '124 questions from ML_Questions_2024.pdf', time: '2026-09-21 10:44', type: 'content' },
    { user: 'Tom Williams', action: 'User deactivated', target: 'li.wei@university.cn', time: '2026-09-20 16:22', type: 'permission' },
    { user: 'System', action: 'Backup completed', target: 'Full backup — 14.2 GB', time: '2026-09-20 03:00', type: 'system' },
  ];
  const typeIcon = { permission: <Icon.Shield className="w-4 h-4 text-purple" />, content: <Icon.FileText className="w-4 h-4 text-brand-ink" />, system: <Icon.Cpu className="w-4 h-4 text-success-strong" /> };
  const typeBadge = { permission: 'purple' as const, content: 'info' as const, system: 'success' as const };
  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-content">Audit Logs</h2>
        <div className="flex gap-2">
          <SearchInput className="w-full sm:w-60" placeholder="Search logs…" />
          <Select value="all" options={[{ label: 'All Types', value: 'all' }, { label: 'Permission', value: 'perm' }, { label: 'Content', value: 'content' }, { label: 'System', value: 'system' }]} className="w-full sm:w-36" />
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y divide-line-faint">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-hover">
              <div className="flex-shrink-0">{typeIcon[log.type as keyof typeof typeIcon]}</div>
              <Avatar name={log.user === 'System' ? 'SY' : log.user} size="sm" color={log.user === 'System' ? '#059669' : undefined} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-content-secondary">{log.user}</span>
                  <span className="text-sm text-content-soft">{log.action}</span>
                </div>
                <p className="text-xs text-content-subtle mt-0.5 font-mono">{log.target}</p>
              </div>
              <Badge variant={typeBadge[log.type as keyof typeof typeBadge]}>{log.type}</Badge>
              <span className="text-xs text-content-subtle font-mono flex-shrink-0">{log.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
