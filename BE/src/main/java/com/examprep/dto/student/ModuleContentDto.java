package com.examprep.dto.student;

import java.util.List;

public record ModuleContentDto(
        ModuleDescriptorDto module,
        List<CourseExamDto> exams,
        List<DeckDto> decks
) {}
