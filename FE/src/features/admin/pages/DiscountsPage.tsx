import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { adminDiscountService, type Discount, type DiscountAssignment, type DiscountPayload, type DiscountType, type Page } from '@/services/adminDiscount.service';
import { formatVnd } from '../utils/dashboardFormat';

const PAGE_SIZE = 10;
const EMPTY_PAGE: Page<Discount> = { content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true };
const validityLabels: Record<string, string> = { ACTIVE: 'Active', UPCOMING: 'Upcoming', EXPIRED: 'Expired', EXHAUSTED: 'Exhausted', INACTIVE: 'Inactive' };

type FormState = {
  code: string; name: string; description: string; discountType: DiscountType; value: string;
  maxDiscountAmount: string; minOrderAmount: string; appliesTo: string; usageLimit: string;
  startAt: string; expiredAt: string; isActive: boolean;
};
const blankForm = (): FormState => ({ code: '', name: '', description: '', discountType: 'PERCENT', value: '', maxDiscountAmount: '', minOrderAmount: '', appliesTo: 'ALL', usageLimit: '100', startAt: '', expiredAt: '', isActive: true });
const toLocalInput = (value?: string | null) => {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
};
const hcmInputToIso = (value: string) => {
  if (!value) return null;
  const [date, time] = value.split('T');
  return new Date(`${date}T${time}:00+07:00`).toISOString();
};
const formFromDiscount = (d: Discount): FormState => ({
  code: d.code, name: d.name, description: d.description ?? '', discountType: d.discountType, value: String(d.value),
  maxDiscountAmount: d.maxDiscountAmount == null ? '' : String(d.maxDiscountAmount), minOrderAmount: d.minOrderAmount == null ? '' : String(d.minOrderAmount),
  appliesTo: d.appliesTo, usageLimit: String(d.usageLimit), startAt: toLocalInput(d.startAt), expiredAt: toLocalInput(d.expiredAt), isActive: d.isActive,
});
const toPayload = (f: FormState): DiscountPayload => ({
  code: f.code.trim(), name: f.name.trim(), description: f.description.trim(), discountType: f.discountType,
  value: Number(f.value), maxDiscountAmount: f.discountType === 'PERCENT' && f.maxDiscountAmount ? Number(f.maxDiscountAmount) : null,
  minOrderAmount: f.minOrderAmount ? Number(f.minOrderAmount) : null, appliesTo: f.appliesTo as DiscountPayload['appliesTo'],
  usageLimit: Number(f.usageLimit), startAt: hcmInputToIso(f.startAt),
  expiredAt: hcmInputToIso(f.expiredAt), isActive: f.isActive,
});
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const badgeVariant = (status: string) => status === 'ACTIVE' ? 'success' : status === 'UPCOMING' ? 'info' : status === 'INACTIVE' ? 'default' : 'warning';

