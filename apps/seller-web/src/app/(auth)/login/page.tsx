import { Suspense } from 'react';
import { Spinner } from '@huspee/web-ui/components/ui';
import { SellerAuthForm } from '../_components/SellerAuthForm';

export default function Login() {
  return (
    <Suspense fallback={<Spinner />}>
      <SellerAuthForm mode="login" />
    </Suspense>
  );
}
