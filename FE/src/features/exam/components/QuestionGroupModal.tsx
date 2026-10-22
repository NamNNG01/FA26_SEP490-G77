import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { examService, type ExamKind, type QuestionGroupItem } from '@/services/exam.service';

interface QuestionGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSelectGroup: (group: QuestionGroupItem, points: number) => void;
  existingGroupIds: Set<number>;
  courseId?: number;
  moduleId?: number;
  questionType: ExamKind;
  loading?: boolean;
}

export function QuestionGroupModal({
  open,
  onClose,
  onSelectGroup,
  existingGroupIds,
  courseId,
  moduleId,
  questionType,
  loading = false,
}: QuestionGroupModalProps) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [groups, setGroups] = useState<QuestionGroupItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<QuestionGroupItem | null>(null);
  const [points, setPoints] = useState<number>(1);
  const [fetching, setFetching] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newPassage, setNewPassage] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    examService
      .getQuestionGroups({
        courseId,
        moduleId,
        questionType,
        search: search.trim() || undefined,
      })
      .then((res) => {
        setGroups(res.content || []);
      })
      .catch(() => {
        setGroups([]);
      })
      .finally(() => {
        setFetching(false);
      });
  }, [open, search, courseId, moduleId, questionType]);

  useEffect(() => {
    if (open) {
      setTab('existing');
      setSelectedGroup(null);
      setPoints(1);
      setNewTitle('');
      setNewPassage('');
      setErrorMsg('');
    }
  }, [open]);

  const handleCreateNewGroup = async () => {
    if (!courseId) {
      setErrorMsg('Select a course for the exam before creating a question group.');
      return;
    }
    if (!newTitle.trim()) {
      setErrorMsg('Please enter a group title.');
      return;
    }
    if (!newPassage.trim()) {
      setErrorMsg('Please enter the passage text.');
      return;
    }
    setErrorMsg('');
    setCreating(true);
    try {
      const created = await examService.createQuestionGroup({
        courseId,
        moduleId,
        questionType,
        title: newTitle.trim(),
        passageText: newPassage.trim(),
      });
      onSelectGroup(created, Number(points) > 0 ? Number(points) : 1);
    } catch {
      setErrorMsg('Failed to create question group.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmSelect = () => {
    if (!selectedGroup) return;
    onSelectGroup(selectedGroup, Number(points) > 0 ? Number(points) : 1);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Reading Passage Group"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-content-secondary">Group Points:</span>
            <input
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading || creating}>
              Cancel
            </Button>
            {tab === 'existing' ? (
              <Button
                onClick={handleConfirmSelect}
                disabled={!selectedGroup || loading}
                loading={loading}
                icon={<Icon.Plus className="w-4 h-4" />}
              >
                Add Group
              </Button>
            ) : (
              <Button
                onClick={handleCreateNewGroup}
                disabled={!courseId || !newTitle.trim() || !newPassage.trim() || creating}
                loading={creating}
                icon={<Icon.Check className="w-4 h-4" />}
              >
                Create & Add
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => setTab('existing')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === 'existing'
                ? 'border-brand-ink text-brand-ink'
                : 'border-transparent text-content-subtle hover:text-content'
            }`}
          >
            Select Existing Group
          </button>
          <button
            type="button"
            onClick={() => setTab('new')}
            disabled={!courseId}
            title={!courseId ? 'Select a course for the exam before creating a question group.' : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              !courseId
                ? 'border-transparent text-content-subtle opacity-50 cursor-not-allowed'
                : tab === 'new'
                ? 'border-brand-ink text-brand-ink cursor-pointer'
                : 'border-transparent text-content-subtle hover:text-content cursor-pointer'
            }`}
          >
            Create New Group
          </button>
        </div>

        {!courseId && (
          <p className="text-xs text-content-subtle">
            Select a course for the exam before creating a question group.
          </p>
        )}

        {tab === 'existing' ? (
          <div className="space-y-3">
            <SearchInput
              placeholder="Search passage title or text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="border border-line rounded-[10px] overflow-hidden max-h-[300px] overflow-y-auto divide-y divide-line-faint">
              {fetching ? (
                <div className="py-10 text-center text-sm text-content-subtle">Loading groups…</div>
              ) : groups.length === 0 ? (
                <div className="py-10 text-center text-sm text-content-subtle">
                  No question groups found. Switch to "Create New Group" to author one.
                </div>
              ) : (
                groups.map((g) => {
                  const isAttached = existingGroupIds.has(g.groupId);
                  const isSelected = selectedGroup?.groupId === g.groupId;

                  return (
                    <div
                      key={g.groupId}
                      onClick={() => !isAttached && setSelectedGroup(g)}
                      className={`p-3.5 transition-colors ${
                        isAttached
                          ? 'bg-surface-muted/60 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary-light border-l-4 border-brand-ink cursor-pointer'
                          : 'hover:bg-surface-hover cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-content">{g.title}</h4>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="purple" className="text-2xs">
                            {g.questionCount} questions
                          </Badge>
                          {isAttached && (
                            <Badge variant="warning" className="text-2xs">
                              Already added
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-content-subtle mt-1.5 line-clamp-2 leading-relaxed">
                        {g.passageText}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {errorMsg && <p className="text-xs text-danger font-medium">{errorMsg}</p>}
            <Input
              label="Group Title *"
              placeholder="e.g. Reading Passage 1: Distributed Consensus"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium text-content-secondary block mb-1">
                Passage Text *
              </label>
              <textarea
                rows={5}
                className="w-full px-3 py-2 text-sm rounded-[10px] border border-line bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                placeholder="Enter shared reading passage text..."
                value={newPassage}
                onChange={(e) => setNewPassage(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

