import i18n from './index';
import phrasesEn from './locales/phrases.en.json';

const EN = phrasesEn as Record<string, string>;

/**
 * Display-only phrase translation. Source strings stay in Spanish in the code;
 * when the UI language is English we look up the phrase dictionary.
 * Never use the return value as a data key or for comparisons.
 */
export const trs = (s: string): string => {
  if (i18n.language !== 'en') return s;
  return EN[s] ?? s;
};
