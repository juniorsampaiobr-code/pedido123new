import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import CartProvider from "./hooks/use-cart";
import { TooltipProvider } from "./components/ui/tooltip";
import { LoadingSpinner } from "./components/LoadingSpinner";
// import Menu from "./pages/Menu"; // Importação direta REMOVIDA

// Lazy load all page components
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AdminAuth = lazy(() => import("./pages/AdminAuth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Orders = lazy(() => import("./pages/Orders"));
const Settings = lazy(() => import("./pages/Settings"));
const Hours = lazy(() => import("./pages/Hours"));
const Cashier = lazy(() => import("./pages/Cashier"));
const Payments = lazy(() => import("./pages/Payments"));
const Delivery = lazy(() => import("./pages/Delivery"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const PaymentRedirect = lazy(() => import("./pages/PaymentRedirect"));
const PreCheckout = lazy(() => import("./pages/PreCheckout"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const PasswordRecovery = lazy(() => import("./pages/PasswordRecovery"));
const Menu = lazy(() => import("./pages/Menu")); // ADICIONADO à lista de lazy load

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CartProvider>
            <HashRouter>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  {/* Rotas Públicas */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin-auth" element={<AdminAuth />} />
                  {/* NOVO: Rota para recuperação de senha */}
                  <Route path="/password-recovery" element={<PasswordRecovery />} /> 
                  {/* Rota do Menu agora requer o ID do restaurante */}
                  <Route path="/menu/:restaurantId" element={<Menu />} />
                  <Route path="/pre-checkout" element={<PreCheckout />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/order-success/:orderId" element={<OrderSuccess />} />
                  <Route path="/payment-redirect/:orderId" element={<PaymentRedirect />} />

                  {/* Rotas do Painel de Administração */}
                  <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/cashier" element={<Cashier />} />
                    <Route path="/hours" element={<Hours />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/delivery" element={<Delivery />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>

                  {/* Rota 404 */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </HashRouter>
          </CartProvider>
        </TooltipProvider>
        <Toaster richColors />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;