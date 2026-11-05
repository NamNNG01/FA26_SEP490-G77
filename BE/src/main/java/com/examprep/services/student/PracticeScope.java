package com.examprep.services.student;

import com.examprep.entities.Course;
import com.examprep.entities.Module;

/**
 * The scope one practice run belongs to: a single module, or a course's "General" pool — the
 * questions of the course that are filed under no module ({@code questions.module_id IS NULL}).
 *
 * <p>Both scopes share every rule (access, paper, grading, progress, reset); only the pool query and
 * the module fields of the responses differ, so the services take a scope instead of a module id.</p>
 */
public record PracticeScope(Module module, Course course) {

    /** What the General pool is called in the responses; a module scope reports its own title. */
    public static final String GENERAL_TITLE = "General";

    public static PracticeScope ofModule(Module module) {
        return new PracticeScope(module, module.getCourse());
    }

    public static PracticeScope general(Course course) {
        return new PracticeScope(null, course);
    }

    public boolean isGeneral() {
        return module == null;
    }

    /** {@code null} for a General scope. */
    public Long moduleId() {
        return module == null ? null : module.getModuleId();
    }

    public String moduleTitle() {
        return module == null ? GENERAL_TITLE : module.getTitle();
    }

    public Long courseId() {
        return course.getCourseId();
    }

    public String courseTitle() {
        return course.getTitle();
    }
}
