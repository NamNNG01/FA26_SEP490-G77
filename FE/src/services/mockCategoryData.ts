import type {
  AdminCategoryNode,
  AdminCategoryItem,
  CategoryTreeSelectNode,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from './category.service';
import type { CategoryResponse } from './course.service';

export const initialMockCategories: AdminCategoryNode[] = [
  {
    categoryId: 1,
    code: 'MATH',
    name: 'Mathematics',
    parentId: null,
    sortOrder: 1,
    isActive: true,
    children: [
      {
        categoryId: 101,
        code: 'MATH-CALC',
        name: 'Calculus',
        parentId: 1,
        sortOrder: 1,
        isActive: true,
        children: [],
      },
      {
        categoryId: 102,
        code: 'MATH-ALG',
        name: 'Linear Algebra',
        parentId: 1,
        sortOrder: 2,
        isActive: true,
        children: [],
      },
      {
        categoryId: 103,
        code: 'MATH-PROB',
        name: 'Probability & Statistics',
        parentId: 1,
        sortOrder: 3,
        isActive: true,
        children: [],
      },
    ],
  },
  {
    categoryId: 2,
    code: 'CS',
    name: 'Computer Science',
    parentId: null,
    sortOrder: 2,
    isActive: true,
    children: [
      {
        categoryId: 201,
        code: 'CS-DS',
        name: 'Data Structures & Algorithms',
        parentId: 2,
        sortOrder: 1,
        isActive: true,
        children: [],
      },
      {
        categoryId: 202,
        code: 'CS-DB',
        name: 'Databases & SQL',
        parentId: 2,
        sortOrder: 2,
        isActive: true,
        children: [],
      },
      {
        categoryId: 203,
        code: 'CS-AI',
        name: 'Artificial Intelligence',
        parentId: 2,
        sortOrder: 3,
        isActive: true,
        children: [],
      },
    ],
  },
  {
    categoryId: 3,
    code: 'PHYS',
    name: 'Physics',
    parentId: null,
    sortOrder: 3,
    isActive: true,
    children: [
      {
        categoryId: 301,
        code: 'PHYS-MECH',
        name: 'Classical Mechanics',
        parentId: 3,
        sortOrder: 1,
        isActive: true,
        children: [],
      },
      {
        categoryId: 302,
        code: 'PHYS-ELEC',
        name: 'Electromagnetism',
        parentId: 3,
        sortOrder: 2,
        isActive: true,
        children: [],
      },
    ],
  },
];

let mockCategoriesStore: AdminCategoryNode[] = JSON.parse(JSON.stringify(initialMockCategories));

export function getMockAdminCategories(): AdminCategoryNode[] {
  const categories: AdminCategoryNode[] = JSON.parse(JSON.stringify(mockCategoriesStore));
  const addSlugs = (nodes: AdminCategoryNode[]) => {
    for (const node of nodes) {
      node.slug = node.slug || slugify(node.name);
      if (node.children?.length) addSlugs(node.children);
    }
  };
  addSlugs(categories);
  return categories;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function getMockPublicCategories(): CategoryResponse[] {
  const result: CategoryResponse[] = [];
  function traverse(nodes: AdminCategoryNode[], parentName: string | null = null) {
    for (const node of nodes) {
      if (node.isActive) {
        result.push({
          categoryId: node.categoryId,
          name: node.name,
          slug: node.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          description: null,
          parentId: node.parentId,
          parentName,
        });
      }
      if (node.children?.length) {
        traverse(node.children, node.name);
      }
    }
  }
  traverse(mockCategoriesStore);
  return result;
}

export function getMockCategoryTreeSelect(): CategoryTreeSelectNode[] {
  function mapNode(node: AdminCategoryNode): CategoryTreeSelectNode {
    return {
      categoryId: node.categoryId,
      label: node.name,
      value: node.categoryId,
      disabled: !node.isActive,
      children: (node.children || []).map(mapNode),
    };
  }
  return mockCategoriesStore.map(mapNode);
}

export function createMockCategory(payload: CreateCategoryRequest): AdminCategoryItem {
  const newId = Date.now();
  const newItem: AdminCategoryItem = {
    categoryId: newId,
    code: `CAT-${newId}`,
    slug: slugify(payload.name),
    name: payload.name.trim(),
    parentId: null,
    sortOrder: mockCategoriesStore.length + 1,
    isActive: payload.isActive ?? true,
  };

  const newNode: AdminCategoryNode = {
    ...newItem,
    children: [],
  };

  mockCategoriesStore.push(newNode);
  return newItem;
}

export function updateMockCategory(id: number | string, payload: UpdateCategoryRequest): AdminCategoryItem {
  const numId = Number(id);

  function findNode(nodes: AdminCategoryNode[]): AdminCategoryNode | null {
    for (const node of nodes) {
      if (node.categoryId === numId) return node;
      if (node.children?.length) {
        const found = findNode(node.children);
        if (found) return found;
      }
    }
    return null;
  }

  const existing = findNode(mockCategoriesStore);
  if (existing) {
    if (payload.name !== undefined) existing.name = payload.name;
    existing.slug = slugify(existing.name);
    if (payload.isActive !== undefined) existing.isActive = payload.isActive;

    return {
      categoryId: existing.categoryId,
      code: existing.code,
      slug: existing.slug || slugify(existing.name),
      name: existing.name,
      parentId: existing.parentId,
      sortOrder: existing.sortOrder,
      isActive: existing.isActive,
    };
  }

  return {
    categoryId: numId,
    code: `CAT-${numId}`,
    slug: slugify(payload.name ?? 'Updated Category'),
    name: payload.name ?? 'Updated Category',
    parentId: null,
    sortOrder: payload.sortOrder ?? 1,
    isActive: payload.isActive ?? true,
  };
}

export function deleteMockCategory(id: number | string): void {
  const numId = Number(id);

  function removeNode(nodes: AdminCategoryNode[]): boolean {
    const idx = nodes.findIndex((n) => n.categoryId === numId);
    if (idx !== -1) {
      nodes.splice(idx, 1);
      return true;
    }
    for (const node of nodes) {
      if (node.children?.length && removeNode(node.children)) {
        return true;
      }
    }
    return false;
  }

  removeNode(mockCategoriesStore);
}

