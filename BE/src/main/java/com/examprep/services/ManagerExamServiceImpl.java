package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.*;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import com.examprep.util.QuestionTypeUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;

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
    private final AnswerOptionRepository options;
    private final CourseRepository courses;
    private final CourseManagerRepository assignments;
    private final ModuleRepository modules;
    private final UserRepository users;
    private final ObjectMapper json;

    @Override
    public PageResponse<ExamResponse> list(UserPrincipal user,String search,Long courseId,Long moduleId,String status,String kind,int page,int size) {
        if(page<0 || size<1 || size>100 || (long)page*size>Integer.MAX_VALUE) throw bad("Invalid page or size (1-100).");
        if(courseId!=null) access(user,courseId,false);
        if(moduleId!=null) access(user,module(moduleId).getCourse().getCourseId(),false);
        if(status!=null && !Set.of("DRAFT","PUBLISHED","ARCHIVED").contains(status)) throw bad("Invalid exam status.");
        if(kind!=null && !kind.equals("all") && !KINDS.contains(kind)) throw bad("Invalid examKind.");
        Specification<Exam> filter=(root,query,cb)-> {
            Join<Exam,Course> c=root.join("course",JoinType.LEFT);
            Join<Exam,Module> m=root.join("module",JoinType.LEFT);
            Join<Module,Course> mc=m.join("course",JoinType.LEFT);
            List<Predicate> where=new ArrayList<>();
            if(!admin(user)) {
                where.add(cb.or(cb.isNull(c),scope(c,query,cb,user.getId())));
                where.add(cb.or(cb.isNull(m),scope(mc,query,cb,user.getId())));
                where.add(cb.or(cb.isNotNull(c),cb.isNotNull(m)));
            }
            if(courseId!=null) where.add(cb.or(cb.equal(c.get("courseId"),courseId),cb.and(cb.isNull(c),cb.equal(mc.get("courseId"),courseId))));
            if(moduleId!=null) where.add(cb.equal(m.get("moduleId"),moduleId));
            if(status!=null) where.add(cb.equal(root.get("status"),status));
            if(search!=null && !search.isBlank()) where.add(cb.like(cb.lower(root.get("title")),pattern(search),'!'));
            if(kind!=null && !kind.equals("all")) {
                List<Predicate> present=KINDS.stream().map(k->familyPresent(root,query,cb,k)).toList();
                for(int i=0;i<4;i++) if(!KINDS.get(i).equals(kind)) where.add(cb.not(present.get(i)));
                if(!kind.equals("QUIZ")) where.add(present.get(KINDS.indexOf(kind)));
            }
            return cb.and(where.toArray(Predicate[]::new));
        };
        Page<Exam> result=exams.findAll(filter,PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt","examId")));
        return PageResponse.of(result,result.getContent().stream().map(e->response(e,false)).toList());
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

    @Override @Transactional
    public ExamResponse create(UserPrincipal user,ExamRequests.Create r) {
        Module module=r.moduleId()==null?null:module(r.moduleId());
        Long courseId=r.courseId()!=null?r.courseId():module==null?null:module.getCourse().getCourseId();
        if(courseId==null) throw bad("courseId or moduleId is required.");
        Course course=access(user,courseId,true);
        if(module!=null && !module.getCourse().getCourseId().equals(courseId)) throw bad("Module must belong to the selected course.");
        validateMode(r.generationType(),size(r.questionIds())+size(r.groupIds()),size(r.configs()));
        // Validate every referenced object before saving an identity-backed exam.
        Set<Long> ids=new HashSet<>();
        for(var item:list(r.questionIds())) { if(!ids.add(item.questionId())) throw conflict("Question is duplicated."); active(user,question(item.questionId())); }
        Set<Long> groupIds=new HashSet<>();
        for(var item:list(r.groupIds())) { if(!groupIds.add(item.groupId())) throw conflict("Group is duplicated."); groupAccess(user,group(item.groupId())); }
        validateConfigs(r.configs(),courseId);
        Exam e=Exam.builder().course(course).module(module).createdBy(users.getReferenceById(user.getId()))
                .title(r.title().strip()).description(r.description()).durationMinutes(r.durationMinutes()).isPractice(r.isPractice())
                .generationType(r.generationType()).passMark(r.passMark()==null?50:r.passMark()).maxAttempts(r.maxAttempts()==null?1:r.maxAttempts()).status("DRAFT").build();
        exams.save(e);
        for(var item:list(r.questionIds())) attachQuestion(user,e,item,false);
        for(var item:list(r.groupIds())) attachGroup(user,e,item);
        saveConfigs(e,r.configs()); exams.flush(); return response(e,true);
    }

    @Override @Transactional
    public ExamResponse update(UserPrincipal user,Long id,ExamRequests.Update r) {
        Exam e=write(user,id);
        boolean structural=r.title()!=null || r.courseId()!=null || r.moduleId()!=null || r.durationMinutes()!=null || r.isPractice()!=null
                || r.generationType()!=null || r.passMark()!=null || r.maxAttempts()!=null || r.configs()!=null;
        if(structural) editable(e);
        Long courseId=r.courseId()==null?courseId(e):r.courseId();
        Module module=r.moduleId()==null?e.getModule():module(r.moduleId());
        if(module!=null && !module.getCourse().getCourseId().equals(courseId)) throw bad("Module must belong to the selected course.");
        if(r.courseId()!=null && r.configs()==null)
            for(ExamConfig config:configs.findByExamExamIdOrderByConfigIdAsc(id)) validateConfigModule(config.getModule(),courseId);
        if(r.courseId()!=null || r.moduleId()!=null) { e.setCourse(access(user,courseId,true)); e.setModule(module); }
        if(r.title()!=null) e.setTitle(r.title().strip());
        if(r.description()!=null) e.setDescription(r.description());
        if(r.durationMinutes()!=null) e.setDurationMinutes(r.durationMinutes());
        if(r.isPractice()!=null) e.setIsPractice(r.isPractice());
        if(r.passMark()!=null) e.setPassMark(r.passMark());
        if(r.maxAttempts()!=null) e.setMaxAttempts(r.maxAttempts());
        if(r.generationType()!=null) e.setGenerationType(r.generationType());
        if(r.configs()!=null) { validateConfigs(r.configs(),courseId); configs.deleteByExamExamId(id); configs.flush(); saveConfigs(e,r.configs()); }
        // Removing the last attachment is allowed while editing a draft; publish validates completeness.
        if(r.generationType()!=null) validateMode(e.getGenerationType(),links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(id).size()+groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(id).size(),configs.findByExamExamIdOrderByConfigIdAsc(id).size());
        exams.flush(); return response(e,true);
    }

    @Override @Transactional
    public ExamResponse.Published publish(UserPrincipal user,Long id,ExamRequests.Publish r) {
        Exam e=write(user,id); ExamResponse state=response(e,true);
        if(r.status().equals("PUBLISHED")) {
            List<ExamConfig> configured=configs.findByExamExamIdOrderByConfigIdAsc(id);
            validateMode(e.getGenerationType(),links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(id).size()
                    +groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(id).size(),configured.size());
            for(ExamConfig config:configured) validateConfigModule(config.getModule(),courseId(e));
            if(state.questionCount()==0) throw bad("Add at least one question before publishing.");
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
    @Override @Transactional public ExamResponse.QuestionLink addQuestion(UserPrincipal user,Long id,ExamRequests.QuestionLink r) {
        Exam e=write(user,id); editable(e); return questionLink(attachQuestion(user,e,r,false));
    }
    @Override @Transactional public void removeQuestion(UserPrincipal user,Long id,Long linkId) {
        Exam e=write(user,id); editable(e); positive(linkId);
        ExamQuestion link=links.findById(linkId).filter(l->l.getExam().getExamId().equals(id)).orElseThrow(()->missing("Exam question link"));
        links.delete(link); links.flush();
    }
    @Override @Transactional public ExamResponse.GroupLink addGroup(UserPrincipal user,Long id,ExamRequests.GroupLink r) {
        Exam e=write(user,id); editable(e); return groupLink(attachGroup(user,e,r));
    }
    @Override @Transactional public void removeGroup(UserPrincipal user,Long id,Long linkId) {
        Exam e=write(user,id); editable(e); positive(linkId);
        ExamGroup link=groupLinks.findById(linkId).filter(l->l.getExam().getExamId().equals(id)).orElseThrow(()->missing("Exam group link"));
        groupLinks.delete(link); groupLinks.flush();
    }

    @Override @Transactional public Map<String,Object> rubric(UserPrincipal user,Long id,ExamRequests.Rubric r) {
        Question q=question(id); questionAccess(user,q);
        if(!Set.of("ESSAY","DIAGRAM","CODE").contains(q.getQuestionType())) throw bad("This question type does not use a rubric.");
        BigDecimal total=r.criteria().stream().map(ExamRequests.Criterion::maxScore).reduce(BigDecimal.ZERO,BigDecimal::add);
        if(r.totalPoints()!=null && r.totalPoints().compareTo(total)!=0) throw bad("totalPoints must equal the sum of criterion maxScore values.");
        ExamRequests.Rubric normalized=new ExamRequests.Rubric(r.criteria(),total,r.notes());
        try { q.setEssayGradingRubric(json.writeValueAsString(normalized)); questions.flush(); }
        catch(JsonProcessingException ex) { throw bad("Could not encode rubric."); }
        return Map.of("questionId",id,"content",q.getContent(),"questionType",q.getQuestionType(),"essayGradingRubric",normalized);
    }

    @Override @Transactional
    public ExamResponse.Imported importQuestions(UserPrincipal user,Long id,String text,BigDecimal points) {
        Exam e=write(user,id); editable(e); points=points(points);
        List<QuestionTextParser.Parsed> parsed=QuestionTextParser.parse(text);
        Map<String,Question> bank=new LinkedHashMap<>();
        for(Question q:questions.findImportBank(courseId(e),e.getModule()==null?null:e.getModule().getModuleId())) bank.putIfAbsent(QuestionTextParser.hash(q.getContent()),q);
        Set<String> attached=new HashSet<>(); for(Question q:examQuestions(e).values()) attached.add(QuestionTextParser.hash(q.getContent()));
        int imported=0,reused=0,skipped=0; List<Long> ids=new ArrayList<>(); Map<String,QuestionGroup> importGroups=new LinkedHashMap<>();
        for(var item:parsed) {
            String hash=QuestionTextParser.hash(item.content());
            if(!attached.add(hash)) { skipped++; continue; }
            Question q=bank.get(hash);
            if(q==null) {
                QuestionGroup importGroup=null;
                if(e.getModule()==null) {
                    String kind=QuestionTypeUtil.kindOf(item.type());
                    importGroup=importGroups.computeIfAbsent(kind,k->groups.save(QuestionGroup.builder().course(e.getCourse()).questionType(k).title(e.getTitle()+" import ("+k+")").build()));
                }
                q=questions.save(Question.builder().course(e.getCourse()!=null?e.getCourse():e.getModule().getCourse()).module(e.getModule()).group(importGroup).content(item.content()).questionType(item.type()).status("DRAFT").build());
                for(int i=0;i<item.options().size();i++) options.save(AnswerOption.builder().question(q).optionText(item.options().get(i)).isCorrect(i==item.correctIndex()).orderIndex(i).build());
                bank.put(hash,q); imported++;
            } else reused++;
            attachQuestion(user,e,new ExamRequests.QuestionLink(q.getQuestionId(),points,null),true); ids.add(q.getQuestionId());
        }
        links.flush(); return new ExamResponse.Imported(imported,reused,skipped,ids);
    }

    private ExamQuestion attachQuestion(UserPrincipal user,Exam e,ExamRequests.QuestionLink r,boolean imported) {
        Question q=question(r.questionId()); questionAccess(user,q); if(!imported) active(user,q);
        if(examQuestions(e).containsKey(q.getQuestionId())) throw conflict("Question is already in this exam.");
        List<ExamQuestion> existing=links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(e.getExamId());
        int order=r.orderIndex()==null?next(existing.stream().map(ExamQuestion::getOrderIndex).toList()):r.orderIndex();
        return links.saveAndFlush(ExamQuestion.builder().exam(e).question(q).points(points(r.points())).orderIndex(order).build());
    }
    private ExamGroup attachGroup(UserPrincipal user,Exam e,ExamRequests.GroupLink r) {
        QuestionGroup g=group(r.groupId()); groupAccess(user,g);
        List<ExamGroup> existing=groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(e.getExamId());
        if(existing.stream().anyMatch(l->l.getGroup().getGroupId().equals(r.groupId()))) throw conflict("Group is already in this exam.");
        Map<Long,Question> used=examQuestions(e);
        for(Question q:questions.findByGroupGroupIdOrderByQuestionIdAsc(r.groupId())) {
            active(user,q); if(used.containsKey(q.getQuestionId())) throw conflict("A group question is already attached to this exam.");
        }
        int order=r.orderIndex()==null?next(existing.stream().map(ExamGroup::getOrderIndex).toList()):r.orderIndex();
        return groupLinks.saveAndFlush(ExamGroup.builder().exam(e).group(g).points(points(r.points())).orderIndex(order).build());
    }
    private void validateConfigs(List<ExamRequests.Config> values,Long courseId) {
        for(var c:list(values)) {
            if(!TYPES.contains(c.questionType())) throw bad("Invalid questionType.");
            validateConfigModule(c.moduleId()==null?null:module(c.moduleId()),courseId);
        }
    }
    private void validateConfigModule(Module module,Long courseId) {
        if(module!=null && !module.getCourse().getCourseId().equals(courseId)) throw bad("Config module must belong to the exam course.");
    }
    private void saveConfigs(Exam e,List<ExamRequests.Config> values) {
        for(var c:list(values)) configs.save(ExamConfig.builder().exam(e).questionType(c.questionType()).numberOfQuestions(c.numberOfQuestions()).module(c.moduleId()==null?null:module(c.moduleId())).difficulty(c.difficulty()).build());
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
    private void groupAccess(UserPrincipal user,QuestionGroup g) {
        if(g.getCourse()!=null) access(user,g.getCourse().getCourseId(),false);
        if(g.getModule()!=null) access(user,g.getModule().getCourse().getCourseId(),false);
        if(g.getCourse()==null && g.getModule()==null && !admin(user)) throw new ForbiddenException("Group has no managed course.");
    }
    private void questionAccess(UserPrincipal user,Question q) {
        if(q.getCourse()!=null) access(user,q.getCourse().getCourseId(),false);
        if(q.getModule()!=null) access(user,q.getModule().getCourse().getCourseId(),false);
        if(q.getGroup()!=null) groupAccess(user,q.getGroup());
        if(q.getCourse()==null && q.getModule()==null && q.getGroup()==null && !admin(user)) throw new ForbiddenException("Question has no managed course.");
    }
    private void active(UserPrincipal user,Question q) { questionAccess(user,q); if(!"ACTIVE".equals(q.getStatus())) throw bad("Only ACTIVE questions can be selected from the bank."); }
    private Map<Long,Question> examQuestions(Exam e) {
        Map<Long,Question> result=new LinkedHashMap<>();
        for(ExamQuestion l:links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(e.getExamId())) result.put(l.getQuestion().getQuestionId(),l.getQuestion());
        for(ExamGroup l:groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(e.getExamId()))
            for(Question q:questions.findByGroupGroupIdOrderByQuestionIdAsc(l.getGroup().getGroupId())) result.put(q.getQuestionId(),q);
        return result;
    }
    private ExamResponse response(Exam e,boolean detail) {
        List<ExamQuestion> direct=links.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(e.getExamId());
        List<ExamGroup> grouped=groupLinks.findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(e.getExamId());
        List<ExamConfig> configured=configs.findByExamExamIdOrderByConfigIdAsc(e.getExamId());
        Map<Long,Question> all=examQuestions(e); Set<String> families=new HashSet<>(); all.values().forEach(q->families.add(family(q.getQuestionType())));
        configured.forEach(c->families.add(family(c.getQuestionType())));
        String kind=families.size()>1?null:families.stream().findFirst().orElse("QUIZ");
        int count=all.size()+configured.stream().mapToInt(ExamConfig::getNumberOfQuestions).sum();
        BigDecimal total=direct.stream().map(ExamQuestion::getPoints).reduce(BigDecimal.ZERO,BigDecimal::add)
                .add(grouped.stream().map(ExamGroup::getPoints).reduce(BigDecimal.ZERO,BigDecimal::add))
                .add(BigDecimal.valueOf(configured.stream().mapToInt(ExamConfig::getNumberOfQuestions).sum()));
        Course course=e.getCourse()!=null?e.getCourse():e.getModule()==null?null:e.getModule().getCourse();
        return new ExamResponse(e.getExamId(),e.getTitle(),e.getDescription(),course==null?null:course.getCourseId(),course==null?null:course.getTitle(),
                e.getModule()==null?null:e.getModule().getModuleId(),e.getModule()==null?null:e.getModule().getTitle(),kind,e.getDurationMinutes(),e.getPassMark(),e.getMaxAttempts(),count,total,
                e.getStatus(),e.getGenerationType(),e.getIsPractice(),e.getCreatedAt(),
                detail?configured.stream().map(c->new ExamResponse.Config(c.getConfigId(),c.getQuestionType(),c.getNumberOfQuestions(),c.getModule()==null?null:c.getModule().getModuleId(),c.getDifficulty())).toList():null,
                detail?direct.stream().map(this::questionLink).toList():null,detail?grouped.stream().map(this::groupLink).toList():null);
    }
    private ExamResponse.QuestionLink questionLink(ExamQuestion l) { return new ExamResponse.QuestionLink(l.getExamQuestionId(),l.getExam().getExamId(),l.getQuestion().getQuestionId(),l.getQuestion().getContent(),l.getQuestion().getQuestionType(),l.getPoints(),l.getOrderIndex(),l.getQuestion().getEssayGradingRubric()!=null); }
    private ExamResponse.GroupLink groupLink(ExamGroup l) { return new ExamResponse.GroupLink(l.getExamGroupId(),l.getExam().getExamId(),l.getGroup().getGroupId(),l.getGroup().getTitle(),l.getPoints(),l.getOrderIndex(),
            l.getGroup().getPassageText(),questions.findByGroupGroupIdOrderByQuestionIdAsc(l.getGroup().getGroupId()).size()); }
    private BigDecimal points(BigDecimal p) { if(p==null)return BigDecimal.ONE; if(p.signum()<=0 || p.compareTo(new BigDecimal("999.99"))>0 || p.scale()>2) throw bad("Points must be positive, at most 999.99 and have at most two decimal places."); return p; }
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
