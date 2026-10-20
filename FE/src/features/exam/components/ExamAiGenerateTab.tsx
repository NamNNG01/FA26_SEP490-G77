import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import {
  examService,
  type AiExamDraftResponse,
  type AiQuestionDraft,
  type Difficulty,
  type ExamDetail,
} from '@/services/exam.service';
import { courseService, type CourseSummaryItem, type CourseModuleResponse } from '@/services/course.service';

interface ExamAiGenerateTabProps {
  formKind: 'QUIZ' | 'ESSAY';
  onCreated: (createdExam: ExamDetail) => void;
  onCancel: () => void;
}

export function ExamAiGenerateTab({
  formKind,
  onCreated,
  onCancel,
}: ExamAiGenerateTabProps) {
  const toast = useToast();
  const abortCtrlRef = useRef<AbortController | null>(null);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);

  const [courseId, setCourseId] = useState<string>('');
  const [moduleId, setModuleId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [language, setLanguage] = useState<'en' | 'vi'>('en');
  const [useExistingBank, setUseExistingBank] = useState(true);

  const [diffDist, setDiffDist] = useState<{ EASY: number; MEDIUM: number; HARD: number }>({
    EASY: 4,
    MEDIUM: 4,
    HARD: 2,
  });

  const allowedTypes =
    formKind === 'QUIZ'
      ? ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MATCHING', 'ORDERING']
      : ['ESSAY'];

  const [typeCounts, setTypeCounts] = useState<Record<string, number>>(
    formKind === 'QUIZ'
      ? {
          SINGLE_CHOICE: 6,
          MULTIPLE_CHOICE: 2,
          TRUE_FALSE: 2,
          FILL_BLANK: 0,
          MATCHING: 0,
          ORDERING: 0,
        }
      : {
          ESSAY: 10,
        }
  );

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AiExamDraftResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savedQuestionIds, setSavedQuestionIds] = useState<number[]>([]);

  const MSG01 = 'This field is required.';
  const MSG06 = 'AI is generating questions, please wait...';
  const MSG08 = 'Failed to generate exam with AI. Please try again or reduce question count.';

  useEffect(() => {
    courseService.getCourses().then((res) => {
      setCourses(res.content || []);
      if (res.content?.length > 0 && !courseId) {
        setCourseId(String(res.content[0].courseId));
      }
    });
  }, []);

  useEffect(() => {
    if (courseId) {
      courseService.getCourseModules(courseId).then((mods) => {
        setModules(mods || []);
      });
    } else {
      setModules([]);
      setModuleId('');
    }
  }, [courseId]);

  const totalDiff = Number(diffDist.EASY || 0) + Number(diffDist.MEDIUM || 0) + Number(diffDist.HARD || 0);
  const totalTypes = Object.values(typeCounts).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const isDiffMatch = totalDiff === questionCount;
  const isTypeMatch = totalTypes === questionCount;
  const canGenerate = courseId !== '' && questionCount >= 1 && questionCount <= 50 && isDiffMatch && isTypeMatch;

  const handleGenerate = async () => {
    if (!courseId) {
      setFieldErrors({ courseId: MSG01 });
      return;
    }
    setFieldErrors({});
    setErrorMsg('');
    setGenerating(true);

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    const payloadQuestionTypes = Object.entries(typeCounts)
      .filter(([_, count]) => count > 0)
      .map(([questionType, count]) => ({ questionType, count }));

    try {
      const result = await examService.generateAiExam(
        {
          courseId: Number(courseId),
          moduleId: moduleId ? Number(moduleId) : undefined,
          title: title.trim() || undefined,
          questionCount,
          difficultyDistribution: diffDist,
          questionTypes: payloadQuestionTypes,
          durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : undefined,
          language,
          useExistingBank,
        },
        abortCtrl.signal
      );
      setDraft(result);
      setSavedQuestionIds([]);
    } catch (err: unknown) {
      const errorObj = err as {
        name?: string;
        response?: { status?: number; data?: { message?: string } };
      };
      if (errorObj?.name === 'CanceledError' || errorObj?.name === 'AbortError') {
        return;
      }
      if (errorObj?.response?.status === 429) {
        setErrorMsg('Daily AI generation quota exceeded for your course. Please try again tomorrow.');
      } else if (errorObj?.response?.status === 502) {
        setErrorMsg(MSG08);
      } else if (errorObj?.response?.status === 504) {
        setErrorMsg('AI request timed out after 90 seconds. ' + MSG08);
      } else if (errorObj?.response?.status === 400) {
        setErrorMsg(errorObj.response.data?.message || 'Invalid parameters for AI generation.');
      } else {
        setErrorMsg(errorObj?.response?.data?.message || MSG08);
      }
    } finally {
      setGenerating(false);
      abortCtrlRef.current = null;
    }
  };

  const handleCancelGenerate = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    setGenerating(false);
  };

  const updateDraftQuestion = (index: number, updated: Partial<AiQuestionDraft>) => {
    if (!draft) return;
    const questions = [...draft.questions];
    questions[index] = { ...questions[index], ...updated };
    setDraft({ ...draft, questions });
  };

  const removeDraftQuestion = (index: number) => {
    if (!draft) return;
    const questions = draft.questions.filter((_, i) => i !== index);
    setDraft({ ...draft, questions, questionCount: questions.length });
  };

  const validateDraftQuestion = (q: AiQuestionDraft): string | null => {
    if (!q.content.trim()) return 'Question content cannot be empty';
    if (q.questionType === 'SINGLE_CHOICE') {
      if (q.options.length < 2 || q.options.length > 6) return 'Single choice must have 2 to 6 options';
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) return 'Single choice must have exactly 1 correct answer';
    } else if (q.questionType === 'MULTIPLE_CHOICE') {
      if (q.options.length < 2 || q.options.length > 8) return 'Multiple choice must have 2 to 8 options';
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount < 1) return 'Multiple choice must have at least 1 correct answer';
    } else if (q.questionType === 'TRUE_FALSE') {
      if (q.options.length !== 2) return 'True/False question must have exactly 2 options';
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) return 'True/False question must have exactly 1 correct answer';
    } else if (q.questionType === 'MATCHING') {
      if (q.options.length % 2 !== 0) return 'Matching question must have an even number of options';
    } else if (q.questionType === 'ORDERING') {
      if (q.options.length < 2) return 'Ordering question must have at least 2 options';
    }
    return null;
  };

  const handleConfirmSave = async () => {
    if (!draft || draft.questions.length === 0) return;

    for (let i = 0; i < draft.questions.length; i++) {
      const err = validateDraftQuestion(draft.questions[i]);
      if (err) {
        setErrorMsg(`Question #${i + 1} validation failed: ${err}`);
        return;
      }
    }

    setSaving(true);
    setErrorMsg('');

    let finalQuestionIds = [...savedQuestionIds];

    try {
      if (finalQuestionIds.length === 0) {
        const questionsToSave = draft.questions.map((q) => ({
          content: q.content,
          questionType: q.questionType,
          difficulty: q.difficulty,
          status: 'ACTIVE',
          options: q.options,
          explanation: q.explanation,
        }));

        const batchRes = await examService.batchCreateQuestions({
          moduleId: moduleId ? Number(moduleId) : undefined,
          questions: questionsToSave,
        });

        finalQuestionIds = batchRes.map((r) => r.questionId);
        setSavedQuestionIds(finalQuestionIds);
      }

      const created = await examService.createExam({
        title: draft.title || title || 'AI Generated Exam',
        description: draft.description,
        courseId: Number(courseId),
        moduleId: moduleId ? Number(moduleId) : undefined,
        durationMinutes: draft.durationMinutes || durationMinutes || 45,
        isPractice: false,
        generationType: 'STATIC',
        questionIds: finalQuestionIds.map((qid, idx) => ({
          questionId: qid,
          points: 1,
          orderIndex: idx,
        })),
      });

      toast.success('Exam successfully created from AI draft.');
      onCreated(created);
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (finalQuestionIds.length > 0) {
        setErrorMsg(
          'Questions have already been saved to the Question Bank. Saving the exam failed. You can click Confirm & Save again to retry creating the exam without duplicating questions.'
        );
      } else {
        setErrorMsg(errorObj?.response?.data?.message || 'Failed to save generated questions or create exam.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!draft ? (
        <div className="card p-6 space-y-5 max-w-4xl">
          <div className="border-b border-line-soft pb-3">
            <h3 className="text-lg font-bold text-content flex items-center gap-2">
              <Icon.Zap className="w-5 h-5 text-brand-ink" />
              Configure AI Exam Generation
            </h3>
            <p className="text-xs text-content-subtle mt-1">
              Specify your syllabus requirements and AI will generate an editable exam draft without saving to database.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 text-xs text-danger bg-danger-light border border-danger-line rounded-[8px] flex items-center justify-between">
              <span>{errorMsg}</span>
              <Button size="sm" variant="outline" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label="Target Course *"
                value={courseId}
                onChange={(v) => {
                  setCourseId(v);
                  setModuleId('');
                }}
                options={[
                  { label: 'Select Course', value: '' },
                  ...courses.map((c) => ({ label: c.title, value: String(c.courseId) })),
                ]}
              />
              {fieldErrors.courseId && (
                <p className="text-xs text-danger mt-1">{fieldErrors.courseId}</p>
              )}
            </div>

            <Select
              label="Module Scope (optional)"
              value={moduleId}
              onChange={setModuleId}
              disabled={!courseId}
              options={[
                { label: 'All Modules in Course', value: '' },
                ...modules.map((m) => ({ label: m.title, value: String(m.moduleId) })),
              ]}
            />

            <Input
              label="Suggested Exam Title"
              placeholder="e.g. Midterm Comprehensive Quiz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">
                  Question Count (1-50) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="w-full px-3 py-1.5 text-sm rounded-[10px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-content-secondary block mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  className="w-full px-3 py-1.5 text-sm rounded-[10px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                />
              </div>
            </div>

            <Select
              label="Language"
              value={language}
              onChange={(v) => setLanguage(v as 'en' | 'vi')}
              options={[
                { label: 'English (en)', value: 'en' },
                { label: 'Tiếng Việt (vi)', value: 'vi' },
              ]}
            />

            <div className="flex items-center justify-between pt-6 px-1">
              <div>
                <span className="text-sm font-medium text-content-secondary block">
                  Prioritize Existing Bank Questions
                </span>
                <span className="text-2xs text-content-subtle">
                  Pull available questions first and synthesize AI only for shortfall.
                </span>
              </div>
              <Switch checked={useExistingBank} onChange={setUseExistingBank} />
            </div>
          </div>

          <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-content">Difficulty Distribution</h4>
              <span
                className={`text-xs font-semibold ${
                  isDiffMatch ? 'text-success' : 'text-danger'
                }`}
              >
                Current Total: {totalDiff} / {questionCount}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">Easy</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.EASY}
                  onChange={(e) =>
                    setDiffDist((prev) => ({ ...prev, EASY: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">Medium</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.MEDIUM}
                  onChange={(e) =>
                    setDiffDist((prev) => ({ ...prev, MEDIUM: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-content-secondary block mb-1">Hard</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                  value={diffDist.HARD}
                  onChange={(e) =>
                    setDiffDist((prev) => ({ ...prev, HARD: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-surface-muted/60 rounded-[10px] border border-line space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-content">Question Types Breakdown</h4>
              <span
                className={`text-xs font-semibold ${
                  isTypeMatch ? 'text-success' : 'text-danger'
                }`}
              >
                Current Total: {totalTypes} / {questionCount}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {allowedTypes.map((qt) => (
                <div key={qt}>
                  <label className="text-xs font-medium text-content-secondary block mb-1">
                    {qt.replace('_', ' ')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="w-full px-2.5 py-1 text-sm rounded-[8px] border border-line bg-surface"
                    value={typeCounts[qt] ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setTypeCounts((prev) => ({ ...prev, [qt]: val }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-soft">
            <Button variant="outline" onClick={onCancel} disabled={generating}>
              Cancel
            </Button>
            {generating ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-content-subtle animate-pulse">{MSG06}</span>
                <Button variant="danger" size="sm" onClick={handleCancelGenerate}>
                  Cancel Generation
                </Button>
              </div>
            ) : (
              <Button
                icon={<Icon.Zap className="w-4 h-4" />}
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                Generate Draft ({questionCount} Questions)
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-surface rounded-[12px] border border-line shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="purple" className="text-xs font-bold">
                  AI Draft
                </Badge>
                <h3 className="text-base font-bold text-content">{draft.title}</h3>
              </div>
              <p className="text-xs text-content-subtle mt-1">
                {draft.questions.length} questions synthesized · {draft.durationMinutes} min
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                Regenerate / Back
              </Button>
              <Button
                icon={<Icon.Check className="w-4 h-4" />}
                loading={saving}
                disabled={saving || draft.questions.length === 0}
                onClick={handleConfirmSave}
              >
                Confirm & Create Exam
              </Button>
            </div>
          </div>

          {draft.warnings && draft.warnings.length > 0 && (
            <div className="p-3 bg-warning-light/40 border border-warning-line rounded-[10px] text-xs text-warning-strong space-y-1">
              {draft.warnings.map((w, idx) => (
                <p key={idx}>⚠️ {w}</p>
              ))}
            </div>
          )}

          {errorMsg && (
            <div className="p-3 text-xs text-danger bg-danger-light border border-danger-line rounded-[8px]">
              {errorMsg}
            </div>
          )}

          <div className="space-y-4">
            {draft.questions.map((q, idx) => {
              const validationErr = validateDraftQuestion(q);

              return (
                <div
                  key={idx}
                  className={`card p-4 space-y-3 transition-colors ${
                    validationErr ? 'border-danger bg-danger-light/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-brand-light text-brand-ink flex items-center justify-center text-xs font-bold">
                        #{idx + 1}
                      </span>
                      <Badge variant="default" className="text-2xs font-semibold">
                        {q.questionType.replace('_', ' ')}
                      </Badge>
                      <Select
                        className="w-28 text-xs"
                        value={q.difficulty}
                        onChange={(v) => updateDraftQuestion(idx, { difficulty: v as Difficulty })}
                        options={[
                          { label: 'EASY', value: 'EASY' },
                          { label: 'MEDIUM', value: 'MEDIUM' },
                          { label: 'HARD', value: 'HARD' },
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraftQuestion(idx)}
                      className="text-content-subtle hover:text-danger p-1 rounded hover:bg-danger-light cursor-pointer"
                      title="Remove Question from Draft"
                    >
                      <Icon.Trash className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-content-secondary block mb-1">
                      Question Prompt
                    </label>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-1.5 text-sm rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                      value={q.content}
                      onChange={(e) => updateDraftQuestion(idx, { content: e.target.value })}
                    />
                  </div>

                  {q.options && q.options.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-content-secondary block">
                        Options & Correct Answers
                      </span>
                      <div className="space-y-1.5">
                        {q.options.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            className={`flex items-center gap-2 p-2 rounded-[8px] border text-xs ${
                              opt.isCorrect
                                ? 'border-success-line bg-success-light/40'
                                : 'border-line bg-surface'
                            }`}
                          >
                            <input
                              type={
                                q.questionType === 'SINGLE_CHOICE' || q.questionType === 'TRUE_FALSE'
                                  ? 'radio'
                                  : 'checkbox'
                              }
                              name={`correct-${idx}`}
                              checked={opt.isCorrect}
                              onChange={(e) => {
                                const newOpts = [...q.options];
                                if (
                                  q.questionType === 'SINGLE_CHOICE' ||
                                  q.questionType === 'TRUE_FALSE'
                                ) {
                                  newOpts.forEach((o, i) => {
                                    o.isCorrect = i === oIdx;
                                  });
                                } else {
                                  newOpts[oIdx].isCorrect = e.target.checked;
                                }
                                updateDraftQuestion(idx, { options: newOpts });
                              }}
                              className="cursor-pointer"
                            />
                            <input
                              type="text"
                              className="flex-1 px-2 py-1 text-xs rounded border border-line-soft bg-surface focus:outline-none"
                              value={opt.optionText}
                              onChange={(e) => {
                                const newOpts = [...q.options];
                                newOpts[oIdx].optionText = e.target.value;
                                updateDraftQuestion(idx, { options: newOpts });
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-content-secondary block mb-1">
                      Explanation / Key Points
                    </label>
                    <input
                      type="text"
                      className="w-full px-2.5 py-1 text-xs rounded-[8px] border border-line bg-surface focus:outline-none focus:ring-1 focus:ring-brand-ink"
                      value={q.explanation || ''}
                      onChange={(e) => updateDraftQuestion(idx, { explanation: e.target.value })}
                      placeholder="Rationale behind correct response..."
                    />
                  </div>

                  {validationErr && (
                    <p className="text-xs text-danger font-medium">⚠️ {validationErr}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

