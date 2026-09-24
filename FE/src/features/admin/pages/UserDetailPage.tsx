import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Table } from '@/components/ui/Table';
import { Icon } from '@/assets/icons';
import { MOCK_USERS, USER_STATS, USER_ATTEMPTS, markPasswordReset, setUserStatus } from '../mockUsers';

export function UserDetailPage({ onNavigate, params }: { onNavigate?: (id: string, params?: Record<string, string>) => void; params?: Record<string, string> }) {
  const user = MOCK_USERS.find(u => u.id === params?.userId) ?? MOCK_USERS[0];
  const stats = USER_STATS[user.id];
  const attempts = USER_ATTEMPTS[user.id] ?? [];

  const attemptColumns = [
    { key: 'exam', label: 'Exam Name', render: (r: Record<string, unknown>) => <span className="font-medium text-[#111827] text-[13.5px]">{r.exam as string}</span> },
    { key: 'score', label: 'Score', render: (r: Record<string, unknown>) => (
      <span className={`font-semibold ${  (r.score as number) >= 70 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{r.score as number}%</span>
    )},
    { key: 'result', label: 'Result', render: (r: Record<string, unknown>) => <Badge variant={(r.result as string) === 'Passed' ? 'success' : 'danger'}>{r.result as string}</Badge> },
    { key: 'date', label: 'Date', render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.date as string}</span> },
    { key: 'actions', label: '', render: () => (
      <button className="text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1">
        View Result <Icon.ChevronRight className="w-3.5 h-3.5" />
      </button>
    )},
  ];

  const attemptTable = (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#F3F4F6]">
        <h4 className="text-[15px] font-semibold text-[#111827]">Recent Exam Attempts</h4>
        <p className="text-[12px] text-[#9CA3AF] mt-0.5">Latest 5 attempts across all enrolled courses</p>
        </div>
      <Table columns={attemptColumns} data={attempts as unknown as Record<string, unknown>[]} perPage={5} unit="attempts" />
    </div>
  );

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb items={[{ label: 'User List', onClick: () => onNavigate?.('users') }, { label: user.name }]} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left (75%): profile, learning stats, recent exam attempts */}
        <div className="lg:col-span-3 space-y-5 min-w-0">
          {/* User Profile card */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <Avatar name={user.name} size="xl" />
                <div className="min-w-0">
                  <h2 className="text-[20px] font-bold text-[#111827] truncate">{user.name}</h2>
                  <p className="text-[13px] text-[#6B7280] truncate">{user.email}</p>
                </div>
              </div>
              <span className="text-[12px] text-[#9CA3AF] flex items-center gap-1.5 flex-shrink-0">
                <Icon.Clock className="w-3.5 h-3.5" />Last login {user.lastLogin}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4 mt-5">
              {[
                { label: 'Full Name', value: user.name },
                { label: 'Email', value: user.email },
                { label: 'Username', value: user.username },
                { label: 'Phone Number', value: user.phone },
                { label: 'Role', value: user.role },
                { label: 'Status', value: user.status },
                { label: 'Date Joined', value: user.joined },
                { label: 'Last Login', value: user.lastLogin },
              ].map(f => (
                <div key={f.label} className="min-w-0">
                  <p className="text-[12px] text-[#9CA3AF]">{f.label}</p>
                  <p className="text-[13.5px] font-medium text-[#111827] mt-0.5 break-words">{f.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t border-[#F3F4F6]">
              <p className="text-[12px] text-[#9CA3AF]">Bio (optional)</p>
              <p className="text-[13.5px] text-[#374151] mt-1">{user.bio}</p>
            </div>
          </div>

          {/* Learning Statistics */}
          <div>
            <h3 className="text-[16px] font-semibold text-[#111827] mb-3">Learning Statistics</h3>
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              {[
                { label: 'Total Courses Enrolled', value: String(stats.enrolled), color: '#2563EB' },
                { label: 'Exams Taken', value: String(stats.examsTaken), color: '#059669' },
                { label: 'Average Score', value: stats.examsTaken > 0 ? `${stats.avgScore}%` : '—', color: '#7C3AED' },
                { label: 'Certificates Earned', value: String(stats.certificates), color: '#D97706' },
                { label: 'Last Activity', value: stats.lastActivity, color: '#0891B2' },
              ].map(s => (
                <div key={s.label} className="bg-[#F9FAFB] rounded-[10px] p-4">
                  <p className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[12px] text-[#9CA3AF] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Exam Attempts */}
          {attemptTable}
        </div>

        {/* Right (25%): sticky sidebar */}
        <div className="lg:col-span-1 lg:sticky lg:top-0 space-y-4 min-w-0">
          {/* Compact summary card */}
          <div className="card p-5 text-center">
            <div className="flex justify-center">
              <Avatar name={user.name} size="xl" />
            </div>
            <h4 className="text-[15px] font-semibold text-[#111827] mt-3 truncate">{user.name}</h4>
            <p className="text-[12px] text-[#9CA3AF] font-mono">User ID: {user.id}</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Badge variant={user.role === 'Admin' ? 'danger' : user.role === 'Content Manager' ? 'purple' : 'info'}>{user.role}</Badge>
              <Badge variant={user.status === 'Active' ? 'success' : 'default'}>{user.status}</Badge>
            </div>
          </div>

          {/* Actions card */}
          <div className="card p-5 space-y-2">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-1">Actions</h4>
            <Button icon={<Icon.Edit className="w-4 h-4" />} className="w-full justify-center">Edit User</Button>
            <Button variant="outline" icon={<Icon.Lock className="w-4 h-4" />} className="w-full justify-center" onClick={() => markPasswordReset(user.id)}>Reset Password</Button>
            <Button
              variant={user.status === 'Active' ? 'outline' : 'primary'}
              icon={user.status === 'Active' ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.CheckCircle className="w-4 h-4" />}
              className="w-full justify-center"
              onClick={() => setUserStatus(user.id, user.status === 'Active' ? 'Inactive' : 'Active')}
            >
              {user.status === 'Active' ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="danger" icon={<Icon.Trash className="w-4 h-4" />} className="w-full justify-center">Delete User</Button>
          </div>

          <Button variant="ghost" icon={<Icon.ChevronLeft className="w-4 h-4" />} className="w-full justify-center" onClick={() => onNavigate?.('users')}>
            Back to User List
          </Button>
        </div>
      </div>
    </div>
  );
}
