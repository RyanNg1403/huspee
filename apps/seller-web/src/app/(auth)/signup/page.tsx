import { Suspense } from 'react';
import { Spinner } from '@huspee/web-ui/components/ui';
import { Steps } from '@/components/shell/Steps';
import { SellerAuthForm } from '../_components/SellerAuthForm';

export default function Signup() {
  return (
    <>
      <Steps current={0} />
      <Suspense fallback={<Spinner />}>
        <SellerAuthForm mode="signup" />
      </Suspense>
    </>
  );
}
