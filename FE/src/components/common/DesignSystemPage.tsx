import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/assets/icons';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-[13px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-4">{title}</h3>
    {children}
  </div>
);

export default function DesignSystemPage() {
  const colors = [
    { name: 'Primary', value: '#2563EB', shade: '600' },
    { name: 'Primary Light', value: '#EFF6FF', shade: '50' },
    { name: 'Success', value: '#16A34A', shade: '' },
    { name: 'Warning', value: '#D97706', shade: '' },
    { name: 'Danger', value: '#DC2626', shade: '' },
    { name: 'Info', value: '#0891B2', shade: '' },
    { name: 'Purple', value: '#7C3AED', shade: '' },
    { name: 'Gray 900', value: '#111827', shade: '' },
    { name: 'Gray 700', value: '#374151', shade: '' },
    { name: 'Gray 500', value: '#6B7280', shade: '' },
    { name: 'Gray 300', value: '#D1D5DB', shade: '' },
    { name: 'Gray 100', value: '#F3F4F6', shade: '' },
  ];
  const radii = [
    { label: 'sm', value: '6px', cls: 'rounded-[6px]' },
    { label: 'md', value: '10px', cls: 'rounded-[10px]' },
    { label: 'lg', value: '14px', cls: 'rounded-[14px]' },
    { label: 'xl', value: '20px', cls: 'rounded-[20px]' },
    { label: 'full', value: '999px', cls: 'rounded-full' },
  ];
  const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];
  const shadows = [
    { label: 'sm', cls: 'shadow-sm' },
    { label: 'md', cls: 'shadow-md' },
    { label: 'lg', cls: 'shadow-lg' },
    { label: 'xl', cls: 'shadow-xl' },
  ];
  const typeScale = [
    { label: 'Display', size: '36px', weight: '800', sample: 'AI Certificate Platform' },
    { label: 'H1', size: '28px', weight: '700', sample: 'Dashboard Overview' },
    { label: 'H2', size: '22px', weight: '700', sample: 'Question' },
    { label: 'H3', size: '18px', weight: '600', sample: 'Exam Results' },
    { label: 'H4', size: '16px', weight: '600', sample: 'Section Title' },
    { label: 'Body Lg', size: '16px', weight: '400', sample: 'Regular body text for reading long content.' },
    { label: 'Body', size: '14px', weight: '400', sample: 'Standard paragraph text used throughout the UI.' },
    { label: 'Small', size: '13px', weight: '400', sample: 'Captions, hints, and helper text.' },
    { label: 'Micro', size: '12px', weight: '500', sample: 'LABELS AND BADGES' },
    { label: 'Mono', size: '13px', weight: '400', sample: 'const score = 92; // JetBrains Mono' },
  ];
  const icons = [
    Icon.Home, Icon.Book, Icon.ClipboardList, Icon.Trophy, Icon.User, Icon.Users,
    Icon.Settings, Icon.Bell, Icon.Search, Icon.Filter, Icon.Plus, Icon.Edit,
    Icon.Trash, Icon.Eye, Icon.ChevronDown, Icon.Check, Icon.X, Icon.Upload,
    Icon.Download, Icon.MoreVertical, Icon.Star, Icon.Clock, Icon.Calendar,
    Icon.Award, Icon.BarChart, Icon.TrendingUp, Icon.FileText, Icon.Shield,
    Icon.Lock, Icon.Mail, Icon.LogOut, Icon.Brain, Icon.Zap, Icon.Activity,
    Icon.AlertCircle, Icon.Info, Icon.CheckCircle, Icon.Database, Icon.Layers,
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-14">
      {/* Colors */}
      <Section title="Color Tokens">
        <div className="grid grid-cols-6 gap-3">
          {colors.map(c => (
            <div key={c.name}>
              <div className="h-14 rounded-[10px] border border-[#00000010] mb-2" style={{ background: c.value }} />
              <p className="text-[12px] font-medium text-[#374151]">{c.name}</p>
              <p className="text-[11px] font-mono text-[#9CA3AF]">{c.value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Typography */}
      <Section title="Typography Scale">
        <div className="card overflow-hidden">
          {typeScale.map((t, i) => (
            <div key={t.label} className={`flex items-baseline gap-6 px-6 py-4 ${i > 0 ? 'border-t border-[#F3F4F6]' : ''}`}>
              <div className="w-20 flex-shrink-0">
                <p className="text-[11px] font-mono text-[#9CA3AF]">{t.label}</p>
                <p className="text-[11px] font-mono text-[#D1D5DB]">{t.size} / {t.weight}</p>
              </div>
              <p style={{ fontSize: t.size, fontWeight: t.weight, fontFamily: t.label === 'Mono' ? 'JetBrains Mono, monospace' : undefined }} className="text-[#111827]">{t.sample}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Spacing */}
      <Section title="Spacing Scale (8px Base)">
        <div className="flex items-end gap-4 flex-wrap">
          {spacing.map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <div className="bg-[#2563EB] rounded-[4px]" style={{ width: s, height: s }} />
              <p className="text-[11px] font-mono text-[#9CA3AF]">{s}px</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Border Radius */}
      <Section title="Border Radius">
        <div className="flex items-center gap-6 flex-wrap">
          {radii.map(r => (
            <div key={r.label} className="flex flex-col items-center gap-2">
              <div className={`w-16 h-16 bg-[#EFF6FF] border-2 border-[#2563EB] ${r.cls}`} />
              <p className="text-[12px] font-medium text-[#374151]">{r.label}</p>
              <p className="text-[11px] font-mono text-[#9CA3AF]">{r.value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Shadows */}
      <Section title="Elevation / Shadows">
        <div className="flex items-center gap-6 flex-wrap">
          {shadows.map(s => (
            <div key={s.label} className={`w-28 h-20 bg-white rounded-[10px] border border-[#F3F4F6] flex items-center justify-center ${s.cls}`}>
              <p className="text-[13px] font-medium text-[#374151]">{s.label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Icons */}
      <Section title="Icon Set (24×24)">
        <div className="flex flex-wrap gap-3">
          {icons.map((IcoComp, i) => (
            <div key={i} className="w-10 h-10 bg-[#F9FAFB] border border-[#F3F4F6] rounded-[8px] flex items-center justify-center hover:bg-[#EFF6FF] hover:border-[#BFDBFE] transition-colors cursor-pointer group">
              <IcoComp className="w-5 h-5 text-[#6B7280] group-hover:text-[#2563EB]" />
            </div>
          ))}
        </div>
      </Section>

      {/* Grid */}
      <Section title="Grid System (12-column)">
        <div className="grid grid-cols-12 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-8 bg-[#EFF6FF] border border-[#BFDBFE] rounded-[4px] flex items-center justify-center">
              <span className="text-[10px] font-mono text-[#2563EB]">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-12 gap-2">
          <div className="col-span-4 h-12 bg-[#2563EB] rounded-[6px] flex items-center justify-center"><span className="text-[12px] text-white font-medium">4 cols</span></div>
          <div className="col-span-8 h-12 bg-[#BFDBFE] rounded-[6px] flex items-center justify-center"><span className="text-[12px] text-[#1E40AF] font-medium">8 cols</span></div>
        </div>
        <div className="mt-2 grid grid-cols-12 gap-2">
          <div className="col-span-3 h-10 bg-[#BFDBFE] rounded-[6px] flex items-center justify-center"><span className="text-[11px] text-[#1E40AF] font-medium">3</span></div>
          <div className="col-span-3 h-10 bg-[#BFDBFE] rounded-[6px] flex items-center justify-center"><span className="text-[11px] text-[#1E40AF] font-medium">3</span></div>
          <div className="col-span-3 h-10 bg-[#BFDBFE] rounded-[6px] flex items-center justify-center"><span className="text-[11px] text-[#1E40AF] font-medium">3</span></div>
          <div className="col-span-3 h-10 bg-[#BFDBFE] rounded-[6px] flex items-center justify-center"><span className="text-[11px] text-[#1E40AF] font-medium">3</span></div>
        </div>
      </Section>

      {/* Variables */}
      <Section title="Design Variables">
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3">Primitives</p>
            <div className="space-y-2">
              {[
                ['--color-primary', '#2563EB'],
                ['--color-success', '#16A34A'],
                ['--color-warning', '#D97706'],
                ['--color-danger', '#DC2626'],
                ['--font-sans', 'Inter'],
                ['--font-mono', 'JetBrains Mono'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <code className="text-[12px] font-mono text-[#7C3AED]">{k}</code>
                  <code className="text-[12px] font-mono text-[#374151]">{v}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3">Semantic Tokens</p>
            <div className="space-y-2">
              {[
                ['--radius-sm', '6px'],
                ['--radius-md', '10px'],
                ['--radius-lg', '14px'],
                ['--spacing-base', '8px'],
                ['--shadow-card', '0 1px 2px rgb(0 0 0/5%)'],
                ['--transition', '150ms ease'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <code className="text-[12px] font-mono text-[#0891B2]">{k}</code>
                  <code className="text-[12px] font-mono text-[#374151]">{v}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Effects */}
      <Section title="Effects & Motion">
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-[13px] font-semibold text-[#374151] mb-3">Progress Indicators</p>
            <div className="space-y-3">
              <Progress value={75} label="Course Completion" color="#2563EB" />
              <Progress value={45} label="Exam Score" color="#D97706" />
              <Progress value={92} label="AI Accuracy" color="#16A34A" />
            </div>
          </div>
          <div className="card p-4">
            <p className="text-[13px] font-semibold text-[#374151] mb-3">Skeleton Loading</p>
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-8 w-full mt-2" />
            </div>
          </div>
          <div className="card p-4">
            <p className="text-[13px] font-semibold text-[#374151] mb-3">Status Badges</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Active</Badge>
              <Badge variant="success">Passed</Badge>
              <Badge variant="warning">Pending</Badge>
              <Badge variant="danger">Failed</Badge>
              <Badge variant="purple">AI Reviewed</Badge>
              <Badge>Draft</Badge>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
