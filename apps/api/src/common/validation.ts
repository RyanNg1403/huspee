import { z, ZodTypeAny } from 'zod';
import { DomainError } from './errors';

export function parseInput<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw new DomainError('VALIDATION', first ? `Invalid ${first.path || 'input'}: ${first.message}` : 'Invalid input', {
      issues,
    });
  }
  return result.data;
}

/**
 * Query-string friendly primitives. Shopee clients send GET params as strings and lists either
 * as repeated keys (`a=1&a=2`, the SDK's style) or comma-separated (`a=1,2`, the docs' style).
 */
const splitList = (v: unknown): unknown => {
  if (v === undefined || v === null || v === '') return undefined;
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((x) => (typeof x === 'string' ? x.split(',').filter((s) => s.length > 0) : [x]));
};

export const q = {
  int: () => z.coerce.number().int(),
  num: () => z.coerce.number(),
  str: () => z.string(),
  bool: () =>
    z.preprocess((v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v), z.boolean()),
  intList: () => z.preprocess(splitList, z.array(z.coerce.number().int())),
  strList: () => z.preprocess(splitList, z.array(z.string())),
};

export const paging = {
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
};
