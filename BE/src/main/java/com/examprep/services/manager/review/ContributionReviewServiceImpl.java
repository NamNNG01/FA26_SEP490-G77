package com.examprep.services.manager.review;

import com.examprep.entities.*;
import com.examprep.exceptions.ReviewException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ContributionReviewServiceImpl implements ContributionReviewService {

    private final QuestionContributionRepository contributionRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final ReviewLogRepository reviewLogRepository;
    private final QuestionPromotionService questionPromotionService;
    private final ReviewNotificationService reviewNotificationService;

    private List<Long> getMyCourseIds(User manager) {
        if (manager == null) return List.of();
        if (User.ROLE_ADMIN.equals(manager.getRoleName())) {
            return null; // admin has no restrictions
        }
        return courseRepository.findCourseIdsManagedByUser(manager.getUserId());
    }

    private void assertCanAccessCourse(User manager, Long courseId) {
        if (User.ROLE_ADMIN.equals(manager.getRoleName())) {
            return;
        }
        boolean hasAccess = courseRepository.existsManagedCourse(courseId, manager.getUserId());
        if (!hasAccess) {
            throw new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Course not found or outside scope");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionContribution> listContributions(User manager, Long courseId, Long moduleId, String questionType,
                                                        String difficulty, String status, Long contributorId,
                                                        String keyword, Instant submittedFrom, Instant submittedTo, Pageable pageable) {
        List<Long> myCourseIds = getMyCourseIds(manager);
        if (myCourseIds != null && myCourseIds.isEmpty()) {
            return Page.empty(pageable);
        }
        if (courseId != null) {
            assertCanAccessCourse(manager, courseId);
            myCourseIds = List.of(courseId);
        }

        String normStatus = (status == null || status.isBlank()) ? "PENDING" : status.toUpperCase();
        if ("ALL".equals(normStatus)) {
            normStatus = null;
        }

        String kwPattern = (keyword == null || keyword.isBlank()) ? null : "%" + keyword.strip().toLowerCase()
                .replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";

        return contributionRepository.findManagedContributions(myCourseIds, moduleId, questionType, difficulty,
                normStatus, contributorId, kwPattern, submittedFrom, submittedTo, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public QuestionContribution getContributionDetail(User manager, Long id) {
        QuestionContribution c = contributionRepository.findById(id)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Contribution not found"));
        assertCanAccessCourse(manager, c.getCourseId());
        return c;
    }

    @Override
    @Transactional
    public Map<String, Object> approve(User manager, Long id, Long requestVersion, String note) {
        QuestionContribution c = contributionRepository.findById(id)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Contribution not found"));
        assertCanAccessCourse(manager, c.getCourseId());

        if (c.getUserId().equals(manager.getUserId())) {
            throw new ReviewException(HttpStatus.FORBIDDEN, "FORBIDDEN", "CANNOT_REVIEW_OWN", "Cannot review your own contribution");
        }
        if (!"PENDING".equals(c.getStatus())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "ALREADY_REVIEWED", "Contribution already reviewed", Map.of("currentStatus", c.getStatus()));
        }
        if (requestVersion != null && !requestVersion.equals(c.getVersion())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "VERSION_CONFLICT", "Version mismatch", Map.of("currentVersion", c.getVersion(), "currentStatus", c.getStatus()));
        }

        Course course = courseRepository.findById(c.getCourseId())
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Course not found"));
        com.examprep.entities.Module module = c.getModuleId() != null ? moduleRepository.findById(c.getModuleId()).orElse(null) : null;
        QuestionGroup group = c.getGroupId() != null ? questionGroupRepository.findById(c.getGroupId()).orElse(null) : null;

        Question savedQuestion = questionPromotionService.promoteContribution(c, course, module, group, manager);

        c.setStatus("ACCEPTED");
        c.setReviewedBy(manager.getUserId());
        c.setReviewedAt(Instant.now());
        c.setReviewNote(note);
        c.setAcceptedQuestionId(savedQuestion.getQuestionId());
        QuestionContribution savedContribution = contributionRepository.save(c);

        ReviewLog log = ReviewLog.builder()
                .targetType("QUESTION_CONTRIBUTION")
                .targetId(c.getContributionId())
                .reviewerId(manager.getUserId())
                .decision("APPROVED")
                .note(note)
                .build();
        reviewLogRepository.save(log);

        String title = "Câu hỏi của bạn đã được duyệt";
        String content = "Câu hỏi \"" + (c.getTitle() != null ? c.getTitle() : "Đóng góp") + "\" trong khóa \"" + course.getTitle() + "\" đã được duyệt và đưa vào ngân hàng câu hỏi.";
        reviewNotificationService.sendNotification(c.getUserId(), title, content, "CONTRIBUTION_APPROVED", "QUESTION_CONTRIBUTION", String.valueOf(c.getContributionId()), "/contributions/" + c.getContributionId());

        return Map.of(
                "contributionId", savedContribution.getContributionId(),
                "status", savedContribution.getStatus(),
                "acceptedQuestionId", savedQuestion.getQuestionId(),
                "reviewedBy", manager.getUserId(),
                "reviewedAt", savedContribution.getReviewedAt(),
                "version", savedContribution.getVersion()
        );
    }

    @Override
    @Transactional
    public Map<String, Object> reject(User manager, Long id, Long requestVersion, String reason) {
        if (reason == null || reason.strip().length() < 5) {
            throw new ReviewException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "REASON_REQUIRED", "Reason is required (at least 5 characters)");
        }

        QuestionContribution c = contributionRepository.findById(id)
                .orElseThrow(() -> new ReviewException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", null, "Contribution not found"));
        assertCanAccessCourse(manager, c.getCourseId());

        if (c.getUserId().equals(manager.getUserId())) {
            throw new ReviewException(HttpStatus.FORBIDDEN, "FORBIDDEN", "CANNOT_REVIEW_OWN", "Cannot review your own contribution");
        }
        if (!"PENDING".equals(c.getStatus())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "ALREADY_REVIEWED", "Contribution already reviewed", Map.of("currentStatus", c.getStatus()));
        }
        if (requestVersion != null && !requestVersion.equals(c.getVersion())) {
            throw new ReviewException(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "VERSION_CONFLICT", "Version mismatch", Map.of("currentVersion", c.getVersion(), "currentStatus", c.getStatus()));
        }

        c.setStatus("REJECTED");
        c.setReviewedBy(manager.getUserId());
        c.setReviewedAt(Instant.now());
        c.setReviewNote(reason.strip());
        QuestionContribution savedContribution = contributionRepository.save(c);

        ReviewLog log = ReviewLog.builder()
                .targetType("QUESTION_CONTRIBUTION")
                .targetId(c.getContributionId())
                .reviewerId(manager.getUserId())
                .decision("REJECTED")
                .note(reason.strip())
                .build();
        reviewLogRepository.save(log);

        boolean canResubmit = (c.getResubmissionCount() < 1);
        String title = "Câu hỏi của bạn chưa được duyệt";
        String content = "Câu hỏi bị từ chối. Lý do: " + reason.strip() + (canResubmit ? " Bạn còn 1 lần chỉnh sửa và gửi lại." : " Bạn đã dùng hết số lần gửi.");
        reviewNotificationService.sendNotification(c.getUserId(), title, content, "CONTRIBUTION_REJECTED", "QUESTION_CONTRIBUTION", String.valueOf(c.getContributionId()), "/contributions/" + c.getContributionId());

        return Map.of(
                "contributionId", savedContribution.getContributionId(),
                "status", savedContribution.getStatus(),
                "canResubmit", canResubmit,
                "reviewedBy", manager.getUserId(),
                "reviewedAt", savedContribution.getReviewedAt(),
                "version", savedContribution.getVersion()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> stats(User manager, Long courseId) {
        List<Long> myCourseIds = getMyCourseIds(manager);
        if (courseId != null) {
            assertCanAccessCourse(manager, courseId);
            myCourseIds = List.of(courseId);
        }
        if (myCourseIds != null && myCourseIds.isEmpty()) {
            return Map.of("pending", 0L, "approvedLast30d", 0L, "rejectedLast30d", 0L, "approvalRate", 0.0, "byCourse", List.of());
        }

        Instant thirtyDaysAgo = Instant.now().minusSeconds(30L * 24 * 60 * 60);

        long pending = contributionRepository.countPending(myCourseIds);
        long approved30 = contributionRepository.countApprovedSince(myCourseIds, thirtyDaysAgo);
        long rejected30 = contributionRepository.countRejectedSince(myCourseIds, thirtyDaysAgo);

        Double approvalRate = null;
        if ((approved30 + rejected30) > 0) {
            approvalRate = (double) approved30 / (approved30 + rejected30);
        }

        List<Object[]> courseCounts = contributionRepository.countPendingByCourse(myCourseIds);
        List<Map<String, Object>> byCourse = courseCounts.stream().map(row -> Map.of(
                "courseId", row[0],
                "courseTitle", row[1],
                "pending", row[2]
        )).toList();

        return Map.of(
                "pending", pending,
                "approvedLast30d", approved30,
                "rejectedLast30d", rejected30,
                "approvalRate", approvalRate != null ? approvalRate : 0.0,
                "byCourse", byCourse
        );
    }
}
