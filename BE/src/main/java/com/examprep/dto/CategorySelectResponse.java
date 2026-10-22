package com.examprep.dto;

public record CategorySelectResponse(Long categoryId, String label, Long value, boolean disabled) {}
