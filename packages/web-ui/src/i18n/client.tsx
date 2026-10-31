'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { translator, type Lang, type Messages } from '@huspee/web-ui/i18n/types';
const Context = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
} | null>(null);
export function LanguageProvider({
  children,
  initialLang = 'vi',
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, update] = useState<Lang>(initialLang);
  const router = useRouter();
  function setLang(next: Lang) {
    document.cookie = `huspee_lang=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    update(next);
    router.refresh();
  }
  return <Context.Provider value={{ lang, setLang }}>{children}</Context.Provider>;
}
export function useLang() {
  const value = useContext(Context);
  if (!value) throw new Error('LanguageProvider required');
  return value;
}
export function useT<K extends string>(messages: Messages<K>) {
  const { lang } = useLang();
  return translator(messages, lang);
}
