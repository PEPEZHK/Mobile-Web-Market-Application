import { NavLink } from "@/components/NavLink";
import { Package, ShoppingCart, Users, History, Settings, ClipboardList } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

export function BottomNav() {
  const { t } = useTranslation();
  const navItems = [
    { to: "/", icon: Package, labelKey: "nav.depot" },
    { to: "/sales", icon: ShoppingCart, labelKey: "nav.sales" },
    { to: "/customers", icon: Users, labelKey: "nav.customers" },
    { to: "/shopping-list", icon: ClipboardList, labelKey: "nav.shopping" },
    { to: "/history", icon: History, labelKey: "nav.history" },
    { to: "/settings", icon: Settings, labelKey: "nav.settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground hover:text-foreground transition-colors"
            activeClassName="text-primary font-medium"
          >
            <item.icon className="h-5 w-5 mb-1" />
            <span className="text-xs">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
