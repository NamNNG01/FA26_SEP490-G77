import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import {
  categoryService,
  type AdminCategoryNode,
  type CreateCategoryRequest,
  type UpdateCategoryRequest,
} from '@/services/category.service';

export function CategoriesPage() {
  const [categories, setCategories] = useState<AdminCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<number | null>(null);
  const [addCode, setAddCode] = useState('');
  const [addName, setAddName] = useState('');
  const [addSortOrder, setAddSortOrder] = useState('0');
  const [addIsActive, setAddIsActive] = useState(true);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  const [editingCategory, setEditingCategory] = useState<AdminCategoryNode | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editParentId, setEditParentId] = useState<string>('root');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const [deletingCategory, setDeletingCategory] = useState<AdminCategoryNode | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await categoryService.getAdminCategories();
      setCategories(data);
      const initialExp: Record<number, boolean> = {};
      data.forEach((c) => {
        initialExp[c.categoryId] = true;
      });
      setExpanded(initialExp);
    } catch {
      setToast({ type: 'error', message: 'Failed to load categories.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const parentOptions = useMemo(() => {
    const list: { label: string; value: string }[] = [{ label: 'Top Level (Root)', value: 'root' }];
    function traverse(nodes: AdminCategoryNode[], prefix = '') {
      for (const node of nodes) {
        if (!editingCategory || node.categoryId !== editingCategory.categoryId) {
          list.push({
            label: `${prefix}${node.name} (${node.code})`,
            value: String(node.categoryId),
          });
          if (node.children?.length) {
            traverse(node.children, prefix + '— ');
          }
        }
      }
    }
    traverse(categories);
    return list;
  }, [categories, editingCategory]);

  const handleOpenAdd = (parentId: number | null = null) => {
    setAddParentId(parentId);
    setAddCode('');
    setAddName('');
    setAddSortOrder('0');
    setAddIsActive(true);
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCode.trim() || !addName.trim()) {
      setToast({ type: 'error', message: 'Code and Name are required.' });
      return;
    }
    setSubmittingAdd(true);
    try {
      const payload: CreateCategoryRequest = {
        code: addCode.trim().toUpperCase(),
        name: addName.trim(),
        parentId: addParentId,
        sortOrder: Number(addSortOrder) || 0,
        isActive: addIsActive,
      };
      await categoryService.createCategory(payload);
      setToast({ type: 'success', message: 'Category created successfully.' });
      setIsAddModalOpen(false);
      await loadCategories();
    } catch {
      setToast({ type: 'error', message: 'Failed to create category.' });
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (category: AdminCategoryNode) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditSortOrder(String(category.sortOrder || 0));
    setEditIsActive(category.isActive);
    setEditParentId(category.parentId ? String(category.parentId) : 'root');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editName.trim()) {
      setToast({ type: 'error', message: 'Category name is required.' });
      return;
    }
    setSubmittingEdit(true);
    try {
      const payload: UpdateCategoryRequest = {
        name: editName.trim(),
        sortOrder: Number(editSortOrder) || 0,
        isActive: editIsActive,
        parentId: editParentId === 'root' ? null : Number(editParentId),
      };
      await categoryService.updateCategory(editingCategory.categoryId, payload);
      setToast({ type: 'success', message: 'Category updated successfully.' });
      setEditingCategory(null);
      await loadCategories();
    } catch {
      setToast({ type: 'error', message: 'Failed to update category.' });
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCategory) return;
    setSubmittingDelete(true);
    try {
      await categoryService.deleteCategory(deletingCategory.categoryId);
      setToast({ type: 'success', message: 'Category deleted successfully.' });
      setDeletingCategory(null);
      await loadCategories();
    } catch {
      setToast({ type: 'error', message: 'Failed to delete category.' });
    } finally {
      setSubmittingDelete(false);
    }
  };

  const filterTree = (nodes: AdminCategoryNode[], term: string): AdminCategoryNode[] => {
    if (!term.trim()) return nodes;
    const lower = term.toLowerCase();
    const result: AdminCategoryNode[] = [];
    for (const node of nodes) {
      const matchSelf = node.name.toLowerCase().includes(lower) || node.code.toLowerCase().includes(lower);
      const filteredChildren = filterTree(node.children || [], term);
      if (matchSelf || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }
    return result;
  };

  const filteredCategories = useMemo(() => {
    return filterTree(categories, search);
  }, [categories, search]);

  const renderNode = (node: AdminCategoryNode, depth = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isNodeExpanded = expanded[node.categoryId] ?? true;

    return (
      <div key={node.categoryId} className="space-y-1">
        <div
          className={`group flex items-center justify-between p-3 rounded-lg border border-line-soft transition-colors ${
            depth === 0 ? 'bg-surface hover:border-line' : 'bg-surface-subtle/50 hover:bg-surface-subtle'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.categoryId)}
                className="p-1 rounded hover:bg-surface-alt text-content-soft transition-colors"
              >
                {isNodeExpanded ? (
                  <Icon.ChevronDown className="w-4 h-4" />
                ) : (
                  <Icon.ChevronRight className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-6 flex items-center justify-center text-content-soft">
                <span className="w-1.5 h-1.5 rounded-full bg-content-soft/40" />
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-brand-soft text-brand-ink">
                {node.code}
              </span>
              <span className="font-medium text-content">{node.name}</span>
            </div>

            <Badge variant={node.isActive ? 'success' : 'default'} size="sm">
              {node.isActive ? 'Active' : 'Inactive'}
            </Badge>

            {hasChildren && (
              <span className="text-xs text-content-soft">
                ({node.children.length} subcategories)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon.Plus className="w-3.5 h-3.5" />}
              onClick={() => handleOpenAdd(node.categoryId)}
              title="Add subcategory"
            >
              Add Child
            </Button>
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

        {hasChildren && isNodeExpanded && (
          <div className="space-y-1">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {toast && (
        <div className="fixed top-5 right-5 z-50">
          <Alert type={toast.type} message={toast.message} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">Category Management</h2>
          <p className="text-sm text-content-soft mt-0.5">
            Organize question bank hierarchies and course subject categories.
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
            onClick={() => handleOpenAdd(null)}
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
            placeholder="Search categories by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface-subtle rounded-lg border border-line-soft focus:outline-none focus:border-brand-primary text-content"
          />
        </div>
        <div className="text-sm text-content-soft">
          {categories.length} root categories
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-content-soft">Loading category tree...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-dashed border-line-soft">
          <Icon.Folder className="w-12 h-12 text-content-soft mx-auto mb-3" />
          <h3 className="text-base font-semibold text-content">No categories found</h3>
          <p className="text-sm text-content-soft mt-1">
            {search ? 'Try modifying your search query.' : 'Create your first category to get started.'}
          </p>
          {!search && (
            <Button
              variant="primary"
              size="sm"
              className="mt-4"
              icon={<Icon.Plus className="w-4 h-4" />}
              onClick={() => handleOpenAdd(null)}
            >
              Add Root Category
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCategories.map((node) => renderNode(node, 0))}
        </div>
      )}

      {isAddModalOpen && (
        <Modal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title={addParentId ? 'Add Subcategory' : 'Add Root Category'}
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <Input
              label="Category Code"
              placeholder="e.g. MATH-ALG"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              required
            />
            <Input
              label="Display Name"
              placeholder="e.g. Linear Algebra"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              required
            />
            <Input
              label="Sort Order"
              type="number"
              placeholder="0"
              value={addSortOrder}
              onChange={(e) => setAddSortOrder(e.target.value)}
            />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-content">Active in Dropdowns</span>
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
          title={`Edit Category: ${editingCategory.code}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-content-soft mb-1">
                Category Code (Read-only)
              </label>
              <input
                type="text"
                disabled
                value={editingCategory.code}
                className="w-full px-3 py-2 text-sm bg-surface-subtle text-content-soft rounded-lg border border-line-soft cursor-not-allowed"
              />
            </div>
            <Input
              label="Display Name"
              placeholder="Category name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <Select
              label="Parent Category"
              value={editParentId}
              onChange={setEditParentId}
              options={parentOptions}
            />
            <Input
              label="Sort Order"
              type="number"
              value={editSortOrder}
              onChange={(e) => setEditSortOrder(e.target.value)}
            />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-content">Active Status</span>
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
              <Button type="submit" variant="primary" loading={submittingEdit}>
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
              Are you sure you want to delete category{' '}
              <strong className="text-content font-semibold">
                {deletingCategory.name} ({deletingCategory.code})
              </strong>
              ?
            </p>
            {deletingCategory.children && deletingCategory.children.length > 0 && (
              <Alert
                type="warning"
                title="Subcategories warning"
                message="This category has child subcategories. Deleting it will remove the entire branch."
              />
            )}
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

