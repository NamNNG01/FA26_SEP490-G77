import React, { useCallback, useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { focusFirstInvalidAfter } from '@/utils/focusFirstInvalid';
import { Alert } from '@/components/ui/Alert';
import type { Page } from '@/services/adminDiscount.service';
import {
  PLAN_DESCRIPTION_MAX,
  PLAN_NAME_MAX,
  PLAN_PRICE_MAX,
  adminSubscriptionPlanService,
  type AdminSubscriptionPlan,
  type AdminSubscriptionPlanDetail,
  type SubscriptionPlanPayload,
} from '@/services/adminSubscriptionPlan.service';
import { MoneyInput, moneyToDigits } from '@/components/ui/MoneyInput';
import { planDescriptionLines, planLines, planLinesToDescription } from '@/utils/planDescription';
import { formatInteger, formatVnd } from '../utils/dashboardFormat';

const PAGE_SIZE = 10;
/** subscription_plans.ai_token_limit is an INTEGER. */
const AI_TOKEN_LIMIT_MAX = 2_147_483_647;
const EMPTY_PAGE: Page<AdminSubscriptionPlan> = { content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true };

type PlanFieldErrors = Partial<Record<'planName' | 'price' | 'durationDays' | 'aiTokenLimit' | 'description', string>>;
type FormState = {
  planName: string; description: string; price: string; durationDays: string;
  aiTokenLimit: string; isActive: boolean; sortOrder: string;
};
const blankForm = (sortOrder = 0): FormState => ({ planName: '', description: '', price: '0', durationDays: '30', aiTokenLimit: '', isActive: true, sortOrder: String(sortOrder) });
// A plan saved with the old feature list gets those features folded into its description, so
// saving it (which clears `features`) keeps every line students saw.
const formFromPlan = (p: AdminSubscriptionPlan): FormState => ({
  planName: p.planName, description: p.features.length ? planLinesToDescription(planLines(p)) : p.description ?? '', price: moneyToDigits(p.price), durationDays: String(p.durationDays),
  aiTokenLimit: String(p.aiTokenLimit), isActive: p.isActive, sortOrder: String(p.sortOrder),
});
const toPayload = (f: FormState): SubscriptionPlanPayload => ({
  planName: f.planName.trim(), description: f.description.trim(), price: Number(f.price), durationDays: Number(f.durationDays),
  aiTokenLimit: Number(f.aiTokenLimit), features: [], isActive: f.isActive, sortOrder: Number(f.sortOrder),
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
  /** The plan open in the details/edit modal; null while creating. */
  const [editing, setEditing] = useState<AdminSubscriptionPlanDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [fieldErrors, setFieldErrors] = useState<PlanFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState<AdminSubscriptionPlan | null>(null);
  const [deleting, setDeleting] = useState<AdminSubscriptionPlan | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [working, setWorking] = useState(false);
  const [ordering, setOrdering] = useState<AdminSubscriptionPlan[] | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  /** `'quiet'` = shared auto-refresh: no loader, no error toast. */
  const load = useCallback(async (mode?: 'quiet') => {
    const quiet = mode === 'quiet';
    if (!quiet) setLoading(true);
    try {
      setPage(await adminSubscriptionPlanService.list({ keyword: keyword.trim(), isActive: activeFilter, page: pageIndex - 1, size: PAGE_SIZE }));
    } catch (error) { if (!quiet) toast.error(getApiErrorMessage(error, 'Could not load subscription plans.')); }
    finally { setLoading(false); }
  }, [activeFilter, keyword, pageIndex, toast]);
  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(() => void load('quiet'));

  const openCreate = async () => {
    // sort_order has to be one past the highest existing value. Using the plan count repeats a
    // number that is already taken, so every new plan showed the same "#" until the next reload.
    let nextSortOrder = 0;
    try {
      const all = await adminSubscriptionPlanService.listAll();
      nextSortOrder = all.reduce((max, plan) => Math.max(max, plan.sortOrder), -1) + 1;
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not read the current plan order.'));
      return;
    }
    setEditing(null); setForm(blankForm(nextSortOrder)); setFieldErrors({}); setFormError(null); setFormOpen(true);
  };
  /** Details and editing share one modal: it opens on the plan's editable form. */
  const openEdit = async (plan: AdminSubscriptionPlan) => {
    setEditing(null); setFieldErrors({}); setFormError(null); setEditLoading(true); setFormOpen(true);
    try { const full = await adminSubscriptionPlanService.get(plan.planId); setEditing(full); setForm(formFromPlan(full)); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Could not load plan details.')); setFormOpen(false); }
    finally { setEditLoading(false); }
  };
  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const descriptionLines = planDescriptionLines(form.description);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = toPayload(form);
    const errors: PlanFieldErrors = {};
    if (!payload.planName) errors.planName = 'Plan name is required.';
    else if (payload.planName.length > PLAN_NAME_MAX) errors.planName = `Plan name must be ${PLAN_NAME_MAX} characters or fewer.`;
    if (form.price === '' || !Number.isInteger(payload.price) || payload.price < 0) errors.price = 'Price must be 0 or more (0 = free plan).';
    else if (payload.price > PLAN_PRICE_MAX) errors.price = `Price must not exceed ${formatVnd(Math.floor(PLAN_PRICE_MAX))}.`;
    if (!Number.isInteger(payload.durationDays) || payload.durationDays < 1) errors.durationDays = 'Duration must be at least 1 day.';
    if (!form.aiTokenLimit.trim() || !Number.isInteger(payload.aiTokenLimit) || payload.aiTokenLimit < 1) errors.aiTokenLimit = 'AI token limit must be greater than 0.';
    else if (payload.aiTokenLimit > AI_TOKEN_LIMIT_MAX) errors.aiTokenLimit = `AI token limit must not exceed ${formatInteger(AI_TOKEN_LIMIT_MAX)}.`;
    if (payload.description.length > PLAN_DESCRIPTION_MAX) errors.description = `Description must be ${PLAN_DESCRIPTION_MAX} characters or fewer.`;
    setFormError(null);
    if (Object.keys(errors).length) {
      if (!focusFirstInvalidAfter(() => setFieldErrors(errors))) setFormError(Object.values(errors).join(' '));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      if (editing) await adminSubscriptionPlanService.update(editing.planId, payload); else await adminSubscriptionPlanService.create(payload);
      toast.success(editing ? 'Plan updated.' : 'Plan created.'); setFormOpen(false); await load();
    } catch (error) {
      if (errorCode(error) === 'PLAN_NAME_EXISTS') focusFirstInvalidAfter(() => setFieldErrors({ planName: 'Another plan already uses this name.' }));
      else setFormError(getApiErrorMessage(error, 'Could not save the plan.'));
    } finally { setSaving(false); }
  };
  const clearFieldError = (key: keyof PlanFieldErrors) => setFieldErrors(prev => ({ ...prev, [key]: undefined }));
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
    { key: 'activeSubscribers', label: 'Active subscribers', render: row => <span className="tabular-nums font-medium text-content-secondary">{formatInteger(Number(row.activeSubscribers))}</span> },
    { key: 'isActive', label: 'On sale', render: row => { const p = row as unknown as AdminSubscriptionPlan; return <div onClick={event => event.stopPropagation()}><Switch checked={p.isActive} onChange={() => setChangingStatus(p)} size="sm" label={p.isActive ? 'On' : 'Off'} /></div>; } },
    { key: 'actions', label: '', width: '48px', render: row => {
      const p = row as unknown as AdminSubscriptionPlan;
      return <div onClick={event => event.stopPropagation()}><Dropdown trigger={<button type="button" aria-label={`Actions for ${p.planName}`} className="rounded-[6px] p-1.5 hover:bg-accent"><Icon.MoreHorizontal className="h-4 w-4 text-content-soft" /></button>} items={[
        { label: 'Details', icon: <Icon.Eye className="h-4 w-4" />, onClick: () => void openEdit(p) },
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
        <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => void openCreate()}>New plan</Button>
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
        onRowClick={row => void openEdit(row as unknown as AdminSubscriptionPlan)}
        emptyState={loading ? 'Loading plans…' : filtersActive ? 'No plans match your filters.' : 'No plans yet. Click “New plan” to add one.'}
      />
    </div>

    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editLoading ? 'Plan details' : editing ? editing.planName : 'Create plan'} size="xl" error={formError && <Alert type="error" message={formError} />} footer={editLoading ? undefined : <><Button variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>Cancel</Button><Button loading={saving} disabled={saving} onClick={() => document.getElementById('plan-form-submit')?.click()}>{editing ? 'Save changes' : 'Create plan'}</Button></>}>
      {editLoading ? <div className="flex justify-center py-12"><Spinner /></div> : <form onSubmit={save} className="space-y-4">
        {editing && <div className="grid grid-cols-2 gap-4 rounded-[10px] border border-line-soft bg-surface-hover/40 p-3 sm:grid-cols-4">
          <Info label="Active subscribers" value={formatInteger(editing.activeSubscribers)} />
          <Info label="Total subscribers" value={formatInteger(editing.totalSubscribers)} />
          <Info label="Created" value={dateLabel(editing.createdAt)} />
          <Info label="Updated" value={dateLabel(editing.updatedAt)} />
        </div>}
        {editing && editing.activeSubscribers > 0 && <p className="rounded-[10px] bg-warning-light/40 px-3 py-2 text-xs text-content-secondary">{formatInteger(editing.activeSubscribers)} students are on this plan. A new price only applies to future purchases; a new AI token limit applies to them right away.</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Plan name" required maxLength={PLAN_NAME_MAX} value={form.planName} error={fieldErrors.planName} onChange={e => { updateForm('planName', e.target.value); clearFieldError('planName'); }} />
          <MoneyInput label="Price (VND)" max={Math.floor(PLAN_PRICE_MAX)} required value={form.price} error={fieldErrors.price} onValueChange={v => { updateForm('price', v); clearFieldError('price'); }} hint="0 = free plan" />
          <Input label="Duration (days)" type="number" min={1} required value={form.durationDays} error={fieldErrors.durationDays} onChange={e => { updateForm('durationDays', e.target.value); clearFieldError('durationDays'); }} />
          <Input label="AI token limit" type="number" min={1} step={1} max={AI_TOKEN_LIMIT_MAX} required value={form.aiTokenLimit} error={fieldErrors.aiTokenLimit} onChange={e => { updateForm('aiTokenLimit', e.target.value); clearFieldError('aiTokenLimit'); }} hint="Total tokens for the whole plan period (any number above 0)." />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="plan-description" className="flex items-baseline justify-between gap-2 text-sm font-medium text-content-secondary">Description <span className="text-xs font-normal tabular-nums text-content-subtle">{form.description.length}/{PLAN_DESCRIPTION_MAX}</span></label>
          <textarea id="plan-description" aria-invalid={fieldErrors.description ? true : undefined} aria-describedby="plan-description-hint" className="min-h-28 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" maxLength={PLAN_DESCRIPTION_MAX} placeholder="e.g. 500,000 AI tokens for 30 days. Generate flashcards and quizzes from your materials. Grade essay answers with AI." value={form.description} onChange={e => { updateForm('description', e.target.value); clearFieldError('description'); }} />
          {fieldErrors.description ? <p className="text-xs text-danger">{fieldErrors.description}</p> : <p id="plan-description-hint" className="text-xs text-content-soft">Each sentence ending with “.” is shown as its own line.</p>}
          {descriptionLines.length > 0 && <div className="rounded-[10px] border border-line-soft px-3 py-2.5">
            <p className="mb-1.5 text-xs font-medium text-content-soft">Preview</p>
            <PlanLineList lines={descriptionLines} />
          </div>}
        </div>
        <label className="flex items-center gap-2 text-sm text-content-secondary"><input type="checkbox" checked={form.isActive} onChange={e => updateForm('isActive', e.target.checked)} /> On sale (shown on the purchase page)</label>
        <button id="plan-form-submit" className="hidden" type="submit" />
      </form>}
    </Modal>


    <ConfirmDialog
      open={!!changingStatus}
      onClose={() => setChangingStatus(null)}
      onConfirm={() => void confirmStatus()}
      loading={working}
      tone={changingStatus?.isActive ? 'danger' : 'warning'}
      title={changingStatus?.isActive ? 'Hide this plan?' : 'Put this plan on sale?'}
      description={changingStatus?.isActive ? <>Students can no longer buy <strong>{changingStatus?.planName}</strong>. Current subscribers keep it until it expires.</> : <>Show <strong>{changingStatus?.planName}</strong> on the purchase page again?</>}
      confirmLabel={changingStatus?.isActive ? 'Hide plan' : 'Put on sale'}
    />

    <ConfirmDialog
      open={!!deleting && !deleteBlocked}
      onClose={() => setDeleting(null)}
      onConfirm={() => void confirmDelete()}
      loading={working}
      tone="danger"
      title="Delete plan?"
      description={<>Delete <strong>{deleting?.planName}</strong>? Plans with active subscribers can’t be deleted.</>}
      confirmLabel="Delete"
    />

    <Modal open={!!deleting && deleteBlocked} onClose={() => setDeleting(null)} title="Delete plan?" footer={<><Button variant="outline" onClick={() => setDeleting(null)}>Close</Button>{deleting?.isActive && <Button onClick={() => { const p = deleting; setDeleting(null); setChangingStatus(p); }}>Hide plan instead</Button>}</>}>
      <p className="text-sm text-content-secondary"><strong>{deleting?.planName}</strong> still has active subscribers, so it can’t be deleted. Hide it from checkout instead — current subscribers keep it until it expires.</p>
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

function PlanLineList({ lines }: { lines: string[] }) {
  return <ul className="space-y-1.5">{lines.map((line, i) => <li key={i} className="flex items-start gap-1.5 text-sm text-content-secondary"><Icon.Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />{line}</li>)}</ul>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs text-content-soft">{label}</p><p className="mt-1 break-words text-sm font-medium text-content">{value}</p></div>; }
