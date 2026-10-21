package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * UM-01: page of admin user rows plus the overview counters.
 * Mirrors {@link PageResponse} field-for-field and appends {@code stats}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserPageResponse {

    private List<AdminUserItem> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private boolean first;
    private boolean last;
    private AdminUserListStats stats;

    public static AdminUserPageResponse of(Page<AdminUserItem> page, AdminUserListStats stats) {
        return AdminUserPageResponse.builder()
                .content(page.getContent())
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .first(page.isFirst())
                .last(page.isLast())
                .stats(stats)
                .build();
    }
}
