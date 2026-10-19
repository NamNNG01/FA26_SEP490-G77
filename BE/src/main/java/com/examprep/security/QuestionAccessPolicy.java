package com.examprep.security;

import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.repositories.CourseManagerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class QuestionAccessPolicy {

    private final CourseManagerRepository courseManagerRepository;

    public boolean canView(User user, Question question) {
        if (user == null || question == null) return false;
        if (User.ROLE_ADMIN.equals(user.getRoleName())) return true;
        if (question.getCourse() == null) return false;
        return courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                question.getCourse().getCourseId(), user.getUserId());
    }

    public boolean canModify(User user, Question question) {
        if (user == null || question == null) return false;
        if (User.ROLE_ADMIN.equals(user.getRoleName())) return true;
        if (question.getCourse() == null) return false;

        boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                question.getCourse().getCourseId(), user.getUserId());
        if (!isManager) return false;

        if ("STUDENT".equals(question.getCreatorRole())) {
            return false;
        }

        return question.getCreatedBy() != null && question.getCreatedBy().getUserId().equals(user.getUserId());
    }

    public boolean canChangeStatus(User user, Question question) {
        if (user == null || question == null) return false;
        if (User.ROLE_ADMIN.equals(user.getRoleName())) return true;
        if (question.getCourse() == null) return false;

        boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                question.getCourse().getCourseId(), user.getUserId());
        if (!isManager) return false;

        if ("STUDENT".equals(question.getCreatorRole())) {
            return true;
        }
        return question.getCreatedBy() != null && question.getCreatedBy().getUserId().equals(user.getUserId());
    }
}
