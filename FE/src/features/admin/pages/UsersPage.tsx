import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [modalOpen, setModalOpen] = useState(false);

  const users = [
    { name: 'Alexandra Chen', email: 'alex.chen@uni.edu', role: 'Student', status: 'Active', lastLogin: '2h ago', courses: 6 },
    { name: 'Marcus Johnson', email: 'm.johnson@corp.com', role: 'Student', status: 'Active', lastLogin: '1d ago', courses: 4 },
    { name: 'Priya Nair', email: 'p.nair@institute.edu', role: 'Content Manager', status: 'Active', lastLogin: '30m ago', courses: null },
    { name: 'Tom Williams', email: 't.williams@certifyai.com', role: 'Admin', status: 'Active', lastLogin: 'Just now', courses: null },
    { name: 'Li Wei', email: 'li.wei@university.cn', role: 'Student', status: 'Inactive', lastLogin: '2w ago', courses: 2 },
  ];

  const columns = [
    { key: 'name', label: 'User', sortable: true, render: (r: Record<string, unknown>) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.name as string} size="sm" />
        <div>
          <p className="font-medium text-[#111827] text-[13.5px]">{r.name as string}</p>
          <p className="text-[11px] text-[#9CA3AF]">{r.email as string}</p>
        </div>
      </div>
    )},
    { key: 'role', label: 'Role', render: (r: Record<string, unknown>) => <Badge variant={r.role === 'Admin' ? 'danger' : r.role === 'Content Manager' ? 'purple' : 'info'}>{r.role as string}</Badge> },
    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => <Badge variant={r.status === 'Active' ? 'success' : 'default'}>{r.status as string}</Badge> },
    { key: 'lastLogin', label: 'Last Login', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.lastLogin as string}</span> },
    { key: 'courses', label: 'Courses', render: (r: Record<string, unknown>) => r.courses !== null ? <span className="text-[13px] text-[#374151]">{r.courses as number}</span> : <span className="text-[#D1D5DB]">—</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
        items={[{ label: 'View', icon: <Icon.Eye /> }, { label: 'Edit', icon: <Icon.Edit /> }, { label: 'Reset Password', icon: <Icon.Lock /> }, { label: 'Change Role', icon: <Icon.Shield /> }, { divider: true } as {label: string; divider: true}, { label: 'Deactivate', icon: <Icon.X />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">User Management</h2>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Upload className="w-4 h-4" />}>Import CSV</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Add User</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[{ label: 'Total Users', value: 3847, color: '#2563EB' }, { label: 'Active', value: 3612, color: '#16A34A' }, { label: 'Inactive', value: 235, color: '#9CA3AF' }, { label: 'New this month', value: 147, color: '#D97706' }].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-[22px] font-bold text-[#111827]">{s.value.toLocaleString()}</p>
              <p className="text-[12px] text-[#9CA3AF]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
          <SearchInput className="w-64" placeholder="Search users…" />
          <Select value="all" options={[{ label: 'All Roles', value: 'all' }, { label: 'Student', value: 'student' }, { label: 'Content Manager', value: 'cm' }, { label: 'Admin', value: 'admin' }]} className="w-40" />
          <Select value="all" options={[{ label: 'All Status', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} className="w-32" />
          <div className="flex-1" />
          <Button variant="outline" size="sm" icon={<Icon.Download className="w-3.5 h-3.5" />}>Export</Button>
        </div>
        <Table columns={columns} data={users as Record<string, unknown>[]} selectable onSort={k => { sortKey === k ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortKey(k); }} sortKey={sortKey} sortDir={sortDir} />
        <div className="border-t border-[#F3F4F6]"><Pagination page={page} total={3847} onChange={setPage} /></div>
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New User"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button>Create User</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First Name" placeholder="John" />
            <Input label="Last Name" placeholder="Doe" />
          </div>
          <Input label="Email Address" placeholder="user@example.com" type="email" icon={<Icon.Mail className="w-4 h-4" />} />
          <Select label="Role" value="student" options={[{ label: 'Student', value: 'student' }, { label: 'Content Manager', value: 'cm' }, { label: 'Admin', value: 'admin' }]} />
          <div className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-[10px]">
            <div>
              <p className="text-[14px] font-medium text-[#374151]">Send welcome email</p>
              <p className="text-[12px] text-[#9CA3AF]">Includes login credentials</p>
            </div>
            <Switch checked={true} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
