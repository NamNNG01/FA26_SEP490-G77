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

        MvcResult xlsxResult = mockMvc.perform(get("/api/v1/manager/questions/import-template")
                        .param("format", "xlsx")
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"apepp-question-template-v2.xlsx\""))
                .andReturn();

        byte[] xlsxBytes = xlsxResult.getResponse().getContentAsByteArray();
        assertTrue(xlsxBytes.length > 0);
        assertEquals(0x50, xlsxBytes[0]);
        assertEquals(0x4B, xlsxBytes[1]);
    }

    @Test
    void testImportPreviewPdfDocxAndXlsxGolden() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        ClassPathResource pdfResource = new ClassPathResource("templates/import/apepp-question-template-v2.pdf");
        byte[] pdfBytes = pdfResource.getInputStream().readAllBytes();
        MockMultipartFile pdfFile = new MockMultipartFile("file", "apepp-question-template-v2.pdf", "application/pdf", pdfBytes);

        MvcResult pdfPreview = mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(pdfFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(pdfPreview.getResponse().getContentAsString()).path("data").path("totalErrors").asInt());

        ClassPathResource docxResource = new ClassPathResource("templates/import/apepp-question-template-v2.docx");
        byte[] docxBytes = docxResource.getInputStream().readAllBytes();
        MockMultipartFile docxFile = new MockMultipartFile("file", "apepp-question-template-v2.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes);

        MvcResult docxPreview = mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(docxFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(docxPreview.getResponse().getContentAsString()).path("data").path("totalErrors").asInt());

        ClassPathResource xlsxResource = new ClassPathResource("templates/import/apepp-question-template-v2.xlsx");
        byte[] xlsxBytes = xlsxResource.getInputStream().readAllBytes();
        MockMultipartFile xlsxFile = new MockMultipartFile("file", "apepp-question-template-v2.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBytes);

        MvcResult xlsxPreview = mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(xlsxFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();
        var xlsxJson = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(xlsxPreview.getResponse().getContentAsString()).path("data");
        assertEquals("XLSX", xlsxJson.path("fileType").asText());
        assertEquals(8, xlsxJson.path("totalBlocks").asInt());
        assertEquals(0, xlsxJson.path("totalErrors").asInt());
    }

    @Test
    void testDiagramAndDiagramEssayRejected() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        byte[] bytes;
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            var sheet = wb.createSheet("Questions");
            var header = sheet.createRow(0);
            String[] cols = {"Type", "Difficulty", "Content", "Rubric", "Diagram XML"};
            for (int c = 0; c < cols.length; c++) header.createCell(c).setCellValue(cols[c]);

            var r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("DIAGRAM");
            r1.createCell(1).setCellValue("EASY");
            r1.createCell(2).setCellValue("Draw an ERD");
            r1.createCell(4).setCellValue("<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>");

            var r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("DIAGRAM_ESSAY");
            r2.createCell(1).setCellValue("HARD");
            r2.createCell(2).setCellValue("Draw a class diagram and explain");
            r2.createCell(3).setCellValue("- Classes | 2 | Required classes");
            r2.createCell(4).setCellValue("<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>");

            wb.write(out);
            bytes = out.toByteArray();
        }

        MockMultipartFile file = new MockMultipartFile("file", "diagram.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes);
        MvcResult res = mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(file)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();

        var data = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(res.getResponse().getContentAsString()).path("data");
        assertEquals(2, data.path("totalBlocks").asInt());
        assertEquals(0, data.path("totalValid").asInt());
        assertEquals(2, data.path("totalErrors").asInt());
    }

    @Test
    void testExcelMissingDifficultyAndIncompleteFieldsKeepParsedData() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        byte[] bytes;
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            var sheet = wb.createSheet("Questions");
            var header = sheet.createRow(0);
            String[] cols = {"Type", "Difficulty", "Content", "Option A", "Option B", "Option C", "Answer", "Explanation"};
            for (int c = 0; c < cols.length; c++) header.createCell(c).setCellValue(cols[c]);

            // Row 2: valid question
            var r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue("SINGLE_CHOICE");
            r1.createCell(1).setCellValue("EASY");
            r1.createCell(2).setCellValue("Valid Q?");
            r1.createCell(3).setCellValue("Opt 1");
            r1.createCell(4).setCellValue("Opt 2");
            r1.createCell(6).setCellValue("B");

            // Row 3: missing Difficulty + unknown ANSWER option 'Z' -> errors but questionData preserved!
            var r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("SINGLE_CHOICE");
            r2.createCell(1).setCellValue("");
            r2.createCell(2).setCellValue("Broken Q missing diff");
            r2.createCell(3).setCellValue("Choice Alpha");
            r2.createCell(4).setCellValue("Choice Beta");
            r2.createCell(6).setCellValue("Z");
            r2.createCell(7).setCellValue("Kept explanation");

            wb.write(out);
            bytes = out.toByteArray();
        }

        MockMultipartFile file = new MockMultipartFile("file", "mixed.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes);
        MvcResult res = mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(file)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isOk())
                .andReturn();

        var data = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(res.getResponse().getContentAsString()).path("data");
        assertEquals(2, data.path("totalBlocks").asInt());
        assertEquals(1, data.path("totalValid").asInt());
        assertEquals(1, data.path("totalErrors").asInt());

        var badBlock = data.path("blocks").get(1);
        assertTrue(badBlock.path("errors").size() >= 2);
        assertFalse(badBlock.path("questionData").isNull(), "questionData must be kept for broken block");
        assertEquals("Broken Q missing diff", badBlock.path("questionData").path("content").asText());
        assertTrue(badBlock.path("questionData").path("difficulty").isNull()
                || badBlock.path("questionData").path("difficulty").isMissingNode(), "must not fall back to MEDIUM");
        assertEquals("Kept explanation", badBlock.path("questionData").path("explanation").asText());
        assertEquals(2, badBlock.path("questionData").path("options").size());
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
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message")
                        .value("Unsupported file format. Supported: .pdf, .docx, .xlsx, .xls"));

        // .pptx ZIP must report unsupported format instead of DOCX structure error
        byte[] pptxBytes;
        try (java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
             java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out)) {
            zip.putNextEntry(new java.util.zip.ZipEntry("ppt/presentation.xml"));
            zip.write("<p:presentation/>".getBytes());
            zip.closeEntry();
            zip.finish();
            pptxBytes = out.toByteArray();
        }
        MockMultipartFile pptxFile = new MockMultipartFile("file", "slides.pptx",
                "application/vnd.openxmlformats-officedocument.presentationml.presentation", pptxBytes);
        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(pptxFile)
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message")
                        .value("Unsupported file format. Supported: .pdf, .docx, .xlsx, .xls"));
    }

    @Test
    void testEmptyQuestionsFileRejectedWithValidationFailed() throws Exception {
        UserPrincipal managerPrincipal = UserPrincipal.create(manager.getUserId(), manager.getEmail(), manager.getRoleName());

        byte[] xlsxBytes;
        try (org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            var sheet = wb.createSheet("Questions");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("Type");
            header.createCell(1).setCellValue("Content");
            wb.write(out);
            xlsxBytes = out.toByteArray();
        }
        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(new MockMultipartFile("file", "header-only.xlsx",
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsxBytes))
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.code")
                        .value("VALIDATION_FAILED"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.message")
                        .value("The file contains no questions in the import template format."));

        byte[] docxBytes;
        try (org.apache.poi.xwpf.usermodel.XWPFDocument doc = new org.apache.poi.xwpf.usermodel.XWPFDocument();
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            doc.createParagraph().createRun().setText("Just plain notes without any TYPE block");
            doc.write(out);
            docxBytes = out.toByteArray();
        }
        mockMvc.perform(multipart("/api/v1/manager/questions/import-preview")
                        .file(new MockMultipartFile("file", "no-blocks.docx",
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes))
                        .param("courseId", course.getCourseId().toString())
                        .with(user(managerPrincipal)))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.code")
                        .value("VALIDATION_FAILED"));
    }
}
