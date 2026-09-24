import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

const STORAGE_KEY = 'gbcf-lang';
const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || 'es';

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: saved === 'en' ? 'en' : 'es',
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* ignore */ }
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export const toggleLanguage = () => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en');
export default i18n;
