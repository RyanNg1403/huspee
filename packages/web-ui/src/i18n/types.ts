export type Lang = 'vi' | 'en';
export type Messages<K extends string = string> = {
  vi: Record<K, string>;
  en: Record<K, string>;
};
export function defineMessages<const V extends Record<string, string>>(messages: {
  vi: V;
  en: { [K in keyof V]: string };
}): { vi: V; en: { [K in keyof V]: string } } {
  return messages;
}
export function translator<K extends string>(messages: Messages<K>, lang: Lang) {
  return (key: K, vars?: Record<string, string | number>) =>
    messages[lang][key].replace(/\{(\w+)\}/g, (match, name: string) =>
      vars?.[name] === undefined ? match : String(vars[name]),
    );
}
