package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;
import java.util.List;

public interface CourseService {
    PageResponse<CourseResponse> list(UserPrincipal user, String search, Long categoryId, Boolean published, int page, int size, String sort);
    CourseResponse detail(UserPrincipal user, Long id);
    CourseResponse create(CourseRequests.Create request);
    CourseResponse update(UserPrincipal user, Long id, CourseRequests.Update request);
    CourseResponse publish(Long id, CourseRequests.Publish request);
    void deleteCourse(Long id);
    List<ModuleResponse> modules(UserPrincipal user, Long courseId);
    ModuleResponse createModule(UserPrincipal user, Long courseId, CourseRequests.CreateModule request);
    ModuleResponse updateModule(UserPrincipal user, Long id, CourseRequests.UpdateModule request);
    void deleteModule(UserPrincipal user, Long id);
    ModuleResponse updateModuleStatus(UserPrincipal user, Long id, CourseRequests.ModuleStatus request);
    PageResponse<CourseStudentResponse> students(UserPrincipal user, Long courseId, String search, String status, int page, int size);
    List<CategoryResponse> categories();
}
