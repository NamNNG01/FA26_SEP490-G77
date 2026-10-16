package com.examprep.dto;

import org.springframework.data.domain.Page;
import java.util.List;

public record PageResponse<T>(List<T> content, int page, int size, long totalElements,
                              int totalPages, boolean first, boolean last) {
    public static <T> PageResponse<T> from(Page<?> source, List<T> content) {
        return new PageResponse<>(content, source.getNumber(), source.getSize(), source.getTotalElements(),
                source.getTotalPages(), source.isFirst(), source.isLast());
    }
}
