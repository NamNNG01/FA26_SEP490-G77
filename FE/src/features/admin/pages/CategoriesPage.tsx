import React, { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import {
  categoryService,
  type AdminCategoryNode,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
} from "@/services/category.service";
import { getApiErrorMessage } from "@/utils/apiError";

export function CategoriesPage() {
  const notification = useToast();
  const [categories, setCategories] = useState<AdminCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addIsActive, setAddIsActive] = useState(true);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  const [editingCategory, setEditingCategory] =
    useState<AdminCategoryNode | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [deletingCategory, setDeletingCategory] =
    useState<AdminCategoryNode | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await categoryService.getAdminCategories();
      setCategories(data);
    } catch (error) {
      notification.error(
        getApiErrorMessage(error, "Failed to load categories."),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleOpenAdd = () => {
    setAddName("");
    setAddDescription("");
    setAddIsActive(true);
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      notification.error("Category name is required.");
      return;
    }
    setSubmittingAdd(true);
    try {
      const payload: CreateCategoryRequest = {
        name: addName.trim(),
        description: addDescription.trim(),
        isActive: addIsActive,
      };
      await categoryService.createCategory(payload);
      notification.success("Category created successfully.");
      setIsAddModalOpen(false);
      await loadCategories();
    } catch (error) {
      notification.error(
        getApiErrorMessage(error, "Failed to create category."),
      );
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (category: AdminCategoryNode) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditDescription(category.description || "");
    setEditIsActive(category.isActive);
  };

  const hasEditChanges = Boolean(
    editingCategory &&
    (editName.trim() !== editingCategory.name ||
      editDescription.trim() !== (editingCategory.description || "") ||
      editIsActive !== editingCategory.isActive),
  );

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editName.trim()) {
      notification.error("Category name is required.");
      return;
    }
    setSubmittingEdit(true);
    try {
      const payload: UpdateCategoryRequest = {
        name: editName.trim(),
        description: editDescription.trim(),
        isActive: editIsActive,
      };
      await categoryService.updateCategory(editingCategory.categoryId, payload);
      notification.success("Category updated successfully.");
      setEditingCategory(null);
      await loadCategories();
    } catch (error) {
      notification.error(
        getApiErrorMessage(error, "Failed to update category."),
      );
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return;
    setSubmittingDelete(true);
    try {
      await categoryService.deleteCategory(deletingCategory.categoryId);
      notification.success("Category deleted successfully.");
      setDeletingCategory(null);
      await loadCategories();
    } catch (error) {
      notification.error(
        getApiErrorMessage(error, "Failed to delete category."),
      );
    } finally {
      setSubmittingDelete(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? categories.filter((category) =>
          `${category.name} ${category.slug || ""} ${category.description || ""}`
            .toLowerCase()
            .includes(term),
        )
      : categories;
  }, [categories, search]);

  const renderCategory = (node: AdminCategoryNode) => {
    return (
      <div
        key={node.categoryId}
        className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_220px] items-center gap-2 sm:gap-4 p-4 rounded-lg border border-line-soft bg-surface"
      >
        <div className="min-w-0">
          <span className="font-medium text-content">{node.name}</span>
          <p
            className={`mt-1 text-xs line-clamp-2 ${node.description ? "text-content-soft" : "italic text-content-subtle"}`}
          >
            {node.description || "No description"}
          </p>
        </div>
        <span
          className="font-mono text-sm text-content-soft truncate"
          title={node.slug || "Slug is generated after saving"}
        >
          {node.slug || "Generated on save"}
        </span>
        <Badge
          variant={node.isActive ? "success" : "default"}
          size="sm"
          className="w-fit"
        >
          {node.isActive ? "Active" : "Inactive"}
        </Badge>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon.Edit className="w-3.5 h-3.5" />}
            onClick={() => handleOpenEdit(node)}
            title="Edit category"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-feedback-error hover:bg-feedback-error/10"
            icon={<Icon.Trash className="w-3.5 h-3.5" />}
            onClick={() => setDeletingCategory(node)}
            title="Delete category"
          >
            Delete
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">
            Category Management
          </h2>
          <p className="text-sm text-content-soft mt-0.5">
            Manage category names, slugs, and active status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={<Icon.RefreshCw className="w-4 h-4" />}
            onClick={loadCategories}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={<Icon.Plus className="w-4 h-4" />}
            onClick={handleOpenAdd}
          >
            New Category
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-surface p-4 rounded-xl border border-line-soft">
        <div className="relative flex-1">
          <Icon.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-soft" />
          <input
            type="text"
            placeholder="Search categories by name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface-subtle rounded-lg border border-line-soft focus:outline-none focus:border-brand-primary text-content"
          />
        </div>
        <div className="text-sm text-content-soft">
          {filteredCategories.length} categories
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-content-soft">Loading categories...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-dashed border-line-soft">
          <Icon.Folder className="w-12 h-12 text-content-soft mx-auto mb-3" />
          <h3 className="text-base font-semibold text-content">
            No categories found
          </h3>
          <p className="text-sm text-content-soft mt-1">
            {search
              ? "Try modifying your search query."
              : "Create your first category to get started."}
          </p>
          {!search && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              icon={<Icon.Plus className="w-4 h-4" />}
              onClick={handleOpenAdd}
            >
              Add Category
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_220px] gap-4 px-4 text-xs font-semibold uppercase tracking-wide text-content-soft">
            <span>Name</span>
            <span>Slug</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filteredCategories.map(renderCategory)}
        </div>
      )}

      {isAddModalOpen && (
        <Modal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Create Category"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <Input
              label="Name"
              placeholder="e.g. Mathematics"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
            />
            <div>
              <label
                htmlFor="add-category-description"
                className="block text-sm font-medium text-content-secondary mb-1.5"
              >
                Description
              </label>
              <textarea
                id="add-category-description"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Describe what this category covers"
                className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-content-subtle focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-content">Active</span>
              <Switch checked={addIsActive} onChange={setAddIsActive} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-line-soft">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                disabled={submittingAdd}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submittingAdd}>
                Create Category
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editingCategory && (
        <Modal
          open={Boolean(editingCategory)}
          onClose={() => setEditingCategory(null)}
          title="Edit Category"
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <Input
              label="Name"
              placeholder="Category name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <div>
              <label
                htmlFor="edit-category-description"
                className="block text-sm font-medium text-content-secondary mb-1.5"
              >
                Description
              </label>
              <textarea
                id="edit-category-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Describe what this category covers"
                className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-content-subtle focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-soft mb-1">
                Slug (read-only)
              </label>
              <input
                type="text"
                readOnly
                value={editingCategory.slug || ""}
                placeholder="Generated by backend"
                className="w-full px-3 py-2 text-sm bg-surface-subtle text-content-soft rounded-lg border border-line-soft"
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-content">
                Active Status
              </span>
              <Switch checked={editIsActive} onChange={setEditIsActive} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-line-soft">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingCategory(null)}
                disabled={submittingEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submittingEdit}
                disabled={submittingEdit || !hasEditChanges}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deletingCategory && (
        <Modal
          open={Boolean(deletingCategory)}
          onClose={() => setDeletingCategory(null)}
          title="Delete Category"
        >
          <div className="space-y-4">
            <p className="text-sm text-content">
              Are you sure you want to delete category{" "}
              <strong className="text-content font-semibold">
                {deletingCategory.name}
              </strong>
              ?
            </p>
            <div className="flex justify-end gap-2 pt-4 border-t border-line-soft">
              <Button
                variant="outline"
                onClick={() => setDeletingCategory(null)}
                disabled={submittingDelete}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={submittingDelete}
                onClick={handleDeleteConfirm}
              >
                Delete Category
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
