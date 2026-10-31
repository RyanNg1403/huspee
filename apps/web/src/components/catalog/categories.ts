import type { CategoryNode } from '@huspee/sdk';

type Lang = 'vi' | 'en';

/** Seeded categories carry a Vietnamese display name and an English name. */
export function categoryLabel(category: Pick<CategoryNode, 'name' | 'display_name'>, lang: Lang) {
  return lang === 'en' ? category.name : category.display_name;
}

export function findCategory(tree: readonly CategoryNode[], id: number | undefined): CategoryNode | null {
  if (id === undefined) return null;
  for (const node of tree) {
    if (node.category_id === id) return node;
    const child = findCategory(node.children, id);
    if (child) return child;
  }
  return null;
}

/** Root category that contains `id` (or is it). */
export function rootOf(tree: readonly CategoryNode[], id: number | undefined): CategoryNode | null {
  return tree.find((root) => findCategory([root], id)) ?? null;
}

/** Filter choices: every root, plus the subcategories of the root that contains `selectedId`. */
export function categoryChoices(
  tree: readonly CategoryNode[],
  selectedId: number | undefined,
): Array<{ category: CategoryNode; depth: 0 | 1 }> {
  const open = rootOf(tree, selectedId);
  return tree.flatMap((root) => [
    { category: root, depth: 0 as const },
    ...(root === open ? root.children.map((category) => ({ category, depth: 1 as const })) : []),
  ]);
}

/** First subcategory of each root: a short spread of shortcuts across departments. */
export function shortcutCategories(tree: readonly CategoryNode[], limit: number): CategoryNode[] {
  return tree.map((root) => root.children[0] ?? root).slice(0, limit);
}
