import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/assets/icons';

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'general', label: 'General', icon: <Icon.Settings className="w-4 h-4" /> },
  { id: 'security', label: 'Authentication & Security', icon: <Icon.Shield className="w-4 h-4" /> },
  { id: 'exam', label: 'Exam Defaults', icon: <Icon.ClipboardList className="w-4 h-4" /> },
  { id: 'question', label: 'Question Settings', icon: <Icon.FileText className="w-4 h-4" /> },
  { id: 'upload', label: 'File Upload', icon: <Icon.Upload className="w-4 h-4" /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Icon.Database className="w-4 h-4" /> },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ── Reusable building blocks ──────────────────────────────────────────────────

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-3 border-t border-[#F3F4F6] first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#374151]">{label}</p>
        {desc && <p className="text-[12px] text-[#9CA3AF] mt-0.5">{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-t border-[#F3F4F6] first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[#374151]">{label}</p>
        {desc && <p className="text-[12px] text-[#9CA3AF] mt-0.5">{desc}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Initial mock values (per section, so Reset restores them) ─────────────────

const INITIAL = {
  general: {
    platformName: 'CertifyAI',
    supportEmail: 'support@certifyai.com',
    language: 'en',
    timezone: 'utc+7',
    dateFormat: 'dmy',
  },
  security: {
    allowRegistration: true,
    requireEmailVerification: true,
    minPasswordLength: '8',
    sessionTimeout: '30',
    maxLoginAttempts: '5',
    lockDuration: '15',
  },
  exam: {
    duration: '60',
    passScore: '70',
    maxAttempts: '2',
    shuffleQuestions: true,
    shuffleOptions: true,
    autoSubmit: true,
    allowReview: false,
  },
  question: {
    difficulty: 'medium',
    maxOptions: '4',
    requireExplanation: false,
    aiHints: true,
    duplicateDetection: true,
  },
  upload: {
    pdfSize: '20',
    imageSize: '5',
    fileTypes: 'pdf,png,jpg,jpeg,webp',
    ocrResolution: '300',
  },
  maintenance: {
    maintenanceMode: false,
  },
};

type Settings = typeof INITIAL;

// Deep-ish copy helper for resetting (all values are strings/booleans, so a
// shallow per-section spread is sufficient).
const clone = (s: Settings): Settings => ({
  general: { ...s.general },
  security: { ...s.security },
  exam: { ...s.exam },
  question: { ...s.question },
  upload: { ...s.upload },
  maintenance: { ...s.maintenance },
});

export function SystemSettingsPage() {
  const [section, setSection] = useState<SectionId>('general');
  const [settings, setSettings] = useState<Settings>(() => clone(INITIAL));
  const [confirmReset, setConfirmReset] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [actionFlash, setActionFlash] = useState<string | null>(null);

  const set = <K extends SectionId>(id: K, patch: Partial<Settings[K]>) =>
    setSettings(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }) as Settings);

  const resetSection = () => {
    setSettings(prev => ({ ...prev, [section]: { ...INITIAL[section] } }));
    setConfirmReset(false);
  };

  const handleSave = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  };

  const runMaintenance = (label: string) => {
    setActionFlash(label);
    window.setTimeout(() => setActionFlash(null), 2500);
  };

  const statusPill = (ok: boolean, label: string) => (
    <Badge variant={ok ? 'success' : 'danger'}>{label}</Badge>
  );

  return (
    <div className="p-8 space-y-5">
      <div>
        <h2 className="text-[22px] font-bold text-[#111827]">System Settings</h2>
        <p className="text-[13px] text-[#6B7280] mt-1">Configure platform behavior, security, and maintenance options.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left (25%): settings navigation */}
        <nav className="lg:col-span-1 lg:sticky lg:top-0 card p-2 space-y-0.5 min-w-0" aria-label="Settings sections">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
              className={`sidebar-link w-full ${section === s.id ? 'active' : ''}`}
            >
              <span className="w-4 h-4 flex-shrink-0">{s.icon}</span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </nav>

        {/* Right (75%): settings content */}
        <div className="lg:col-span-3 min-w-0 space-y-5">
          {/* ── General ── */}
          {section === 'general' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">General</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Platform Name" value={settings.general.platformName} onChange={e => set('general', { platformName: e.target.value })} />
                <Input label="Support Email" type="email" icon={<Icon.Mail className="w-4 h-4" />} value={settings.general.supportEmail} onChange={e => set('general', { supportEmail: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Default Language"
                  value={settings.general.language}
                  onChange={v => set('general', { language: v })}
                  options={[{ label: 'English', value: 'en' }, { label: 'Spanish', value: 'es' }, { label: 'French', value: 'fr' }, { label: 'Vietnamese', value: 'vi' }]}
                />
                <Select
                  label="Time Zone"
                  value={settings.general.timezone}
                  onChange={v => set('general', { timezone: v })}
                  options={[{ label: 'UTC+07:00 — Bangkok, Hanoi, Jakarta', value: 'utc+7' }, { label: 'UTC+00:00 — UTC', value: 'utc' }, { label: 'UTC−05:00 — New York', value: 'utc-5' }, { label: 'UTC+09:00 — Tokyo', value: 'utc+9' }]}
                />
              </div>
              <Select
                label="Date Format"
                value={settings.general.dateFormat}
                onChange={v => set('general', { dateFormat: v })}
                className="max-w-xs"
                options={[{ label: 'DD/MM/YYYY', value: 'dmy' }, { label: 'MM/DD/YYYY', value: 'mdy' }, { label: 'YYYY-MM-DD', value: 'ymd' }]}
              />
            </div>
          )}

          {/* ── Authentication & Security ── */}
          {section === 'security' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">Authentication & Security</h4>
              <ToggleRow label="Enable User Registration" desc="Students can create their own accounts" checked={settings.security.allowRegistration} onChange={v => set('security', { allowRegistration: v })} />
              <ToggleRow label="Require Email Verification" desc="New accounts must confirm their email before logging in" checked={settings.security.requireEmailVerification} onChange={v => set('security', { requireEmailVerification: v })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <Input label="Minimum Password Length" type="number" min={6} max={64} value={settings.security.minPasswordLength} onChange={e => set('security', { minPasswordLength: e.target.value })} hint="Characters" />
                <Input label="Session Timeout" type="number" min={5} value={settings.security.sessionTimeout} onChange={e => set('security', { sessionTimeout: e.target.value })} suffix="min" hint="Minutes of inactivity before logout" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Maximum Login Attempts" type="number" min={1} value={settings.security.maxLoginAttempts} onChange={e => set('security', { maxLoginAttempts: e.target.value })} hint="Before the account locks" />
                <Input label="Account Lock Duration" type="number" min={1} value={settings.security.lockDuration} onChange={e => set('security', { lockDuration: e.target.value })} suffix="min" hint="How long a locked account stays locked" />
              </div>
            </div>
          )}

          {/* ── Exam Defaults ── */}
          {section === 'exam' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">Exam Defaults</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input label="Default Exam Duration" type="number" min={5} value={settings.exam.duration} onChange={e => set('exam', { duration: e.target.value })} suffix="min" />
                <Input label="Default Pass Score" type="number" min={0} max={100} value={settings.exam.passScore} onChange={e => set('exam', { passScore: e.target.value })} suffix="%" />
                <Input label="Maximum Attempts" type="number" min={1} value={settings.exam.maxAttempts} onChange={e => set('exam', { maxAttempts: e.target.value })} />
              </div>
              <div className="pt-1">
                <ToggleRow label="Shuffle Questions" desc="Randomize question order for every attempt" checked={settings.exam.shuffleQuestions} onChange={v => set('exam', { shuffleQuestions: v })} />
                <ToggleRow label="Shuffle Answer Options" desc="Randomize answer order within each question" checked={settings.exam.shuffleOptions} onChange={v => set('exam', { shuffleOptions: v })} />
                <ToggleRow label="Auto Submit When Time Ends" desc="The exam is submitted automatically at timeout" checked={settings.exam.autoSubmit} onChange={v => set('exam', { autoSubmit: v })} />
                <ToggleRow label="Allow Review After Submission" desc="Let students view their answers and correct answers afterward" checked={settings.exam.allowReview} onChange={v => set('exam', { allowReview: v })} />
              </div>
            </div>
          )}

          {/* ── Question Settings ── */}
          {section === 'question' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">Question Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Default Difficulty"
                  value={settings.question.difficulty}
                  onChange={v => set('question', { difficulty: v })}
                  options={[{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]}
                />
                <Input label="Maximum Answer Options" type="number" min={2} max={10} value={settings.question.maxOptions} onChange={e => set('question', { maxOptions: e.target.value })} hint="2–10 options per question" />
              </div>
              <ToggleRow label="Require Explanation" desc="Content managers must add an answer explanation" checked={settings.question.requireExplanation} onChange={v => set('question', { requireExplanation: v })} />
              <ToggleRow label="Enable AI Hint Generation" desc="Students can request AI hints during quizzes" checked={settings.question.aiHints} onChange={v => set('question', { aiHints: v })} />
              <ToggleRow label="Duplicate Question Detection" desc="Warn when a new question closely matches an existing one" checked={settings.question.duplicateDetection} onChange={v => set('question', { duplicateDetection: v })} />
            </div>
          )}

          {/* ── File Upload ── */}
          {section === 'upload' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">File Upload</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Maximum PDF Size" type="number" min={1} value={settings.upload.pdfSize} onChange={e => set('upload', { pdfSize: e.target.value })} suffix="MB" />
                <Input label="Maximum Image Size" type="number" min={1} value={settings.upload.imageSize} onChange={e => set('upload', { imageSize: e.target.value })} suffix="MB" />
              </div>
              <Input label="Allowed File Types" value={settings.upload.fileTypes} onChange={e => set('upload', { fileTypes: e.target.value })} hint="Comma-separated file extensions" />
              <Input label="Maximum OCR Image Resolution" type="number" min={72} value={settings.upload.ocrResolution} onChange={e => set('upload', { ocrResolution: e.target.value })} suffix="dpi" hint="Higher resolution improves OCR accuracy" />
            </div>
          )}

          {/* ── Maintenance ── */}
          {section === 'maintenance' && (
            <div className="space-y-5">
              <div className="card p-6 space-y-4">
                <h4 className="text-[16px] font-semibold text-[#111827]">Maintenance</h4>
                <ToggleRow
                  label="Enable Maintenance Mode"
                  desc="Disable access for all non-admin users while updates are applied"
                  checked={settings.maintenance.maintenanceMode}
                  onChange={v => set('maintenance', { maintenanceMode: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => runMaintenance('Cache cleared')}>Clear Cache</Button>
                  <Button variant="outline" icon={<Icon.Database className="w-4 h-4" />} onClick={() => runMaintenance('Database backup started')}>Backup Database</Button>
                  <Button variant="outline" icon={<Icon.Upload className="w-4 h-4" />} onClick={() => runMaintenance('Restore preview: select a backup file')}>Restore Database</Button>
                  <Button variant="outline" icon={<Icon.Activity className="w-4 h-4" />} onClick={() => runMaintenance('All systems operational')}>View System Status</Button>
                  <div className="sm:col-span-2">
                    <Alert type="warning" title="Careful" message="Restore replaces the current database with the selected backup. Create a fresh backup first." />
                  </div>
                </div>
              </div>
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F3F4F6]"><h4 className="text-[15px] font-semibold text-[#111827]">Backup History</h4></div>
                <div className="divide-y divide-[#F9FAFB]">
                  {[
                    { date: '2026-09-21 03:00', size: '14.2 GB', status: 'Success', type: 'Auto' },
                    { date: '2026-09-20 03:00', size: '14.0 GB', status: 'Success', type: 'Auto' },
                    { date: '2026-09-19 14:35', size: '13.9 GB', status: 'Success', type: 'Manual' },
                  ].map(b => (
                    <div key={b.date} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F9FAFB]">
                      <Icon.Database className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#374151] font-mono truncate">{b.date}</p>
                        <p className="text-[12px] text-[#9CA3AF]">{b.size}</p>
                      </div>
                      <Badge variant={b.type === 'Manual' ? 'purple' : 'default'}>{b.type}</Badge>
                      {statusPill(b.status === 'Success', b.status)}
                      <button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px] flex-shrink-0"><Icon.Download className="w-4 h-4 text-[#6B7280]" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save / Reset footer (shared by every section) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              {savedFlash && <Alert type="success" message="Settings saved successfully." />}
              {!savedFlash && actionFlash && <Alert type="info" message={actionFlash} />}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setConfirmReset(true)}>Reset to Default</Button>
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset to Default"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={resetSection}>Reset</Button>
          </>
        }
      >
        <p className="text-[14px] text-[#374151]">
          This will restore the <span className="font-semibold">{SECTIONS.find(s => s.id === section)?.label}</span> settings to their default values. Any unsaved changes in this section will be lost.
        </p>
      </Modal>
    </div>
  );
}
