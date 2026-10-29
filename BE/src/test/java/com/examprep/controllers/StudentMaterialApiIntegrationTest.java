package com.examprep.controllers;

import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BaseException;
import com.examprep.security.UserPrincipal;
import com.examprep.services.AiQuotaService;
import com.examprep.services.MaterialStorage;
import com.examprep.services.MaterialTextReader;
import com.examprep.services.QuizGenerationWorker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end contract tests of MQ-01 … MQ-06 (spec 13): upload, listing, asynchronous quiz
 * generation, polling, starting the generated quiz and history.
 *
 * <p>Storage, text extraction and the async worker are mocked: no file is written, no AI call is
 * made, and the worker never runs behind the test's back. Everything else (quota reservation,
 * ownership, transaction boundaries, attempt creation) runs against H2.</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class StudentMaterialApiIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    @Autowired DataSource dataSource;
    @MockBean MaterialStorage storage;
    @MockBean MaterialTextReader reader;
    @MockBean QuizGenerationWorker worker;

    User manager, student, other;
    Category category;
    Course course;

    /** H2 stand-in for Postgres' pg_advisory_xact_lock (used by the AI quota). */
    public static Integer advisoryLock(Long key) { return 0; }

    @BeforeEach
    void fixtures() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.createStatement().execute("CREATE ALIAS IF NOT EXISTS pg_advisory_xact_lock FOR '"
                    + StudentMaterialApiIntegrationTest.class.getName() + ".advisoryLock'");
            // lessons is only mapped by a native query (MQ-03); Postgres gets it from Flyway.
            connection.createStatement().execute(
                    "CREATE TABLE IF NOT EXISTS lessons (lesson_id BIGINT PRIMARY KEY, module_id BIGINT NOT NULL)");
        }
        when(reader.read(anyString(), any(byte[].class))).thenReturn("Nội dung tài liệu: lập trình hướng đối tượng.");
        when(reader.pageCount(anyString(), any(byte[].class))).thenReturn(3);
        when(storage.newPublicId(anyLong(), anyString())).thenReturn("materials/user/notes.pdf");
        when(storage.store(anyString(), anyString(), any(byte[].class))).thenReturn("https://cdn.test/notes.pdf");

        manager = account(User.ROLE_COURSE_MANAGER);
        student = account(User.ROLE_STUDENT);
        other = account(User.ROLE_STUDENT);
        category = Category.builder().name("Materials").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Java OOP").slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(true).build();
        em.persist(course);
        em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());
        em.flush();
    }

    // =================================================================================
    // MQ-01
    // =================================================================================

    @Test
    void uploadStoresTheFileAndCreatesTheDocument() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "week1.pdf", "application/pdf",
                "PDFDATA".getBytes(StandardCharsets.UTF_8));

        JsonNode data = data(call(student, multipart("/api/v1/student/materials").file(file)
                .param("courseId", course.getCourseId().toString())
                .param("title", "  Week 1 notes  "))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Uploaded")));

        Document saved = em.find(Document.class, data.path("documentId").asLong());
        assertNotNull(saved);
        assertEquals("week1.pdf", data.path("fileName").asText());
        assertEquals(3, data.path("pageCount").asInt());
        assertEquals("Week 1 notes", data.path("title").asText());

        assertEquals(student.getUserId(), saved.getUser().getUserId());
        assertEquals(course.getCourseId(), saved.getCourse().getCourseId());
        assertEquals("MATERIAL", saved.getGenerationType());
        assertEquals("UPLOADED", saved.getStatus());
        assertEquals("Nội dung tài liệu: lập trình hướng đối tượng.", saved.getExtractedContent());
        assertEquals("week1.pdf", saved.getFileName());
        assertEquals("https://cdn.test/notes.pdf", saved.getFileUrl());
        assertEquals(1, saved.getFileSizeKb()); // 7 bytes, rounded up
        assertEquals(3, saved.getPageCount());
        assertEquals("Week 1 notes", saved.getTitle());
        assertNotNull(saved.getCreatedAt());

        ArgumentCaptor<byte[]> bytes = ArgumentCaptor.forClass(byte[].class);
        verify(reader).read(eq("week1.pdf"), bytes.capture());
        assertArrayEquals("PDFDATA".getBytes(StandardCharsets.UTF_8), bytes.getValue());
        verify(storage).store(eq("materials/user/notes.pdf"), eq("week1.pdf"), any(byte[].class));
    }

    @Test
    void uploadDefaultsTheTitleAndValidatesInput() throws Exception {
        MockMultipartFile docx = new MockMultipartFile("file", "notes.docx", "application/octet-stream",
                "DOCX".getBytes(StandardCharsets.UTF_8));
        JsonNode defaults = data(call(student, multipart("/api/v1/student/materials").file(docx)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isCreated()));
        assertEquals("notes.docx", defaults.path("title").asText());

        MockMultipartFile txt = new MockMultipartFile("file", "notes.txt", "text/plain", "TXT".getBytes());
        call(student, multipart("/api/v1/student/materials").file(txt)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only PDF and DOCX files are supported"));

        MockMultipartFile empty = new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);
        call(student, multipart("/api/v1/student/materials").file(empty)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("File must contain data"));

        // Not enrolled: rejected before the file is read or stored.
        clearInvocations(reader, storage);
        call(other, multipart("/api/v1/student/materials").file(docx)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(reader, storage);

        call(manager, multipart("/api/v1/student/materials").file(docx)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isForbidden());

        mvc.perform(multipart("/api/v1/student/materials").file(docx)
                        .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isUnauthorized());

        call(student, multipart("/api/v1/student/materials")
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadRejectsOversizedFilesAndStorageFailures() throws Exception {
        byte[] huge = new byte[20 * 1024 * 1024 + 1];
        MockMultipartFile oversized = new MockMultipartFile("file", "huge.pdf", "application/pdf", huge);
        clearInvocations(reader, storage);
        call(student, multipart("/api/v1/student/materials").file(oversized)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Material must not exceed 20MB"));
        verifyNoInteractions(reader, storage);

        when(storage.store(anyString(), anyString(), any(byte[].class)))
                .thenThrow(new BaseException(ResponseCode.STORAGE_ERROR, "Storage is down"));
        MockMultipartFile fine = new MockMultipartFile("file", "fine.pdf", "application/pdf",
                "DATA".getBytes(StandardCharsets.UTF_8));
        long before = documentsOf(student);
        call(student, multipart("/api/v1/student/materials").file(fine)
                .param("courseId", course.getCourseId().toString()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.message").value("Storage is down"));
        assertEquals(before, documentsOf(student));
    }

    // =================================================================================
    // MQ-02
    // =================================================================================

    @Test
    void listReturnsMyDocumentsWithJobsAndPaging() throws Exception {
        Instant now = Instant.now();
        Document older = document(student, course, "old", "Old material", now.minus(2, ChronoUnit.HOURS));
        Document newer = document(student, course, "new", "New material", now.minus(30, ChronoUnit.MINUTES));
        document(other, course, "foreign", "Foreign material", now);
        job(newer, student, QuizGenerationWorker.STATUS_COMPLETED, 10, null, now.minus(20, ChronoUnit.MINUTES));
        QuizGenerationJob newestJob = job(newer, student, QuizGenerationWorker.STATUS_FAILED, 5, null, now.minus(10, ChronoUnit.MINUTES));
        QuizGenerationJob olderJob = job(older, student, QuizGenerationWorker.STATUS_PROCESSING, 8, null, now.minus(90, ChronoUnit.MINUTES));
        em.flush();

        JsonNode data = data(call(student, get("/api/v1/student/materials?page=0&size=10"))
                .andExpect(status().isOk()));
        assertEquals(2, data.path("content").size());
        assertEquals(2L, data.path("totalElements").asLong());
        assertEquals(0, data.path("page").asInt());
        assertEquals(10, data.path("size").asInt());
        assertTrue(data.path("first").asBoolean());
        assertTrue(data.path("last").asBoolean());

        JsonNode first = data.path("content").get(0);
        assertEquals(newer.getDocId(), first.path("documentId").asLong());
        assertEquals("New material", first.path("title").asText());
        assertEquals(newer.getFileName(), first.path("fileName").asText());
        assertEquals(2, first.path("pageCount").asInt());
        assertNotNull(first.path("uploadedAt").textValue());
        assertEquals(2, first.path("jobs").size());
        assertEquals(newestJob.getJobId(), first.path("jobs").get(0).path("jobId").asLong());
        assertEquals("FAILED", first.path("jobs").get(0).path("status").asText());
        assertEquals("COMPLETED", first.path("jobs").get(1).path("status").asText());

        JsonNode second = data.path("content").get(1);
        assertEquals(older.getDocId(), second.path("documentId").asLong());
        assertEquals(olderJob.getJobId(), second.path("jobs").get(0).path("jobId").asLong());

        // courseId filter and paging
        call(student, get("/api/v1/student/materials").param("courseId", course.getCourseId().toString()))
                .andExpect(jsonPath("$.data.totalElements").value(2));
        Course emptyCourse = course("Empty");
        JsonNode filtered = data(call(student, get("/api/v1/student/materials")
                .param("courseId", emptyCourse.getCourseId().toString())).andExpect(status().isOk()));
        assertEquals(0, filtered.path("content").size());
        assertEquals(0L, filtered.path("totalElements").asLong());

        JsonNode page1 = data(call(student, get("/api/v1/student/materials?page=1&size=1")).andExpect(status().isOk()));
        assertEquals(1, page1.path("content").size());
        assertEquals(older.getDocId(), page1.path("content").get(0).path("documentId").asLong());
        assertEquals(1, page1.path("page").asInt());
        assertEquals(2L, page1.path("totalElements").asLong());
        assertEquals(2, page1.path("totalPages").asInt());
        assertFalse(page1.path("first").asBoolean());
        assertTrue(page1.path("last").asBoolean());

        call(student, get("/api/v1/student/materials?page=-1")).andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/materials?size=0")).andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/materials?size=101")).andExpect(status().isBadRequest());
    }

    // =================================================================================
    // MQ-03
    // =================================================================================

    @Test
    void generateReservesQuotaAndQueuesTheJob() throws Exception {
        Document subject = material("x".repeat(200));
        long expected = AiQuotaService.estimate(subject.getExtractedContent().length(), 500);

        JsonNode data = data(call(student, post("/api/v1/student/materials/" + subject.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("questionCount", 10))))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.message").value("Accepted"))
                .andExpect(jsonPath("$.data.status").value("PROCESSING"))
                .andExpect(jsonPath("$.data.questionCount").value(10)));

        QuizGenerationJob queued = em.find(QuizGenerationJob.class, data.path("jobId").asLong());
        assertNotNull(queued);
        assertEquals(QuizGenerationWorker.STATUS_PENDING, queued.getStatus()); // dispatched after commit
        assertEquals(0, queued.getProgress());
        assertEquals(10, queued.getQuestionCount());
        assertEquals("MEDIUM", queued.getDifficulty()); // default when omitted
        assertEquals(expected, queued.getEstimatedTokens().intValue());
        assertEquals(student.getUserId(), queued.getUser().getUserId());
        assertEquals(subject.getDocId(), queued.getDocument().getDocId());
        assertEquals(course.getCourseId(), queued.getCourse().getCourseId());
        assertNull(queued.getResultExam());
        assertNull(queued.getErrorMessage());

        AiUsageLog log = em.find(AiUsageLog.class, queued.getAiUsageLog().getLogId());
        assertEquals("PENDING", log.getStatus());
        assertEquals("QUIZ_GENERATION", log.getPurpose());
        assertEquals("FREE", log.getBillingSource());
        assertEquals(expected, log.getReservedTokens().intValue());
        assertEquals(course.getCourseId(), log.getCourse().getCourseId());

        verify(worker).dispatch(queued.getJobId());

        // difficulty is stored as sent
        Document second = document(student, course, "y".repeat(120), "Hard material", Instant.now());
        em.flush();
        JsonNode hard = data(call(student, post("/api/v1/student/materials/" + second.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionCount\":5,\"difficulty\":\"HARD\"}"))
                .andExpect(status().isAccepted()));
        assertEquals("HARD", em.find(QuizGenerationJob.class, hard.path("jobId").asLong()).getDifficulty());
    }

    @Test
    void generateRejectsInvalidRequestsDocumentsAndDuplicates() throws Exception {
        Document subject = material("x".repeat(200));
        String url = "/api/v1/student/materials/" + subject.getDocId() + "/generate-quiz";
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":4}"))
                .andExpect(status().isBadRequest());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":31}"))
                .andExpect(status().isBadRequest());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionCount\":10,\"difficulty\":\"EXPERT\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, jobsOf(subject));

        // unknown or foreign material
        call(student, post("/api/v1/student/materials/" + Long.MAX_VALUE + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isNotFound());
        Document foreign = document(other, course, "foreign", "Other material", Instant.now());
        em.flush();
        call(student, post("/api/v1/student/materials/" + foreign.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isNotFound());

        // no readable text
        Document blank = document(student, course, " ", "Blank material", Instant.now());
        em.flush();
        call(student, post("/api/v1/student/materials/" + blank.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Material contains no readable text"));

        // one active job per document
        QuizGenerationJob active = job(subject, student, QuizGenerationWorker.STATUS_PENDING, 10, null, Instant.now());
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A quiz is already being generated for this material"));
        active.setStatus(QuizGenerationWorker.STATUS_PROCESSING);
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isConflict());
        active.setStatus(QuizGenerationWorker.STATUS_COMPLETED);
        em.flush();
        call(student, post(url).contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isAccepted());
        assertEquals(2, jobsOf(subject));
    }

    @Test
    void generateChecksTheSourceLesson() throws Exception {
        Document subject = material("x".repeat(200));
        Module module = Module.builder().course(course).title("Module 1").orderIndex(1).build();
        em.persist(module);
        Course otherCourse = course("Another course");
        Module otherModule = Module.builder().course(otherCourse).title("Module 2").orderIndex(1).build();
        em.persist(otherModule);
        em.flush();
        em.createNativeQuery("INSERT INTO lessons (lesson_id, module_id) VALUES (9001, :moduleId)")
                .setParameter("moduleId", module.getModuleId()).executeUpdate();
        em.createNativeQuery("INSERT INTO lessons (lesson_id, module_id) VALUES (9002, :moduleId)")
                .setParameter("moduleId", otherModule.getModuleId()).executeUpdate();

        String url = "/api/v1/student/materials/" + subject.getDocId() + "/generate-quiz";
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionCount\":10,\"sourceLessonId\":9002}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("sourceLessonId does not belong to the course of this material"));
        call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionCount\":10,\"sourceLessonId\":9003}"))
                .andExpect(status().isBadRequest());

        JsonNode data = data(call(student, post(url).contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionCount\":10,\"sourceLessonId\":9001}"))
                .andExpect(status().isAccepted()));
        assertEquals(9001L, em.find(QuizGenerationJob.class, data.path("jobId").asLong()).getSourceLessonId());
    }

    @Test
    void generateReturns429WhenQuotaIsExhausted() throws Exception {
        Document subject = material("x".repeat(200));
        em.persist(AiUsageLog.builder().user(student).purpose("EXPLANATION").status("SUCCESS")
                .inputTokens(19_900).outputTokens(0).billingSource("FREE").build());
        em.flush();
        long expected = AiQuotaService.estimate(subject.getExtractedContent().length(), 500);

        call(student, post("/api/v1/student/materials/" + subject.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("Not enough AI quota to generate this quiz"))
                .andExpect(jsonPath("$.data.estimatedTokens").value(expected))
                .andExpect(jsonPath("$.data.availableTokens").value(100))
                .andExpect(jsonPath("$.data.quota").value(20_000));
        assertEquals(0, jobsOf(subject));
    }

    @Test
    void generateFailsTheJobWhenTheWorkerCannotBeDispatched() throws Exception {
        Document subject = material("x".repeat(200));
        doThrow(new IllegalStateException("pool closed")).when(worker).dispatch(anyLong());
        call(student, post("/api/v1/student/materials/" + subject.getDocId() + "/generate-quiz")
                .contentType(MediaType.APPLICATION_JSON).content("{\"questionCount\":10}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Quiz generation could not be started"));

        QuizGenerationJob queued = em.createQuery(
                        "select j from QuizGenerationJob j where j.document.docId = :id", QuizGenerationJob.class)
                .setParameter("id", subject.getDocId()).getSingleResult();
        verify(worker).fail(queued.getJobId(), "Quiz generation worker could not be started");
    }

    // =================================================================================
    // MQ-04
    // =================================================================================

    @Test
    void jobPollingReturnsStatusAndChecksOwnership() throws Exception {
        Document doc = document(student, course, "z", "Polling material", Instant.now());
        em.flush();
        Exam exam = publishedExam(course, student, "Generated quiz", 2);
        QuizGenerationJob pending = job(doc, student, QuizGenerationWorker.STATUS_PENDING, 10, null, Instant.now());
        QuizGenerationJob failed = job(doc, student, QuizGenerationWorker.STATUS_FAILED, 10, null, Instant.now());
        failed.setErrorMessage("AI provider could not generate the quiz");
        QuizGenerationJob completed = job(doc, student, QuizGenerationWorker.STATUS_COMPLETED, 10, exam, Instant.now());
        completed.setProgress(100);
        em.flush();

        call(student, get("/api/v1/student/materials/quiz-jobs/" + pending.getJobId()))
                .andExpect(status().isOk())
                .andExpect(header().string("Retry-After", "2"))
                .andExpect(jsonPath("$.data.jobId").value(pending.getJobId()))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.progress").value(0))
                .andExpect(jsonPath("$.data.questionCount").value(10))
                .andExpect(jsonPath("$.data.errorMessage").doesNotExist())
                .andExpect(jsonPath("$.data.quizId").doesNotExist());

        call(student, get("/api/v1/student/materials/quiz-jobs/" + failed.getJobId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.errorMessage").value("AI provider could not generate the quiz"));

        call(student, get("/api/v1/student/materials/quiz-jobs/" + completed.getJobId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.progress").value(100))
                .andExpect(jsonPath("$.data.quizId").value(exam.getExamId()));

        call(other, get("/api/v1/student/materials/quiz-jobs/" + pending.getJobId()))
                .andExpect(status().isNotFound());
        call(student, get("/api/v1/student/materials/quiz-jobs/" + Long.MAX_VALUE))
                .andExpect(status().isNotFound());
    }

    // =================================================================================
    // MQ-05
    // =================================================================================

    @Test
    void startReturnsTheQuizWithoutAnswersAndResumesTheSameAttempt() throws Exception {
        Exam exam = publishedExam(course, student, "Material quiz", 3);
        Document doc = document(student, course, "quiz", "Quiz material", Instant.now());
        em.flush();
        QuizGenerationJob job = job(doc, student, QuizGenerationWorker.STATUS_COMPLETED, 3, exam, Instant.now());
        em.flush();

        MvcResult firstResult = call(student, post("/api/v1/student/materials/quiz-jobs/" + job.getJobId() + "/start"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Quiz started"))
                .andExpect(jsonPath("$.data.questions.length()").value(3))
                .andExpect(jsonPath("$.data.questions[0].options.length()").value(4))
                .andReturn();
        JsonNode first = data(firstResult);
        long attemptId = first.path("attemptId").asLong();

        for (JsonNode question : first.path("questions")) {
            assertTrue(question.has("questionId"));
            assertTrue(question.has("orderIndex"));
            assertTrue(question.has("questionType"));
            assertTrue(question.has("content"));
            for (JsonNode option : question.path("options")) {
                assertTrue(option.has("optionId"));
                assertTrue(option.has("optionText"));
                assertFalse(option.has("isCorrect"), "the started quiz must never expose the answer key");
            }
        }
        assertFalse(firstResult.getResponse().getContentAsString().contains("correctOptionIds"));

        ExamAttempt attempt = em.find(ExamAttempt.class, attemptId);
        assertNotNull(attempt);
        assertEquals("MATERIAL_QUIZ", attempt.getMode());
        assertEquals("IN_PROGRESS", attempt.getStatus());
        assertEquals(exam.getExamId(), attempt.getExam().getExamId());
        assertEquals(student.getUserId(), attempt.getUser().getUserId());

        // Starting again resumes the in-progress attempt instead of creating a second one.
        JsonNode resumed = data(call(student, post("/api/v1/student/materials/quiz-jobs/" + job.getJobId() + "/start"))
                .andExpect(status().isOk()));
        assertEquals(attemptId, resumed.path("attemptId").asLong());
        assertEquals(3, resumed.path("questions").size());
        assertEquals(1L, em.createQuery("select count(a) from ExamAttempt a where a.exam = :exam and a.user = :u", Long.class)
                .setParameter("exam", exam).setParameter("u", student).getSingleResult());
    }

    @Test
    void startRejectsIncompleteOrForeignJobs() throws Exception {
        Exam exam = publishedExam(course, student, "Material quiz", 2);
        Document doc = document(student, course, "quiz", "Quiz material", Instant.now());
        em.flush();
        QuizGenerationJob pending = job(doc, student, QuizGenerationWorker.STATUS_PENDING, 2, null, Instant.now());
        QuizGenerationJob failed = job(doc, student, QuizGenerationWorker.STATUS_FAILED, 2, null, Instant.now());
        QuizGenerationJob completedWithoutExam = job(doc, student, QuizGenerationWorker.STATUS_COMPLETED, 2, null, Instant.now());
        Document foreignDoc = document(other, course, "foreign", "Foreign quiz", Instant.now());
        em.flush();
        QuizGenerationJob foreign = job(foreignDoc, other, QuizGenerationWorker.STATUS_COMPLETED, 2, exam, Instant.now());
        em.flush();

        for (QuizGenerationJob notReady : List.of(pending, failed, completedWithoutExam)) {
            call(student, post("/api/v1/student/materials/quiz-jobs/" + notReady.getJobId() + "/start"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message").value("Quiz generation has not completed yet"));
        }
        call(student, post("/api/v1/student/materials/quiz-jobs/" + foreign.getJobId() + "/start"))
                .andExpect(status().isNotFound());
        call(student, post("/api/v1/student/materials/quiz-jobs/" + Long.MAX_VALUE + "/start"))
                .andExpect(status().isNotFound());
    }

    @Test
    void startRequiresAnEnrollmentInTheCourseOfTheGeneratedQuiz() throws Exception {
        Course otherCourse = course("Unenrolled course");
        Exam exam = publishedExam(otherCourse, manager, "Other quiz", 2);
        Document doc = document(student, otherCourse, "quiz", "Other material", Instant.now());
        em.flush();
        QuizGenerationJob job = job(doc, student, QuizGenerationWorker.STATUS_COMPLETED, 2, exam, Instant.now());
        em.flush();

        call(student, post("/api/v1/student/materials/quiz-jobs/" + job.getJobId() + "/start"))
                .andExpect(status().isForbidden());
        assertEquals(0L, em.createQuery("select count(a) from ExamAttempt a where a.exam = :exam", Long.class)
                .setParameter("exam", exam).getSingleResult());
    }

    // =================================================================================
    // MQ-06
    // =================================================================================

    @Test
    void historyListsCompletedQuizzesWithBestScoreAndPaging() throws Exception {
        Instant now = Instant.now();
        Exam exam = publishedExam(course, student, "Quiz one", 3);
        Exam exam2 = publishedExam(course, student, "Quiz two", 2);
        Document doc = document(student, course, "q1", "Chapter 1", now.minus(3, ChronoUnit.HOURS));
        Document doc2 = document(student, course, "q2", "Chapter 2", now.minus(2, ChronoUnit.HOURS));
        Document doc3 = document(student, course, "q3", "Failed chapter", now.minus(1, ChronoUnit.HOURS));
        em.flush();
        QuizGenerationJob older = job(doc, student, QuizGenerationWorker.STATUS_COMPLETED, 10, exam, now.minus(2, ChronoUnit.HOURS));
        QuizGenerationJob newer = job(doc2, student, QuizGenerationWorker.STATUS_COMPLETED, 5, exam2, now.minus(1, ChronoUnit.HOURS));
        job(doc3, student, QuizGenerationWorker.STATUS_FAILED, 5, null, now);
        job(doc3, student, QuizGenerationWorker.STATUS_PENDING, 5, null, now);
        attempt(exam, student, "7.50", now.minus(90, ChronoUnit.MINUTES));
        attempt(exam, student, "9.00", now.minus(60, ChronoUnit.MINUTES));
        attempt(exam, other, "10.00", now.minus(30, ChronoUnit.MINUTES)); // other students never count
        em.flush();

        JsonNode data = data(call(student, get("/api/v1/student/materials/quiz-history"))
                .andExpect(status().isOk()));
        assertEquals(2, data.path("content").size());
        assertEquals(2L, data.path("totalElements").asLong());

        JsonNode newest = data.path("content").get(0);
        assertEquals(newer.getJobId(), newest.path("jobId").asLong());
        assertEquals(doc2.getDocId(), newest.path("documentId").asLong());
        assertEquals("Chapter 2", newest.path("documentTitle").asText());
        assertEquals(5, newest.path("questionCount").asInt());
        assertEquals(0, newest.path("attemptCount").asInt());

        JsonNode oldest = data.path("content").get(1);
        assertEquals(older.getJobId(), oldest.path("jobId").asLong());
        assertEquals(10, oldest.path("questionCount").asInt());
        assertEquals(2, oldest.path("attemptCount").asInt());
        assertEquals(0, new BigDecimal("9.00").compareTo(oldest.path("bestScore").decimalValue()));

        JsonNode page1 = data(call(student, get("/api/v1/student/materials/quiz-history?page=1&size=1"))
                .andExpect(status().isOk()));
        assertEquals(1, page1.path("content").size());
        assertEquals(older.getJobId(), page1.path("content").get(0).path("jobId").asLong());
        assertEquals(2L, page1.path("totalElements").asLong());
        assertTrue(page1.path("last").asBoolean());

        JsonNode foreignHistory = data(call(other, get("/api/v1/student/materials/quiz-history"))
                .andExpect(status().isOk()));
        assertEquals(0, foreignHistory.path("content").size());

        call(student, get("/api/v1/student/materials/quiz-history?page=-1")).andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/materials/quiz-history?size=0")).andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/materials/quiz-history?size=101")).andExpect(status().isBadRequest());
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode data(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString()).path("data");
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return data(actions.andReturn());
    }

    private long documentsOf(User owner) {
        return em.createQuery("select count(d) from Document d where d.user = :u", Long.class)
                .setParameter("u", owner).getSingleResult();
    }

    private long jobsOf(Document doc) {
        return em.createQuery("select count(j) from QuizGenerationJob j where j.document = :d", Long.class)
                .setParameter("d", doc).getSingleResult();
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Course course(String title) {
        Course value = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title(title).slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(true).build();
        em.persist(value);
        return value;
    }

    private Document document(User owner, Course ownerCourse, String content, String title, Instant createdAt) {
        Document value = Document.builder().user(owner).course(ownerCourse).generationType("MATERIAL")
                .extractedContent(content).status("UPLOADED").title(title).fileName("material.docx")
                .fileUrl("https://cdn.test/material.docx").fileSizeKb(10).pageCount(2)
                .createdAt(createdAt).build();
        em.persist(value);
        return value;
    }

    private Document material(String content) {
        return document(student, course, content, "Week 1 slides", Instant.now());
    }

    private QuizGenerationJob job(Document doc, User owner, String status, int count, Exam result, Instant createdAt) {
        QuizGenerationJob value = QuizGenerationJob.builder().user(owner).document(doc).course(doc.getCourse())
                .questionCount(count).difficulty("MEDIUM").status(status).progress(0)
                .resultExam(result).createdAt(createdAt).updatedAt(createdAt).build();
        em.persist(value);
        return value;
    }

    private Exam publishedExam(Course ownerCourse, User creator, String title, int questions) {
        Exam exam = Exam.builder().course(ownerCourse).createdBy(creator).title(title).durationMinutes(10)
                .isPractice(true).generationType("STATIC").maxScore(BigDecimal.valueOf(questions))
                .status("PUBLISHED").publishedAt(Instant.now()).build();
        em.persist(exam);
        int order = 1;
        for (int i = 1; i <= questions; i++) {
            Question question = Question.builder().course(ownerCourse).createdBy(creator)
                    .questionType("SINGLE_CHOICE").difficulty("EASY").content(title + " question " + i).build();
            em.persist(question);
            for (int option = 1; option <= 4; option++) {
                em.persist(AnswerOption.builder().question(question).optionText("Option " + option)
                        .isCorrect(option == 1).orderIndex(option).build());
            }
            em.persist(ExamQuestion.builder().exam(exam).question(question)
                    .weight(BigDecimal.ONE).orderIndex(order++).build());
        }
        return exam;
    }

    private void attempt(Exam exam, User actor, String score, Instant startedAt) {
        em.persist(ExamAttempt.builder().exam(exam).user(actor).startTime(startedAt)
                .deadlineAt(startedAt.plus(30, ChronoUnit.MINUTES)).status("SUBMITTED")
                .examSnapshot("{\"maxScore\":10}").totalScore(new BigDecimal(score)).build());
    }
}
