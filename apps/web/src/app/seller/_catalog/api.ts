import { HuspeeApiError } from '@huspee/sdk';
import { getApiClient } from '@/lib/api';
export async function call<T>(
  shopId: number,
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const result = await getApiClient().seller.shopee.call<T>(shopId, path, params);
  if (result.error) throw new HuspeeApiError(0, result.error, result.message);
  if (result.response === undefined) throw new Error('Missing response');
  return result.response;
}
