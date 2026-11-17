package com.examprep.dto.student;

public record DiscussionListFilter(
        String scope,
        Long courseId,
        String tag,
        String approvalStatus,
        String status,
        String search,
        String sort,
        int page,
        int size
) {
    public static DiscussionListFilter publicFeed(String tag, String search, String sort, int page, int size) {
        return new DiscussionListFilter("PUBLIC", null, tag, null, null, search, sort, page, size);
    }
}
