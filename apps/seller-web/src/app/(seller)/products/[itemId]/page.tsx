'use client';

import { useParams } from 'next/navigation';
import { ProductEditor } from '@/components/commerce/products/ProductEditor';
import { ShopGuard } from '@/components/commerce/ShopGuard';

export default function EditProductPage() {
  const itemId = Number(useParams().itemId);
  return <ShopGuard>{(shop) => <ProductEditor shop={shop} itemId={itemId} />}</ShopGuard>;
}
