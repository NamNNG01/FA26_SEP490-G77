package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.Category;
import com.examprep.entities.CategoryAuditEvent;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CategoryAuditEventRepository;
import com.examprep.repositories.CategoryRepository;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CategoryServiceImpl implements CategoryService {
    private final CategoryRepository categories;
    private final CategoryAuditEventRepository auditEvents;

    @Override
    public List<CategoryResponse> list() {
        return categories.findTree().stream().filter(this::visible)
                .sorted(Comparator.comparing(Category::getName).thenComparing(Category::getCategoryId))
                .map(c -> new CategoryResponse(c.getCategoryId(), c.getName(), c.getSlug(), c.getDescription())).toList();
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public CategoryTreeResponse adminList() {
        return new CategoryTreeResponse(categories.findTree().stream()
                .filter(c -> !c.getIsDeleted()).map(this::response).toList());
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public List<CategorySelectResponse> buildTree() {
        return categories.findTree().stream().filter(c -> !c.getIsDeleted())
                .map(c -> new CategorySelectResponse(c.getCategoryId(), c.getName(), c.getCategoryId(), !visible(c))).toList();
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CategoryAdminResponse create(UserPrincipal actor, CategoryRequests.Create request) {
        String code = normalizeCode(request.code());
        categories.lockTree();
        if (categories.existsByCode(code)) throw validation("Category code already exists.");
        Category category = Category.builder().code(code).name(request.name().strip())
                .slug("category-" + UUID.randomUUID())
                .sortOrder(request.sortOrder() == null ? 0 : request.sortOrder())
                .isActive(request.isActive() == null || request.isActive()).build();
        try {
            categories.saveAndFlush(category);
        } catch (DataIntegrityViolationException duplicate) {
            throw validation("Category code already exists.");
        }
        category.setSlug(slug(category.getName(), category.getCategoryId()));
        audit(actor, category, "ADMIN_CATEGORY_CREATED");
        return response(category);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CategoryAdminResponse update(UserPrincipal actor, Long id, CategoryRequests.Update request) {
        List<Category> locked = categories.lockTree();
        Category category = activeCategory(locked, id);
        if (request.getName() != null) category.setName(request.getName().strip());
        if (request.getSortOrder() != null) category.setSortOrder(request.getSortOrder());
        if (request.getIsActive() != null) category.setIsActive(request.getIsActive());
        audit(actor, category, "ADMIN_CATEGORY_UPDATED");
        return response(category);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(UserPrincipal actor, Long id) {
        Category category = activeCategory(categories.lockTree(), id);
        long courses = categories.countCourses(id);
        if (courses > 0) throw new BaseException(ResponseCode.CONFLICT,
                "Category is used by " + courses + " courses and their questions.");
        category.setIsDeleted(true);
        audit(actor, category, "ADMIN_CATEGORY_DELETED");
    }

    private Category activeCategory(List<Category> values, Long id) {
        if (id == null || id <= 0) throw validation("ID must be a positive integer.");
        return values.stream().filter(c -> c.getCategoryId().equals(id) && !c.getIsDeleted()).findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Category not found."));
    }

    private boolean visible(Category category) {
        return category.getIsActive() && !category.getIsDeleted();
    }

    private CategoryAdminResponse response(Category category) {
        return new CategoryAdminResponse(category.getCategoryId(), category.getCode(), category.getName(),
                category.getSortOrder(), category.getIsActive());
    }

    private void audit(UserPrincipal actor, Category category, String eventType) {
        auditEvents.save(CategoryAuditEvent.builder().categoryId(category.getCategoryId()).actorId(actor.getId()).eventType(eventType).build());
    }

    private String normalizeCode(String value) {
        String normalized = Normalizer.normalize(value.strip(), Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .replace('đ', 'd').replace('Đ', 'D').toUpperCase(Locale.ROOT);
        if (normalized.isBlank() || normalized.length() > 255) throw validation("Category code must contain 1-255 characters.");
        return normalized;
    }

    private String slug(String name, Long id) {
        String base = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT).replace('đ', 'd').replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isEmpty()) base = "category";
        String suffix = "-" + id;
        return base.substring(0, Math.min(base.length(), 100 - suffix.length())).replaceAll("-+$", "") + suffix;
    }

    private BaseException validation(String message) { return new BaseException(ResponseCode.VALIDATION_ERROR, message); }
}
