import React from 'react';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { StatCard } from '@/components/ui/StatCard';
import { CourseCard, ExamCard } from '@/components/common/CourseCard';
import { Icon } from '@/assets/icons';

export function StudentDashboard() {
  return (
    <div className="p-8 space-y-7">
      <div className="flex justify-end">
        <Button icon={<Icon.Book className="w-4 h-4" />}>Continue Learning</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Courses Enrolled" value="6" change={0} changeLabel="" icon={<Icon.Book />} color="#2563EB" />
        <StatCard title="Exams Completed" value="23" change={4.3} changeLabel="this month" icon={<Icon.ClipboardList />} color="#7C3AED" />
        <StatCard title="Average Score" value="84.2%" change={2.1} changeLabel="vs last month" icon={<Icon.TrendingUp />} color="#059669" />
        <StatCard title="Certificates" value="4" change={33.3} changeLabel="vs last month" icon={<Icon.Award />} color="#D97706" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <h3 className="text-[16px] font-semibold text-[#111827]">My Courses</h3>
          <div className="grid grid-cols-2 gap-4">
            <CourseCard title="Machine Learning Fundamentals" subject="AI & Data Science" progress={67} examCount={8} difficulty="Medium" />
            <CourseCard title="Python for Data Science" subject="Programming" progress={91} examCount={12} difficulty="Easy" />
            <CourseCard title="Deep Neural Networks" subject="Advanced AI" progress={23} examCount={5} difficulty="Hard" />
            <CourseCard title="Statistics for ML" subject="Mathematics" progress={55} examCount={6} difficulty="Medium" />
          </div>

          <h3 className="text-[16px] font-semibold text-[#111827]">Upcoming Exams</h3>
          <div className="grid grid-cols-2 gap-4">
            <ExamCard title="ML Fundamentals Final" duration={90} questions={45} passMark={70} status="upcoming" />
            <ExamCard title="Statistics Mid-Exam" duration={60} questions={30} passMark={65} status="upcoming" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Study Progress</h4>
            <div className="space-y-3">
              <Progress value={67} label="ML Fundamentals" color="#2563EB" />
              <Progress value={91} label="Python Basics" color="#16A34A" />
              <Progress value={23} label="Deep Learning" color="#D97706" />
              <Progress value={55} label="Statistics" color="#7C3AED" />
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Recent Activity</h4>
            <div className="space-y-3">
              {[
                { action: 'Completed Chapter 7', course: 'ML Fundamentals', time: '2h ago', icon: <Icon.CheckCircle className="w-4 h-4 text-[#16A34A]" /> },
                { action: 'Practice exam: 76%', course: 'Statistics', time: '1d ago', icon: <Icon.ClipboardList className="w-4 h-4 text-[#2563EB]" /> },
                { action: 'Certificate earned', course: 'Python Basics', time: '3d ago', icon: <Icon.Award className="w-4 h-4 text-[#D97706]" /> },
                { action: 'Started Chapter 3', course: 'Deep Learning', time: '4d ago', icon: <Icon.Book className="w-4 h-4 text-[#7C3AED]" /> },
              ].map((a, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">{a.icon}</div>
                  <div>
                    <p className="text-[13px] font-medium text-[#374151]">{a.action}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{a.course} · {a.time}</p>
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
