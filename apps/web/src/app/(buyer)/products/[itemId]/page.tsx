'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { QueryState } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { getApiClient } from '@huspee/web-ui/lib/api';
import { useApi } from '@huspee/web-ui/lib/use-api';
import { messages } from '@/components/product/messages';
import { ProductView } from '@/components/product/ProductView';

export default function ProductPage() {
  const t = useT(messages);
  const id = Number(useParams().itemId);
  const product = useApi(() => getApiClient().marketplace.getProduct(id), [id]);
  useEffect(() => {
    document.title = `${product.data?.name ?? t('product')} | Huspee`;
  }, [product.data, t]);
  return (
    <>
      <QueryState {...product} retry={product.reload} className="h-[480px] w-full" />
      {!product.loading && !product.error && product.data && <ProductView key={id} product={product.data} />}
    </>
  );
}
