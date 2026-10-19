package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamGroup;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.User;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.ExamGroupRepository;
import com.examprep.repositories.QuestionGroupRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestionGroupIntegrationTest {

    @Autowired
    private QuestionGroupService questionGroupService;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private QuestionGroupRepository questionGroupRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private ExamGroupRepository examGroupRepository;

    private User manager1;
    private User manager2;
    private User admin;
    private Course courseA;
    private Course courseB;
    private Module moduleA1;
    private Module moduleA2;
    private Module moduleB1;
    private QuestionGroup g1;
    private QuestionGroup g2;
    private QuestionGroup g3;
    private QuestionGroup g4;
    private QuestionGroup g5;
    private Exam draftExamA;
    private Exam publishedExamA;
    private Exam publishedExamB;

    @BeforeEach
    void setUp() {
        manager1 = persistUser("manager1@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        manager2 = persistUser("manager2@gmail.com", "Manager Two", User.ROLE_COURSE_MANAGER);
        admin = persistUser("admin@gmail.com", "Platform Admin", User.ROLE_ADMIN);

        Category category = Category.builder().name("Languages").slug("languages").build();
        entityManager.persist(category);

        courseA = persistCourse(category, manager1, "IELTS Academic", "ielts-academic");
        courseB = persistCourse(category, manager2, "TOEFL Prep", "toefl-prep");

        moduleA1 = persistModule(courseA, "Reading");
        moduleA2 = persistModule(courseA, "Listening");
        moduleB1 = persistModule(courseB, "Reading");

        g1 = persistGroup(courseA, moduleA1, "Reading Passage 1", "Factory output rose sharply in Q3");
        g2 = persistGroup(courseA, moduleA2, "Listening Task", "Audio transcript for listening");
        g3 = persistGroup(courseB, moduleB1, "Reading Passage 2", "Factory output fell in Q4");
        g4 = persistGroup(null, moduleA1, "Legacy Group", "Legacy shared passage");
        g5 = persistGroup(null, null, "Global Group", "Global passage");

        persistQuestion(moduleA1, g1, "Question one of g1");
        persistQuestion(moduleA1, g1, "Question two of g1");
        persistQuestion(moduleA2, g2, "Question of g2");
        persistQuestion(moduleA1, g4, "Question of g4");
        Question questionOfG3 = persistQuestion(moduleB1, g3, "Question of g3");

        draftExamA = persistExam(courseA, manager1, "Draft quiz A", "DRAFT");
        publishedExamA = persistExam(courseA, manager1, "Published quiz A", "PUBLISHED");
        publishedExamB = persistExam(courseB, manager2, "Published quiz B", "PUBLISHED");

        persistExamGroup(draftExamA, g2);
        persistExamGroup(publishedExamA, g1);
        persistExamQuestion(publishedExamB, questionOfG3);

        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void managerSeesOnlyOwnCourseGroupsOrderedByIdDescWithQuestionCounts() {
        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, null, null, 0, 20);

        List<Long> ids = response.getContent().stream().map(QuestionGroupResponse::getGroupId).toList();
        assertEquals(List.of(g4.getGroupId(), g2.getGroupId(), g1.getGroupId()), ids);
        assertEquals(3L, response.getTotalElements());
        assertEquals(1, response.getTotalPages());
        assertTrue(response.isFirst());
        assertTrue(response.isLast());

        assertEquals(2L, questionCountOf(response, g1.getGroupId()));
        assertEquals(1L, questionCountOf(response, g2.getGroupId()));
        assertEquals(1L, questionCountOf(response, g4.getGroupId()));
    }

    @Test
    void adminSeesAllGroups() {
        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, null, 0, 20);

        List<Long> ids = response.getContent().stream().map(QuestionGroupResponse::getGroupId).toList();
        assertEquals(List.of(g5.getGroupId(), g4.getGroupId(), g3.getGroupId(), g2.getGroupId(), g1.getGroupId()),
                ids);
        assertEquals(5L, response.getTotalElements());
    }

    @Test
    void courseFilterMatchesGroupsLinkedThroughModule() {
        PageResponse<QuestionGroupResponse> managerView = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, courseA.getCourseId(), null, null, 0, 20);

        List<Long> ids = managerView.getContent().stream().map(QuestionGroupResponse::getGroupId).toList();
        assertEquals(List.of(g4.getGroupId(), g2.getGroupId(), g1.getGroupId()), ids);

        PageResponse<QuestionGroupResponse> adminView = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, courseB.getCourseId(), null, null, 0, 20);

        assertEquals(List.of(g3.getGroupId()),
                adminView.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());
    }

    @Test
    void moduleFilterLimitsResults() {
        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, moduleA1.getModuleId(), null, 0, 20);

        List<Long> ids = response.getContent().stream().map(QuestionGroupResponse::getGroupId).toList();
        assertEquals(List.of(g4.getGroupId(), g1.getGroupId()), ids);
    }

    @Test
    void searchMatchesTitleAndPassageCaseInsensitively() {
        PageResponse<QuestionGroupResponse> byTitle = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, "READING", 0, 20);

        assertEquals(List.of(g3.getGroupId(), g1.getGroupId()),
                byTitle.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());

        PageResponse<QuestionGroupResponse> byPassage = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, "factory", 0, 20);

        assertEquals(List.of(g3.getGroupId(), g1.getGroupId()),
                byPassage.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());

        PageResponse<QuestionGroupResponse> managerScope = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, null, "factory", 0, 20);

        assertEquals(List.of(g1.getGroupId()),
                managerScope.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());
    }

    @Test
    void searchEscapesLikeWildcards() {
        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, "%", 0, 20);

        assertTrue(response.getContent().isEmpty());
        assertEquals(0L, response.getTotalElements());
    }

    @Test
    void paginationReportsPageMetadata() {
        PageResponse<QuestionGroupResponse> firstPage = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, null, 0, 2);

        assertEquals(List.of(g5.getGroupId(), g4.getGroupId()),
                firstPage.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());
        assertEquals(5L, firstPage.getTotalElements());
        assertEquals(3, firstPage.getTotalPages());
        assertEquals(0, firstPage.getPage());
        assertEquals(2, firstPage.getSize());
        assertTrue(firstPage.isFirst());
        assertFalse(firstPage.isLast());

        PageResponse<QuestionGroupResponse> lastPage = questionGroupService.getQuestionGroups(
                admin.getUserId(), User.ROLE_ADMIN, null, null, null, 2, 2);

        assertEquals(List.of(g1.getGroupId()),
                lastPage.getContent().stream().map(QuestionGroupResponse::getGroupId).toList());
        assertFalse(lastPage.isFirst());
        assertTrue(lastPage.isLast());
    }

    @Test
    void managerFilteringForeignCourseIsForbidden() {
        assertThrows(ForbiddenException.class, () -> questionGroupService.getQuestionGroups(
                manager2.getUserId(), User.ROLE_COURSE_MANAGER, courseA.getCourseId(), null, null, 0, 20));
    }

    @Test
    void createGroupPersistsAndStartsEmpty() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(courseA.getCourseId())
                .moduleId(moduleA1.getModuleId())
                .title("Reading Passage 3")
                .passageText("New shared passage")
                .build();

        QuestionGroupResponse response =
                questionGroupService.createQuestionGroup(manager1.getUserId(), User.ROLE_COURSE_MANAGER, request);

        assertEquals(courseA.getCourseId(), response.getCourseId());
        assertEquals(moduleA1.getModuleId(), response.getModuleId());
        assertEquals("Reading Passage 3", response.getTitle());
        assertEquals("New shared passage", response.getPassageText());
        assertEquals(0L, response.getQuestionCount());

        entityManager.flush();
        entityManager.clear();
        assertTrue(questionGroupRepository.findById(response.getGroupId()).isPresent());
        assertEquals(6, questionGroupRepository.count());
    }

    @Test
    void createGroupWithoutModuleIsAllowed() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(courseA.getCourseId())
                .title("Course level group")
                .passageText("Shared for the whole course")
                .build();

        QuestionGroupResponse response =
                questionGroupService.createQuestionGroup(manager1.getUserId(), User.ROLE_COURSE_MANAGER, request);

        assertNull(response.getModuleId());
        assertEquals(courseA.getCourseId(), response.getCourseId());
    }

    @Test
    void courseOnlyGroupStaysVisibleToManagerAndUnderCourseFilter() {
        QuestionGroup courseOnly = persistGroup(courseA, null, "Course only group", "Course-scoped passage");
        persistQuestion(moduleA1, courseOnly, "Question of course-only group");
        entityManager.flush();
        entityManager.clear();

        PageResponse<QuestionGroupResponse> managerView = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, null, null, 0, 20);
        List<Long> managerIds = managerView.getContent().stream()
                .map(QuestionGroupResponse::getGroupId).toList();
        assertTrue(managerIds.contains(courseOnly.getGroupId()),
                "course-only group must be visible to its manager");

        PageResponse<QuestionGroupResponse> courseView = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, courseA.getCourseId(), null, null, 0, 20);
        List<Long> courseIds = courseView.getContent().stream()
                .map(QuestionGroupResponse::getGroupId).toList();
        assertTrue(courseIds.contains(courseOnly.getGroupId()),
                "course-only group must match the courseId filter");

        PageResponse<QuestionGroupResponse> moduleView = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, moduleA2.getModuleId(), null, 0, 20);
        assertFalse(moduleView.getContent().stream()
                        .map(QuestionGroupResponse::getGroupId)
                        .anyMatch(id -> id.equals(courseOnly.getGroupId())),
                "course-only group must not match an unrelated module filter");
    }

    @Test
    void createGroupWithModuleOutsideCourseIsRejected() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(courseB.getCourseId())
                .moduleId(moduleA1.getModuleId())
                .title("Misplaced group")
                .build();

        assertThrows(ResourceNotFoundException.class, () -> questionGroupService.createQuestionGroup(
                admin.getUserId(), User.ROLE_ADMIN, request));
    }

    @Test
    void createGroupOnForeignCourseIsForbidden() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(courseA.getCourseId())
                .title("Another manager group")
                .build();

        assertThrows(ForbiddenException.class, () -> questionGroupService.createQuestionGroup(
                manager2.getUserId(), User.ROLE_COURSE_MANAGER, request));
    }

    @Test
    void updateGroupKeepsOmittedFieldsAndClearsBlankOnes() {
        QuestionGroupResponse partial = questionGroupService.updateQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g1.getGroupId(),
                QuestionGroupUpdateRequest.builder().title("Reading Passage 1 v2").build());

        assertEquals("Reading Passage 1 v2", partial.getTitle());
        assertEquals("Factory output rose sharply in Q3", partial.getPassageText());
        assertEquals(2L, partial.getQuestionCount());

        QuestionGroupResponse cleared = questionGroupService.updateQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g1.getGroupId(),
                QuestionGroupUpdateRequest.builder().passageText("").build());

        assertEquals("Reading Passage 1 v2", cleared.getTitle());
        assertNull(cleared.getPassageText());

        entityManager.flush();
        entityManager.clear();
        assertEquals("Reading Passage 1 v2",
                questionGroupRepository.findById(g1.getGroupId()).orElseThrow().getTitle());
        assertNull(questionGroupRepository.findById(g1.getGroupId()).orElseThrow().getPassageText());
    }

    @Test
    void updateForeignGroupIsForbidden() {
        assertThrows(ForbiddenException.class, () -> questionGroupService.updateQuestionGroup(
                manager2.getUserId(), User.ROLE_COURSE_MANAGER, g1.getGroupId(),
                QuestionGroupUpdateRequest.builder().title("Hijacked").build()));
    }

    @Test
    void deleteGroupUsedByPublishedExamGroupIsBlocked() {
        assertThrows(ResourceConflictException.class, () -> questionGroupService.deleteQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g1.getGroupId()));

        assertTrue(questionGroupRepository.findById(g1.getGroupId()).isPresent());
    }

    @Test
    void deleteGroupWithQuestionInsidePublishedExamIsBlocked() {
        assertThrows(ResourceConflictException.class, () -> questionGroupService.deleteQuestionGroup(
                manager2.getUserId(), User.ROLE_COURSE_MANAGER, g3.getGroupId()));

        assertTrue(questionGroupRepository.findById(g3.getGroupId()).isPresent());
    }

    @Test
    void deleteGroupDetachesQuestionsAndRemovesDraftExamLinks() {
        Long questionOfG2Id = questionRepository.findAll().stream()
                .filter(question -> question.getGroup() != null
                        && question.getGroup().getGroupId().equals(g2.getGroupId()))
                .findFirst()
                .orElseThrow()
                .getQuestionId();

        questionGroupService.deleteQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g2.getGroupId());

        entityManager.flush();
        entityManager.clear();

        assertTrue(questionGroupRepository.findById(g2.getGroupId()).isEmpty());
        assertNull(questionRepository.findById(questionOfG2Id).orElseThrow().getGroup());
        assertEquals(1, examGroupRepository.count());
    }

    @Test
    void globalGroupIsInvisibleAndImmutableForManagersButManageableByAdmin() {
        PageResponse<QuestionGroupResponse> managerView = questionGroupService.getQuestionGroups(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, null, null, null, 0, 20);
        assertTrue(managerView.getContent().stream()
                .noneMatch(item -> item.getGroupId().equals(g5.getGroupId())));

        assertThrows(ForbiddenException.class, () -> questionGroupService.deleteQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g5.getGroupId()));

        questionGroupService.deleteQuestionGroup(admin.getUserId(), User.ROLE_ADMIN, g5.getGroupId());

        entityManager.flush();
        entityManager.clear();
        assertTrue(questionGroupRepository.findById(g5.getGroupId()).isEmpty());
    }

    @Test
    void legacyGroupIsDeletedByModuleCourseOwner() {
        questionGroupService.deleteQuestionGroup(
                manager1.getUserId(), User.ROLE_COURSE_MANAGER, g4.getGroupId());

        entityManager.flush();
        entityManager.clear();
        assertTrue(questionGroupRepository.findById(g4.getGroupId()).isEmpty());
    }

    private long questionCountOf(PageResponse<QuestionGroupResponse> response, Long groupId) {
        return response.getContent().stream()
                .filter(item -> item.getGroupId().equals(groupId))
                .findFirst()
                .orElseThrow()
                .getQuestionCount();
    }

    private User persistUser(String email, String fullName, String roleName) {
        User user = User.builder()
                .email(email)
                .passwordHash("$2a$10$examplehashexamplehashexamplehashexamplehash")
                .fullName(fullName)
                .roleName(roleName)
                .status(User.STATUS_ACTIVE)
                .build();
        entityManager.persist(user);
        return user;
    }

    private Course persistCourse(Category category, User manager, String title, String slug) {
        Course course = Course.builder()
                .categoryId(category.getCategoryId())
                .manager(manager)
                .title(title)
                .slug(slug)
                .price(java.math.BigDecimal.ZERO)
                .isPublished(true)
                .build();
        entityManager.persist(course);
        return course;
    }

    private Module persistModule(Course course, String title) {
        Module module = Module.builder()
                .course(course)
                .title(title)
                .orderIndex(0)
                .build();
        entityManager.persist(module);
        return module;
    }

    private QuestionGroup persistGroup(Course course, Module module, String title, String passageText) {
        QuestionGroup group = QuestionGroup.builder()
                .course(course)
                .module(module)
                .title(title)
                .passageText(passageText)
                .build();
        entityManager.persist(group);
        return group;
    }

    private Question persistQuestion(Module module, QuestionGroup group, String content) {
        Question question = Question.builder()
                .module(module)
                .group(group)
                .questionType("SINGLE_CHOICE")
                .content(content)
                .difficulty("EASY")
                .status("ACTIVE")
                .build();
        entityManager.persist(question);
        return question;
    }

    private Exam persistExam(Course course, User createdBy, String title, String status) {
        Exam exam = Exam.builder()
                .course(course)
                .createdBy(createdBy)
                .title(title)
                .durationMinutes(60)
                .isPractice(false)
                .generationType("FIXED")
                .status(status)
                .build();
        entityManager.persist(exam);
        return exam;
    }

    private ExamGroup persistExamGroup(Exam exam, QuestionGroup group) {
        ExamGroup examGroup = ExamGroup.builder()
                .exam(exam)
                .group(group)
                .orderIndex(0)
                .build();
        entityManager.persist(examGroup);
        return examGroup;
    }

    private ExamQuestion persistExamQuestion(Exam exam, Question question) {
        ExamQuestion examQuestion = ExamQuestion.builder()
                .exam(exam)
                .question(question)
                .orderIndex(0)
                .build();
        entityManager.persist(examQuestion);
        return examQuestion;
    }
}
