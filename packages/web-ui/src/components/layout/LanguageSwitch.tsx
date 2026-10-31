'use client';
import { GlobeIcon } from '@huspee/web-ui/components/icons';
import { useLang } from '@huspee/web-ui/i18n/client';
export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  return (
    <label className="inline-flex items-center gap-1 text-gray-500">
      <GlobeIcon className="h-4 w-4" />
      <select
        aria-label="Language"
        value={lang}
        onChange={(e) => setLang(e.target.value === 'en' ? 'en' : 'vi')}
        className="cursor-pointer rounded-lg bg-transparent py-1 pr-1 text-gray-700 hover:text-ink focus:outline-none"
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
