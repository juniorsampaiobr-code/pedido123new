import { Link, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Package,
  ShoppingCart,
  Wallet,
  Clock,
  CreditCard,
  Settings,
  Truck,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/products", label: "Produtos", icon: Package },
  { href: "/orders", label: "Pedidos", icon: ShoppingCart },
  { href: "/cashier", label: "Caixa", icon: Wallet },
  { href: "/hours", label: "Horários", icon: Clock },
  { href: "/payments", label: "Pagamentos", icon: CreditCard },
  { href: "/delivery", label: "Taxa de Entrega", icon: Truck },
  { href: "/settings", label: "Configurações", icon: Settings },
];

export const Sidebar = () => {
  const location = useLocation();

  return (
    <aside className="w-64 flex-shrink-0 border-r bg-card h-screen sticky top-0 flex-col flex">
      <div className="p-4 border-b">
        <Logo />
      </div>
      <nav className="flex-grow p-4">
        <ul>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname === item.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};