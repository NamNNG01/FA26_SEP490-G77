package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;

import java.util.List;

public interface CategoryService {
    List<CategoryResponse> list();
    CategoryTreeResponse adminList();
    List<CategorySelectResponse> buildTree();
    CategoryAdminResponse create(UserPrincipal actor, CategoryRequests.Create request);
    CategoryAdminResponse update(UserPrincipal actor, Long id, CategoryRequests.Update request);
    void delete(UserPrincipal actor, Long id);
}
