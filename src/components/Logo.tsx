import { cn } from "@/lib/utils";
import { ShoppingCart } from "lucide-react";

interface LogoProps {
  className?: string;
}

export const Logo = ({ className }: LogoProps) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ShoppingCart className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold text-foreground">Pedido 123</span>
    </div>
  );
};