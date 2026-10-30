import { Suspense } from 'react';
import { AuthForm } from '@/components/session/AuthForm';
import { Spinner } from '@/components/ui';
export default function Login() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm />
    </Suspense>
  );
}
