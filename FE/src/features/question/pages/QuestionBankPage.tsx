import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';

export function QuestionBankPage() {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [modalOpen, setModalOpen] = useState(false);

  const questions = [
    { id: 'Q-1042', text: 'What is gradient descent and how does it work?', topic: 'Optimization', difficulty: 'Medium', type: 'MCQ', status: 'Active', uses: 47 },
    { id: 'Q-1041', text: 'Explain the bias-variance tradeoff in machine learning.', topic: 'ML Theory', difficulty: 'Hard', type: 'Essay', status: 'Active', uses: 23 },
    { id: 'Q-1040', text: 'What is the purpose of the softmax function in classification?', topic: 'Neural Nets', difficulty: 'Medium', type: 'MCQ', status: 'Draft', uses: 0 },
    { id: 'Q-1039', text: 'How does cross-entropy loss differ from mean squared error?', topic: 'Loss Functions', difficulty: 'Hard', type: 'MCQ', status: 'Active', uses: 31 },
    { id: 'Q-1038', text: 'What is the difference between supervised and unsupervised learning?', topic: 'ML Basics', difficulty: 'Easy', type: 'MCQ', status: 'Active', uses: 89 },
  ];

  const columns = [
    { key: 'id', label: 'ID', width: '80px', render: (r: Record<string, unknown>) => <code className="text-[12px] font-mono text-[#9CA3AF]">{r.id as string}</code> },
    { key: 'text', label: 'Question', render: (r: Record<string, unknown>) => <p className="text-[13.5px] text-[#374151] line-clamp-2 max-w-xs">{r.text as string}</p> },
    { key: 'topic', label: 'Topic', render: (r: Record<string, unknown>) => <Badge variant="info">{r.topic as string}</Badge> },
    { key: 'difficulty', label: 'Difficulty', render: (r: Record<string, unknown>) => <Badge variant={(r.difficulty === 'Hard' ? 'danger' : r.difficulty === 'Medium' ? 'warning' : 'success') as 'danger' | 'warning' | 'success'}>{r.difficulty as string}</Badge> },
    { key: 'type', label: 'Type', render: (r: Record<string, unknown>) => <Badge>{r.type as string}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.status === 'Active' ? 'success' : 'default') as 'success' | 'default'}>{r.status as string}</Badge> },
    { key: 'uses', label: 'Uses', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#374151]">{r.uses as number}</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
        items={[{ label: 'Edit', icon: <Icon.Edit /> }, { label: 'Preview', icon: <Icon.Eye /> }, { label: 'Duplicate', icon: <Icon.Copy /> }, { divider: true } as {label: string; divider: true}, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">Question Bank</h2>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Scan className="w-4 h-4" />}>OCR Import</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>Add Question</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
          <SearchInput className="w-60" placeholder="Search questions…" />
          <Select value="all" options={[{ label: 'All Topics', value: 'all' }, { label: 'ML Theory', value: 'ml' }, { label: 'Deep Learning', value: 'dl' }]} className="w-36" />
          <Select value="all" options={[{ label: 'All Difficulty', value: 'all' }, { label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]} className="w-36" />
          <Select value="all" options={[{ label: 'All Status', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Draft', value: 'draft' }]} className="w-32" />
          <div className="flex-1" />
          <Badge variant="default">4,827 questions</Badge>
        </div>
        <Table columns={columns} data={questions as Record<string, unknown>[]} selectable onSort={k => { sortKey === k ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortKey(k); }} sortKey={sortKey} sortDir={sortDir} />
        <div className="border-t border-[#F3F4F6]">
          <Pagination page={page} total={4827} perPage={5} onChange={setPage} />
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Question" size="lg"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="secondary">Save as Draft</Button><Button>Publish Question</Button></>}>
        <div className="space-y-4">
          <div>
            <label className="text-[13px] font-medium text-[#374151] block mb-1.5">Question Text</label>
            <textarea className="w-full h-28 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" placeholder="Enter the question..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Subject" value="ml" options={[{ label: 'Machine Learning', value: 'ml' }, { label: 'Deep Learning', value: 'dl' }]} />
            <Select label="Difficulty" value="medium" options={[{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]} />
            <Select label="Type" value="mcq" options={[{ label: 'Multiple Choice', value: 'mcq' }, { label: 'True/False', value: 'tf' }, { label: 'Essay', value: 'essay' }]} />
          </div>
          <div>
            <label className="text-[13px] font-medium text-[#374151] block mb-2">Answer Options</label>
            <div className="space-y-2">
              {['A', 'B', 'C', 'D'].map(l => (
                <div key={l} className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-[#F3F4F6] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-[#6B7280] flex-shrink-0">{l}</div>
                  <input className="flex-1 h-9 px-3 rounded-[10px] border border-[#E5E7EB] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" placeholder={`Option ${l}`} />
                  <input type="radio" name="correct" className="accent-[#16A34A]" />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[13px] font-medium text-[#374151] block mb-1.5">AI Hint</label>
            <textarea className="w-full h-20 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" placeholder="Provide an AI-generated hint for this question..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