export function DiscountsPage() {
  const toast = useToast();
  const [page, setPage] = useState<Page<Discount>>(EMPTY_PAGE);
  const [pageIndex, setPageIndex] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [validityFilter, setValidityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Discount | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignments, setAssignments] = useState<Page<DiscountAssignment> | null>(null);
  const [assignmentPage, setAssignmentPage] = useState(0);
  const [assignmentKeyword, setAssignmentKeyword] = useState('');
  const [assignmentUsed, setAssignmentUsed] = useState('');
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState<Discount | null>(null);
  const [working, setWorking] = useState(false);
  const [affected, setAffected] = useState<{ title: string; status: string; contestId: number }[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await adminDiscountService.list({ keyword: keyword.trim(), discountType: typeFilter, isActive: activeFilter, validity: validityFilter, page: pageIndex - 1, size: PAGE_SIZE }));
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not load discounts.')); }
    finally { setLoading(false); }
  }, [activeFilter, keyword, pageIndex, toast, typeFilter, validityFilter]);
  useEffect(() => { void load(); }, [load]);

  const loadAssignments = useCallback(async (discountId: number) => {
    setAssignmentLoading(true);
    try { setAssignments(await adminDiscountService.assignments(discountId, { isUsed: assignmentUsed, keyword: assignmentKeyword.trim(), page: assignmentPage, size: PAGE_SIZE })); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load assigned users.')); }
    finally { setAssignmentLoading(false); }
  }, [assignmentKeyword, assignmentPage, assignmentUsed, toast]);
  useEffect(() => { if (detail) void loadAssignments(detail.discountId); }, [detail, loadAssignments]);

  const openCreate = () => { setEditing(null); setForm(blankForm()); setFormOpen(true); };
  const openEdit = async (discount: Discount) => {
    try { const full = await adminDiscountService.get(discount.discountId); setEditing(full); setForm(formFromDiscount(full)); setFormOpen(true); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load discount details.')); }
  };
  const openDetail = async (discount: Discount) => {
    setDetailLoading(true); setAssignments(null); setAssignmentPage(0); setAssignmentKeyword(''); setAssignmentUsed('');
    try { setDetail(await adminDiscountService.get(discount.discountId)); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load discount details.')); }
    finally { setDetailLoading(false); }
  };
  const updateForm = (key: keyof FormState, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));
  const lockedFields = Boolean(editing && ((editing.stats?.assignedCount ?? 0) > 0 || (editing.stats?.usedCount ?? editing.usedCount) > 0));
  const minimumUsageLimit = editing ? (editing.stats?.usedCount ?? editing.usedCount) + (editing.stats?.unusedAssignedCount ?? 0) : 1;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = toPayload(form);
    if (!payload.code || payload.code.length < 4 || payload.code.length > 30 || !/^[A-Za-z0-9_-]+$/.test(payload.code)) { toast.error('Code must be 4–30 characters using letters, numbers, _ or -.'); return; }
    if (!payload.name) { toast.error('Name is required.'); return; }
    if (payload.discountType === 'PERCENT' ? payload.value < 1 || payload.value > 100 : payload.value <= 0) { toast.error(payload.discountType === 'PERCENT' ? 'Percent value must be from 1 to 100.' : 'Discount amount must be greater than zero.'); return; }
    if (payload.usageLimit < minimumUsageLimit) { toast.error(`Usage limit cannot be lower than ${minimumUsageLimit} used or assigned vouchers.`); return; }
    if (payload.startAt && payload.expiredAt && new Date(payload.expiredAt) <= new Date(payload.startAt)) { toast.error('Expiry must be after the start date.'); return; }
    setSaving(true);
    try {
      if (editing) await adminDiscountService.update(editing.discountId, payload); else await adminDiscountService.create(payload);
      toast.success(editing ? 'Discount updated.' : 'Discount created.'); setFormOpen(false); await load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not save discount.')); }
    finally { setSaving(false); }
  };
  const confirmStatus = async () => {
    if (!changingStatus) return;
    setWorking(true);
    try {
      const result = await adminDiscountService.setStatus(changingStatus.discountId, !changingStatus.isActive);
      setChangingStatus(null); setAffected(result.affectedContests ?? []); await load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not change discount status.')); }
    finally { setWorking(false); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setWorking(true);
    try { await adminDiscountService.remove(deleting.discountId); toast.success('Discount deleted.'); setDeleting(null); await load(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not delete discount.')); }
    finally { setWorking(false); }
  };

  const rows = page.content.map(discount => ({ ...discount, id: discount.discountId }));
  const columns: TableColumn[] = [
    { key: 'code', label: 'Code / name', width: '24%', render: row => <div><p className="font-semibold text-content">{String(row.code)}</p><p className="text-xs text-content-soft">{String(row.name)}</p></div> },
    { key: 'value', label: 'Discount', render: row => { const d = row as unknown as Discount; return <span className="font-medium text-content-secondary">{d.discountType === 'PERCENT' ? `${d.value}%` : formatVnd(d.value)}</span>; } },
    { key: 'appliesTo', label: 'Applies to', render: row => <Badge variant="info">{String(row.appliesTo)}</Badge> },
    { key: 'usageLimit', label: 'Usage', render: row => { const d = row as unknown as Discount; return <div className="whitespace-nowrap tabular-nums"><span className="font-medium text-content-secondary">{d.usedCount.toLocaleString()} / {d.usageLimit.toLocaleString()}</span><p className="mt-1 text-xs text-content-soft">{d.remaining.toLocaleString()} remaining</p></div>; } },
    { key: 'validity', label: 'Validity', render: row => <Badge variant={badgeVariant(String(row.validity))}>{validityLabels[String(row.validity)] ?? String(row.validity)}</Badge> },
    { key: 'isActive', label: 'Status', render: row => { const d = row as unknown as Discount; return <div onClick={event => event.stopPropagation()}><Switch checked={d.isActive} onChange={() => setChangingStatus(d)} size="sm" label={d.isActive ? 'On' : 'Off'} /></div>; } },
    { key: 'actions', label: '', width: '48px', render: row => {
      const d = row as unknown as Discount;
      return <div onClick={event => event.stopPropagation()}><Dropdown trigger={<button type="button" aria-label={`Actions for ${d.code}`} className="rounded-[6px] p-1.5 hover:bg-accent"><Icon.MoreHorizontal className="h-4 w-4 text-content-soft" /></button>} items={[
        { label: 'Details and assignments', icon: <Icon.Eye className="h-4 w-4" />, onClick: () => void openDetail(d) },
        { label: 'Edit', icon: <Icon.Edit className="h-4 w-4" />, onClick: () => void openEdit(d) },
        { label: 'Delete', icon: <Icon.Trash className="h-4 w-4" />, danger: true, onClick: () => setDeleting(d) },
      ]} /></div>;
    } },
  ];
  const filtersActive = keyword !== '' || typeFilter !== '' || activeFilter !== '' || validityFilter !== '';
  const resetFilters = () => { setKeyword(''); setTypeFilter(''); setActiveFilter(''); setValidityFilter(''); setPageIndex(1); };

  return <div className="space-y-5 py-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-content">Discounts</h1><p className="mt-1 text-sm text-content-soft">Create and manage discount codes, eligibility, and assigned vouchers.</p></div>
      <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={openCreate}>New discount</Button>
    </header>

    <section className="card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Input aria-label="Search discounts" placeholder="Search code or name" icon={<Icon.Search className="h-4 w-4" />} value={keyword} onChange={e => { setKeyword(e.target.value); setPageIndex(1); }} />
        <Select aria-label="Discount type" value={typeFilter} onChange={v => { setTypeFilter(v); setPageIndex(1); }} options={[{ label: 'All types', value: '' }, { label: 'Percent', value: 'PERCENT' }, { label: 'Fixed amount', value: 'FIXED_AMOUNT' }]} />
        <Select aria-label="Active status" value={activeFilter} onChange={v => { setActiveFilter(v); setPageIndex(1); }} options={[{ label: 'Any status', value: '' }, { label: 'Active', value: 'true' }, { label: 'Inactive', value: 'false' }]} />
        <Select aria-label="Validity" value={validityFilter} onChange={v => { setValidityFilter(v); setPageIndex(1); }} options={[{ label: 'Any validity', value: '' }, ...Object.entries(validityLabels).map(([value, label]) => ({ value, label }))]} />
        {filtersActive ? <div className="flex justify-end"><button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"><Icon.X className="h-3.5 w-3.5" /> Clear filters</button></div> : <span />}
      </div>
    </section>

    <div className={`card overflow-hidden transition-opacity ${loading && page.content.length ? 'opacity-60' : ''}`} aria-busy={loading}>
      <Table columns={columns} data={rows as unknown as Record<string, unknown>[]} perPage={PAGE_SIZE} unit="discounts"
        serverPagination={{ page: pageIndex, total: page.totalElements, onChange: setPageIndex }}
        onRowClick={row => void openDetail(row as unknown as Discount)}
        emptyState={loading ? 'Loading discounts…' : filtersActive ? 'No discounts match your filters.' : 'No discounts yet. Click “New discount” to add one.'}
      />
    </div>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.code}` : 'Create discount'} size="xl" footer={<><Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button><Button loading={saving} disabled={saving} onClick={() => document.getElementById('discount-form-submit')?.click()}>{editing ? 'Save changes' : 'Create discount'}</Button></>}>
      <form id="discount-form" onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Code" required minLength={4} maxLength={30} disabled={lockedFields} value={form.code} onChange={e => updateForm('code', e.target.value)} hint={lockedFields ? 'Locked because this discount has been assigned.' : '4–30 letters, numbers, underscores, or hyphens.'} />
          <Input label="Name" required maxLength={255} value={form.name} onChange={e => updateForm('name', e.target.value)} />
          <Select label="Discount type" disabled={lockedFields} value={form.discountType} onChange={v => { updateForm('discountType', v); if (v === 'FIXED_AMOUNT') updateForm('maxDiscountAmount', ''); }} options={[{ label: 'Percent', value: 'PERCENT' }, { label: 'Fixed amount', value: 'FIXED_AMOUNT' }]} />
          <Input label={form.discountType === 'PERCENT' ? 'Value (%)' : 'Value (VND)'} type="number" min={form.discountType === 'PERCENT' ? 1 : 0.01} max={form.discountType === 'PERCENT' ? 100 : undefined} required disabled={lockedFields} value={form.value} onChange={e => updateForm('value', e.target.value)} />
          {form.discountType === 'PERCENT' && <Input label="Maximum discount (VND)" type="number" min={1} value={form.maxDiscountAmount} onChange={e => updateForm('maxDiscountAmount', e.target.value)} />}
          <Input label="Minimum order (VND)" type="number" min={0} value={form.minOrderAmount} onChange={e => updateForm('minOrderAmount', e.target.value)} />
          <Select label="Applies to" disabled={lockedFields} value={form.appliesTo} onChange={v => updateForm('appliesTo', v)} options={[{ label: 'All', value: 'ALL' }, { label: 'Courses', value: 'COURSE' }, { label: 'Subscriptions', value: 'SUBSCRIPTION' }]} />
          <Input label="Total usage limit" type="number" min={minimumUsageLimit} required value={form.usageLimit} onChange={e => updateForm('usageLimit', e.target.value)} hint={editing?.stats?.assignedCount ? `Must be at least ${minimumUsageLimit} for used and assigned vouchers.` : undefined} />
          <Input label="Starts at (Ho Chi Minh City time)" type="datetime-local" value={form.startAt} onChange={e => updateForm('startAt', e.target.value)} />
          <Input label="Expires at (Ho Chi Minh City time)" type="datetime-local" value={form.expiredAt} onChange={e => updateForm('expiredAt', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-content-secondary"><input type="checkbox" checked={form.isActive} onChange={e => updateForm('isActive', e.target.checked)} /> Active</label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Description<textarea className="min-h-20 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" maxLength={2000} value={form.description} onChange={e => updateForm('description', e.target.value)} /></label>
        <button id="discount-form-submit" className="hidden" type="submit" />
      </form>
    </Modal>

    <Modal open={detailLoading || !!detail} onClose={() => setDetail(null)} title={detail ? `${detail.code} · ${detail.name}` : 'Discount details'} size="2xl">
      {detailLoading || !detail ? <div className="flex justify-center py-12"><Spinner /></div> : <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Discount" value={detail.discountType === 'PERCENT' ? `${detail.value}%` : formatVnd(detail.value)} />
          <Info label="Applies to" value={detail.appliesTo} />
          <Info label="Validity" value={validityLabels[detail.validity] ?? detail.validity} />
          <Info label="Status" value={detail.isActive ? 'Active' : 'Inactive'} />
          <Info label="Usage" value={`${detail.usedCount} / ${detail.usageLimit}`} />
          <Info label="Assigned" value={String(detail.stats?.assignedCount ?? '—')} />
          <Info label="Unused assigned" value={String(detail.stats?.unusedAssignedCount ?? '—')} />
          <Info label="Remaining capacity" value={String(detail.stats?.remaining ?? detail.remaining)} />
          <Info label="Starts" value={dateLabel(detail.startAt)} />
          <Info label="Expires" value={dateLabel(detail.expiredAt)} />
          <Info label="Created" value={dateLabel(detail.createdAt)} />
          <Info label="Updated" value={dateLabel(detail.updatedAt)} />
        </div>
        {detail.description && <p className="text-sm text-content-secondary">{detail.description}</p>}
        <div><h3 className="mb-2 font-semibold text-content">Contests using this discount</h3>{detail.usedInContests?.length ? <ul className="space-y-2">{detail.usedInContests.map(contest => <li key={`${contest.contestId}-${contest.rankPosition}`} className="flex justify-between rounded-lg border border-line-soft px-3 py-2 text-sm"><span>{contest.title} · rank {contest.rankPosition}</span><Badge variant="info">{contest.status}</Badge></li>)}</ul> : <p className="text-sm text-content-soft">No contests use this discount.</p>}</div>
        <div className="space-y-3 border-t border-line-soft pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-content">Assigned users</h3><div className="flex flex-wrap gap-2"><Input aria-label="Search assigned users" placeholder="Name or email" value={assignmentKeyword} onChange={e => { setAssignmentKeyword(e.target.value); setAssignmentPage(0); }} /><Select aria-label="Assignment use status" value={assignmentUsed} onChange={v => { setAssignmentUsed(v); setAssignmentPage(0); }} options={[{ label: 'Used or unused', value: '' }, { label: 'Unused', value: 'false' }, { label: 'Used', value: 'true' }]} /></div></div>
          {assignmentLoading ? <div className="flex justify-center py-6"><Spinner size="sm" /></div> : assignments?.content.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-line-soft text-xs uppercase text-content-soft"><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Assigned</th><th className="py-2 pr-3">Used</th><th className="py-2">Source</th></tr></thead><tbody>{assignments.content.map(a => <tr key={a.userDiscountId} className="border-b border-line-faint"><td className="py-2 pr-3"><p className="font-medium text-content">{a.user.fullName}</p><p className="text-xs text-content-soft">{a.user.email}</p></td><td className="py-2 pr-3"><Badge variant={a.isUsed ? 'default' : 'success'}>{a.isUsed ? 'Used' : 'Unused'}</Badge></td><td className="py-2 pr-3 whitespace-nowrap">{dateLabel(a.assignedAt)}</td><td className="py-2 pr-3 whitespace-nowrap">{dateLabel(a.usedAt)}</td><td className="py-2">{a.source?.title ?? a.source?.type ?? '—'}</td></tr>)}</tbody></table><div className="flex justify-end gap-2 pt-3"><Button size="sm" variant="outline" disabled={!assignments || assignments.first || assignmentLoading} onClick={() => setAssignmentPage(v => Math.max(0, v - 1))}>Previous</Button><span className="self-center text-xs text-content-soft">{assignments.totalElements} users · {assignments.totalPages ? assignmentPage + 1 : 0}/{assignments.totalPages}</span><Button size="sm" variant="outline" disabled={!assignments || assignments.last || assignmentLoading} onClick={() => setAssignmentPage(v => v + 1)}>Next</Button></div></div> : <p className="text-sm text-content-soft">No users have been assigned this discount.</p>}
        </div>
      </div>}
    </Modal>

    <Modal open={!!changingStatus} onClose={() => setChangingStatus(null)} title={changingStatus?.isActive ? 'Deactivate discount?' : 'Activate discount?'} footer={<><Button variant="outline" disabled={working} onClick={() => setChangingStatus(null)}>Cancel</Button><Button variant={changingStatus?.isActive ? 'danger' : 'primary'} loading={working} disabled={working} onClick={() => void confirmStatus()}>{changingStatus?.isActive ? 'Deactivate' : 'Activate'}</Button></>}>
      <p className="text-sm text-content-secondary">{changingStatus?.isActive ? `Deactivating ${changingStatus?.code} will prevent redemption and block reward payments in contests that use it.` : `Activate ${changingStatus?.code} for future use?`}</p>
    </Modal>
    <Modal open={affected !== null} onClose={() => setAffected(null)} title="Discount status updated">
      {affected?.length ? <div className="space-y-3"><p className="text-sm text-content-secondary">This discount is attached to contests that may be affected:</p><ul className="space-y-2">{affected.map(c => <li key={c.contestId} className="flex items-center justify-between rounded-lg border border-line-soft px-3 py-2 text-sm"><span>{c.title}</span><Badge variant="warning">{c.status}</Badge></li>)}</ul></div> : <p className="text-sm text-content-secondary">No active contests are affected.</p>}
    </Modal>
    <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete discount?" footer={<><Button variant="outline" disabled={working} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={working} disabled={working} onClick={() => void confirmDelete()}>Delete</Button></>}>
      <p className="text-sm text-content-secondary">Delete <strong>{deleting?.code}</strong>? Discounts with active contest usage or assigned vouchers cannot be deleted; the API will explain the conflict.</p>
    </Modal>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-content-soft">{label}</p><p className="mt-1 break-words text-sm font-medium text-content">{value}</p></div>; }
