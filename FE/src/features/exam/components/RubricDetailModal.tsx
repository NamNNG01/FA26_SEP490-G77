import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';
import { examService, type RubricCriterion } from '@/services/exam.service';
import { getApiErrorMessage } from '@/utils/apiError';

interface RubricDetailModalProps {
  open: boolean;
  questionId: number | null;
  questionContent?: string;
  onClose: () => void;
  onSaved: (questionId: number) => void;
}

export function RubricDetailModal({
  open,
  questionId,
  questionContent,
  onClose,
  onSaved,
}: RubricDetailModalProps) {
  const [criteria, setCriteria] = useState<RubricCriterion[]>([
    { name: '', maxScore: 5, weight: 50, descriptors: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [invalidRowIdx, setInvalidRowIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !questionId) return;
    setLoading(true);
    setErrorMsg('');
    setLoadFailed(false);
    setInvalidRowIdx(null);
    examService
      .getQuestionById(questionId)
      .then((q) => {
        if (q.essayGradingRubric && q.essayGradingRubric.criteria?.length > 0) {
          setCriteria(q.essayGradingRubric.criteria);
          setNotes(q.essayGradingRubric.notes || '');
        } else {
          setCriteria([{ name: '', maxScore: 5, weight: 100, descriptors: '' }]);
          setNotes('');
        }
      })
      .catch((err) => {
        setLoadFailed(true);
        setErrorMsg(getApiErrorMessage(err, 'Failed to load grading rubric.'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, questionId]);

  const totalScore = criteria.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);
  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  const addCriterion = () => {
    setCriteria((prev) => [...prev, { name: '', maxScore: 5, weight: 0, descriptors: '' }]);
  };

  const removeCriterion = (index: number) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCriterion = (index: number, field: keyof RubricCriterion, val: string | number) => {
    setCriteria((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
    if (invalidRowIdx === index) {
      setInvalidRowIdx(null);
      setErrorMsg('');
    }
  };

  const handleSave = async () => {
    if (!questionId) return;
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (!c.name.trim()) {
        setInvalidRowIdx(i);
        setErrorMsg(`Criterion #${i + 1} name is required.`);
        return;
      }
      if (Number(c.maxScore) <= 0) {
        setInvalidRowIdx(i);
        setErrorMsg(`Criterion #${i + 1} max score must be greater than 0.`);
        return;
      }
    }

    setSaving(true);
    setErrorMsg('');
    try {
      await examService.updateRubric(questionId, {
        criteria,
        totalPoints: totalScore,
        notes: notes.trim() || undefined,
      });
      onSaved(questionId);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to save grading rubric.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Essay Grading Rubric Detail"
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4 text-sm">
            <span>
              Live Total Score: <strong className="text-content font-bold">{totalScore} pts</strong>
            </span>
            <span className={totalWeight !== 100 ? 'text-warning font-medium' : 'text-success font-medium'}>
              Total Weight: {totalWeight}% {totalWeight !== 100 && '(suggested: 100%)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={criteria.length === 0 || saving || loading || loadFailed}
              loading={saving}
              icon={<Icon.Check className="w-4 h-4" />}
            >
              Save Rubric
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {questionContent && (
          <div className="p-3 bg-surface-muted rounded-[10px] border border-line">
            <span className="text-2xs uppercase tracking-wider text-content-subtle font-semibold block mb-1">
              Question Prompt
            </span>
            <p className="text-sm text-content font-medium leading-relaxed">{questionContent}</p>
          </div>
        )}

        <div className="text-xs text-content-subtle bg-info-light/40 border border-info-line/50 p-2.5 rounded-[8px]">
          Note: Rubric belongs to the question entity in Question Bank. Editing it affects all exams referencing this question.
        </div>

        {errorMsg && (
          <div className="p-3 text-xs text-danger bg-danger-light border border-danger-line rounded-[8px]">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-content">Evaluation Criteria</h4>
            <Button variant="secondary" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={addCriterion}>
              Add Criterion
            </Button>
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {criteria.map((c, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-[10px] border space-y-2.5 transition-colors ${
                  invalidRowIdx === idx ? 'border-danger bg-danger-light/10' : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <Input
                      label={`Criterion #${idx + 1} Name *`}
                      placeholder="e.g. Content Relevance & Argumentation"
                      value={c.name}
                      onChange={(e) => updateCriterion(idx, 'name', e.target.value)}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-medium text-content-secondary block mb-1">Max Score *</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className="w-full px-2.5 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                      value={c.maxScore}
                      onChange={(e) => updateCriterion(idx, 'maxScore', Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-medium text-content-secondary block mb-1">Weight (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full px-2.5 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                      value={c.weight}
                      onChange={(e) => updateCriterion(idx, 'weight', Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="pt-5">
                    <button
                      type="button"
                      disabled={criteria.length <= 1}
                      onClick={() => removeCriterion(idx)}
                      className="p-2 text-content-subtle hover:text-danger rounded-[6px] hover:bg-danger-light disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      title="Remove Criterion"
                    >
                      <Icon.Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-content-secondary block mb-1">
                    Performance Level Descriptors
                  </label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-1.5 text-xs rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                    placeholder="Describe expectations for full, partial, and minimal credit..."
                    value={c.descriptors || ''}
                    onChange={(e) => updateCriterion(idx, 'descriptors', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-content-secondary block mb-1">
            General Notes / Penalty Guidelines (optional)
          </label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 text-xs rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
            placeholder="e.g. Deduct 2 points for every 100 words exceeding word limit."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

