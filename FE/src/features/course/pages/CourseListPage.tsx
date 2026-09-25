import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { Alert } from '@/components/ui/Alert';
import { CourseCard } from '@/components/common/CourseCard';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';

const courses = [
  { id: 'C-101', title: 'Machine Learning Fundamentals', description: 'Core theory and practice for designing, training, and evaluating machine learning models across three curriculum modules.', subject: 'AI & Data Science', difficulty: 'Medium' as const, progress: 100, modules: 3, lessons: 24, questions: 184, examCount: 8, students: 1247, status: 'Published', updated: '2d ago' },
  { id: 'C-102', title: 'Python for Data Science', description: 'Hands-on foundation in Python, data wrangling, and analysis workflows for aspiring data scientists.', subject: 'Programming', difficulty: 'Easy' as const, progress: 100, modules: 2, lessons: 14, questions: 96, examCount: 12, students: 2054, status: 'Published', updated: '5d ago' },
  { id: 'C-103', title: 'Deep Neural Networks', description: 'Advanced architectures, backpropagation, and modern normalization techniques for deep learning.', subject: 'Advanced AI', difficulty: 'Hard' as const, progress: 64, modules: 4, lessons: 18, questions: 140, examCount: 5, students: 386, status: 'Draft', updated: '1h ago' },
  { id: 'C-104', title: 'Statistics for ML', description: 'Distributions, inference, and hypothesis testing applied to machine learning problems.', subject: 'Mathematics', difficulty: 'Medium' as const, progress: 82, modules: 2, lessons: 10, questions: 72, examCount: 6, students: 812, status: 'Published', updated: '1w ago' },
  { id: 'C-105', title: 'SQL & Databases', description: 'Query design and relational modeling fundamentals for data engineering.', subject: 'Data Engineering', difficulty: 'Easy' as const, progress: 45, modules: 1, lessons: 6, questions: 40, examCount: 4, students: 0, status: 'Archived', updated: '3w ago' },
];

export function CourseListPage({ onNavigate, readonly }: { onNavigate?: (id: string) => void; readonly?: boolean }) {
  const [status, setStatus] = useState('all');
  const [subject, setSubject] = useState('all');

  const filtered = courses.filter(c => (status === 'all' || c.status === status) && (subject === 'all' || c.subject === subject));

  const { page, pageItems: paged, setPage } = usePagination(filtered, { resetKey: `${status}|${subject}` });

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Courses</h2>
          {readonly && <p className="text-[13px] text-[#6B7280] mt-0.5">Read-only access — courses are created by administrators.</p>}
        </div>
        {!readonly && (
          <div className="flex gap-2">
            <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
            <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => onNavigate?.('course-create')}>New Course</Button>
          </div>
        )}
      </div>

      {readonly && <Alert type="info" message="You can open a course to manage its modules, lessons, questions, and exams." />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Courses', value: 48, color: '#2563EB' },
          { label: 'Published', value: 36, color: '#16A34A' },
          { label: 'Drafts', value: 8, color: '#D97706' },
          { label: 'Archived', value: 4, color: '#9CA3AF' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-[22px] font-bold text-[#111827]">{s.value}</p>
              <p className="text-[12px] text-[#9CA3AF]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SearchInput className="w-full sm:w-64" placeholder="Search courses…" />
        <Select value={subject} onChange={setSubject} options={[{ label: 'All Subjects', value: 'all' }, { label: 'AI & Data Science', value: 'AI & Data Science' }, { label: 'Programming', value: 'Programming' }, { label: 'Mathematics', value: 'Mathematics' }]} className="w-full sm:w-48" />
        <Select value={status} onChange={setStatus} options={[{ label: 'All Status', value: 'all' }, { label: 'Published', value: 'Published' }, { label: 'Draft', value: 'Draft' }, { label: 'Archived', value: 'Archived' }]} className="w-full sm:w-36" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {paged.map(c => (
          <CourseCard key={c.id} title={c.title} description={c.description} subject={c.subject} difficulty={c.difficulty}
            progress={c.progress} modules={c.modules} lessons={c.lessons} questions={c.questions} examCount={c.examCount}
            status={c.status} updated={c.updated} onClick={() => onNavigate?.('course-detail')} />
        ))}
      </div>

      <div className="card overflow-hidden">
        <Pagination page={page} total={filtered.length} onChange={setPage} unit="courses" />
      </div>
    </div>
  );
}