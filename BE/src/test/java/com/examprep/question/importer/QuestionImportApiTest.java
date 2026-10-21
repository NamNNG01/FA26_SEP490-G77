package com.examprep.question.importer;

import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.CourseManager;
import com.examprep.entities.User;
import com.examprep.repositories.CourseManagerRepository;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class QuestionImportApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EntityManager em;

    private User manager;
    private User student;
    private Course course;

    @BeforeEach
    void setUp() {
        manager = User.builder()
                .email(UUID.randomUUID() + "@test.com")
                .fullName("Manager")
                .passwordHash("test")
                .roleName("COURSE_MANAGER")
                .build();
        em.persist(manager);

        student = User.builder()
                .email(UUID.randomUUID() + "@test.com")
                .fullName("Student")
                .passwordHash("test")
                .roleName("STUDENT")
                .build();
        em.persist(student);

        Category category = Category.builder()
                .name("Import category")
                .slug(UUID.randomUUID().toString())
                .build();
        em.persist(category);

        course = Course.builder()
                .manager(manager)
                .category(category)
                .categoryId(category.getCategoryId())
                .title("Import Test Course")
                .slug(UUID.randomUUID().toString())
                .price(BigDecimal.ZERO)
                .isPublished(true)
                .build();
        em.persist(course);

        CourseManager cm = CourseManager.builder()
                .course(course)
                .user(manager)
                .build();
        em.persist(cm);
        em.flush();
    }

    @Test
    void testDownloadTemplatePdfAndDocx() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        MvcResult pdfResult = mockMvc.perform(get("/api/v1/manager/questions/import-template")
                        .param("format", "pdf")
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"apepp-question-template-v2.pdf\""))
                .andReturn();

        byte[] pdfBytes = pdfResult.getResponse().getContentAsByteArray();
        assertTrue(pdfBytes.length > 0);
        assertTrue(new String(pdfBytes, 0, 5).equals("%PDF-"));

        MvcResult docxResult = mockMvc.perform(get("/api/v1/manager/questions/import-template")
                        .param("format", "docx")
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"apepp-question-template-v2.docx\""))
                .andReturn();

        byte[] docxBytes = docxResult.getResponse().getContentAsByteArray();
        assertTrue(docxBytes.length > 0);
    }

    @Test
    void testImportPreviewPdfAndDocxGolden() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        ClassPathResource pdfResource = new ClassPathResource("templates/import/apepp-question-template-v2.pdf");
        byte[] pdfBytes = pdfResource.getInputStream().readAllBytes();
        MockMultipartFile pdfFile = new MockMultipartFile("file", "apepp-question-template-v2.pdf", "application/pdf", pdfBytes);

        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(pdfFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk());

        ClassPathResource docxResource = new ClassPathResource("templates/import/apepp-question-template-v2.docx");
        byte[] docxBytes = docxResource.getInputStream().readAllBytes();
        MockMultipartFile docxFile = new MockMultipartFile("file", "apepp-question-template-v2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes);

        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(docxFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk());
    }

    @Test
    void testStudentForbidden() throws Exception {
        UserPrincipal studentPrincipal = UserPrincipal.create(student.getUserId(), student.getEmail(), student.getRoleName());

        ClassPathResource pdfResource = new ClassPathResource("templates/import/apepp-question-template-v2.pdf");
        byte[] pdfBytes = pdfResource.getInputStream().readAllBytes();
        MockMultipartFile pdfFile = new MockMultipartFile("file", "template.pdf", "application/pdf", pdfBytes);

        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(pdfFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(studentPrincipal)))
                .andExpect(status().isForbidden());
    }

    @Test
    void testInvalidFileFormat() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());
        MockMultipartFile txtFile = new MockMultipartFile("file", "test.txt", "text/plain", "Not a valid pdf or docx".getBytes());

        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(txtFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isBadRequest());
    }
}
