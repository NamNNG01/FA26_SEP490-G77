package com.examprep.dto.student;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Request bodies of CD-04 (run) and CD-05 (submit), spec 19.2 / 19.3. */
public final class CodeExamRequests {
    private CodeExamRequests() {}

    /** Source is capped at 100 KB (spec 19.2). */
    public static final int MAX_SOURCE_CHARS = 100 * 1024;

    public record Run(
            @NotNull Long questionId,
            @NotBlank @Pattern(regexp = "JAVA|PYTHON|C|CPP") String language,
            @NotBlank @Size(max = 102400) String sourceCode,
            @Size(max = 100000) String stdin) {}

    public record Answer(
            @NotNull Long questionId,
            @NotBlank @Pattern(regexp = "JAVA|PYTHON|C|CPP") String language,
            @NotBlank @Size(max = 102400) String sourceCode) {}

    public record Submit(
            @NotNull Long examId,
            @NotEmpty @Valid @Size(max = 50) List<@NotNull Answer> answers) {}
}
