package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.student.CodeExamRequests;
import com.examprep.dto.student.CodeExamResponses;

import java.util.List;

/**
 * The five coding-test APIs (spec 19.1-19.5, CD-03 … CD-07): list the code questions of an exam,
 * run source against a public sample, submit answers judged on every fixture (public and hidden),
 * list the supported languages and review my submission history.
 */
public interface StudentCodeExamService {

    /** CD-03 */
    CodeExamResponses.Questions questions(Long userId, Long examId);

    /** CD-04 */
    CodeExamResponses.RunResult run(Long userId, CodeExamRequests.Run request);

    /** CD-05 */
    CodeExamResponses.Submitted submit(Long userId, CodeExamRequests.Submit request);

    /** CD-06 */
    List<CodeExamResponses.Language> languages();

    /** CD-07 */
    PageResponse<CodeExamResponses.SubmissionItem> submissions(Long userId, Long examId, int page, int size);
}
