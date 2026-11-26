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
        List<Category> locked = categories.lockTree();
        Long parentId = validateParent(locked, null, request.parentId());
        String name = request.name().strip();
        String slug = generateUniqueSlug(name);
        String internalCode = "CAT-" + UUID.randomUUID().toString().toUpperCase(Locale.ROOT);
        Category category = Category.builder()
                .code(internalCode)
                .name(name)
                .slug(slug)
                .description(normalizeDescription(request.description()))
                .parentId(parentId)
                .sortOrder(request.sortOrder() == null ? 0 : request.sortOrder())
                .isActive(request.isActive() == null || request.isActive())
                .build();
        categories.saveAndFlush(category);
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
        if (request.isDescriptionPresent()) category.setDescription(normalizeDescription(request.getDescription()));
        if (request.getSortOrder() != null) category.setSortOrder(request.getSortOrder());
        if (request.getIsActive() != null) category.setIsActive(request.getIsActive());
        if (request.getParentId() != null) category.setParentId(validateParent(locked, id, request.getParentId()));
        audit(actor, category, "ADMIN_CATEGORY_UPDATED");
        return response(category);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public void delete(UserPrincipal actor, Long id) {
        Category category = activeCategory(categories.lockTree(), id);
        long children = categories.countActiveChildren(id);
        if (children > 0) {
            throw new BaseException(ResponseCode.CONFLICT,
                    "Category has " + children + " child categories and cannot be deleted.");
        }
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

    private Long validateParent(List<Category> locked, Long selfId, Long parentId) {
        if (parentId == null) return null;
        if (parentId <= 0) throw validation("Parent category ID must be a positive integer.");
        if (selfId != null && selfId.equals(parentId)) throw validation("Category cannot be its own parent.");
        boolean exists = locked.stream().anyMatch(c -> c.getCategoryId().equals(parentId) && !c.getIsDeleted());
        if (!exists) throw validation("Parent category not found.");
        return parentId;
    }

    private boolean visible(Category category) {
        return category.getIsActive() && !category.getIsDeleted();
    }

    private CategoryAdminResponse response(Category category) {
        return new CategoryAdminResponse(
                category.getCategoryId(),
                category.getName(),
                category.getSlug(),
                category.getDescription(),
                category.getSortOrder(),
                category.getIsActive());
    }

    private void audit(UserPrincipal actor, Category category, String eventType) {
        auditEvents.save(CategoryAuditEvent.builder().categoryId(category.getCategoryId()).actorId(actor.getId()).eventType(eventType).build());
    }

    private static String normalizeDescription(String description) {
        if (description == null || description.isBlank()) return null;
        return description.strip();
    }

    private String generateUniqueSlug(String name) {
        String base = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT).replace('đ', 'd').replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        if (base.isEmpty()) base = "category";
        if (base.length() > 100) base = base.substring(0, 100).replaceAll("-+$", "");
        if (base.isEmpty()) base = "category";

        String candidate = base;
        int suffix = 2;
        while (categories.existsBySlug(candidate)) {
            String tail = "-" + suffix++;
            int maxBase = Math.max(1, 100 - tail.length());
            String prefix = base.length() > maxBase ? base.substring(0, maxBase).replaceAll("-+$", "") : base;
            if (prefix.isEmpty()) prefix = "cat";
            candidate = prefix + tail;
        }
        return candidate;
    }

    private BaseException validation(String message) { return new BaseException(ResponseCode.VALIDATION_ERROR, message); }
}
