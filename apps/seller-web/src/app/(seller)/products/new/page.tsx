'use client';

import { ProductEditor } from '@/components/commerce/products/ProductEditor';
import { ShopGuard } from '@/components/commerce/ShopGuard';

export default function NewProductPage() {
  return <ShopGuard>{(shop) => <ProductEditor shop={shop} />}</ShopGuard>;
}
