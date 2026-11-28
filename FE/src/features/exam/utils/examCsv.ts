import type { ExamListItem } from "@/services/exam.service";

export function exportExamsToCsv(exams: ExamListItem[]): boolean {
  if (exams.length === 0) {
    return false;
  }

  const headers = [
    "ID",
    "Title",
    "Exam Kind",
    "Course",
    "Module",
    "Questions",
    "Max Score",
    "Duration (min)",
    "Status",
    "Generation Type",
    "Mode",
    "Created At",
  ];

  const rows = exams.map((e) => [
    e.examId,
    `"${(e.title || "").replace(/"/g, '""')}"`,
    e.examKind,
    `"${(e.courseName || "").replace(/"/g, '""')}"`,
    `"${(e.moduleName || "").replace(/"/g, '""')}"`,
    e.questionCount,
    e.maxScore ?? e.totalPoints ?? 0,
    e.durationMinutes,
    e.status,
    e.generationType,
    e.mode ?? "EXAM",
    `"${new Date(e.createdAt).toLocaleString()}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `exams_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
