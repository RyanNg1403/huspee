'use client';
import { useParams } from 'next/navigation';
import { ProductEditor } from '../../_catalog/ProductEditor';
export default function EditProduct() {
  return <ProductEditor itemId={Number(useParams().itemId)} />;
}
