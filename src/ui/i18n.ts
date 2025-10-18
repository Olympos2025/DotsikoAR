import el from '../locales/el.json';
import en from '../locales/en.json';

type LocaleKey = keyof typeof el;

const dictionaries = {
  el,
  en
} satisfies Record<string, Record<LocaleKey, string>>;

const getDefaultLocale = (): keyof typeof dictionaries => {
  const lang = navigator.language?.toLowerCase() ?? 'el';
  if (lang.startsWith('en')) return 'en';
  return 'el';
};

let currentLocale: keyof typeof dictionaries = getDefaultLocale();

export const setLocale = (locale: keyof typeof dictionaries) => {
  if (dictionaries[locale]) {
    currentLocale = locale;
    document.documentElement.lang = locale;
  }
};

export const t = (key: LocaleKey) => dictionaries[currentLocale][key] ?? key;

export const getLocale = () => currentLocale;

export const availableLocales = Object.keys(dictionaries) as (keyof typeof dictionaries)[];
