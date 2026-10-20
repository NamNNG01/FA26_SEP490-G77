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
                .map(c -> new CategoryResponse(c.getCategoryId(), c.getName(), c.getSlug(), c.getDescription(),
                        parentId(c), c.getParent() == null ? null : c.getParent().getName())).toList();
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public CategoryTreeResponse list(boolean includeDeleted) {
        List<Category> values = categories.findTree().stream()
                .filter(c -> includeDeleted || !c.getIsDeleted()).toList();
        Map<Long, CategoryAdminResponse> nodes = new LinkedHashMap<>();
        for (Category category : values) nodes.put(category.getCategoryId(), response(category));
        List<CategoryAdminResponse> roots = new ArrayList<>();
        for (Category category : values) {
            CategoryAdminResponse node = nodes.get(category.getCategoryId());
            CategoryAdminResponse parent = nodes.get(parentId(category));
            if (parent == null) roots.add(node);
            else parent.children().add(node);
        }
        return new CategoryTreeResponse(roots);
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public List<CategorySelectResponse> buildTree() {
        Map<Long, CategorySelectResponse> nodes = new LinkedHashMap<>();
        List<Category> values = categories.findTree().stream().filter(c -> !c.getIsDeleted()).toList();
        for (Category category : values) nodes.put(category.getCategoryId(), new CategorySelectResponse(
                category.getCategoryId(), category.getName(), category.getCategoryId(), !visible(category), new ArrayList<>()));
        List<CategorySelectResponse> roots = new ArrayList<>();
        for (Category category : values) {
            CategorySelectResponse node = nodes.get(category.getCategoryId());
            CategorySelectResponse parent = nodes.get(parentId(category));
            if (parent == null) roots.add(node);
            else parent.children().add(node);
        }
        return roots;
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public CategoryAdminResponse create(UserPrincipal actor, CategoryRequests.Create request) {
        String code = normalizeCode(request.code());
        List<Category> locked = categories.lockTree();
        if (categories.existsByCode(code)) throw validation("Category code already exists.");
        Category parent = request.parentId() == null ? null : activeCategory(locked, request.parentId());
        Category category = Category.builder().code(code).name(request.name().strip()).parent(parent)
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
        Category parent = category.getParent();
        if (request.isParentSpecified()) {
            parent = request.getParentId() == null ? null : activeCategory(locked, request.getParentId());
            Set<Long> seen = new HashSet<>();
            for (Category ancestor = parent; ancestor != null; ancestor = ancestor.getParent()) {
                if (ancestor.getCategoryId().equals(id) || !seen.add(ancestor.getCategoryId()))
                    throw validation("Category parent would create a cycle.");
            }
        }
        category.setParent(parent);
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
        long children = categories.countByParentCategoryIdAndIsDeletedFalse(id);
        if (children > 0) throw new BaseException(ResponseCode.CONFLICT,
                "Category has " + children + " child categories. Remove them first.");
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
        Set<Long> seen = new HashSet<>();
        for (Category current = category; current != null; current = current.getParent()) {
            if (!current.getIsActive() || current.getIsDeleted() || !seen.add(current.getCategoryId())) return false;
        }
        return true;
    }

    private CategoryAdminResponse response(Category category) {
        return new CategoryAdminResponse(category.getCategoryId(), category.getCode(), category.getName(), parentId(category),
                category.getSortOrder(), category.getIsActive(), category.getIsDeleted(), new ArrayList<>());
    }

    private Long parentId(Category category) {
        return category.getParent() == null ? null : category.getParent().getCategoryId();
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
