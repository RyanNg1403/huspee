import { Suspense } from 'react';
import { AuthForm } from '@huspee/web-ui/components/session/AuthForm';
import { Spinner } from '@huspee/web-ui/components/ui';
export default function Signup() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm seller signup />
    </Suspense>
  );
}
