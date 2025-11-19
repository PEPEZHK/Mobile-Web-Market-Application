import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTranslation } from "@/hooks/useTranslation";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{title ?? t("layout.defaultTitle")}</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">{t("app.tagline")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
