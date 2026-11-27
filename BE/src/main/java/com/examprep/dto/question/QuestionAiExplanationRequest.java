package com.examprep.dto.question;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class QuestionAiExplanationRequest {

    @NotEmpty(message = "questionIds must contain 1 to 500 question ids")
    @Size(max = 500, message = "questionIds must contain 1 to 500 question ids")
    private List<@NotNull(message = "questionIds must not contain null") @Positive(message = "questionIds must be positive") Long> questionIds;

    private boolean overwrite;
}
