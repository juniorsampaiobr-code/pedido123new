// ... (código existente, apenas pequenas alterações para garantir compatibilidade) ...

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

// ... (restante do código existente) ...