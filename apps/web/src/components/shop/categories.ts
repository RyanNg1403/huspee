import type { CategoryNode, ProductSummary } from '@huspee/sdk';

export interface CategoryTab {
  category_id: number;
  name: string;
  count: number;
}

function names(nodes: CategoryNode[], into = new Map<number, string>()) {
  for (const node of nodes) {
    into.set(node.category_id, node.display_name);
    names(node.children, into);
  }
  return into;
}

/** Marketplace categories that a shop's listed products belong to, most stocked first. */
export function categoryTabs(products: ProductSummary[], tree: CategoryNode[]): CategoryTab[] {
  const known = names(tree);
  const counts = new Map<number, number>();
  for (const p of products) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  return [...counts]
    .filter(([id]) => known.has(id))
    .map(([id, count]) => ({ category_id: id, name: known.get(id)!, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
}

/** Path from the top-level category down to `categoryId`, or an empty list when it is unknown. */
export function categoryPath(tree: CategoryNode[], categoryId: number): CategoryNode[] {
  for (const node of tree) {
    if (node.category_id === categoryId) return [node];
    const below = categoryPath(node.children, categoryId);
    if (below.length) return [node, ...below];
  }
  return [];
}
