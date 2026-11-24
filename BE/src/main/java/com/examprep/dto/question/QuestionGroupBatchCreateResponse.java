package com.examprep.dto.question;

import com.examprep.dto.QuestionGroupResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionGroupBatchCreateResponse {

    private QuestionGroupResponse group;
    private List<QuestionDetailDto> questions;
}
