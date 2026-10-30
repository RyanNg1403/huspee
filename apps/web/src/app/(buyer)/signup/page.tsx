import { Suspense } from 'react';
import { AuthForm } from '@/components/session/AuthForm';
import { Spinner } from '@/components/ui';
export default function Signup() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm signup />
    </Suspense>
  );
}
