import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { MOCK_USERS, getUserListState, type MockUser } from '../mockUsers';

export interface UserListState {
  search: string;
  role: string;
  status: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  page: number;
}

export function UsersPage({ onNavigate }: { onNavigate?: (id: string, params?: Record<string, string>) => void }) {
  // Filters, sorting, and pagination persist in a module singleton so "Back to
  // User List" from User Detail restores the exact previous view.
  const saved = getUserListState();
  const [search, setSearch] = useState(saved.search);
  const [role, setRole] = useState(saved.role);
  const [status, setStatus] = useState(saved.status);
  const [sortKey, setSortKey] = useState(saved.sortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(saved.sortDir);

  const pushState = (patch: Partial<UserListState>) => {
    Object.assign(saved, patch);
  };

  const users = MOCK_USERS;
  const lc = (s: string) => s.toLowerCase();
  const filtered = users.filter(u => {
    const matchesSearch = !search || lc(u.name).includes(lc(search)) || lc(u.email).includes(lc(search)) || lc(u.username).includes(lc(search));
    const matchesRole = role === 'all' || u.role === role;
    const matchesStatus = status === 'all' || u.status === status;
    return matchesSearch && matchesRole && matchesStatus;
  });
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
    if (sortKey === 'lastLogin') return dir * a.lastLogin.localeCompare(b.lastLogin);
    return 0;
  });

  const openDetail = (u: MockUser) => onNavigate?.('user-detail', { userId: u.id });

  const columns = [
    { key: 'name', label: 'User', sortable: true, render: (r: Record<string, unknown>) => (
      <button onClick={() => openDetail(r as unknown as MockUser)} className="flex items-center gap-2.5 text-left rounded-[6px] -ml-1 pl-1 pr-2 py-0.5 hover:bg-[#F3F4F6] transition-colors min-w-0">
        <Avatar name={r.name as string} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-[#111827] text-[13.5px] truncate hover:text-[#2563EB] transition-colors">{r.name as string}</p>
          <p className="text-[11px] text-[#9CA3AF] truncate">{r.email as string}</p>
        </div>
      </button>
    )},
    { key: 'role', label: 'Role', render: (r: Record<string, unknown>) => <Badge variant={r.role === 'Admin' ? 'danger' : r.role === 'Content Manager' ? 'purple' : 'info'}>{r.role as string}</Badge> },
    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => <Badge variant={r.status === 'Active' ? 'success' : 'default'}>{r.status as string}</Badge> },
    { key: 'lastLogin', label: 'Last Login', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.lastLogin as string}</span> },
    { key: 'courses', label: 'Courses', render: (r: Record<string, unknown>) => r.courses !== null ? <span className="text-[13px] text-[#374151]">{r.courses as number}</span> : <span className="text-[#D1D5DB]">—</span> },
    { key: 'actions', label: '', render: (r: Record<string, unknown>) => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]"/></button>}
        items={[{ label: 'View', icon: <Icon.Eye />, onClick: () => openDetail(r as unknown as MockUser) }, { label: 'Edit', icon: <Icon.Edit /> }, { label: 'Reset Password', icon: <Icon.Lock /> }, { label: 'Change Role', icon: <Icon.Shield /> }, { divider: true } as {label: string; divider: true}, { label: 'Deactivate', icon: <Icon.X />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">User List</h2>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
          <SearchInput className="w-full sm:w-64" placeholder="Search users…" value={search} onChange={e => { setSearch(e.target.value); pushState({ search: e.target.value }); }} />
          <Select value={role} onChange={v => { setRole(v); pushState({ role: v }); }} options={[{ label: 'All Roles', value: 'all' }, { label: 'Student', value: 'Student' }, { label: 'Content Manager', value: 'Content Manager' }, { label: 'Admin', value: 'Admin' }]} className="w-full sm:w-40" />
          <Select value={status} onChange={v => { setStatus(v); pushState({ status: v }); }} options={[{ label: 'All Status', value: 'all' }, { label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }]} className="w-full sm:w-32" />
          <div className="flex-1" />
          <Button variant="outline" size="sm" icon={<Icon.Download className="w-3.5 h-3.5" />}>Export</Button>
        </div>
        <Table
          columns={columns}
          data={sorted as unknown as Record<string, unknown>[]}
          selectable
          unit="users"
          onSort={k => {
            const dir = sortKey === k ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
            setSortKey(k); setSortDir(dir); pushState({ sortKey: k, sortDir: dir });
          }}
          sortKey={sortKey}
          sortDir={sortDir}
          initialPage={saved.page}
          onPageChange={p => pushState({ page: p })}
        />
      </div>
    </div>
  );
}
