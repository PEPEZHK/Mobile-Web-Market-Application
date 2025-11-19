import { Globe2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Language } from "@/contexts/LanguageContext";

const languageKeyMap = {
  en: "language.english",
  tr: "language.turkish",
  ru: "language.russian",
} as const;

export function LanguageSwitcher() {
  const { language, setLanguage, availableLanguages, t } = useLanguage();

  return (
    <Select value={language} onValueChange={value => setLanguage(value as Language)}>
      <SelectTrigger className="w-[150px]">
        <Globe2 className="mr-2 h-4 w-4" />
        <SelectValue placeholder={t("layout.language")}>{t(languageKeyMap[language])}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableLanguages.map(({ value }) => (
          <SelectItem key={value} value={value}>
            {t(languageKeyMap[value])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
