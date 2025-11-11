import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background pb-20">
      {title && (
        <header className="sticky top-0 bg-primary text-primary-foreground shadow-md z-40">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold">{title}</h1>
          </div>
        </header>
      )}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
