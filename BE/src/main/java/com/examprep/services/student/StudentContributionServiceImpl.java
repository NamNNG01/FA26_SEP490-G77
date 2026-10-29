package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.student.ContributionDetailDto;
import com.examprep.dto.student.ContributionItemDto;
import com.examprep.dto.student.TipContributionRequestDto;
import com.examprep.entities.QuestionContribution;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.util.validation.QuestionPayload;
import com.examprep.util.validation.QuestionValidator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class StudentContributionServiceImpl implements StudentContributionService {

    private final QuestionContributionRepository contributionRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final QuestionValidator questionValidator;
    private final ObjectMapper objectMapper;

    private void validateActiveEnrollment(Long courseId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        if (courseId == null || !courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
    }

    private String writeJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return null;
        }
    }

    private <T> T readJson(String json, TypeReference<T> ref) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, ref);
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public Map<String, Object> createQuestionContribution(QuestionCreateRequest request, Long userId) {
        if (request == null || request.getCourseId() == null) {
            throw new BadRequestException("Invalid request data");
        }
        validateActiveEnrollment(request.getCourseId(), userId);

        if (request.getModuleId() != null) {
            moduleRepository.findById(request.getModuleId())
                    .filter(m -> m.getCourse().getCourseId().equals(request.getCourseId()))
                    .orElseThrow(() -> new ResourceNotFoundException("Module not found or does not belong to course"));
        }

        if (request.getGroupId() != null) {
            questionGroupRepository.findById(request.getGroupId())
                    .filter(g -> g.getCourse().getCourseId().equals(request.getCourseId()))
                    .orElseThrow(() -> new ResourceNotFoundException("Question group not found or does not belong to course"));
        }

        questionValidator.validateOrThrow(QuestionPayload.from(request));

        QuestionContribution contribution = QuestionContribution.builder()
                .userId(userId)
                .courseId(request.getCourseId())
                .type("QUESTION")
                .content(request.getContent())
                .moduleId(request.getModuleId())
                .groupId(request.getGroupId())
                .questionType(request.getQuestionType())
                .optionsJson(writeJson(request.getOptions()))
                .answerKeyJson(writeJson(request.getAnswerKey()))
                .explanation(request.getExplanation())
                .difficulty(request.getDifficulty())
                .categoryIds(writeJson(request.getCorrectOrder()))
                .essayGradingRubricJson(writeJson(request.getEssayGradingRubric()))
                .questionMetadataJson(writeJson(request.getQuestionMetadata()))
                .status("PENDING")
                .resubmissionCount(0)
                .build();

        QuestionContribution saved = contributionRepository.save(contribution);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus(),
                "createdAt", saved.getSubmittedAt() != null ? saved.getSubmittedAt().toString() : ""
        );
    }

    @Override
    public Map<String, Object> createDocumentContribution(MultipartFile file, Long courseId, String title, Long userId) {
        if (courseId == null) {
            throw new BadRequestException("Course ID is required");
        }
        validateActiveEnrollment(courseId, userId);

        if (file == null || file.isEmpty()) {
            throw new BadRequestException("File is required");
        }
        if (file.getSize() > 20L * 1024 * 1024) {
            throw new BadRequestException("File size exceeds 20 MB limit");
        }

        String originalFilename = file.getOriginalFilename();
        String ext = originalFilename != null && originalFilename.contains(".") ?
                originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase() : "";

        if (!List.of(".pdf", ".docx", ".pptx", ".xlsx").contains(ext)) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "Unsupported file type", Map.of("code", "UNSUPPORTED_FILE_TYPE"));
        }

        String fileUrl = null;
        try {
            Path uploadPath = Paths.get("uploads", "documents");
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }
            String uniqueName = UUID.randomUUID().toString() + "_" + (originalFilename != null ? originalFilename : "doc");
            Path targetPath = uploadPath.resolve(uniqueName);
            Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
            fileUrl = targetPath.toString();
        } catch (IOException e) {
            log.error("Failed to store uploaded document file", e);
            throw new BadRequestException("Failed to store uploaded file");
        }

        QuestionContribution contribution = QuestionContribution.builder()
                .userId(userId)
                .courseId(courseId)
                .type("DOCUMENT")
                .title(title != null ? title : originalFilename)
                .content(title != null ? title : (originalFilename != null ? originalFilename : "Document Contribution"))
                .fileUrl(fileUrl)
                .fileName(originalFilename)
                .fileSizeKb((int) (file.getSize() / 1024))
                .status("PENDING")
                .resubmissionCount(0)
                .build();

        QuestionContribution saved = contributionRepository.save(contribution);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus(),
                "fileName", saved.getFileName() != null ? saved.getFileName() : ""
        );
    }

    @Override
    public Map<String, Object> createTipContribution(TipContributionRequestDto request, Long userId) {
        if (request == null || request.getCourseId() == null) {
            throw new BadRequestException("Invalid request data");
        }
        validateActiveEnrollment(request.getCourseId(), userId);

        if (request.getTitle() == null || request.getTitle().isBlank() || request.getContent() == null || request.getContent().isBlank()) {
            throw new BadRequestException("Title and content are required");
        }

        QuestionContribution contribution = QuestionContribution.builder()
                .userId(userId)
                .courseId(request.getCourseId())
                .type("TIP")
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .sourceReference(request.getSourceReference())
                .status("PENDING")
                .resubmissionCount(0)
                .build();

        QuestionContribution saved = contributionRepository.save(contribution);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ContributionItemDto> listContributions(String type, String status, int page, int size, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        String normalizedType = (type != null && !type.isBlank()) ? type.trim().toUpperCase() : null;
        String normalizedStatus = (status != null && !status.isBlank()) ? status.trim().toUpperCase() : null;

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "submittedAt"));
        Page<QuestionContribution> contributions = contributionRepository.findByStudentAndFilters(userId, normalizedType, normalizedStatus, pageable);

        return contributions.map(c -> {
            String summary = c.getTitle();
            if (summary == null || summary.isBlank()) {
                String content = c.getContent();
                if (content != null) {
                    summary = content.length() > 100 ? content.substring(0, 100) + "..." : content;
                } else {
                    summary = "Contribution #" + c.getContributionId();
                }
            }
            return ContributionItemDto.builder()
                    .contributionId(c.getContributionId())
                    .type(c.getType())
                    .status(c.getStatus())
                    .summary(summary)
                    .createdAt(c.getSubmittedAt())
                    .reviewedAt(c.getReviewedAt())
                    .resubmissionCount(c.getResubmissionCount())
                    .build();
        });
    }

    @Override
    @Transactional(readOnly = true)
    public ContributionDetailDto getContributionDetail(Long contributionId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        QuestionContribution c = contributionRepository.findById(contributionId)
                .orElseThrow(() -> new ResourceNotFoundException("Contribution not found"));

        if (!c.getUserId().equals(userId)) {
            throw new ForbiddenException("Only the owner can view this contribution");
        }

        List<AnswerOptionDto> options = readJson(c.getOptionsJson(), new TypeReference<List<AnswerOptionDto>>() {});
        Object answerKey = readJson(c.getAnswerKeyJson(), new TypeReference<Object>() {});
        Object essayGradingRubric = readJson(c.getEssayGradingRubricJson(), new TypeReference<Object>() {});
        Object questionMetadata = readJson(c.getQuestionMetadataJson(), new TypeReference<Object>() {});

        return ContributionDetailDto.builder()
                .contributionId(c.getContributionId())
                .courseId(c.getCourseId())
                .type(c.getType())
                .status(c.getStatus())
                .title(c.getTitle())
                .content(c.getContent())
                .moduleId(c.getModuleId())
                .groupId(c.getGroupId())
                .questionType(c.getQuestionType())
                .options(options)
                .answerKey(answerKey)
                .explanation(c.getExplanation())
                .difficulty(c.getDifficulty())
                .essayGradingRubric(essayGradingRubric)
                .questionMetadata(questionMetadata)
                .fileName(c.getFileName())
                .fileSizeKb(c.getFileSizeKb())
                .fileUrl(c.getFileUrl())
                .sourceReference(c.getSourceReference())
                .reviewNote(c.getReviewNote())
                .resubmissionCount(c.getResubmissionCount())
                .createdAt(c.getSubmittedAt())
                .reviewedAt(c.getReviewedAt())
                .build();
    }

    @Override
    public Map<String, Object> resubmitContribution(Long contributionId, Object requestBody, MultipartFile file, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        QuestionContribution c = contributionRepository.findById(contributionId)
                .orElseThrow(() -> new ResourceNotFoundException("Contribution not found"));

        if (!c.getUserId().equals(userId)) {
            throw new ForbiddenException("Only the owner can resubmit this contribution");
        }

        if (!"REJECTED".equals(c.getStatus())) {
            throw new BaseException(ResponseCode.CONFLICT, "Only rejected contributions can be resubmitted", Map.of("code", "NOT_REJECTED"));
        }

        if ("QUESTION".equals(c.getType())) {
            QuestionCreateRequest qReq;
            if (requestBody instanceof QuestionCreateRequest) {
                qReq = (QuestionCreateRequest) requestBody;
            } else {
                qReq = objectMapper.convertValue(requestBody, QuestionCreateRequest.class);
            }
            if (qReq.getCourseId() == null) {
                qReq.setCourseId(c.getCourseId());
            }
            validateActiveEnrollment(qReq.getCourseId(), userId);
            questionValidator.validateOrThrow(QuestionPayload.from(qReq));

            c.setCourseId(qReq.getCourseId());
            c.setContent(qReq.getContent());
            c.setModuleId(qReq.getModuleId());
            c.setGroupId(qReq.getGroupId());
            c.setQuestionType(qReq.getQuestionType());
            c.setOptionsJson(writeJson(qReq.getOptions()));
            c.setAnswerKeyJson(writeJson(qReq.getAnswerKey()));
            c.setExplanation(qReq.getExplanation());
            c.setDifficulty(qReq.getDifficulty());
            c.setCategoryIds(writeJson(qReq.getCorrectOrder()));
            c.setEssayGradingRubricJson(writeJson(qReq.getEssayGradingRubric()));
            c.setQuestionMetadataJson(writeJson(qReq.getQuestionMetadata()));
        } else if ("TIP".equals(c.getType())) {
            TipContributionRequestDto tReq;
            if (requestBody instanceof TipContributionRequestDto) {
                tReq = (TipContributionRequestDto) requestBody;
            } else if (requestBody instanceof Map) {
                tReq = objectMapper.convertValue(requestBody, TipContributionRequestDto.class);
            } else {
                throw new BadRequestException("Invalid tip resubmission request");
            }
            if (tReq.getCourseId() == null) {
                tReq.setCourseId(c.getCourseId());
            }
            validateActiveEnrollment(tReq.getCourseId(), userId);
            if (tReq.getTitle() == null || tReq.getTitle().isBlank() || tReq.getContent() == null || tReq.getContent().isBlank()) {
                throw new BadRequestException("Title and content are required");
            }
            c.setCourseId(tReq.getCourseId());
            c.setTitle(tReq.getTitle().trim());
            c.setContent(tReq.getContent().trim());
            c.setSourceReference(tReq.getSourceReference());
        } else if ("DOCUMENT".equals(c.getType())) {
            if (file != null && !file.isEmpty()) {
                if (file.getSize() > 20L * 1024 * 1024) {
                    throw new BadRequestException("File size exceeds 20 MB limit");
                }
                String originalFilename = file.getOriginalFilename();
                String ext = originalFilename != null && originalFilename.contains(".") ?
                        originalFilename.substring(originalFilename.lastIndexOf(".")).toLowerCase() : "";
                if (!List.of(".pdf", ".docx", ".pptx", ".xlsx").contains(ext)) {
                    throw new BaseException(ResponseCode.BAD_REQUEST, "Unsupported file type", Map.of("code", "UNSUPPORTED_FILE_TYPE"));
                }
                try {
                    Path uploadPath = Paths.get("uploads", "documents");
                    if (!Files.exists(uploadPath)) {
                        Files.createDirectories(uploadPath);
                    }
                    String uniqueName = UUID.randomUUID().toString() + "_" + (originalFilename != null ? originalFilename : "doc");
                    Path targetPath = uploadPath.resolve(uniqueName);
                    Files.copy(file.getInputStream(), targetPath, StandardCopyOption.REPLACE_EXISTING);
                    c.setFileUrl(targetPath.toString());
                    c.setFileName(originalFilename);
                    c.setFileSizeKb((int) (file.getSize() / 1024));
                } catch (IOException e) {
                    throw new BadRequestException("Failed to store uploaded file");
                }
            }
            if (requestBody instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) requestBody;
                if (map.containsKey("title") && map.get("title") != null) {
                    String title = map.get("title").toString();
                    c.setTitle(title);
                    c.setContent(title);
                }
            }
        }

        c.setStatus("PENDING");
        c.setResubmissionCount(c.getResubmissionCount() + 1);
        c.setReviewNote(null);
        QuestionContribution saved = contributionRepository.save(c);

        return Map.of(
                "contributionId", saved.getContributionId(),
                "status", saved.getStatus(),
                "resubmissionCount", saved.getResubmissionCount()
        );
    }
}
