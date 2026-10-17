import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';

export function CourseOverviewPanel({ title, description, status, manager, updated, stats, onNavigate }: {
  title: string;
  description: string;
  status: string;
  manager: string;
  updated: string;
  stats: { label: string; value: number | string; color: string }[];
  onNavigate?: (id: string) => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-bold text-content">{title}</h3>
            <Badge variant="success">{status}</Badge>
          </div>
          <p className="text-sm text-content-soft leading-relaxed mt-1.5 max-w-2xl"><span className="font-medium text-content-secondary">Description: </span>{description}</p>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-content-soft">
            <span className="flex items-center gap-1.5"><Icon.User className="w-3.5 h-3.5 text-content-subtle" />Course Manager: <span className="font-medium text-content-secondary">{manager}</span></span>
            <span className="flex items-center gap-1.5"><Icon.Clock className="w-3.5 h-3.5 text-content-subtle" />Last Updated: <span className="font-medium text-content-secondary">{updated}</span></span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats.map(s => (
            <div key={s.label} className="flex items-center gap-2 bg-surface-alt rounded-[10px] px-3.5 py-2.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <div>
                <p className="text-lg font-semibold text-content leading-none">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
                <p className="text-2xs text-content-subtle mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 xl:flex-col">
          <Button variant="outline" size="sm" icon={<Icon.Edit className="w-3.5 h-3.5" />} onClick={() => onNavigate?.('course-edit')}>Edit Course</Button>
        </div>
      </div>
    </div>
  );
}