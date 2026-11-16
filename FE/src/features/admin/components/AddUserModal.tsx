import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getApiErrorMessage } from '@/utils/apiError';
import { adminUserService, type AdminUserProfile, type AdminUserRole } from '@/services/adminUser.service';

const FULL_NAME_MAX = 100;
const EMAIL_MAX = 150;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_OPTIONS: { label: string; value: AdminUserRole }[] = [
  { label: 'Student', value: 'STUDENT' },
  { label: 'Content Manager', value: 'COURSE_MANAGER' },
  { label: 'Admin', value: 'ADMIN' },
];

type Form = { fullName: string; email: string; role: AdminUserRole };
type FieldErrors = Partial<Record<keyof Form, string>>;
const EMPTY: Form = { fullName: '', email: '', role: 'STUDENT' };

/**
 * Creates an account (UM-06). The admin never sees or types a password: the backend generates one
 * and e-mails it to the new user together with the sign-in details.
 */
export function AddUserModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: AdminUserProfile) => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setErrors({});
    setError(null);
  }, [open]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
    setError(null);
  };

  const validate = (fullName: string, email: string): FieldErrors => {
    const next: FieldErrors = {};
    if (!fullName) next.fullName = 'Full name is required.';
    if (!email) next.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email)) next.email = 'Enter a valid email address.';
    return next;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const fieldErrors = validate(fullName, email);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(await adminUserService.create({ fullName, email, role: form.role }));
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) setErrors({ email: 'This email is already in use.' });
      else setError(getApiErrorMessage(err, 'Could not create this user.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Add User"
      description="A password is generated automatically and sent to the user's email with their sign-in details."
      error={error && <Alert type="error" message={error} />}
      footer={<>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button form="add-user-form" type="submit" variant="primary" loading={saving} disabled={saving}>Create user</Button>
      </>}
    >
      <form id="add-user-form" onSubmit={submit} noValidate className="space-y-4">
        <Input label="Full Name" required maxLength={FULL_NAME_MAX} value={form.fullName} error={errors.fullName} onChange={e => update('fullName', e.target.value)} placeholder="e.g. Nguyen Van A" />
        <Input label="Email" type="email" required maxLength={EMAIL_MAX} value={form.email} error={errors.email} onChange={e => update('email', e.target.value)} placeholder="name@example.com" />
        <Select label="Role" value={form.role} options={ROLE_OPTIONS} onChange={v => update('role', v as AdminUserRole)} />
      </form>
    </Modal>
  );
}
