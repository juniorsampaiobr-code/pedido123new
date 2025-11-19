import { lazy, Suspense, useMemo } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "./hooks/use-cart";
import { LoadingSpinner } from './components/LoadingSpinner';

// Lazy load all page components
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AdminAuth = lazy(() => import("./pages/AdminAuth")); // Novo import
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Menu = lazy(() => import("./pages/Menu"));
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 10, // 10 minutos (cacheTime was renamed to gcTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  const queryClientMemo = useMemo(() => queryClient, []);

  // Configuração para garantir que os dados do restaurante no checkout sejam sempre frescos
  queryClientMemo.setQueryDefaults(['checkoutRestaurantData'], {
    staleTime: 0, // Torna os dados obsoletos imediatamente
    refetchOnMount: true, // Força o refetch ao montar o componente
  });

  // Log de erros não capturados para facilitar debug em produção
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      console.error('Erro não capturado:', event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Promise rejeitada não tratada:', event.reason);
    });
  }

  return (
    <QueryClientProvider client={queryClientMemo}>
      <TooltipProvider>
        <Toaster />
        <Sonner 
          position="bottom-center" 
          toastOptions={{
            style: {
              marginBottom: '100px', // Adiciona 100px de margem inferior (aproximadamente 10cm)
            }
          }}
        />
        {/* Adicionando div wrapper para contenção de layout */}
        <div className="min-h-screen w-full overflow-x-hidden">
          <ErrorBoundary>
            <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <CartProvider>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin-auth" element={<AdminAuth />} /> {/* NOVA ROTA DE ADMIN */}
                  <Route path="/menu" element={<Menu />} />
                  <Route path="/pre-checkout" element={<PreCheckout />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/payment/:orderId" element={<PaymentRedirect />} />
                  <Route path="/order-success/:orderId" element={<OrderSuccess />} />

                  {/* Dashboard Routes (Protected Layout) */}
                  <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/hours" element={<Hours />} />
                    <Route path="/cashier" element={<Cashier />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/delivery" element={<Delivery />} />
                  </Route>

                  {/* Catch-all Route */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </CartProvider>
          </HashRouter>
        </ErrorBoundary>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;