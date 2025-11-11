import { NavLink } from "@/components/NavLink";
import { Package, ShoppingCart, Users, History, Settings } from "lucide-react";

export function BottomNav() {
  const navItems = [
    { to: "/", icon: Package, label: "Depot" },
    { to: "/sales", icon: ShoppingCart, label: "Sales" },
    { to: "/customers", icon: Users, label: "Customers" },
    { to: "/history", icon: History, label: "History" },
    { to: "/settings", icon: Settings, label: "Settings" },
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
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
