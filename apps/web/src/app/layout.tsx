import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { cookies } from 'next/headers';
import { LanguageProvider } from '@/i18n/client';
import { SessionProvider } from '@/components/session';
import { ToastProvider } from '@/components/ui';
import './globals.css';
const font = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'] });
export const metadata: Metadata = { title: 'Huspee', description: 'Huspee marketplace simulation' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get('huspee_lang')?.value === 'en' ? 'en' : 'vi';
  return (
    <html lang={lang}>
      <body className={font.className}>
        <LanguageProvider initialLang={lang}>
          <SessionProvider>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
