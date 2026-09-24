import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/assets/icons';
import { type CourseModule } from '@/features/module/mockModules';
import { MOCK_LESSONS } from '@/features/lesson/mockLessons';
import { MOCK_QUESTION_BANK } from '@/features/exam/mockQuestionBank';
import { blockVariant } from '@/features/lesson/contentBlocks';

const moduleStatusVariant = (s: string) => (s === 'Active' ? 'success' : s === 'Draft' ? 'warning' : 'default') as 'success' | 'warning' | 'default';
const lessonStatusVariant = (s: string) => (s === 'Published' ? 'success' : s === 'Draft' ? 'warning' : 'default') as 'success' | 'warning' | 'default';

export function CourseExplorer({
  courseId, modules, expanded, onToggleModule, onExpandAll, onCollapseAll, onNavigate, onAddLesson, onAddModule, onEditModule,
}: {
  courseId: string;
  modules: CourseModule[];
  expanded: Set<string>;
  onToggleModule: (id: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onNavigate?: (id: string) => void;
  onAddLesson: (moduleId: string) => void;
  onAddModule: () => void;
  onEditModule?: (moduleId: string) => void;
}) {
  const lessonsOf = (moduleId: string) => MOCK_LESSONS.filter(l => l.moduleId === moduleId).sort((a, b) => a.order - b.order);
  const questionCountOf = (moduleId: string) => MOCK_QUESTION_BANK.filter(q => q.moduleId === moduleId).length;
  const durationOf = (moduleId: string) => MOCK_LESSONS.filter(l => l.moduleId === moduleId).reduce((s, l) => s + (parseInt(l.duration, 10) || 0), 0);
  const totalLessons = MOCK_LESSONS.filter(l => l.courseId === courseId).length;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#F3F4F6]">
        <div className="flex items-center gap-2">
          <Icon.FolderOpen className="w-4 h-4 text-[#2563EB]" />
          <div>
            <p className="text-[14px] font-semibold text-[#111827] leading-tight">Course Content</p>
            <p className="text-[11.5px] text-[#9CA3AF] leading-tight">{modules.length} modules · {totalLessons} lessons</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Icon.ChevronDown className="w-3.5 h-3.5" />} onClick={onExpandAll}>Expand All</Button>
          <Button variant="ghost" size="sm" icon={<Icon.ChevronRight className="w-3.5 h-3.5" />} onClick={onCollapseAll}>Collapse All</Button>
          <Button size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={onAddModule}>Add Module</Button>
        </div>
      </div>

      <div className="divide-y divide-[#F9FAFB]">
        {modules.map(m => {
          const open = expanded.has(m.id);
          const lessons = lessonsOf(m.id);
          return (
            <div key={m.id}>
              <div
                className={`flex items-center gap-2 px-4 py-3 cursor-pointer select-none transition-colors ${open ? 'bg-[#F9FAFB]' : 'hover:bg-[#F9FAFB]'}`}
                onClick={() => onToggleModule(m.id)}
              >
                <Icon.ChevronRight className={`w-4 h-4 text-[#9CA3AF] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                {open
                  ? <Icon.FolderOpen className="w-4 h-4 text-[#D97706] flex-shrink-0" />
                  : <Icon.Folder className="w-4 h-4 text-[#D97706] flex-shrink-0" />}
                <span className="text-[13.5px] font-semibold text-[#111827] truncate">{m.title}</span>
                <span className="text-[10.5px] px-1.5 py-0.5 bg-[#F3F4F6] rounded-[5px] text-[#9CA3AF] flex-shrink-0">O{m.order}</span>
                <Badge variant={moduleStatusVariant(m.status)} className="flex-shrink-0">{m.status}</Badge>
                <div className="hidden lg:flex items-center gap-2.5 text-[12px] text-[#6B7280] flex-shrink-0">
                  <span className="flex items-center gap-1"><Icon.List className="w-3 h-3" />{lessons.length} lessons</span>
                  <span className="flex items-center gap-1"><Icon.ClipboardList className="w-3 h-3" />{questionCountOf(m.id)} questions</span>
                  <span className="flex items-center gap-1"><Icon.Clock className="w-3 h-3" />{durationOf(m.id)} min</span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={() => onAddLesson(m.id)}>Add Lesson</Button>
                  <button onClick={() => onEditModule?.(m.id)} className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#EFF6FF] hover:text-[#2563EB]" title="Edit Module"><Icon.Edit className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#DC2626]" title="Delete Module"><Icon.Trash className="w-4 h-4" /></button>
                </div>
              </div>

              {open && (
                <div className="ml-8 pl-5 border-l border-[#EEF2F7] pb-2">
                  {lessons.length === 0 && (
                    <div className="px-4 py-3 flex items-center gap-2 text-[12.5px] text-[#9CA3AF]">
                      <Icon.File className="w-3.5 h-3.5" />No lessons yet
                      <button className="text-[#2563EB] font-medium hover:underline" onClick={() => onAddLesson(m.id)}>Add Lesson</button>
                    </div>
                  )}
                  {lessons.map(l => (
                    <div key={l.id} className="group flex items-center gap-2 px-4 py-2.5 rounded-[8px] hover:bg-[#F9FAFB] transition-colors">
                      <Icon.FileText className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#2563EB] flex-shrink-0" />
                      <button
                        className="text-[13.5px] font-medium text-[#374151] group-hover:text-[#2563EB] text-left truncate"
                        onClick={() => onNavigate?.('lesson-edit')}
                        title="Open lesson detail"
                      >
                        {l.title}
                      </button>
                      <Badge variant={lessonStatusVariant(l.status)} className="flex-shrink-0">{l.status}</Badge>
                      <div className="hidden md:flex items-center gap-2 text-[12px] text-[#9CA3AF] flex-shrink-0">
                        <Tooltip label={
                          <span className="flex flex-wrap gap-1">{l.blocks.map(b => <Badge key={b} variant={blockVariant(b) as 'info' | 'purple' | 'warning' | 'success' | 'default'} className="text-[10px]">{b}</Badge>)}</span>
                        }>
                          <span className="cursor-help">{l.blocks.length} block{l.blocks.length > 1 ? 's' : ''}</span>
                        </Tooltip>
                        <span className="text-[#D1D5DB]">·</span>
                        <span>{l.exams} exam{l.exams === 1 ? '' : 's'}</span>
                        <span className="text-[#D1D5DB]">·</span>
                        <span>{l.duration}</span>
                      </div>
                      <div className="flex-1" />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => onNavigate?.('lesson-edit')} className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#EFF6FF] hover:text-[#2563EB]" title="Open"><Icon.Eye className="w-4 h-4" /></button>
                        <button onClick={() => onNavigate?.('lesson-edit')} className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#EFF6FF] hover:text-[#2563EB]" title="Edit"><Icon.Edit className="w-4 h-4" /></button>
                        <button className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:text-[#DC2626]" title="Delete"><Icon.Trash className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}