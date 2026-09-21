import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/assets/icons';

export function ProfilePage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h2 className="text-[22px] font-bold text-[#111827]">My Profile</h2>
      {/* Header card */}
      <div className="card p-6 flex items-start gap-6">
        <div className="relative">
          <Avatar name="Alexandra Chen" size="xl" color="#2563EB" />
          <button className="absolute bottom-0 right-0 w-7 h-7 bg-[#2563EB] rounded-full flex items-center justify-center shadow-md">
            <Icon.Edit className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-[20px] font-bold text-[#111827]">Alexandra Chen</h3>
            <Badge variant="info">Student</Badge>
          </div>
          <p className="text-[14px] text-[#6B7280]">alexandra.chen@university.edu</p>
          <p className="text-[13px] text-[#9CA3AF] mt-1">Member since January 2025 · Student ID: STU-2025-0847</p>
          <div className="flex gap-6 mt-4">
            {[{ label: 'Courses', value: 6 }, { label: 'Exams Taken', value: 23 }, { label: 'Certificates', value: 4 }, { label: 'Avg Score', value: '84%' }].map(s => (
              <div key={s.label}>
                <p className="text-[18px] font-bold text-[#111827]">{s.value}</p>
                <p className="text-[12px] text-[#9CA3AF]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <Button variant="outline" icon={<Icon.Edit className="w-4 h-4" />}>Edit Profile</Button>
      </div>
      {/* Personal info */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card p-6">
          <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Personal Information</h4>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" defaultValue="Alexandra" />
            <Input label="Last Name" defaultValue="Chen" />
            <Input label="Email" defaultValue="alexandra.chen@university.edu" type="email" icon={<Icon.Mail className="w-4 h-4" />} />
            <Input label="Phone" defaultValue="+1 (555) 012-3456" />
            <Input label="University" defaultValue="Stanford University" />
            <Input label="Student ID" defaultValue="STU-2025-0847" />
          </div>
          <div className="flex justify-end mt-4 gap-2">
            <Button variant="outline">Cancel</Button>
            <Button>Save Changes</Button>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Progress Overview</h4>
            <div className="space-y-3">
              <Progress value={67} label="ML Fundamentals" color="#2563EB" />
              <Progress value={91} label="Python Basics" color="#16A34A" />
              <Progress value={34} label="Deep Learning" color="#D97706" />
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Recent Certificates</h4>
            <div className="space-y-3">
              {['Python Fundamentals', 'Data Analysis', 'SQL Basics'].map(c => (
                <div key={c} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-[#FFFBEB] rounded-[8px] flex items-center justify-center">
                    <Icon.Award className="w-4 h-4 text-[#D97706]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[#374151]">{c}</p>
                    <p className="text-[11px] text-[#9CA3AF]">Issued 2025</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
