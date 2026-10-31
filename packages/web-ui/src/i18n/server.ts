import { cookies } from 'next/headers';
import { translator, type Messages } from '@huspee/web-ui/i18n/types';
export async function getT<K extends string>(messages: Messages<K>) {
  const lang = (await cookies()).get('huspee_lang')?.value === 'en' ? 'en' : 'vi';
  return translator(messages, lang);
}
