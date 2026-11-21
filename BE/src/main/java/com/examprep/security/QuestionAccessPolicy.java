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
        return hasAccess(user, question);
    }

    public boolean canModify(User user, Question question) {
        return hasAccess(user, question);
    }

    public boolean canChangeStatus(User user, Question question) {
        return hasAccess(user, question);
    }

    private boolean hasAccess(User user, Question question) {
        if (user == null || question == null) return false;
        if (User.ROLE_ADMIN.equals(user.getRoleName())) return true;
        if (!User.ROLE_COURSE_MANAGER.equals(user.getRoleName())) return false;
        if (question.getCourse() == null) return false;
        if (question.getCourse().getManager() != null
                && user.getUserId().equals(question.getCourse().getManager().getUserId())) {
            return true;
        }
        return courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(
                question.getCourse().getCourseId(), user.getUserId());
    }
}
