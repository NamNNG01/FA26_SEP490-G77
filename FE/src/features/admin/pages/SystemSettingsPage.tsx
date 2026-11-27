import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/assets/icons';
import { systemSettingsService } from '@/services/systemSettings.service';
import { getApiErrorMessage } from '@/utils/apiError';

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'general', label: 'General', icon: <Icon.Settings className="w-4 h-4" /> },
  { id: 'security', label: 'Authentication & Security', icon: <Icon.Shield className="w-4 h-4" /> },
  { id: 'exam', label: 'Exam Defaults', icon: <Icon.ClipboardList className="w-4 h-4" /> },
  { id: 'question', label: 'Question Settings', icon: <Icon.FileText className="w-4 h-4" /> },
  { id: 'ai', label: 'AI Quota', icon: <Icon.Zap className="w-4 h-4" /> },
  { id: 'upload', label: 'File Upload', icon: <Icon.Upload className="w-4 h-4" /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Icon.Database className="w-4 h-4" /> },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// ── Reusable building blocks ──────────────────────────────────────────────────

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-3 border-t border-line-soft first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-base font-medium text-content-secondary">{label}</p>
        {desc && <p className="text-xs text-content-subtle mt-0.5">{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-t border-line-soft first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-base font-medium text-content-secondary">{label}</p>
        {desc && <p className="text-xs text-content-subtle mt-0.5">{desc}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Initial mock values (per section, so Reset restores them) ─────────────────

const INITIAL = {
  general: {
    platformName: 'PrepExam',
    supportEmail: 'support@prepexam.com',
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
  ai: {
    managerMonthlyTokenLimit: '1000000',
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
  ai: { ...s.ai },
  upload: { ...s.upload },
  maintenance: { ...s.maintenance },
});

/**
 * The stored document merged over the defaults, section by section, so a document written by an
 * older screen (missing a field) still opens instead of silently losing the missing defaults.
 */
function fromDocument(document: Record<string, unknown>): Settings {
  const next = clone(INITIAL);
  for (const id of Object.keys(INITIAL) as SectionId[]) {
    const stored = document[id];
    if (stored != null && typeof stored === 'object' && !Array.isArray(stored)) {
      Object.assign(next[id] as unknown as Record<string, unknown>, stored as Record<string, unknown>);
    }
  }
  return next;
}

export function SystemSettingsPage() {
  const [section, setSection] = useState<SectionId>('general');
  const [settings, setSettings] = useState<Settings>(() => clone(INITIAL));
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    setLoaded(false);
    systemSettingsService
      .get()
      .then(document => {
        setSettings(fromDocument(document));
        setLoaded(true);
      })
      .catch(err => setLoadError(getApiErrorMessage(err, 'Could not load the current settings.')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends SectionId>(id: K, patch: Partial<Settings[K]>) => {
    setSavedFlash(false);
    setSettings(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }) as Settings);
  };

  const resetSection = () => {
    setSettings(prev => ({ ...prev, [section]: { ...INITIAL[section] } }));
    setConfirmReset(false);
    setSavedFlash(false);
  };

  /** Save now writes to the server: the success banner appears only after the write lands. */
  const handleSave = async () => {
    const rawLimit = String(settings.ai.managerMonthlyTokenLimit ?? '').trim();
    if (!/^\d+$/.test(rawLimit)) {
      setSection('ai');
      setSaveError('Manager monthly AI token limit must be a non-negative whole number.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await systemSettingsService.save(settings as unknown as Record<string, unknown>);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'Could not save the settings. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-content">System Settings</h2>
        <p className="text-sm text-content-soft mt-1">Configure platform behavior, security, AI quotas, and maintenance options.</p>
      </div>

      {section !== 'ai' && (
        <Alert
          type="info"
          message="These settings are saved as configuration metadata in the database and are not yet enforced by backend runtime checks (except AI Quota)."
        />
      )}

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
          {loadError && (
            <div className="card p-4 space-y-3">
              <Alert type="error" message={loadError} />
              <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={load}>
                Retry
              </Button>
            </div>
          )}
          {!loaded && !loadError && <div className="card p-4 text-sm text-content-subtle">Loading settings…</div>}

          {/* ── General ── */}
          {section === 'general' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-lg font-semibold text-content">General</h4>
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
              <h4 className="text-lg font-semibold text-content">Authentication & Security</h4>
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
              <h4 className="text-lg font-semibold text-content">Exam Defaults</h4>
              <div className="grid grid-cols-1 gap-4">
                <Input label="Default Exam Duration" type="number" min={5} value={settings.exam.duration} onChange={e => set('exam', { duration: e.target.value })} suffix="min" />
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
              <h4 className="text-lg font-semibold text-content">Question Settings</h4>
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

          {/* ── AI Quota ── */}
          {section === 'ai' && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-lg font-semibold text-content">AI Quota</h4>
                <Badge variant="success">Enforced at runtime</Badge>
              </div>
              <Alert
                type="info"
                message="Global monthly token limit for Content Manager AI explanation generation (AI-04). Resets on the 1st of each month (Asia/Ho_Chi_Minh). You can set per-manager overrides on individual user profiles."
              />
              <Input
                label="Default Monthly AI Token Limit (per Manager)"
                type="number"
                min={0}
                step={1000}
                value={String(settings.ai.managerMonthlyTokenLimit ?? '')}
                onChange={e => set('ai', { managerMonthlyTokenLimit: e.target.value })}
                suffix="tokens / month"
                hint={
                  /^\d+$/.test(String(settings.ai.managerMonthlyTokenLimit ?? '').trim())
                    ? `Current limit: ${Number(settings.ai.managerMonthlyTokenLimit).toLocaleString()} tokens/month (Default: 1,000,000)`
                    : 'Enter a non-negative whole number (Default: 1,000,000)'
                }
              />
            </div>
          )}

          {/* ── File Upload ── */}
          {section === 'upload' && (
            <div className="card p-6 space-y-4">
              <h4 className="text-lg font-semibold text-content">File Upload</h4>
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
                <h4 className="text-lg font-semibold text-content">Maintenance</h4>
                <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-content-secondary">Maintenance Mode</p>
                    <p className="text-xs text-content-subtle mt-0.5">
                      Managed by the deployment environment, not by this screen — nothing here disables student access
                    </p>
                  </div>
                  <Badge variant="default">Not available</Badge>
                </div>
              </div>
              <div className="card p-6 space-y-4">
                <h4 className="text-lg font-semibold text-content">Operations</h4>
                <Alert
                  type="info"
                  title="Managed outside this screen"
                  message="Cache, backup, restore and system-status operations run in the deployment environment. Controls that only reported success have been removed instead of pretending."
                />
              </div>
            </div>
          )}

          {/* Save / Reset footer (shared by every section) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              {saveError && <Alert type="error" message={saveError} />}
              {!saveError && savedFlash && <Alert type="success" message="Settings saved successfully." />}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setConfirmReset(true)} disabled={!loaded || saving}>
                Reset to Default
              </Button>
              <Button onClick={() => void handleSave()} loading={saving} disabled={!loaded || saving}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetSection}
        tone="danger"
        title="Reset to default?"
        description={<>
          This will restore the <span className="font-semibold">{SECTIONS.find(s => s.id === section)?.label}</span> settings to their default values. Any unsaved changes in this section will be lost.
        </>}
        confirmLabel="Reset"
      />
    </div>
  );
}
