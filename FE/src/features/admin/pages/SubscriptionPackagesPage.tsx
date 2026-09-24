import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';

const initialPackages = [
  { id: 'p1', name: 'Free', price: '$0', billing: '/month', description: 'Get started with core certification features.', features: ['5 exams / month', '10 AI hints / month', 'Basic reports'], active: true, subs: 3841 },
  { id: 'p2', name: 'Pro Monthly', price: '$29', billing: '/month', description: 'For serious learners and professionals.', features: ['Unlimited exams', '100 AI hints / month', 'Advanced analytics', 'Certificates'], active: true, subs: 1273 },
  { id: 'p3', name: 'Pro Annual', price: '$240', billing: '/year', description: 'Two months free, billed yearly.', features: ['Everything in Pro Monthly', 'Priority support', 'Offline practice'], active: true, subs: 684 },
  { id: 'p4', name: 'Team', price: '$320', billing: '/month', description: 'For teams up to 20 members.', features: ['Up to 20 seats', 'Admin console', 'Usage reports', 'API access'], active: true, subs: 89 },
  { id: 'p5', name: 'Enterprise', price: 'Custom', billing: '', description: 'Dedicated onboarding and SLA.', features: ['Unlimited seats', 'SSO / SAML', 'Dedicated support', 'Custom branding'], active: true, subs: 23 },
];

export function SubscriptionPackagesPage() {
  const [packages, setPackages] = useState(initialPackages);
  const [modalOpen, setModalOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const togglePackage = (id: string) => {
    setPackages(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">Subscription Packages</h2>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>New Package</Button>
        </div>
      </div>

      {saved && <Alert type="success" title="Settings saved" message="Package configuration has been updated successfully." />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {packages.map(p => (
          <div key={p.id} className="card p-5 flex flex-col gap-4 border-2 transition-all" style={{ borderColor: p.active ? '#BFDBFE' : '#E5E7EB' }}>
            <div className="flex items-start justify-between">
              <div>
                <Badge variant={p.name === 'Enterprise' ? 'purple' : p.name === 'Free' ? 'default' : 'info'}>{p.name}</Badge>
                <p className="text-[28px] font-bold text-[#111827] mt-3">{p.price}<span className="text-[13px] font-medium text-[#9CA3AF]">{p.billing}</span></p>
                <p className="text-[12px] text-[#6B7280] mt-1 leading-snug">{p.description}</p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {p.features.map(f => (
                <p key={f} className="flex items-center gap-1.5 text-[12.5px] text-[#374151]">
                  <Icon.Check className="w-3.5 h-3.5 text-[#16A34A]" />{f}
                </p>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6]">
              <span className="text-[12px] text-[#9CA3AF]">{p.subs.toLocaleString()} subs</span>
              <Switch checked={p.active} onChange={() => togglePackage(p.id)} size="sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6]"><h4 className="text-[15px] font-semibold text-[#111827]">Checkout Configuration</h4></div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Default Currency" defaultValue="USD" />
          <Input label="Trial Length (days)" type="number" defaultValue="14" />
          <Select label="Tax Rate" value="8.25" options={[{ label: '8.25%', value: '8.25' }, { label: '0%', value: '0' }]} />
        </div>
        <div className="px-6 pb-6 flex justify-end"><Button onClick={() => setSaved(true)} icon={<Icon.Check className="w-4 h-4" />}>Save Configuration</Button></div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Subscription Package" footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={() => setModalOpen(false)}>Create Package</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Package Name" placeholder="e.g. Pro Plus" />
            <Select label="Billing Cycle" value="monthly" options={[{ label: 'Monthly', value: 'monthly' }, { label: 'Annual', value: 'annual' }, { label: 'One-time', value: 'once' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price" type="number" placeholder="29.00" />
            <Select label="Active" value="true" options={[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]} />
          </div>
          <Input label="Description" placeholder="Short description shown on checkout" />
        </div>
      </Modal>
    </div>
  );
}