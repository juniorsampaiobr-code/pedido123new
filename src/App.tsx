import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Menu from "./pages/Menu";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import Settings from "./pages/Settings";
import Hours from "./pages/Hours";
import Cashier from "./pages/Cashier";
import Payments from "./pages/Payments";
import Delivery from "./pages/Delivery";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess"; // Importando OrderSuccess
import NotFound from "./pages/NotFound";
import { CartProvider } from "./hooks/use-cart";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <CartProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/products" element={<Products />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/hours" element={<Hours />} />
            <Route path="/cashier" element={<Cashier />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/delivery" element={<Delivery />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-success/:orderId" element={<OrderSuccess />} /> {/* Nova Rota de Sucesso */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </CartProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;