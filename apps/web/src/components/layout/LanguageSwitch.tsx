'use client';
import { GlobeIcon } from '@/components/icons';
import { useLang } from '@/i18n/client';
export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  return (
    <label className="inline-flex items-center gap-1">
      <GlobeIcon className="h-4 w-4" />
      <select
        aria-label="Language"
        value={lang}
        onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'vi')}
        className="rounded bg-transparent p-1"
      >
        <option className="text-gray-900" value="vi">
          Tiếng Việt
        </option>
        <option className="text-gray-900" value="en">
          English
        </option>
      </select>
    </label>
  );
}
