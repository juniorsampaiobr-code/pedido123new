import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import CartProvider from "./hooks/use-cart";
import { TooltipProvider } from "./components/ui/tooltip";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { Wrapper, Status } from "@googlemaps/react-wrapper";

// Importando Wrapper
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
const Menu = lazy(() => import("./pages/Menu"));

const queryClient = new QueryClient();

// Função de renderização do status para o Wrapper
const renderMapStatus = (status: Status) => {
  if (status === Status.LOADING) return <LoadingSpinner />;
  if (status === Status.FAILURE) {
    console.error("Falha ao carregar o Google Maps SDK.");
    return <div className="flex h-screen items-center justify-center text-destructive">Erro ao carregar o serviço de mapas.</div>;
  }
  return null;
};

// Chave de API do Google Maps (lida do .env via Vite)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Componente que agrupa as rotas que precisam do Google Maps SDK
const ClientRoutesWithMaps = () => (
  <Wrapper apiKey={GOOGLE_MAPS_API_KEY} render={renderMapStatus} libraries={["places"]}>
    <Routes>
      <Route path="/menu/:restaurantId" element={<Menu />} />
      <Route path="/pre-checkout" element={<PreCheckout />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/order-success/:orderId" element={<OrderSuccess />} />
      <Route path="/payment-redirect/:orderId" element={<PaymentRedirect />} />
      {/* Rotas do Painel de Administração (que também usam mapas) */}
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
  </Wrapper>
);

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CartProvider>
            <HashRouter>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  {/* Rotas Públicas que NÃO precisam do SDK do Google Maps */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin-auth" element={<AdminAuth />} />
                  <Route path="/password-recovery" element={<PasswordRecovery />} />
                  {/* Rotas que dependem do SDK do Google Maps (Menu, Checkout, Admin) */}
                  <Route path="/*" element={<ClientRoutesWithMaps />} />
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