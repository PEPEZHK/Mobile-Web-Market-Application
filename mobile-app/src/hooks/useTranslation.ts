import { useLanguage } from './useLanguage';

type TranslationOptions = Parameters<ReturnType<typeof useLanguage>['t']>[1];
type Translator = (key: string, options?: TranslationOptions) => string;

export function useTranslation(): { t: Translator } {
  const { t } = useLanguage();
  return { t };
}
