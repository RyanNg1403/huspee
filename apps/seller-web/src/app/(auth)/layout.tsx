import { LanguageSwitch } from '@huspee/web-ui/components/layout/LanguageSwitch';
import { getT } from '@huspee/web-ui/i18n/server';
import { FocusFrame } from '@/components/shell/Brand';
import { shellMessages } from '@/components/shell/messages';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getT(shellMessages);
  return (
    <FocusFrame channel={t('channel')} right={<LanguageSwitch />}>
      {children}
    </FocusFrame>
  );
}
