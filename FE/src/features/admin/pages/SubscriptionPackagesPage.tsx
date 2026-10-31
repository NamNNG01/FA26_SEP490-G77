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
import type { Page } from '@/services/adminDiscount.service';
import {
  PLAN_FEATURES_MAX,
  PLAN_FEATURE_TEXT_MAX,
  PLAN_NAME_MAX,
  adminSubscriptionPlanService,
  type AdminSubscriptionPlan,
  type AdminSubscriptionPlanDetail,
  type SubscriptionPlanPayload,
} from '@/services/adminSubscriptionPlan.service';
import { formatInteger, formatVnd } from '../utils/dashboardFormat';

const PAGE_SIZE = 10;
const EMPTY_PAGE: Page<AdminSubscriptionPlan> = { content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true };

type FormState = {
  planName: string; description: string; price: string; durationDays: string;
  aiTokenLimit: string; features: string[]; isActive: boolean; sortOrder: string;
};
const blankForm = (sortOrder = 0): FormState => ({ planName: '', description: '', price: '0', durationDays: '30', aiTokenLimit: '0', features: [''], isActive: true, sortOrder: String(sortOrder) });
const formFromPlan = (p: AdminSubscriptionPlan): FormState => ({
  planName: p.planName, description: p.description ?? '', price: String(p.price), durationDays: String(p.durationDays),
  aiTokenLimit: String(p.aiTokenLimit), features: p.features.length ? [...p.features] : [''], isActive: p.isActive, sortOrder: String(p.sortOrder),
});
const toPayload = (f: FormState): SubscriptionPlanPayload => ({
  planName: f.planName.trim(), description: f.description.trim(), price: Number(f.price), durationDays: Number(f.durationDays),
  aiTokenLimit: Number(f.aiTokenLimit), features: f.features.map(x => x.trim()).filter(Boolean), isActive: f.isActive, sortOrder: Number(f.sortOrder),
});
const priceLabel = (price: number) => (price === 0 ? 'Free' : formatVnd(price));
const dateLabel = (value?: string | null) => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');

/** `data.code` of a BE error (PLAN_NAME_EXISTS, PLAN_HAS_ACTIVE_SUBSCRIBERS, …). */
function errorCode(err: unknown): string | null {
  const body = (err as { response?: { data?: { code?: string; data?: { code?: string } | null } } } | null)?.response?.data;
  return body?.data?.code ?? body?.code ?? null;
}

