import { Suspense } from 'react';
import { AuthForm } from '@huspee/web-ui/components/session/AuthForm';
import { Spinner } from '@huspee/web-ui/components/ui';
export default function Login() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm seller />
    </Suspense>
  );
}
