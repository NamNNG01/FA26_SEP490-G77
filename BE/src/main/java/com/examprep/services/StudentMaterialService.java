package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.student.MaterialRequests;
import com.examprep.dto.student.MaterialResponses;

/**
 * The six student material APIs (spec 13.1-13.6, MQ-01 … MQ-06): upload a PDF/DOCX, list my
 * materials, generate a quiz from one of them asynchronously, poll the job, start the generated
 * quiz and review the history of generated quizzes.
 */
public interface StudentMaterialService {

    /** MQ-01: stores the file once per owner and attaches it to the course; a re-upload only links. */
    MaterialResponses.Uploaded upload(Long userId, String fileName, byte[] bytes, Long courseId, String title);

    /** MQ-02: my own materials, newest first, each with its courses and generation jobs. */
    PageResponse<MaterialResponses.DocumentItem> list(Long userId, Long courseId, int page, int size);

    /** The material of this student with the same content, or 404. */
    MaterialResponses.Lookup lookup(Long userId, String sha256);

    /** Attaches an already uploaded material to another course (idempotent). */
    MaterialResponses.Lookup attachCourse(Long userId, Long documentId, Long courseId);

    /** Deletes a material, its generation jobs and the stored file. */
    void delete(Long userId, Long documentId);

    /** MQ-03: reserves quota and queues the generation; the AI call runs outside the transaction. */
    MaterialResponses.JobAccepted generateQuiz(Long userId, Long documentId, MaterialRequests.GenerateQuiz request);

    /** MQ-04: the polled state of one job. */
    MaterialResponses.JobState job(Long userId, Long jobId);

    /** MQ-05: starts (or resumes) the attempt of a completed generated quiz. */
    MaterialResponses.Started start(Long userId, Long jobId);

    /** MQ-06: history of generated quizzes with best score and attempt count. */
    PageResponse<MaterialResponses.HistoryItem> history(Long userId, int page, int size);
}