export function SubscriptionPackagesPage() {
  const toast = useToast();
  const [page, setPage] = useState<Page<AdminSubscriptionPlan>>(EMPTY_PAGE);
  const [pageIndex, setPageIndex] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminSubscriptionPlan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<AdminSubscriptionPlanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState<AdminSubscriptionPlan | null>(null);
  const [deleting, setDeleting] = useState<AdminSubscriptionPlan | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [working, setWorking] = useState(false);
  const [ordering, setOrdering] = useState<AdminSubscriptionPlan[] | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPage(await adminSubscriptionPlanService.list({ keyword: keyword.trim(), isActive: activeFilter, page: pageIndex - 1, size: PAGE_SIZE }));
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not load subscription plans.')); }
    finally { setLoading(false); }
  }, [activeFilter, keyword, pageIndex, toast]);
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(blankForm(page.totalElements)); setNameError(null); setFormOpen(true); };
  const openEdit = async (plan: AdminSubscriptionPlan) => {
    try { const full = await adminSubscriptionPlanService.get(plan.planId); setEditing(full); setForm(formFromPlan(full)); setNameError(null); setFormOpen(true); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load plan details.')); }
  };
  const openDetail = async (plan: AdminSubscriptionPlan) => {
    setDetailLoading(true);
    try { setDetail(await adminSubscriptionPlanService.get(plan.planId)); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load plan details.')); }
    finally { setDetailLoading(false); }
  };
  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const setFeature = (index: number, value: string) => updateForm('features', form.features.map((f, i) => (i === index ? value : f)));
  const addFeature = () => { if (form.features.length < PLAN_FEATURES_MAX) updateForm('features', [...form.features, '']); };
  const removeFeature = (index: number) => updateForm('features', form.features.length === 1 ? [''] : form.features.filter((_, i) => i !== index));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = toPayload(form);
    if (!payload.planName) { setNameError('Plan name is required.'); return; }
    if (payload.planName.length > PLAN_NAME_MAX) { setNameError(`Plan name must be ${PLAN_NAME_MAX} characters or fewer.`); return; }
    if (!Number.isFinite(payload.price) || payload.price < 0) { toast.error('Price must be 0 or more (0 = free plan).'); return; }
    if (!Number.isInteger(payload.durationDays) || payload.durationDays < 1) { toast.error('Duration must be at least 1 day.'); return; }
    if (!Number.isInteger(payload.aiTokenLimit) || payload.aiTokenLimit < 0) { toast.error('AI token limit must be 0 or more.'); return; }
    if (payload.features.length > PLAN_FEATURES_MAX) { toast.error(`A plan can list at most ${PLAN_FEATURES_MAX} features.`); return; }
    if (payload.features.some(f => f.length > PLAN_FEATURE_TEXT_MAX)) { toast.error(`Each feature must be ${PLAN_FEATURE_TEXT_MAX} characters or fewer.`); return; }
    setSaving(true);
    try {
      if (editing) await adminSubscriptionPlanService.update(editing.planId, payload); else await adminSubscriptionPlanService.create(payload);
      toast.success(editing ? 'Plan updated.' : 'Plan created.'); setFormOpen(false); await load();
    } catch (error) {
      if (errorCode(error) === 'PLAN_NAME_EXISTS') setNameError('Another plan already uses this name.');
      else toast.error(getApiErrorMessage(error, 'Could not save the plan.'));
    } finally { setSaving(false); }
  };
  const confirmStatus = async () => {
    if (!changingStatus) return;
    setWorking(true);
    try {
      await adminSubscriptionPlanService.setStatus(changingStatus.planId, !changingStatus.isActive);
      toast.success(changingStatus.isActive ? 'Plan hidden from checkout.' : 'Plan is on sale again.');
      setChangingStatus(null); await load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Could not change the plan status.')); }
    finally { setWorking(false); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setWorking(true);
    try { await adminSubscriptionPlanService.remove(deleting.planId); toast.success('Plan deleted.'); setDeleting(null); await load(); }
    catch (error) {
      if (errorCode(error) === 'PLAN_HAS_ACTIVE_SUBSCRIBERS') setDeleteBlocked(true);
      else toast.error(getApiErrorMessage(error, 'Could not delete the plan.'));
    } finally { setWorking(false); }
  };
  const openReorder = async () => {
    setOrderLoading(true);
    try { setOrdering(await adminSubscriptionPlanService.listAll()); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load every plan.')); }
    finally { setOrderLoading(false); }
  };
  const move = (index: number, delta: number) => setOrdering(list => {
    if (!list) return list;
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const saveOrder = async () => {
    if (!ordering) return;
    setWorking(true);
    try { await adminSubscriptionPlanService.reorder(ordering.map(p => p.planId)); toast.success('Plan order saved.'); setOrdering(null); await load(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not save the order.')); }
    finally { setWorking(false); }
  };

  const rows = page.content.map(plan => ({ ...plan, id: plan.planId }));
  const columns: TableColumn[] = [
    { key: 'sortOrder', label: '#', width: '48px', render: row => <span className="tabular-nums text-content-soft">{Number(row.sortOrder) + 1}</span> },
    { key: 'planName', label: 'Plan', width: '28%', render: row => { const p = row as unknown as AdminSubscriptionPlan; return <div className="min-w-0"><p className="font-semibold text-content">{p.planName}</p>{p.description && <p className="truncate text-xs text-content-soft">{p.description}</p>}</div>; } },
    { key: 'price', label: 'Price', render: row => { const p = row as unknown as AdminSubscriptionPlan; return <div className="whitespace-nowrap"><span className="font-medium text-content-secondary">{priceLabel(p.price)}</span><p className="text-xs text-content-soft">{p.durationDays} days</p></div>; } },
    { key: 'aiTokenLimit', label: 'AI tokens / period', render: row => <span className="tabular-nums text-content-secondary">{formatInteger(Number(row.aiTokenLimit))}</span> },
    { key: 'features', label: 'Features', render: row => <span className="text-content-secondary">{(row.features as string[]).length}</span> },
    { key: 'activeSubscribers', label: 'Active subscribers', render: row => <span className="tabular-nums font-medium text-content-secondary">{formatInteger(Number(row.activeSubscribers))}</span> },
    { key: 'isActive', label: 'On sale', render: row => { const p = row as unknown as AdminSubscriptionPlan; return <div onClick={event => event.stopPropagation()}><Switch checked={p.isActive} onChange={() => setChangingStatus(p)} size="sm" label={p.isActive ? 'On' : 'Off'} /></div>; } },
    { key: 'actions', label: '', width: '48px', render: row => {
      const p = row as unknown as AdminSubscriptionPlan;
      return <div onClick={event => event.stopPropagation()}><Dropdown trigger={<button type="button" aria-label={`Actions for ${p.planName}`} className="rounded-[6px] p-1.5 hover:bg-accent"><Icon.MoreHorizontal className="h-4 w-4 text-content-soft" /></button>} items={[
        { label: 'Details', icon: <Icon.Eye className="h-4 w-4" />, onClick: () => void openDetail(p) },
        { label: 'Edit', icon: <Icon.Edit className="h-4 w-4" />, onClick: () => void openEdit(p) },
        { label: 'Delete', icon: <Icon.Trash className="h-4 w-4" />, danger: true, onClick: () => { setDeleteBlocked(false); setDeleting(p); } },
      ]} /></div>;
    } },
  ];
  const filtersActive = keyword !== '' || activeFilter !== '';
  const resetFilters = () => { setKeyword(''); setActiveFilter(''); setPageIndex(1); };

  return <div className="space-y-5 py-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-content">Subscription Packages</h1><p className="mt-1 text-sm text-content-soft">Configure plan prices, duration, AI token limits and the order students see them in.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" icon={<Icon.SortAsc className="h-4 w-4" />} loading={orderLoading} disabled={orderLoading} onClick={() => void openReorder()}>Reorder</Button>
        <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={openCreate}>New plan</Button>
      </div>
    </header>

    <section className="card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input aria-label="Search plans" placeholder="Search plan name" icon={<Icon.Search className="h-4 w-4" />} value={keyword} onChange={e => { setKeyword(e.target.value); setPageIndex(1); }} />
        <Select aria-label="Sale status" value={activeFilter} onChange={v => { setActiveFilter(v); setPageIndex(1); }} options={[{ label: 'Any status', value: '' }, { label: 'On sale', value: 'true' }, { label: 'Hidden', value: 'false' }]} />
        {filtersActive ? <div className="flex items-center justify-end"><button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"><Icon.X className="h-3.5 w-3.5" /> Clear filters</button></div> : <span />}
      </div>
    </section>

    <div className={`card overflow-hidden transition-opacity ${loading && page.content.length ? 'opacity-60' : ''}`} aria-busy={loading}>
      <Table columns={columns} data={rows as unknown as Record<string, unknown>[]} perPage={PAGE_SIZE} unit="plans"
        serverPagination={{ page: pageIndex, total: page.totalElements, onChange: setPageIndex }}
        onRowClick={row => void openDetail(row as unknown as AdminSubscriptionPlan)}
        emptyState={loading ? 'Loading plans…' : filtersActive ? 'No plans match your filters.' : 'No plans yet. Click “New plan” to add one.'}
      />
    </div>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.planName}` : 'Create plan'} size="xl" footer={<><Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button><Button loading={saving} disabled={saving} onClick={() => document.getElementById('plan-form-submit')?.click()}>{editing ? 'Save changes' : 'Create plan'}</Button></>}>
      <form onSubmit={save} className="space-y-4">
        {editing && editing.activeSubscribers > 0 && <p className="rounded-[10px] bg-warning-light/40 px-3 py-2 text-xs text-content-secondary">{formatInteger(editing.activeSubscribers)} students are on this plan. A new price only applies to future purchases; a new AI token limit applies to them right away.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Plan name" required maxLength={PLAN_NAME_MAX} value={form.planName} error={nameError ?? undefined} onChange={e => { updateForm('planName', e.target.value); setNameError(null); }} />
          <Input label="Price (VND)" type="number" min={0} step={1000} required value={form.price} onChange={e => updateForm('price', e.target.value)} hint="0 = free plan" />
          <Input label="Duration (days)" type="number" min={1} required value={form.durationDays} onChange={e => updateForm('durationDays', e.target.value)} />
          <Input label="AI token limit" type="number" min={0} step={1000} required value={form.aiTokenLimit} onChange={e => updateForm('aiTokenLimit', e.target.value)} hint="Total tokens for the whole plan period." />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Description<textarea className="min-h-20 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" maxLength={1000} value={form.description} onChange={e => updateForm('description', e.target.value)} /></label>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-content-secondary">Features <span className="font-normal text-content-subtle">({form.features.filter(f => f.trim()).length}/{PLAN_FEATURES_MAX})</span></p>
            <Button type="button" size="sm" variant="outline" icon={<Icon.Plus className="h-3.5 w-3.5" />} disabled={form.features.length >= PLAN_FEATURES_MAX} onClick={addFeature}>Add feature</Button></div>
          {form.features.map((feature, index) => <div key={index} className="flex items-center gap-2">
            <Input aria-label={`Feature ${index + 1}`} className="flex-1" maxLength={PLAN_FEATURE_TEXT_MAX} placeholder="e.g. Unlimited decks" value={feature} onChange={e => setFeature(index, e.target.value)} />
            <button type="button" aria-label={`Remove feature ${index + 1}`} onClick={() => removeFeature(index)} className="p-1.5 text-content-subtle hover:text-danger"><Icon.Trash className="h-4 w-4" /></button>
          </div>)}
        </div>
        <label className="flex items-center gap-2 text-sm text-content-secondary"><input type="checkbox" checked={form.isActive} onChange={e => updateForm('isActive', e.target.checked)} /> On sale (shown on the purchase page)</label>
        <button id="plan-form-submit" className="hidden" type="submit" />
      </form>
    </Modal>

    <Modal open={detailLoading || !!detail} onClose={() => setDetail(null)} title={detail ? detail.planName : 'Plan details'} size="xl">
      {detailLoading || !detail ? <div className="flex justify-center py-12"><Spinner /></div> : <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Price" value={priceLabel(detail.price)} />
          <Info label="Duration" value={`${detail.durationDays} days`} />
          <Info label="AI tokens / period" value={formatInteger(detail.aiTokenLimit)} />
          <Info label="Status" value={detail.isActive ? 'On sale' : 'Hidden'} />
          <Info label="Active subscribers" value={formatInteger(detail.activeSubscribers)} />
          <Info label="Total subscribers" value={formatInteger(detail.totalSubscribers)} />
          <Info label="Created" value={dateLabel(detail.createdAt)} />
          <Info label="Updated" value={dateLabel(detail.updatedAt)} />
        </div>
        {detail.description && <p className="text-sm text-content-secondary">{detail.description}</p>}
        <div><h3 className="mb-2 font-semibold text-content">Features</h3>{detail.features.length ? <ul className="space-y-1.5">{detail.features.map(f => <li key={f} className="flex items-start gap-1.5 text-sm text-content-secondary"><Icon.Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />{f}</li>)}</ul> : <p className="text-sm text-content-soft">No features listed.</p>}</div>
      </div>}
    </Modal>

    <Modal open={!!changingStatus} onClose={() => setChangingStatus(null)} title={changingStatus?.isActive ? 'Hide this plan?' : 'Put this plan on sale?'} footer={<><Button variant="outline" disabled={working} onClick={() => setChangingStatus(null)}>Cancel</Button><Button variant={changingStatus?.isActive ? 'danger' : 'primary'} loading={working} disabled={working} onClick={() => void confirmStatus()}>{changingStatus?.isActive ? 'Hide plan' : 'Put on sale'}</Button></>}>
      <p className="text-sm text-content-secondary">{changingStatus?.isActive ? <>Students can no longer buy <strong>{changingStatus?.planName}</strong>. Current subscribers keep it until it expires.</> : <>Show <strong>{changingStatus?.planName}</strong> on the purchase page again?</>}</p>
    </Modal>

    <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete plan?" footer={deleteBlocked
      ? <><Button variant="outline" onClick={() => setDeleting(null)}>Close</Button>{deleting?.isActive && <Button onClick={() => { const p = deleting; setDeleting(null); setChangingStatus(p); }}>Hide plan instead</Button>}</>
      : <><Button variant="outline" disabled={working} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" loading={working} disabled={working} onClick={() => void confirmDelete()}>Delete</Button></>}>
      {deleteBlocked
        ? <p className="text-sm text-content-secondary"><strong>{deleting?.planName}</strong> still has active subscribers, so it can’t be deleted. Hide it from checkout instead — current subscribers keep it until it expires.</p>
        : <p className="text-sm text-content-secondary">Delete <strong>{deleting?.planName}</strong>? Plans with active subscribers can’t be deleted.</p>}
    </Modal>

    <Modal open={ordering !== null} onClose={() => setOrdering(null)} title="Reorder plans" size="lg" footer={<><Button variant="outline" disabled={working} onClick={() => setOrdering(null)}>Cancel</Button><Button loading={working} disabled={working || !ordering?.length} onClick={() => void saveOrder()}>Save order</Button></>}>
      <p className="mb-3 text-sm text-content-soft">Students see plans in this order.</p>
      {ordering?.length ? <ol className="space-y-2">{ordering.map((p, index) => <li key={p.planId} className="flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2">
        <span className="w-6 text-sm tabular-nums text-content-soft">{index + 1}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-content">{p.planName}</p><p className="text-xs text-content-soft">{priceLabel(p.price)} · {p.durationDays} days</p></div>
        {!p.isActive && <Badge variant="default">Hidden</Badge>}
        <button type="button" aria-label={`Move ${p.planName} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-[6px] p-1.5 text-content-soft hover:bg-accent disabled:opacity-30"><Icon.ArrowUp className="h-4 w-4" /></button>
        <button type="button" aria-label={`Move ${p.planName} down`} disabled={index === ordering.length - 1} onClick={() => move(index, 1)} className="rounded-[6px] p-1.5 text-content-soft hover:bg-accent disabled:opacity-30"><Icon.ArrowDown className="h-4 w-4" /></button>
      </li>)}</ol> : <p className="text-sm text-content-soft">No plans to reorder.</p>}
    </Modal>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-content-soft">{label}</p><p className="mt-1 break-words text-sm font-medium text-content">{value}</p></div>; }
