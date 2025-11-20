import { useLanguage as useLanguageContext } from '../contexts/LanguageContext';

export function useLanguage() {
  return useLanguageContext();
}
