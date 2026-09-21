import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Progress } from '@/components/ui/Progress';
import { Avatar } from '@/components/ui/Avatar';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';

export function AdminDashboard() {
  const barData = [
    { month: 'Apr', students: 180, exams: 420 },
    { month: 'May', students: 230, exams: 560 },
    { month: 'Jun', students: 310, exams: 740 },
    { month: 'Jul', students: 280, exams: 680 },
    { month: 'Aug', students: 390, exams: 920 },
    { month: 'Sep', students: 447, exams: 1082 },
  ];
  const maxBar = Math.max(...barData.map(d => d.exams));

  return (
    <div className="p-8 space-y-7">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Admin Dashboard</h2>
          <p className="text-[14px] text-[#6B7280] mt-1">Platform overview and system health.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export Report</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />}>Add User</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Users" value="3,847" change={8.4} changeLabel="vs last month" icon={<Icon.Users />} color="#2563EB" />
        <StatCard title="Active Courses" value="48" change={4.2} changeLabel="vs last month" icon={<Icon.Book />} color="#7C3AED" />
        <StatCard title="Exams This Month" value="18,291" change={12.1} changeLabel="vs last month" icon={<Icon.ClipboardList />} color="#059669" />
        <StatCard title="Certificates Issued" value="1,204" change={21.8} changeLabel="vs last month" icon={<Icon.Award />} color="#D97706" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* Chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[15px] font-semibold text-[#111827]">Platform Activity</h4>
              <div className="flex items-center gap-4 text-[12px]">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-[#2563EB]" /><span className="text-[#6B7280]">New Students</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-[#BFDBFE]" /><span className="text-[#6B7280]">Exams Taken</span></div>
              </div>
            </div>
            <div className="flex items-end gap-3 h-40">
              {barData.map(d => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full flex items-end gap-1 h-32">
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.students / maxBar) * 100}%`, background: '#2563EB', minHeight: 4 }} />
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.exams / maxBar) * 100}%`, background: '#BFDBFE', minHeight: 4 }} />
                  </div>
                  <span className="text-[11px] text-[#9CA3AF]">{d.month}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Users Table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
              <h4 className="text-[15px] font-semibold text-[#111827]">Recent Registrations</h4>
              <Button variant="ghost" size="sm">View All</Button>
            </div>
            <div className="divide-y divide-[#F9FAFB]">
              {[
                { name: 'Emma Rodriguez', email: 'emma.r@university.edu', role: 'Student', joined: 'Today', status: 'Active' },
                { name: 'Liam Thompson', email: 'liam.t@techcorp.com', role: 'Student', joined: 'Yesterday', status: 'Active' },
                { name: 'Sofia Patel', email: 'sofia.p@college.edu', role: 'Content Manager', joined: '2d ago', status: 'Active' },
                { name: 'Noah Kim', email: 'noah.k@university.edu', role: 'Student', joined: '3d ago', status: 'Inactive' },
              ].map(u => (
                <div key={u.email} className="flex items-center gap-3 px-5 py-3 hover:bg-[#F9FAFB]">
                  <Avatar name={u.name} size="sm" />
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium text-[#374151]">{u.name}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{u.email}</p>
                  </div>
                  <Badge variant={u.role === 'Content Manager' ? 'purple' : 'info'} className="text-[11px]">{u.role}</Badge>
                  <Badge variant={u.status === 'Active' ? 'success' : 'default'} className="text-[11px]">{u.status}</Badge>
                  <span className="text-[12px] text-[#9CA3AF] w-16 text-right">{u.joined}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">System Health</h4>
            <div className="space-y-3">
              <Progress value={94} label="AI Service" color="#16A34A" />
              <Progress value={78} label="Server CPU" color="#2563EB" />
              <Progress value={61} label="Storage Used" color="#D97706" />
              <Progress value={99} label="Uptime" color="#16A34A" />
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">User Distribution</h4>
            <div className="space-y-3">
              {[
                { role: 'Students', count: 3412, pct: 89, color: '#2563EB' },
                { role: 'Content Managers', count: 387, pct: 10, color: '#7C3AED' },
                { role: 'Admins', count: 48, pct: 1, color: '#DC2626' },
              ].map(r => (
                <div key={r.role} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  <span className="text-[12px] text-[#6B7280] flex-1">{r.role}</span>
                  <span className="text-[12px] font-semibold text-[#374151]">{r.count}</span>
                  <span className="text-[11px] text-[#9CA3AF]">{r.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Recent Alerts</h4>
            <div className="space-y-2">
              <Alert type="warning" message="Storage at 61% capacity. Consider cleanup." />
              <Alert type="info" message="AI model updated to v3.2 successfully." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
