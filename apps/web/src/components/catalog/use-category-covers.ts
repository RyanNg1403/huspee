'use client';
import type { CategoryNode } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';

const covers = new Map<number, Promise<string | null>>();

/** Photo of the category's best-selling product; seeded categories have no image of their own. */
function coverOf(categoryId: number) {
  let cover = covers.get(categoryId);
  if (!cover) {
    cover = getApiClient()
      .marketplace.searchProducts({ category_id: categoryId, sort: 'top_sales', page_size: 1 })
      .then((page) => page.data[0]?.image_url ?? null)
      .catch(() => {
        covers.delete(categoryId);
        return null;
      });
    covers.set(categoryId, cover);
  }
  return cover;
}

/** Image per category id: its own `image_url`, else its best seller's photo. */
export function useCategoryCovers(categories: readonly CategoryNode[]) {
  const key = categories.map((c) => c.category_id).join(',');
  const result = useApi(
    async () =>
      new Map(
        await Promise.all(
          categories.map(
            async (c) => [c.category_id, c.image_url ?? (await coverOf(c.category_id))] as const,
          ),
        ),
      ),
    [key],
  );
  return result.data ?? new Map<number, string | null>();
}
