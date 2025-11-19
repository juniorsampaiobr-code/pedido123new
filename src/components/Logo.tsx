import { Package } from "lucide-react";

export const Logo = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="bg-primary rounded-lg p-2">
        <Package className="w-6 h-6 text-primary-foreground" />
      </div>
      <span className="text-xl font-bold text-foreground">Pedido 123</span>
    </div>
  );
};
