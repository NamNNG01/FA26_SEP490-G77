import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQuietRefresh } from "@/hooks/useAutoRefresh";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { studentCourseService, type MyCourse } from "@/services/studentCourse.service";
import type { StudentPage } from "@/services/studentLearning.service";
import {
  studentContestService,
  type ContestHistoryItem,
  type ContestStatus,
  type StudentContest,
} from "@/services/studentContest.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from "../studentUi";
import {
  dateFilter,
  EMPTY_PAGE,
  formatDate,
  LIST_TABS,
  PAGE_SIZE,
  STATUS_OPTIONS,
  StatusBadge,
} from "./contestHelpers";
import { ContestCard } from "./ContestCard";

type Course = Pick<MyCourse, "courseId" | "title">;

export function ContestListView() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState(LIST_TABS[0]);
  const [page, setPage] = useState(1);
  const [contestPage, setContestPage] = useState<StudentPage<StudentContest>>(() => EMPTY_PAGE());
  const [historyPage, setHistoryPage] = useState<StudentPage<ContestHistoryItem>>(() =>
    EMPTY_PAGE(),
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReload((v) => v + 1));
  const [status, setStatus] = useState("");
  const [courseId, setCourseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const isHistory = tab === "History";

  useEffect(() => {
    let cancelled = false;
    studentCourseService
      .getMyCourses({ page: 0, size: 100 })
      .then((result) => {
        if (!cancelled) {
          setCourses(
            result.content
              .filter((course) => course.status !== "CANCELLED")
              .map(({ courseId: cid, title }) => ({ courseId: cid, title }))
              .sort((a, b) => a.title.localeCompare(b.title)),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const quiet = takeQuiet();
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    const filters = {
      courseId: courseId ? Number(courseId) : undefined,
      from: dateFilter(from),
      to: dateFilter(to, true),
      page: page - 1,
      size: PAGE_SIZE,
    };
    const request = isHistory
      ? studentContestService.getHistory(filters)
      : studentContestService.getContests({
          ...filters,
          status: status ? (status as ContestStatus) : undefined,
        });
    request
      .then((result) => {
        if (cancelled) return;
        if (isHistory) setHistoryPage(result as StudentPage<ContestHistoryItem>);
        else setContestPage(result as StudentPage<StudentContest>);
      })
      .catch((err) => {
        if (cancelled || quiet) return;
        const message = getApiErrorMessage(err, "Failed to load contests.");
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, from, isHistory, page, reload, status, to, toast]);

  const rows = isHistory ? historyPage.content : contestPage.content;
  const totalRows = isHistory ? historyPage.totalElements : contestPage.totalElements;
  const filtersActive = Boolean((!isHistory && status) || courseId || from || to);

  const chooseTab = (next: string) => {
    setTab(next);
    setPage(1);
    setStatus("");
    setCourseId("");
  };

  const resetFilters = () => {
    setStatus("");
    setCourseId("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const open = (id: number) => navigate(`${ROUTES.studentContests}/${id}`);

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="Contests"
        subtitle="Join a contest, compete with other students, and claim your rewards."
      />
      <Tabs tabs={LIST_TABS} active={tab} onChange={chooseTab} variant="underline" />

      <section className="card p-4">
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isHistory ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
        >
          <SearchableSelect
            aria-label="Course"
            value={courseId}
            onChange={(v) => {
              setCourseId(v);
              setPage(1);
            }}
            options={[
              { label: "All courses", value: "" },
              ...courses.map((c) => ({
                label: c.title,
                value: String(c.courseId),
              })),
            ]}
            placeholder="All courses"
            searchPlaceholder="Search courses…"
          />
          {!isHistory && (
            <Select
              aria-label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
            />
          )}
          <Input
            aria-label="Starts from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            aria-label="Starts until"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Icon.X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </section>

      {error ? (
        <LoadError message={error} onRetry={() => setReload((v) => v + 1)} />
      ) : loading ? (
        <div className="card p-8 text-sm text-content-subtle">Loading contests…</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Trophy className="w-7 h-7" />}
            title={
              filtersActive
                ? "No contests match your filters"
                : isHistory
                  ? "No contest history"
                  : "No contests yet"
            }
            message={
              filtersActive
                ? "Try another course, status or date."
                : isHistory
                  ? "Contests you join will appear here."
                  : "New contests will appear here."
            }
          />
        </div>
      ) : isHistory ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {(rows as ContestHistoryItem[]).map((item) => (
              <li key={item.contestId} className="flex flex-wrap items-center gap-3 px-4 py-4">
                <Icon.Trophy className="h-5 w-5 text-warning" />
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold text-content">{item.title}</p>
                  <p className="text-xs text-content-subtle">
                    {item.course ? `${item.course.title} · ` : ""}
                    {item.startTime
                      ? `Starts ${formatDate(item.startTime)}`
                      : `Joined ${formatDate(item.registeredAt)}`}
                  </p>
                </div>
                <StatusBadge status={item.status} />
                <span className="text-sm text-content-secondary">
                  {item.rank != null ? `Rank #${item.rank}` : "—"} · {item.score ?? "No score"}
                </span>
                <Button size="sm" variant="outline" onClick={() => open(item.contestId)}>
                  Details
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination
              page={page}
              total={totalRows}
              perPage={PAGE_SIZE}
              onChange={setPage}
              unit="contests"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {(rows as StudentContest[]).map((contest) => (
              <ContestCard
                key={contest.contestId}
                contest={contest}
                onOpen={() => open(contest.contestId)}
              />
            ))}
          </div>
          <div className="card">
            <Pagination
              page={page}
              total={totalRows}
              perPage={PAGE_SIZE}
              onChange={setPage}
              unit="contests"
            />
          </div>
        </>
      )}
    </div>
  );
}
