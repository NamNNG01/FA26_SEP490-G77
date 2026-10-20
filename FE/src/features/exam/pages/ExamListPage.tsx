import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import {
  examService,
  type ExamListItem,
  type ExamKind,
  type ExamStatus,
} from '@/services/exam.service';
import { courseService, type CourseSummaryItem, type CourseModuleResponse } from '@/services/course.service';

export function ExamListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const tabParam = (searchParams.get('tab') as ExamKind | 'all') || 'all';
  const searchParam = searchParams.get('search') || '';
  const courseParam = searchParams.get('courseId') || '';
  const moduleParam = searchParams.get('moduleId') || '';
  const statusParam = searchParams.get('status') || 'all';
  const pageParam = parseInt(searchParams.get('page') || '0', 10);

  const [activeTab, setActiveTab] = useState<ExamKind | 'all'>(tabParam);
  const [searchTerm, setSearchTerm] = useState(searchParam);
  const [selectedCourse, setSelectedCourse] = useState(courseParam);
  const [selectedModule, setSelectedModule] = useState(moduleParam);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [page, setPage] = useState(isNaN(pageParam) ? 0 : pageParam);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedExamIds, setSelectedExamIds] = useState<Set<number>>(new Set());

  const [statusDialogTarget, setStatusDialogTarget] = useState<{
    exam: ExamListItem;
    targetStatus: ExamStatus;
  } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusWarnings, setStatusWarnings] = useState<string[]>([]);

  const [deleteDialogTarget, setDeleteDialogTarget] = useState<ExamListItem | null>(null);
  const [deleteConflict409, setDeleteConflict409] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteSummary, setBulkDeleteSummary] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    courseService.getCourses().then((res) => {
      setCourses(res.content || []);
    });
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      courseService.getCourseModules(selectedCourse).then((mods) => {
        setModules(mods || []);
      });
    } else {
      setModules([]);
      setSelectedModule('');
    }
  }, [selectedCourse]);

  const updateUrlParams = (updates: Record<string, string | number | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === '' || val === 'all' || (key === 'page' && val === 0)) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      return next;
    });
  };

  const fetchExams = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLoading(true);
    setError(null);

    examService
      .getExams({
        search: searchTerm.trim() || undefined,
        courseId: selectedCourse ? Number(selectedCourse) : undefined,
        moduleId: selectedModule ? Number(selectedModule) : undefined,
        status: selectedStatus !== 'all' ? (selectedStatus as ExamStatus) : undefined,
        examKind: activeTab !== 'all' ? activeTab : undefined,
        page,
        size: 15,
      })
      .then((res) => {
        setExams(res.content || []);
        setTotalElements(res.totalElements || 0);
        setTotalPages(res.totalPages || 1);
        setSelectedExamIds(new Set());
      })
      .catch((err: unknown) => {
        const errorObj = err as { name?: string; response?: { status?: number; data?: { message?: string } } };
        if (errorObj?.name === 'CanceledError' || errorObj?.name === 'AbortError') {
          return;
        }
        if (errorObj?.response?.status === 403) {
          setError('You do not have permission to view exams for this course.');
        } else {
          setError(errorObj?.response?.data?.message || 'Failed to load exams.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchExams();
    }, 400);

    return () => clearTimeout(handler);
  }, [activeTab, searchTerm, selectedCourse, selectedModule, selectedStatus, page]);

  const handleTabChange = (tab: ExamKind | 'all') => {
    setActiveTab(tab);
    setPage(0);
    updateUrlParams({ tab, page: 0 });
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(0);
    updateUrlParams({ search: val, page: 0 });
  };

  const handleCourseChange = (val: string) => {
    setSelectedCourse(val);
    setSelectedModule('');
    setPage(0);
    updateUrlParams({ courseId: val, moduleId: '', page: 0 });
  };

  const handleModuleChange = (val: string) => {
    setSelectedModule(val);
    setPage(0);
    updateUrlParams({ moduleId: val, page: 0 });
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    setPage(0);
    updateUrlParams({ status: val, page: 0 });
  };

  const handleExportCsv = () => {
    if (exams.length === 0) {
      toast.warning('No exam rows to export.');
      return;
    }

    const headers = [
      'ID',
      'Title',
      'Exam Kind',
      'Course',
      'Module',
      'Questions',
      'Total Points',
      'Duration (min)',
      'Status',
      'Generation Type',
      'Practice',
      'Created At',
    ];

    const rows = exams.map((e) => [
      e.examId,
      `"${(e.title || '').replace(/"/g, '""')}"`,
      e.examKind,
      `"${(e.courseName || '').replace(/"/g, '""')}"`,
      `"${(e.moduleName || '').replace(/"/g, '""')}"`,
      e.questionCount,
      e.totalPoints,
      e.durationMinutes,
      e.status,
      e.generationType,
      e.isPractice ? 'Yes' : 'No',
      `"${new Date(e.createdAt).toLocaleString()}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `exams_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Exams exported to CSV.');
  };

  const handleEditExam = (exam: ExamListItem) => {
    if (exam.examKind === 'QUIZ') {
      navigate(`/manager/exams/quiz/${exam.examId}`);
    } else if (exam.examKind === 'ESSAY') {
      navigate(`/manager/exams/essay/${exam.examId}`);
    }
  };

  const handleApplyStatusChange = async () => {
    if (!statusDialogTarget) return;
    setStatusUpdating(true);
    setStatusWarnings([]);

    try {
      const res = await examService.patchPublishExam(
        statusDialogTarget.exam.examId,
        statusDialogTarget.targetStatus
      );

      setExams((prev) =>
        prev.map((e) =>
          e.examId === statusDialogTarget.exam.examId ? { ...e, status: res.status } : e
        )
      );

      if (res.warnings && res.warnings.length > 0) {
        setStatusWarnings(res.warnings);
        toast.warning(`Exam updated to ${res.status} with warnings.`);
      } else {
        toast.success(`Exam successfully updated to ${res.status}.`);
        setStatusDialogTarget(null);
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number; data?: { message?: string } } };
      if (errorObj?.response?.status === 400) {
        toast.error(errorObj.response.data?.message || 'Exam has 0 questions and cannot be published.');
      } else {
        toast.error(errorObj?.response?.data?.message || 'Failed to update exam status.');
      }
      setStatusDialogTarget(null);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteDialogTarget) return;
    setDeleting(true);

    try {
      await examService.deleteExam(deleteDialogTarget.examId);
      toast.success('Exam deleted successfully.');
      setDeleteDialogTarget(null);
      setDeleteConflict409(false);
      fetchExams();
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number } };
      if (errorObj?.response?.status === 409) {
        setDeleteConflict409(true);
      } else {
        toast.error('Failed to delete exam.');
        setDeleteDialogTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedExamIds.size === 0) return;
    setBulkDeleting(true);
    let success = 0;
    let failed = 0;

    for (const examId of selectedExamIds) {
      try {
        await examService.deleteExam(examId);
        success++;
      } catch {
        failed++;
      }
    }

    setBulkDeleteSummary({ success, failed });
    setBulkDeleting(false);
    fetchExams();
  };

  const allPageIds = useMemo(() => exams.map((e) => e.examId), [exams]);
  const isAllChecked = allPageIds.length > 0 && allPageIds.every((id) => selectedExamIds.has(id));
  const isSomeChecked = allPageIds.some((id) => selectedExamIds.has(id));

  const toggleSelectAll = () => {
    if (isAllChecked) {
      setSelectedExamIds(new Set());
    } else {
      setSelectedExamIds(new Set(allPageIds));
    }
  };

  const toggleSelectRow = (examId: number) => {
    setSelectedExamIds((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) next.delete(examId);
      else next.add(examId);
      return next;
    });
  };

  const startShowing = totalElements === 0 ? 0 : page * 15 + 1;
  const endShowing = Math.min((page + 1) * 15, totalElements);

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">Exams</h2>
          <p className="text-xs text-content-subtle mt-0.5">
            Manage course examinations, questionnaires, and essay evaluations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedExamIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              loading={bulkDeleting}
              icon={<Icon.Trash className="w-4 h-4" />}
              onClick={handleBulkDelete}
            >
              Bulk Delete ({selectedExamIds.size})
            </Button>
          )}

          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            onClick={handleExportCsv}
          >
            Export CSV
          </Button>

          <Dropdown
            trigger={
              <Button icon={<Icon.Plus className="w-4 h-4" />}>
                New Exam <Icon.ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            }
            items={[
              {
                label: 'Quiz Exam (Objective)',
                icon: <Icon.HelpCircle className="w-4 h-4" />,
                onClick: () => navigate('/manager/exams/quiz/new'),
              },
              {
                label: 'Essay Exam (Free Response)',
                icon: <Icon.FileText className="w-4 h-4" />,
                onClick: () => navigate('/manager/exams/essay/new'),
              },
            ]}
          />
        </div>
      </div>

      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => handleTabChange('all')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'border-brand-ink text-brand-ink'
              : 'border-transparent text-content-subtle hover:text-content'
          }`}
        >
          All Exams
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('QUIZ')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'QUIZ'
              ? 'border-brand-ink text-brand-ink'
              : 'border-transparent text-content-subtle hover:text-content'
          }`}
        >
          <Icon.HelpCircle className="w-4 h-4" />
          Quiz
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('ESSAY')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ESSAY'
              ? 'border-brand-ink text-brand-ink'
              : 'border-transparent text-content-subtle hover:text-content'
          }`}
        >
          <Icon.FileText className="w-4 h-4" />
          Essay
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
          <SearchInput
            className="w-full sm:w-60"
            placeholder="Search exams…"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />

          <Select
            className="w-full sm:w-52"
            value={selectedCourse}
            onChange={handleCourseChange}
            options={[
              { label: 'All Courses', value: '' },
              ...courses.map((c) => ({ label: c.title, value: String(c.courseId) })),
            ]}
          />

          <Select
            className="w-full sm:w-48"
            value={selectedModule}
            disabled={!selectedCourse}
            onChange={handleModuleChange}
            options={[
              { label: 'All Modules', value: '' },
              ...modules.map((m) => ({ label: m.title, value: String(m.moduleId) })),
            ]}
          />

          <Select
            className="w-full sm:w-36"
            value={selectedStatus}
            onChange={handleStatusChange}
            options={[
              { label: 'All Status', value: 'all' },
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Published', value: 'PUBLISHED' },
              { label: 'Archived', value: 'ARCHIVED' },
            ]}
          />

          <div className="flex-1" />
          <Badge variant="default" className="font-semibold text-xs">
            {totalElements} active exams
          </Badge>
        </div>

        {error ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchExams}>
              Thử lại
            </Button>
          </div>
        ) : loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        ) : exams.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Icon.ClipboardList className="w-10 h-10 mx-auto text-content-subtle" />
            <h4 className="text-base font-semibold text-content">No exams found</h4>
            <p className="text-xs text-content-subtle max-w-sm mx-auto">
              There are no exams matching your search criteria. Create a new Quiz or Essay exam to get started.
            </p>
            <div className="pt-2">
              <Button onClick={() => navigate('/manager/exams/quiz/new')} icon={<Icon.Plus className="w-4 h-4" />}>
                New Exam
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-soft text-left text-xs font-semibold text-content-soft uppercase tracking-wide">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isAllChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeChecked && !isAllChecked;
                      }}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3">Exam Title</th>
                  <th className="px-3 py-3">Course</th>
                  <th className="px-3 py-3">Module</th>
                  <th className="px-3 py-3">Kind</th>
                  <th className="px-3 py-3 text-center">Questions</th>
                  <th className="px-3 py-3 text-center">Points</th>
                  <th className="px-3 py-3 text-center">Duration</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="w-16 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-faint text-sm">
                {exams.map((exam) => {
                  const isChecked = selectedExamIds.has(exam.examId);
                  const isSupportedKind = exam.examKind === 'QUIZ' || exam.examKind === 'ESSAY';

                  return (
                    <tr
                      key={exam.examId}
                      className={`hover:bg-surface-hover transition-colors ${
                        isChecked ? 'bg-primary-light/40' : ''
                      }`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(exam.examId)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-content max-w-xs truncate" title={exam.title}>
                        {exam.title}
                      </td>
                      <td className="px-3 py-3 text-content-secondary max-w-[150px] truncate" title={exam.courseName}>
                        {exam.courseName}
                      </td>
                      <td className="px-3 py-3 text-content-subtle max-w-[130px] truncate" title={exam.moduleName || '—'}>
                        {exam.moduleName || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant={
                            exam.examKind === 'QUIZ'
                              ? 'purple'
                              : exam.examKind === 'ESSAY'
                              ? 'default'
                              : 'warning'
                          }
                          className="text-2xs"
                        >
                          {exam.examKind}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-center text-content-secondary font-medium">
                        {exam.questionCount}
                      </td>
                      <td className="px-3 py-3 text-center text-brand-ink font-semibold">
                        {exam.totalPoints}
                      </td>
                      <td className="px-3 py-3 text-center text-content-secondary">
                        {exam.durationMinutes}m
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge
                          variant={
                            exam.status === 'PUBLISHED'
                              ? 'success'
                              : exam.status === 'ARCHIVED'
                              ? 'default'
                              : 'warning'
                          }
                          className="text-2xs"
                        >
                          {exam.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-content-subtle whitespace-nowrap">
                        {new Date(exam.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Dropdown
                          trigger={
                            <button className="p-1.5 hover:bg-surface-hover rounded-[6px] text-content-subtle hover:text-content cursor-pointer">
                              <Icon.MoreHorizontal className="w-4 h-4" />
                            </button>
                          }
                          items={[
                            {
                              label: isSupportedKind ? 'Edit' : 'Edit (Later Version)',
                              icon: <Icon.Edit className="w-4 h-4" />,
                              disabled: !isSupportedKind,
                              onClick: () => handleEditExam(exam),
                            },
                            {
                              label: exam.status === 'PUBLISHED' ? 'Unpublish to Draft' : 'Publish',
                              icon: exam.status === 'PUBLISHED' ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.CheckCircle className="w-4 h-4" />,
                              disabled:
                                exam.status !== 'PUBLISHED' &&
                                exam.questionCount === 0 &&
                                exam.generationType === 'STATIC',
                              onClick: () =>
                                setStatusDialogTarget({
                                  exam,
                                  targetStatus: exam.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED',
                                }),
                            },
                            {
                              label: 'Archive',
                              icon: <Icon.Archive className="w-4 h-4" />,
                              disabled: exam.status === 'ARCHIVED',
                              onClick: () =>
                                setStatusDialogTarget({
                                  exam,
                                  targetStatus: 'ARCHIVED',
                                }),
                            },
                            { divider: true } as { label: string; divider: true },
                            {
                              label: 'Delete',
                              icon: <Icon.Trash className="w-4 h-4" />,
                              danger: true,
                              onClick: () => {
                                setDeleteConflict409(false);
                                setDeleteDialogTarget(exam);
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-line-soft text-xs text-content-subtle">
          <span>
            Showing {startShowing}–{endShowing} of {totalElements}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const prevPage = Math.max(0, page - 1);
                setPage(prevPage);
                updateUrlParams({ page: prevPage });
              }}
              disabled={page === 0 || loading}
              className="px-3 py-1 rounded border border-line hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="px-2">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => {
                const nextPage = Math.min(totalPages - 1, page + 1);
                setPage(nextPage);
                updateUrlParams({ page: nextPage });
              }}
              disabled={page >= totalPages - 1 || loading}
              className="px-3 py-1 rounded border border-line hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={statusDialogTarget !== null}
        onClose={() => {
          setStatusDialogTarget(null);
          setStatusWarnings([]);
        }}
        title={`Confirm ${statusDialogTarget?.targetStatus}`}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => {
                setStatusDialogTarget(null);
                setStatusWarnings([]);
              }}
              disabled={statusUpdating}
            >
              {statusWarnings.length > 0 ? 'Close' : 'Cancel'}
            </Button>
            {statusWarnings.length === 0 && (
              <Button
                onClick={handleApplyStatusChange}
                loading={statusUpdating}
                icon={<Icon.Check className="w-4 h-4" />}
              >
                Confirm
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3 text-sm text-content">
          <p>
            Are you sure you want to change the status of <strong>"{statusDialogTarget?.exam.title}"</strong> to{' '}
            <strong className="text-brand-ink">{statusDialogTarget?.targetStatus}</strong>?
          </p>

          {statusWarnings.length > 0 && (
            <div className="p-3 bg-warning-light/40 border border-warning-line rounded-[8px] space-y-1 text-xs text-warning-strong">
              <p className="font-semibold">Published successfully with warnings:</p>
              {statusWarnings.map((w, idx) => (
                <p key={idx}>• {w}</p>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={deleteDialogTarget !== null}
        onClose={() => {
          setDeleteDialogTarget(null);
          setDeleteConflict409(false);
        }}
        title={deleteConflict409 ? 'Cannot Delete Active Exam (409)' : 'Delete Exam'}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogTarget(null);
                setDeleteConflict409(false);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            {deleteConflict409 ? (
              <Button
                icon={<Icon.Archive className="w-4 h-4" />}
                onClick={async () => {
                  if (!deleteDialogTarget) return;
                  try {
                    await examService.patchPublishExam(deleteDialogTarget.examId, 'ARCHIVED');
                  } catch (err: unknown) {
                    const errorObj = err as { response?: { data?: { message?: string } } };
                    toast.error(errorObj?.response?.data?.message || 'Failed to archive exam.');
                    return;
                  }
                  toast.success('Exam archived successfully.');
                  setDeleteDialogTarget(null);
                  setDeleteConflict409(false);
                  fetchExams();
                }}
              >
                Archive Exam Instead
              </Button>
            ) : (
              <Button variant="danger" onClick={handleDeleteExam} loading={deleting}>
                Delete Permanently
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3 text-sm text-content">
          {deleteConflict409 ? (
            <p className="text-danger font-medium text-xs leading-relaxed">
              This exam cannot be permanently deleted because students have already submitted attempts for it. Please Archive the exam instead to preserve student grading histories.
            </p>
          ) : (
            <div className="space-y-2 text-xs text-content-secondary leading-relaxed">
              <p>
                Are you sure you want to permanently delete <strong>"{deleteDialogTarget?.title}"</strong>?
              </p>
              <div className="p-2.5 bg-surface-muted rounded-[8px] border border-line space-y-1 text-2xs text-content-subtle">
                <p><strong>Delete:</strong> Permanently removes draft exam with no test submissions.</p>
                <p><strong>Archive:</strong> Preserves past attempt histories while hiding exam from new enrollments.</p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={bulkDeleteSummary !== null}
        onClose={() => setBulkDeleteSummary(null)}
        title="Bulk Delete Summary"
        size="sm"
        footer={
          <Button onClick={() => setBulkDeleteSummary(null)}>
            Done
          </Button>
        }
      >
        <div className="space-y-2 text-sm text-content">
          <p className="text-success font-medium">
            Successfully deleted: {bulkDeleteSummary?.success} exam(s).
          </p>
          {bulkDeleteSummary && bulkDeleteSummary.failed > 0 && (
            <p className="text-danger font-medium">
              Failed to delete: {bulkDeleteSummary.failed} exam(s) (e.g. exams with student attempts).
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}