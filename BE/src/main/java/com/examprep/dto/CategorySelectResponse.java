package com.examprep.dto;

import java.util.List;

public record CategorySelectResponse(Long categoryId, String label, Long value, boolean disabled,
                                     List<CategorySelectResponse> children) {}
