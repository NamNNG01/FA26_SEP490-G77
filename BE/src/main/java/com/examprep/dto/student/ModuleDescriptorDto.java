package com.examprep.dto.student;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ModuleDescriptorDto(
        Long moduleId,
        String title,
        String description
) {}
