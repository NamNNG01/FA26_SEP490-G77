import type { CourseStudentItem } from "@/services/course.service";

export function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

export function exportStudentsToCsv(students: CourseStudentItem[], courseTitle: string) {
  if (!students.length) return;
  const headers = ["User ID", "Full Name", "Email", "Enrolled At", "Status", "Progress (%)"];
  const rows = students.map((s) => [
    s.userId,
    `"${s.fullName.replace(/"/g, '""')}"`,
    `"${s.email.replace(/"/g, '""')}"`,
    `"${s.enrolledAt}"`,
    s.status,
    s.progress,
  ]);
  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `${courseTitle.replace(/\s+/g, "_")}_students_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
