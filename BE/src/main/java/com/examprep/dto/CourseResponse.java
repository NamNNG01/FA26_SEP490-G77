package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

// thumbnailUrl/description are always emitted (null when empty) despite the global non_null inclusion,
// matching the C-06/C-07 contract; modules and managers stay omitted on list items.
@JsonPropertyOrder({"courseId", "title", "slug", "categoryId", "categoryName", "managerId", "managerName", "managers", "thumbnailUrl",
        "price", "isPublished", "status", "moduleCount", "studentCount", "examCount", "description", "modules", "createdAt", "updatedAt"})
public record CourseResponse(Long courseId, String title, String slug, Long categoryId, String categoryName,
                             Long managerId, String managerName, List<Manager> managers,
                             @JsonInclude(JsonInclude.Include.ALWAYS) String thumbnailUrl,
                             BigDecimal price, Boolean isPublished, Status status, long moduleCount, long studentCount, long examCount,
                             Instant createdAt, Instant updatedAt, @JsonInclude(JsonInclude.Include.ALWAYS) String description,
                             List<ModuleResponse> modules) {
    public enum Status { DRAFT, READY_TO_PUBLISH, PUBLISHED }

    // Every assigned manager (primary first), from course_managers.
    public record Manager(Long userId, String fullName, boolean primary) {}
}
