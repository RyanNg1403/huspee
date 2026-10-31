'use client';
import type { CategoryNode } from '@huspee/sdk';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';

let pending: Promise<CategoryNode[]> | null = null;

/** The category tree changes only with a reseed, so the header and pages share one request per page load. */
function loadCategories() {
  pending ??= getApiClient()
    .marketplace.categories()
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

export function useCategories() {
  return useApi(loadCategories, []);
}
