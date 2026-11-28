import React from "react";
import { Table } from "@/components/ui/Table";
import { useManagerReview } from "../hooks/useManagerReview";
import { idOf, type Row } from "../utils/contentReviewHelpers";
import { ReviewFiltersBar } from "../components/content-review/ReviewFiltersBar";
import { buildReviewTableColumns } from "../components/content-review/reviewTableColumns";
import { ReviewDetailModal } from "../components/content-review/ReviewDetailModal";

export function ManagerReviewPage() {
  const rev = useManagerReview();

  const columns = buildReviewTableColumns({
    kind: rev.kind,
    studentNames: rev.studentNames,
    courseNameOf: rev.courseNameOf,
    moduleNameOf: rev.moduleNameOf,
  });

  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Content review</h1>
          <p className="mt-1 text-sm text-content-subtle">
            Review student questions and flashcard decks submitted for publication.
          </p>
        </div>
        <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary">
          {rev.pageData.totalElements || 0} submissions
        </div>
      </header>

      <ReviewFiltersBar
        kind={rev.kind}
        onSwitchKind={rev.switchKind}
        keyword={rev.keyword}
        onKeywordChange={rev.setKeyword}
        status={rev.status}
        onStatusChange={rev.setStatus}
        courseId={rev.courseId}
        onCourseChange={(value) => {
          rev.setCourseId(value);
          rev.setModuleId("");
        }}
        moduleId={rev.moduleId}
        onModuleChange={rev.setModuleId}
        contributorId={rev.contributorId}
        onContributorChange={rev.setContributorId}
        onContributorSearchChange={rev.setContributorSearch}
        studentsLoading={rev.studentsLoading}
        questionType={rev.questionType}
        onQuestionTypeChange={rev.setQuestionType}
        difficulty={rev.difficulty}
        onDifficultyChange={rev.setDifficulty}
        submittedFrom={rev.submittedFrom}
        onSubmittedFromChange={rev.setSubmittedFrom}
        submittedTo={rev.submittedTo}
        onSubmittedToChange={rev.setSubmittedTo}
        courseOptions={rev.courseOptions}
        moduleOptions={rev.moduleOptions}
        contributorOptions={rev.contributorOptions}
        busy={rev.busy}
        refreshing={rev.refreshing}
        onRefresh={() => void rev.refreshQueue()}
        onClear={() => void rev.clearFilters()}
        onSubmit={() => {
          rev.syncUrl(0);
          void rev.load(0);
        }}
      />

      {rev.notice && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900"
        >
          {rev.notice}
        </div>
      )}
      {rev.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {rev.error}
        </div>
      )}

      <div className="card overflow-hidden">
        <Table
          columns={columns}
          data={rev.rows.map((row) => ({ ...row, id: idOf(row, rev.kind) }))}
          unit="submissions"
          serverPagination={{
            page: rev.page + 1,
            total: rev.pageData.totalElements || 0,
            onChange: (value) => {
              rev.syncUrl(value - 1);
              void rev.load(value - 1);
            },
          }}
          onRowClick={(row) => void rev.open(row as Row)}
          emptyState={
            rev.busy ? "Loading submissions…" : "No submissions found. Try changing the filters."
          }
        />
      </div>

      <ReviewDetailModal
        kind={rev.kind}
        detail={rev.detail}
        detailLoading={rev.detailLoading}
        detailStatus={rev.detailStatus}
        questionDraft={rev.questionDraft}
        isOwnSubmission={rev.isOwnSubmission}
        canReviewDetail={rev.canReviewDetail}
        busy={rev.busy}
        cardsLoading={rev.cardsLoading}
        deckCardPage={rev.deckCardPage}
        error={rev.error}
        rejecting={rev.rejecting}
        confirmingApproval={rev.confirmingApproval}
        reason={rev.reason}
        approveNote={rev.approveNote}
        studentNames={rev.studentNames}
        courseNameOf={rev.courseNameOf}
        moduleNameOf={rev.moduleNameOf}
        onClose={rev.closeDetail}
        onReloadItem={(row, cardPage) => void rev.open(row, cardPage)}
        onReview={(decision) => void rev.review(decision)}
        onStartReject={() => {
          rev.setRejecting(true);
          rev.setConfirmingApproval(false);
          rev.setError("");
        }}
        onCancelReject={() => {
          rev.setRejecting(false);
          rev.setReason("");
          rev.setError("");
        }}
        onCancelApprove={() => {
          rev.setConfirmingApproval(false);
          rev.setApproveNote("");
          rev.setError("");
        }}
        onReasonChange={rev.setReason}
        onApproveNoteChange={rev.setApproveNote}
      />
    </main>
  );
}
