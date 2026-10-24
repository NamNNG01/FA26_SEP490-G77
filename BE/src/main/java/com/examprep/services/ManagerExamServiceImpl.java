package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.*;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import com.examprep.dto.question.ImportBlockResult;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.util.QuestionTypeUtil;
import com.examprep.util.importer.DocxTextExtractor;
import com.examprep.util.importer.PdfTextExtractor;
import com.examprep.util.importer.TemplateBlockParser;
import com.examprep.util.importer.TemplateQuestionMapper;
import org.springframework.web.multipart.MultipartFile;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.math.BigDecimal;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class ManagerExamServiceImpl implements ManagerExamService {
    private static final Set<String> TYPES=Set.of("SINGLE_CHOICE","MULTIPLE_CHOICE","TRUE_FALSE","FILL_BLANK","MATCHING","ORDERING","ESSAY","CODE","DIAGRAM");
    private static final List<String> KINDS=List.of("QUIZ","ESSAY","CODE","DIAGRAM");
    private final ExamRepository exams;
    private final ExamQuestionRepository links;
    private final ExamGroupRepository groupLinks;
    private final ExamConfigRepository configs;
    private final ExamAttemptRepository attempts;
    private final QuestionRepository questions;
    private final QuestionGroupRepository groups;
    private final CourseRepository courses;
    private final CourseManagerRepository assignments;
    private final ModuleRepository modules;
    private final UserRepository users;
    private final ObjectMapper json;
    private final QuestionService questionService;
    private final PdfTextExtractor pdfText;
    private final DocxTextExtractor docxText;
    private final TemplateBlockParser blockParser;
    private final TemplateQuestionMapper blockMapper;

    private List<ExamResponse> mapExamPage(List<Exam> exams, boolean detail) {
        if (exams.isEmpty()) {
            return List.of();
        }

        List<Long> examIds = exams.stream()
                .map(Exam::getExamId)
                .toList();

        // Load toàn bộ dữ liệu của trang bằng batch queries
        List<ExamQuestion> directLinks =
                links.findAllByExamIds(examIds);

        List<ExamGroup> groupedLinks =
                groupLinks.findAllByExamIds(examIds);

        List<ExamConfig> allConfigs =
                configs.findAllByExamIds(examIds);

        // Gom dữ liệu theo examId
        Map<Long, List<ExamQuestion>> directByExam =
                directLinks.stream().collect(
                        Collectors.groupingBy(
                                x -> x.getExam().getExamId(),
                                LinkedHashMap::new,
                                Collectors.toList()
                        )
                );

        Map<Long, List<ExamGroup>> groupsByExam =
                groupedLinks.stream().collect(
                        Collectors.groupingBy(
                                x -> x.getExam().getExamId(),
                                LinkedHashMap::new,
                                Collectors.toList()
                        )
                );

        Map<Long, List<ExamConfig>> configsByExam =
                allConfigs.stream().collect(
                        Collectors.groupingBy(
                                x -> x.getExam().getExamId(),
                                LinkedHashMap::new,
                                Collectors.toList()
                        )
                );

        // Lấy ID của toàn bộ group trong trang
        List<Long> groupIds = groupedLinks.stream()
                .map(x -> x.getGroup().getGroupId())
                .distinct()
                .toList();

        // Chỉ query questions nếu có group
        List<Question> groupedQuestions = groupIds.isEmpty()
                ? List.of()
                : questions.findAllByGroupIds(groupIds);

        Map<Long, List<Question>> questionsByGroup =
                groupedQuestions.stream().collect(
                        Collectors.groupingBy(
                                q -> q.getGroup().getGroupId(),
                                LinkedHashMap::new,
                                Collectors.toList()
                        )
                );

        // Mapping: không gọi repository trong vòng lặp này
        List<ExamResponse> items = new ArrayList<>(exams.size());

        for (Exam exam : exams) {
            Long examId = exam.getExamId();

            List<ExamQuestion> direct = directByExam.getOrDefault(
                    examId, List.of()
            );

            List<ExamGroup> grouped = groupsByExam.getOrDefault(
                    examId, List.of()
            );

            List<ExamConfig> configured = configsByExam.getOrDefault(
                    examId, List.of()
            );

            Map<Long, Question> all = new LinkedHashMap<>();

            // Giữ thứ tự và cách tính unique question như logic cũ:
            // direct questions trước, sau đó đến questions thuộc groups.
            for (ExamQuestion link : direct) {
                Question q = link.getQuestion();
                all.put(q.getQuestionId(), q);
            }

            for (ExamGroup groupLink : grouped) {
                Long groupId = groupLink.getGroup().getGroupId();

                for (Question q : questionsByGroup.getOrDefault(
                        groupId, List.of())) {
                    all.put(q.getQuestionId(), q);
                }
            }

            items.add(buildResponse(
                    exam, detail, direct, grouped, configured, all, questionsByGroup
            ));
        }

        return items;
    }
    @Override
    public PageResponse<ExamResponse> list(
            UserPrincipal user,
            String search,
            Long courseId,
            Long moduleId,
            String status,
            String kind,
            int page,
            int size
    ) {
        long start = System.nanoTime();

        // 1. Validate request và kiểm tra quyền
        if (page < 0 || size < 1 || size > 100
                || (long) page * size > Integer.MAX_VALUE) {
            throw bad("Invalid page or size (1-100).");
        }

        if (courseId != null) {
            access(user, courseId, false);
        }

        if (moduleId != null) {
            access(user, module(moduleId).getCourse().getCourseId(), false);
        }

        if (status != null
                && !Set.of("DRAFT", "PUBLISHED", "ARCHIVED").contains(status)) {
            throw bad("Invalid exam status.");
        }

        if (kind != null && !kind.equals("all") && !KINDS.contains(kind)) {
            throw bad("Invalid examKind.");
        }

        long validated = System.nanoTime();

        // 2. Build Specification: giữ nguyên điều kiện nghiệp vụ
        Specification<Exam> filter = (root, query, cb) -> {
            Join<Exam, Course> c = root.join("course", JoinType.LEFT);
            Join<Exam, Module> m = root.join("module", JoinType.LEFT);
            Join<Module, Course> mc = m.join("course", JoinType.LEFT);

            List<Predicate> where = new ArrayList<>();

            if (!admin(user)) {
                where.add(cb.or(
                        cb.isNull(c),
                        scope(c, query, cb, user.getId())
                ));

                where.add(cb.or(
                        cb.isNull(m),
                        scope(mc, query, cb, user.getId())
                ));

                where.add(cb.or(
                        cb.isNotNull(c),
                        cb.isNotNull(m)
                ));
            }

            if (courseId != null) {
                where.add(cb.or(
                        cb.equal(c.get("courseId"), courseId),
                        cb.and(
                                cb.isNull(c),
                                cb.equal(mc.get("courseId"), courseId)
                        )
                ));
            }

            if (moduleId != null) {
                where.add(cb.equal(m.get("moduleId"), moduleId));
            }

            if (status != null) {
                where.add(cb.equal(root.get("status"), status));
            }

            if (search != null && !search.isBlank()) {
                where.add(cb.like(
                        cb.lower(root.get("title")),
                        pattern(search),
                        '!'
                ));
            }

            if (kind != null && !kind.equals("all")) {
                List<Predicate> present = KINDS.stream()
                        .map(k -> familyPresent(root, query, cb, k))
                        .toList();

                for (int i = 0; i < 4; i++) {
                    if (!KINDS.get(i).equals(kind)) {
                        where.add(cb.not(present.get(i)));
                    }
                }

                if (!kind.equals("QUIZ")) {
                    where.add(present.get(KINDS.indexOf(kind)));
                }
            }

            return cb.and(where.toArray(Predicate[]::new));
        };

        long built = System.nanoTime();

        // 3. Execute query (có thể bao gồm cả query COUNT)
        Pageable pageable = PageRequest.of(
                page,
                size,
                Sort.by(
                        Sort.Order.desc("createdAt"),
                        Sort.Order.desc("examId")
                )
        );

        Page<Exam> result = exams.findAll(filter, pageable);

        long queried = System.nanoTime();

        // 4. Map entity sang response
        List<ExamResponse> items = mapExamPage(result.getContent(), false);

        long mapped = System.nanoTime();

        // 5. Log thời gian từng giai đoạn
        log.debug(
                "EXAM_LIST_DEBUG | userId={} | page={} | size={} "
                        + "| kind={} | resultCount={} | totalElements={} "
                        + "| validation={}ms | buildSpec={}ms "
                        + "| repository={}ms | mapping={}ms | total={}ms",
                user.getId(),
                page,
                size,
                kind,
                items.size(),
                result.getTotalElements(),
                (validated - start) / 1_000_000,
                (built - validated) / 1_000_000,
                (queried - built) / 1_000_000,
                (mapped - queried) / 1_000_000,
                (mapped - start) / 1_000_000
        );

        return PageResponse.of(result, items);
    }


    private Predicate scope(Path<Course> course,CriteriaQuery<?> query,CriteriaBuilder cb,Long userId) {
        Subquery<Long> assigned=query.subquery(Long.class);
        Root<CourseManager> a=assigned.from(CourseManager.class);
        assigned.select(a.get("courseManagerId")).where(cb.equal(a.get("course"),course),cb.equal(a.get("user").get("userId"),userId));
        return cb.or(cb.equal(course.get("manager").get("userId"),userId),cb.exists(assigned));
    }

    private Predicate familyPresent(Root<Exam> exam,CriteriaQuery<?> query,CriteriaBuilder cb,String kind) {
        Subquery<Long> q=query.subquery(Long.class); Root<Question> question=q.from(Question.class);
        Subquery<Long> direct=q.subquery(Long.class); Root<ExamQuestion> link=direct.from(ExamQuestion.class);
        direct.select(link.get("examQuestionId")).where(cb.equal(link.get("exam"),exam),cb.equal(link.get("question"),question));
        Subquery<Long> grouped=q.subquery(Long.class); Root<ExamGroup> gl=grouped.from(ExamGroup.class);
        grouped.select(gl.get("examGroupId")).where(cb.equal(gl.get("exam"),exam),cb.equal(gl.get("group"),question.get("group")));
        q.select(question.get("questionId")).where(familyPredicate(question.get("questionType"),cb,kind),cb.or(cb.exists(direct),cb.exists(grouped)));
        Subquery<Long> conf=query.subquery(Long.class); Root<ExamConfig> config=conf.from(ExamConfig.class);
        conf.select(config.get("configId")).where(cb.equal(config.get("exam"),exam),familyPredicate(config.get("questionType"),cb,kind));
        return cb.or(cb.exists(q),cb.exists(conf));
    }
    private Predicate familyPredicate(Path<String> type,CriteriaBuilder cb,String kind) {
        return kind.equals("QUIZ")?cb.not(type.in("ESSAY","CODE","DIAGRAM")):cb.equal(type,kind);
    }

    @Override public ExamResponse detail(UserPrincipal user,Long id) { Exam e=read(id); check(user,e); return response(e,true); }

    @Override
    @Transactional
    public ExamResponse create(UserPrincipal user, ExamRequests.Create r) {
        long start = System.nanoTime();
        long t;

        BigDecimal maxScore = maxScore(r.getMaxScore());
        Module module = r.getModuleId() == null
                ? null : module(r.getModuleId());

        Long courseId = r.getCourseId() != null
                ? r.getCourseId()
                : module == null ? null : module.getCourse().getCourseId();

        if (courseId == null) {
            throw bad("courseId or moduleId is required.");
        }

        Course course = access(user, courseId, true);
        Set<Long> checked = new HashSet<>(List.of(courseId));

        if (module != null
                && !module.getCourse().getCourseId().equals(courseId)) {
            throw bad("Module must belong to the selected course.");
        }

        validateMode(
                r.getGenerationType(),
                size(r.getQuestionIds()) + size(r.getGroupIds()) + size(r.getImportedQuestions()),
                size(r.getConfigs())
        );

        List<ExamRequests.QuestionLink> questionItems =
                list(r.getQuestionIds());

        Set<Long> ids = new HashSet<>();

        for (var item : questionItems) {
            Long questionId = item.getQuestionId();
            positive(questionId);

            if (!ids.add(questionId)) {
                throw conflict("Question is duplicated.");
            }
        }

        Map<Long, Question> questionMap = new HashMap<>();

        if (!ids.isEmpty()) {
            questionMap = questions
                    .findActiveWithAccessRelationsByQuestionIdIn(ids)
                    .stream()
                    .collect(Collectors.toMap(
                            Question::getQuestionId,
                            Function.identity()
                    ));

            if (questionMap.size() != ids.size()) {
                throw missing("Question");
            }
        }

// Giữ nguyên kiểm tra quyền và trạng thái.
        for (var item : questionItems) {
            Question q = questionMap.get(item.getQuestionId());
            active(user, q, checked);
        }

        Set<Long> groupIds = new HashSet<>();
        for (var item : list(r.getGroupIds())) {
            if (!groupIds.add(item.getGroupId())) {
                throw conflict("Group is duplicated.");
            }
            groupAccess(user, group(item.getGroupId()), checked);
        }

        validateConfigs(r.getConfigs(), courseId);
        if (!list(r.getImportedQuestions()).isEmpty() && module == null) {
            throw bad("Select a module for this exam before importing questions.");
        }
        long validated = System.nanoTime();

        Exam e = Exam.builder()
                .course(course)
                .module(module)
                .createdBy(users.getReferenceById(user.getId()))
                .title(r.getTitle().strip())
                .description(r.getDescription())
                .durationMinutes(r.getDurationMinutes())
                .isPractice(r.getIsPractice())
                .generationType(r.getGenerationType())
                .maxScore(maxScore)
                .status("DRAFT")
                .build();

        exams.save(e);
        long savedExam = System.nanoTime();

        int nextOrder = 0;

        Set<Long> attachedIds = new HashSet<>();

        for (var item : questionItems) {
            Question q = questionMap.get(item.getQuestionId());

            ExamQuestion saved = attachValidatedQuestion(
                    e,
                    item,
                    q,
                    attachedIds,
                    nextOrder
            );

            nextOrder = Math.max(
                    nextOrder,
                    saved.getOrderIndex() + 1
            );
        }

        // Questions imported on the create screen: saved and attached in this same transaction (no orphans if E-02 fails).
        if (!list(r.getImportedQuestions()).isEmpty()) {
            attachImported(user, e,
                    r.getImportedQuestions().stream().map(ExamRequests.ImportedQuestion::getQuestion).toList(),
                    r.getImportedQuestions().stream().map(i -> weight(i.getWeight())).toList(),
                    attachedIds, nextOrder);
        }

        for (var item : list(r.getGroupIds())) {
            attachGroup(user, e, item, checked);
        }
        long attached = System.nanoTime();

        saveConfigs(e, r.getConfigs());
        exams.flush();
        long flushed = System.nanoTime();

        ExamResponse response = response(e, true);
        long mapped = System.nanoTime();

        log.debug(
                "EXAM_CREATE_DEBUG | userId={} | questionCount={} | groupCount={} | configCount={} "
                        + "| validation={}ms | saveExam={}ms | attach={}ms "
                        + "| saveConfigsFlush={}ms | response={}ms | total={}ms",
                user.getId(),
                size(r.getQuestionIds()),
                size(r.getGroupIds()),
                size(r.getConfigs()),
                (validated - start) / 1_000_000,
                (savedExam - validated) / 1_000_000,
                (attached - savedExam) / 1_000_000,
                (flushed - attached) / 1_000_000,
                (mapped - flushed) / 1_000_000,
                (mapped - start) / 1_000_000
        );

        return response;
    }
    private ExamQuestion attachValidatedQuestion(
            Exam e,
            ExamRequests.QuestionLink r,
            Question q,
            Set<Long> attachedIds,
            int defaultOrder
    ) {
        if (!attachedIds.add(q.getQuestionId())) {
            throw conflict("Question is already in this exam.");
        }

        int order = r.getOrderIndex() == null
                ? defaultOrder
                : r.getOrderIndex();

        BigDecimal wt = r.getWeight() != null
                ? weight(r.getWeight())
                : BigDecimal.ONE;

        return links.save(
                ExamQuestion.builder()
                        .exam(e)
                        .question(q)
                        .weight(wt)
                        .orderIndex(order)
                        .build()
        );
    }
    @Override @Transactional
    public ExamResponse update(UserPrincipal user,Long id,ExamRequests.Update r) {
        Exam e=write(user,id);
        boolean structural=r.getTitle()!=null || r.getCourseId()!=null || r.getModuleId()!=null || r.getDurationMinutes()!=null || r.getIsPractice()!=null
                || r.getGenerationType()!=null || r.getMaxScore()!=null || r.getConfigs()!=null;
        if(structural) editable(e);
        Long courseId=r.getCourseId()==null?courseId(e):r.getCourseId();
        Module module=r.getModuleId()==null?e.getModule():module(r.getModuleId());
        if(module!=null && !module.getCourse().getCourseId().equals(courseId)) throw bad("Module must belong to the selected course.");
        if(r.getCourseId()!=null && r.getConfigs()==null)
            for(ExamConfig config:configs.findByExamExamIdOrderByConfigIdAsc(id)) validateConfigModule(config.getModule(),courseId);
        if(r.getCourseId()!=null || r.getModuleId()!=null) { e.setCourse(access(user,courseId,true)); e.setModule(module); }
        if(r.getTitle()!=null) e.setTitle(r.getTitle().strip());
        if(r.getDescription()!=null) e.setDescription(r.getDescription());
        if(r.getDurationMinutes()!=null) e.setDurationMinutes(r.getDurationMinutes());
        if(r.getIsPractice()!=null) e.setIsPractice(r.getIsPractice());
        if(r.getMaxScore()!=null) e.setMaxScore(maxScore(r.getMaxScore()));
        if(r.getGenerationType()!=null) e.setGenerationType(r.getGenerationType());
        if(r.getConfigs()!=null) { validateConfigs(r.getConfigs(),courseId); configs.deleteByExamExamId(id); configs.flush(); saveConfigs(e,r.getConfigs()); }
        if(r.getGenerationType()!=null) validateMode(e.getGenerationType(),links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(id).size()+groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(id).size(),configs.findByExamExamIdOrderByConfigIdAsc(id).size());
        exams.flush(); return response(e,true);
    }

    @Override @Transactional
    public ExamResponse.Published publish(UserPrincipal user,Long id,ExamRequests.Publish r) {
        Exam e=write(user,id); ExamResponse state=response(e,false);
        if(r.status().equals("PUBLISHED")) {
            List<ExamConfig> configured=configs.findByExamExamIdOrderByConfigIdAsc(id);
            List<ExamQuestion> direct=links.findAllByExamIds(List.of(id));
            validateMode(e.getGenerationType(),direct.size()
                    +groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(id).size(),configured.size());
            for(ExamConfig config:configured) validateConfigModule(config.getModule(),courseId(e));
            if(state.questionCount()==0) throw bad("Add at least one question before publishing.");
            // Re-checked here because the bank may have changed since the rules were saved.
            for(int i=0;i<configured.size();i++) {
                ExamConfig c=configured.get(i);
                checkDrawable(courseId(e),i+1,c.getQuestionType(),c.getModule()==null?null:c.getModule().getModuleId(),c.getDifficulty(),c.getNumberOfQuestions());
            }

            for(ExamQuestion l : direct) {
                if(l.getWeight().compareTo(BigDecimal.ZERO) <= 0) throw conflict("Question weight must be positive.");
                if(!"ACTIVE".equals(l.getQuestion().getStatus()) || !"APPROVED".equals(l.getQuestion().getApprovalStatus()) || l.getQuestion().getDeletedAt() != null)
                    throw conflict("All questions in a published exam must be active and approved.");
            }
        }
        e.setStatus(r.status()); exams.flush();
        List<String> warnings=new ArrayList<>();
        if(r.status().equals("PUBLISHED")) for(Question question:examQuestions(e).values())
            if(Set.of("ESSAY","DIAGRAM").contains(question.getQuestionType()) && (question.getEssayGradingRubric()==null || question.getEssayGradingRubric().isBlank()))
                warnings.add("Question "+question.getQuestionId()+" has no rubric.");
        return new ExamResponse.Published(id,e.getTitle(),e.getStatus(),state.questionCount(),warnings);
    }
    @Override @Transactional public void delete(UserPrincipal user,Long id) {
        Exam e=write(user,id); editable(e);
        configs.deleteByExamExamId(id); links.deleteByExamExamId(id); groupLinks.deleteByExamExamId(id);
        exams.delete(e); exams.flush();
    }
    @Override
    @Transactional
    public ExamResponse.QuestionLink addQuestion(
            UserPrincipal user,
            Long id,
            ExamRequests.QuestionLink r
    ) {
        Exam e = write(user, id);
        editable(e);

        Set<Long> existingQuestionIds = new HashSet<>(examQuestions(e).keySet());

        Question q = question(r.getQuestionId());
        active(user, q);

        ExamQuestion saved = attachValidatedQuestion(
                e,
                r,
                q,
                existingQuestionIds,
                next(
                        links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(id)
                                .stream()
                                .map(ExamQuestion::getOrderIndex)
                                .toList()
                )
        );

        return questionLink(saved);
    }
    @Override @Transactional public ExamResponse.QuestionLink updateQuestionWeight(UserPrincipal user,Long id,Long linkId,ExamRequests.QuestionWeight r) {
        Exam e=write(user,id); editable(e); positive(linkId);
        ExamQuestion link=links.findById(linkId).filter(l->l.getExam().getExamId().equals(id)).orElseThrow(()->missing("Exam question link"));
        link.setWeight(weight(r.getWeight()));
        links.saveAndFlush(link);
        return questionLink(link);
    }
    @Override @Transactional public void removeQuestion(UserPrincipal user,Long id,Long linkId) {
        Exam e=write(user,id); editable(e); positive(linkId);
        ExamQuestion link=links.findById(linkId).filter(l->l.getExam().getExamId().equals(id)).orElseThrow(()->missing("Exam question link"));
        links.delete(link); links.flush();
    }
    @Override @Transactional public ExamResponse.GroupLink addGroup(UserPrincipal user,Long id,ExamRequests.GroupLink r) {
        Exam e=write(user,id); editable(e); return groupLink(attachGroup(user,e,r,new HashSet<>()));
    }
    @Override @Transactional public void removeGroup(UserPrincipal user,Long id,Long linkId) {
        Exam e=write(user,id); editable(e); positive(linkId);
        ExamGroup link=groupLinks.findById(linkId).filter(l->l.getExam().getExamId().equals(id)).orElseThrow(()->missing("Exam group link"));
        for(Question q : questions.findByGroupGroupIdOrderByQuestionIdAsc(link.getGroup().getGroupId())) {
            links.findByExamExamIdAndQuestionQuestionId(id, q.getQuestionId()).ifPresent(links::delete);
        }
        groupLinks.delete(link); groupLinks.flush(); links.flush();
    }

    @Override @Transactional public Map<String,Object> rubric(UserPrincipal user,Long id,ExamRequests.Rubric r) {
        Question q=question(id); questionAccess(user,q);
        if(!Set.of("ESSAY","DIAGRAM","CODE").contains(q.getQuestionType())) throw bad("This question type does not use a rubric.");
        ExamRequests.Rubric normalized=new ExamRequests.Rubric(r.criteria(),r.notes());
        try { q.setEssayGradingRubric(json.writeValueAsString(normalized)); questions.flush(); }
        catch(JsonProcessingException ex) { throw bad("Could not encode rubric."); }
        return Map.of("questionId",id,"content",q.getContent(),"questionType",q.getQuestionType(),"essayGradingRubric",normalized);
    }

    @Override @Transactional
    public ExamResponse.Imported importQuestions(UserPrincipal user,Long id,MultipartFile file,boolean dryRun,List<ExamRequests.ImportItem> items) {
        Exam e=write(user,id);
        if(!"DRAFT".equals(e.getStatus())) throw conflict("Unpublish the exam before importing.");
        editable(e);
        if(e.getModule()==null) throw bad("Select a module for this exam before importing questions.");
        List<QuestionCreateRequest> parsed=importBlocks(file);
        if(dryRun) return new ExamResponse.Imported(parsed.size(),0,0,List.of());
        List<BigDecimal> weights=new ArrayList<>(Collections.nCopies(parsed.size(),BigDecimal.ONE));
        for(var item:list(items)) {
            if(item.getIndex()<0 || item.getIndex()>=parsed.size()) throw bad("Import item index out of range.");
            weights.set(item.getIndex(),weight(item.getWeight()));
        }
        int nextOrder=next(links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(id).stream().map(ExamQuestion::getOrderIndex).toList());
        ExamResponse.Imported result=attachImported(user,e,parsed,weights,new HashSet<>(examQuestions(e).keySet()),nextOrder);
        links.flush();
        return result;
    }

    // Shared by E-13 and E-02 importedQuestions, so both Import buttons behave the same: reuse a bank question with
    // Q-03's content hash (course-wide, like Q-03's duplicate check, so creating the rest never hits its 409), skip
    // duplicates within the list or already in the exam, create the rest through Q-03, then attach in list order.
    // Callers must reject module-less exams first (Q-03 needs a module).
    private ExamResponse.Imported attachImported(UserPrincipal user,Exam e,List<QuestionCreateRequest> requests,List<BigDecimal> weights,Set<Long> inExam,int nextOrder) {
        Long courseId=courseId(e), moduleId=e.getModule().getModuleId();
        List<String> hashes=requests.stream().map(questionService::contentHash).toList();
        Map<String,Question> bank=new HashMap<>();
        for(Question q:questions.findActiveByCourseAndContentHashes(courseId,new HashSet<>(hashes))) bank.putIfAbsent(q.getContentHash(),q);

        Set<String> seen=new HashSet<>(); Map<Integer,Long> picked=new LinkedHashMap<>(); List<QuestionCreateRequest> toCreate=new ArrayList<>();
        int reused=0,skipped=0;
        for(int idx=0;idx<requests.size();idx++) {
            Question existing=bank.get(hashes.get(idx));
            if(!seen.add(hashes.get(idx)) || (existing!=null && inExam.contains(existing.getQuestionId()))) { skipped++; continue; }
            if(existing!=null) reused++; else toCreate.add(requests.get(idx));
            picked.put(idx,existing==null?null:existing.getQuestionId());
        }

        User creator=users.findById(user.getId()).orElseThrow(()->missing("User"));
        List<Long> created=new ArrayList<>();
        for(int from=0;from<toCreate.size();from+=50)
            questionService.createQuestionsBatch(courseId,moduleId,toCreate.subList(from,Math.min(from+50,toCreate.size())),creator)
                    .forEach(q->created.add(q.getQuestionId()));

        Iterator<Long> newIds=created.iterator();
        List<Long> ids=new ArrayList<>();
        for(var entry:picked.entrySet()) {
            Long questionId=entry.getValue()!=null?entry.getValue():newIds.next();
            // Access was settled by write()/create (the exam's course) and Q-03; reused questions come from that same course.
            ExamQuestion saved=attachValidatedQuestion(e,new ExamRequests.QuestionLink(questionId,weights.get(entry.getKey()),nextOrder),
                    questions.getReferenceById(questionId),inExam,nextOrder);
            nextOrder=saved.getOrderIndex()+1;
            ids.add(questionId);
        }
        return new ExamResponse.Imported(toCreate.size(),reused,skipped,ids);
    }

    // E-13 reads files exactly like Q-09 (template v2: [TYPE: ...] then Q1. ...), so both Import buttons accept the same file.
    private List<QuestionCreateRequest> importBlocks(MultipartFile file) {
        String name=file.getOriginalFilename()==null?"":file.getOriginalFilename().toLowerCase(Locale.ROOT);
        List<String> lines;
        try {
            if(name.endsWith(".pdf")) lines=pdfText.extractText(file);
            else if(name.endsWith(".docx")) lines=docxText.extractText(file);
            else if(name.endsWith(".txt")) lines=new String(file.getBytes(),java.nio.charset.StandardCharsets.UTF_8).lines().map(String::strip).toList();
            else throw bad("Supported files: pdf, docx and txt.");
        } catch(BadRequestException ex) { throw ex; }
        catch(Exception ex) { throw bad("Could not read the uploaded file."); }
        List<TemplateBlockParser.RawBlock> blocks=blockParser.parseBlocks(lines);
        if(blocks.isEmpty() || blocks.size()>500) throw bad("Import needs 1-500 questions in the import template format ([TYPE: ...] followed by Q1. ...).");
        List<QuestionCreateRequest> result=new ArrayList<>(); List<String> errors=new ArrayList<>();
        for(int i=0;i<blocks.size();i++) {
            ImportBlockResult block=blockMapper.mapAndValidateBlock(blocks.get(i),i+1,"MEDIUM");
            int number=i+1;
            if(block.getErrors()==null || block.getErrors().isEmpty()) result.add(block.getQuestionData());
            else block.getErrors().forEach(err->errors.add("Question "+number+" (line "+err.getLine()+"): "+err.getMessage()));
        }
        if(!errors.isEmpty()) throw bad(String.join("; ",errors.subList(0,Math.min(5,errors.size())))+(errors.size()>5?" (+"+(errors.size()-5)+" more)":""));
        return result;
    }

    private ExamGroup attachGroup(UserPrincipal user,Exam e,ExamRequests.GroupLink r,Set<Long> checked) {
        QuestionGroup g=group(r.getGroupId()); groupAccess(user,g,checked);
        List<ExamGroup> existing=groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(e.getExamId());
        if(existing.stream().anyMatch(l->l.getGroup().getGroupId().equals(r.getGroupId()))) throw conflict("Group is already in this exam.");
        List<Question> groupQuestions=questions.findByGroupGroupIdOrderByQuestionIdAsc(r.getGroupId());
        List<ExamRequests.GroupQuestionPoint> reqPoints=list(r.getQuestions());
        if(groupQuestions.size()!=reqPoints.size()) throw bad("Group questions and provided weight count do not match.");
        Map<Long,BigDecimal> weightMap=new HashMap<>();
        Set<Long> expectedIds = groupQuestions.stream().map(Question::getQuestionId).collect(Collectors.toSet());
        for(var qp:reqPoints) {
            positive(qp.getQuestionId());
            if(!expectedIds.contains(qp.getQuestionId())) throw bad("Question does not belong to this group.");
            if(weightMap.containsKey(qp.getQuestionId())) throw bad("Duplicate question in request.");
            weightMap.put(qp.getQuestionId(),weight(qp.getWeight()));
        }
        for(Question q:groupQuestions) {
            active(user,q,checked);
            if(!weightMap.containsKey(q.getQuestionId())) throw bad("Missing weight for group question "+q.getQuestionId());
        }
        Map<Long,Question> used=examQuestions(e);
        for(Question q:groupQuestions) {
            if(used.containsKey(q.getQuestionId())) throw conflict("A group question is already attached to this exam.");
        }
        List<ExamQuestion> existingLinks=links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(e.getExamId());
        int groupOrder=r.getOrderIndex()==null?next(existing.stream().map(ExamGroup::getOrderIndex).toList()):r.getOrderIndex();
        int qOrder=next(existingLinks.stream().map(ExamQuestion::getOrderIndex).toList());
        for(Question q:groupQuestions) {
            BigDecimal wt = weightMap.getOrDefault(q.getQuestionId(), BigDecimal.ONE);
            links.save(ExamQuestion.builder().exam(e).question(q).weight(wt).orderIndex(qOrder++).build());
        }
        return groupLinks.saveAndFlush(ExamGroup.builder().exam(e).group(g).orderIndex(groupOrder).build());
    }
    private void validateConfigs(List<ExamRequests.Config> values,Long courseId) {
        List<ExamRequests.Config> rules=list(values);
        for(int i=0;i<rules.size();i++) {
            var c=rules.get(i);
            if(!TYPES.contains(c.getQuestionType())) throw bad("Invalid questionType.");
            validateConfigModule(c.getModuleId()==null?null:module(c.getModuleId()),courseId);
            if(c.getWeightEach()!=null) weight(c.getWeightEach());
            checkDrawable(courseId,i+1,c.getQuestionType(),c.getModuleId(),c.getDifficulty(),c.getNumberOfQuestions());
        }
    }
    // A random rule must be fillable from the bank's active, approved questions (type, module, difficulty; null = any).
    // ponytail: each rule is checked alone; two rules drawing from the same pool can still overlap. Sum per pool if that matters.
    private void checkDrawable(Long courseId,int rule,String type,Long moduleId,String difficulty,int count) {
        long available=questions.countDrawable(courseId,moduleId,type,difficulty);
        if(available<count)
            throw bad("Random rule "+rule+" needs "+count+" "+type+(difficulty==null?"":" "+difficulty)
                    +" question(s) but the question bank has only "+available+" active, approved one(s).");
    }
    private void validateConfigModule(Module module,Long courseId) {
        if(module!=null && !module.getCourse().getCourseId().equals(courseId)) throw bad("Config module must belong to the exam course.");
    }
    private void saveConfigs(Exam e,List<ExamRequests.Config> values) {
        for(var c:list(values)) configs.save(ExamConfig.builder().exam(e).questionType(c.getQuestionType()).numberOfQuestions(c.getNumberOfQuestions()).module(c.getModuleId()==null?null:module(c.getModuleId())).difficulty(c.getDifficulty()).weightEach(c.getWeightEach()).build());
    }
    private void validateMode(String mode,int fixed,int random) {
        if(!Set.of("STATIC","RANDOM","MIXED").contains(mode) || (mode.equals("STATIC") && (fixed==0 || random>0)) || (mode.equals("RANDOM") && (random==0 || fixed>0)) || (mode.equals("MIXED") && (fixed==0 || random==0)))
            throw bad("STATIC requires fixed questions, RANDOM requires configs, MIXED requires both.");
    }
    private void editable(Exam e) {
        if(!"DRAFT".equals(e.getStatus()) || attempts.existsByExamExamId(e.getExamId())) throw conflict("Only draft exams with no attempts allow content changes. Archive exams with attempts.");
    }
    private Exam read(Long id) { positive(id); return exams.findById(id).orElseThrow(()->missing("Exam")); }
    private Exam write(UserPrincipal user,Long id) {
        Exam e=read(id); access(user,courseId(e),true);
        e=exams.findForUpdate(id).orElseThrow(()->missing("Exam")); check(user,e); return e;
    }
    private void check(UserPrincipal user,Exam e) {
        if(e.getCourse()!=null) access(user,e.getCourse().getCourseId(),false);
        if(e.getModule()!=null) access(user,e.getModule().getCourse().getCourseId(),false);
        if(e.getCourse()==null && e.getModule()==null && !admin(user)) throw new ForbiddenException("Exam has no managed course.");
    }
    private Long courseId(Exam e) { return e.getCourse()!=null?e.getCourse().getCourseId():e.getModule()==null?null:e.getModule().getCourse().getCourseId(); }
    private Course access(UserPrincipal user,Long id,boolean lock) {
        positive(id); Course c=(lock?courses.findForUpdate(id):courses.findById(id)).orElseThrow(()->missing("Course"));
        if(!admin(user) && !c.getManager().getUserId().equals(user.getId()) && !assignments.existsByCourseCourseIdAndUserUserId(id,user.getId())) throw new ForbiddenException("Course is outside your management scope.");
        return c;
    }
    private Module module(Long id) { positive(id); return modules.findById(id).orElseThrow(()->missing("Module")); }
    private Question question(Long id) { positive(id); return questions.findActiveById(id).orElseThrow(()->missing("Question")); }
    private QuestionGroup group(Long id) { positive(id); return groups.findById(id).orElseThrow(()->missing("Question group")); }
    // checked = course ids already authorized in this request, so a 40-question exam costs one access query per course, not per question.
    private void courseAccess(UserPrincipal user,Long courseId,Set<Long> checked) { if(checked.add(courseId)) access(user,courseId,false); }
    private void groupAccess(UserPrincipal user,QuestionGroup g) { groupAccess(user,g,new HashSet<>()); }
    private void groupAccess(UserPrincipal user,QuestionGroup g,Set<Long> checked) {
        if(g.getCourse()!=null) courseAccess(user,g.getCourse().getCourseId(),checked);
        if(g.getModule()!=null) courseAccess(user,g.getModule().getCourse().getCourseId(),checked);
        if(g.getCourse()==null && g.getModule()==null && !admin(user)) throw new ForbiddenException("Group has no managed course.");
    }
    private void questionAccess(UserPrincipal user,Question q,Set<Long> checked) {
        if(q.getCourse()!=null) courseAccess(user,q.getCourse().getCourseId(),checked);
        if(q.getModule()!=null) courseAccess(user,q.getModule().getCourse().getCourseId(),checked);
        if(q.getGroup()!=null) groupAccess(user,q.getGroup(),checked);
        if(q.getCourse()==null && q.getModule()==null && q.getGroup()==null && !admin(user)) throw new ForbiddenException("Question has no managed course.");
    }
    private void questionAccess(UserPrincipal user,Question q) { questionAccess(user,q,new HashSet<>()); }
    private void active(UserPrincipal user,Question q) { active(user,q,new HashSet<>()); }
    private void active(UserPrincipal user,Question q,Set<Long> checked) { questionAccess(user,q,checked); if(!"ACTIVE".equals(q.getStatus())) throw bad("Only ACTIVE questions can be selected from the bank."); }
    private Map<Long,Question> examQuestions(Exam e) {
        List<Long> examIds=List.of(e.getExamId());
        Map<Long,Question> result=new LinkedHashMap<>();
        for(ExamQuestion l:links.findAllByExamIds(examIds)) result.put(l.getQuestion().getQuestionId(),l.getQuestion());
        List<Long> groupIds=groupLinks.findAllByExamIds(examIds).stream().map(l->l.getGroup().getGroupId()).toList();
        if(!groupIds.isEmpty()) for(Question q:questions.findAllByGroupIds(groupIds)) result.put(q.getQuestionId(),q);
        return result;
    }

    private ExamResponse response(Exam e, boolean detail) {
        return mapExamPage(List.of(e), detail).get(0);
    }
    private ExamResponse buildResponse(
            Exam e,
            boolean detail,
            List<ExamQuestion> direct,
            List<ExamGroup> grouped,
            List<ExamConfig> configured,
            Map<Long, Question> all,
            Map<Long, List<Question>> questionsByGroup
    ) {
        Set<Long> linkedGroups = linkedGroupIds(grouped);
        Set<String> families = new HashSet<>();

        all.values().forEach(q ->
                families.add(family(q.getQuestionType()))
        );

        configured.forEach(c ->
                families.add(family(c.getQuestionType()))
        );

        String kind = families.size() > 1
                ? null
                : families.stream().findFirst().orElse("QUIZ");

        int count = all.size()
                + configured.stream()
                .mapToInt(ExamConfig::getNumberOfQuestions)
                .sum();

        BigDecimal totalWeight = direct.stream()
                .map(ExamQuestion::getWeight)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Course course = e.getCourse() != null
                ? e.getCourse()
                : e.getModule() == null
                ? null
                : e.getModule().getCourse();

        return new ExamResponse(
                e.getExamId(),
                e.getTitle(),
                e.getDescription(),
                course == null ? null : course.getCourseId(),
                course == null ? null : course.getTitle(),
                e.getModule() == null ? null : e.getModule().getModuleId(),
                e.getModule() == null ? null : e.getModule().getTitle(),
                kind,
                e.getDurationMinutes(),
                e.getMaxScore(),
                totalWeight,
                count,
                e.getStatus(),
                e.getGenerationType(),
                e.getIsPractice(),
                e.getCreatedAt(),
                detail
                        ? configured.stream()
                        .map(c -> new ExamResponse.Config(
                                c.getConfigId(),
                                c.getQuestionType(),
                                c.getNumberOfQuestions(),
                                c.getModule() == null
                                        ? null
                                        : c.getModule().getModuleId(),
                                c.getDifficulty(),
                                c.getWeightEach()
                        ))
                        .toList()
                        : null,
                detail
                        ? direct.stream().map(l -> questionLink(l, linkedGroups)).toList()
                        : null,
                detail
                        ? grouped.stream().map(l -> groupLink(l, questionsByGroup.getOrDefault(l.getGroup().getGroupId(), List.of()).size())).toList()
                        : null
        );
    }
    private Set<Long> linkedGroupIds(List<ExamGroup> grouped) { return grouped.stream().map(g->g.getGroup().getGroupId()).collect(Collectors.toSet()); }
    private ExamResponse.QuestionLink questionLink(ExamQuestion l) {
        return questionLink(l,linkedGroupIds(groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(l.getExam().getExamId())));
    }
    private ExamResponse.QuestionLink questionLink(ExamQuestion l,Set<Long> linkedGroupIds) {
        Long rawGroupId=l.getQuestion().getGroup()!=null?l.getQuestion().getGroup().getGroupId():null;
        Long groupId=rawGroupId!=null && linkedGroupIds.contains(rawGroupId)?rawGroupId:null;
        return new ExamResponse.QuestionLink(l.getExamQuestionId(),l.getExam().getExamId(),l.getQuestion().getQuestionId(),l.getQuestion().getContent(),l.getQuestion().getQuestionType(),l.getWeight(),l.getOrderIndex(),l.getQuestion().getEssayGradingRubric()!=null,groupId);
    }
    private ExamResponse.GroupLink groupLink(ExamGroup l) { return groupLink(l,questions.findByGroupGroupIdOrderByQuestionIdAsc(l.getGroup().getGroupId()).size()); }
    private ExamResponse.GroupLink groupLink(ExamGroup l,int questionCount) { return new ExamResponse.GroupLink(l.getExamGroupId(),l.getExam().getExamId(),l.getGroup().getGroupId(),l.getGroup().getTitle(),
            l.getGroup().getPassageText(),questionCount); }
    private BigDecimal weight(BigDecimal w) { if(w==null)return BigDecimal.ONE; if(w.signum()<=0 || w.compareTo(new BigDecimal("1000"))>0 || w.scale()>2) throw bad("Weight must be positive, at most 1000 and have at most two decimal places."); return w; }
    private BigDecimal maxScore(BigDecimal m) { if(m==null || m.signum()<=0 || m.compareTo(new BigDecimal("10000"))>0 || m.scale()>2) throw bad("Max score must be positive, at most 10000 and have at most two decimal places."); return m; }
    private int next(List<Integer> values) { int max=values.stream().mapToInt(Integer::intValue).max().orElse(-1); if(max==Integer.MAX_VALUE)throw conflict("Question order limit reached."); return max+1; }
    private String family(String type) { String kind=QuestionTypeUtil.kindOf(type); return kind==null?"QUIZ":kind; }
    private String pattern(String s) { return "%"+s.strip().toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%"; }
    private boolean admin(UserPrincipal user) { return "ADMIN".equals(user.getRole()); }
    private void positive(Long id) { if(id==null || id<=0)throw bad("ID must be a positive integer."); }
    private <T> List<T> list(List<T> value) { return value==null?List.of():value; }
    private int size(List<?> value) { return value==null?0:value.size(); }
    private BadRequestException bad(String message) { return new BadRequestException(message); }
    private ResourceConflictException conflict(String message) { return new ResourceConflictException(message); }
    private ResourceNotFoundException missing(String type) { return new ResourceNotFoundException(type+" not found."); }
}
