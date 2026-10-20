package com.examprep.dto;

import java.util.List;

public record CategoryAdminResponse(Long categoryId, String code, String name, Long parentId,
                                    Integer sortOrder, Boolean isActive, Boolean isDeleted,
                                    List<CategoryAdminResponse> children) {}
