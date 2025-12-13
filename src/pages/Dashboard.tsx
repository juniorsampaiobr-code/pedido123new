import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ShoppingCart,
  Package,
  LineChart,
  Users,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOutletContext } from 'react-router-dom';
import { DashboardContextType } from '@/layouts/DashboardLayout';
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";

const DashboardStatCard = ({ icon: Icon, title, value, description, isLoading }: { icon: React.ElementType, title: string, value: string, description: string, isLoading: boolean }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-7 w-3/4" />
      ) : (
        <div className="text-2xl font-bold">{value}</div>
      )}
      <p className="text-xs text-muted-foreground">{description}</p>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { restaurant } = useOutletContext<DashboardContextType>();
  // Gerando o link com o ID do restaurante
  const menuLink = `${window.location.origin}${window.location.pathname}#/menu/${restaurant.id}`;

  const { data: stats, isLoading: isLoadingStats } = useDashboardStats(restaurant.id);

  const copyLink = () => {
    navigator.clipboard.writeText(menuLink);
    toast.success("Link copiado para a área de transferência!");
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-8">
      <div className="mb-4">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Bem-vindo ao painel de controle do Pedido 123</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          title="Pedidos Hoje"
          value={isLoadingStats ? '' : String(stats.ordersTodayCount)}
          description={isLoadingStats ? 'Carregando...' : stats.ordersTodayCount === 0 ? "Nenhum pedido hoje" : `${stats.ordersTodayCount} pedidos`}
          icon={ShoppingCart}
          isLoading={isLoadingStats}
        />
        <DashboardStatCard
          title="Produtos"
          value={isLoadingStats ? '' : String(stats.productsCount)}
          description={isLoadingStats ? 'Carregando...' : `Total de produtos`}
          icon={Package}
          isLoading={isLoadingStats}
        />
        <DashboardStatCard
          title="Vendas do Mês"
          value={isLoadingStats ? '' : formatCurrency(stats.salesMonthTotal)}
          description={isLoadingStats ? 'Carregando...' : "Receita mensal"}
          icon={LineChart}
          isLoading={isLoadingStats}
        />
        <DashboardStatCard
          title="Clientes"
          value={isLoadingStats ? '' : String(stats.customersCount)}
          description={isLoadingStats ? 'Carregando...' : `Total de clientes`}
          icon={Users}
          isLoading={isLoadingStats}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Primeiros Passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">1</div>
              <div>
                <h3 className="font-semibold">Configure sua loja</h3>
                <p className="text-sm text-muted-foreground">Adicione informações sobre seu restaurante ou estabelecimento</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">2</div>
              <div>
                <h3 className="font-semibold">Cadastre seus produtos</h3>
                <p className="text-sm text-muted-foreground">Crie categorias e adicione os produtos do seu cardápio</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">3</div>
              <div>
                <h3 className="semibold">Compartilhe seu link</h3>
                <p className="text-sm text-muted-foreground">Envie o link da sua loja para seus clientes começarem a fazer pedidos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compartilhe seu Link</CardTitle>
            <p className="text-sm text-muted-foreground pt-1">Envie este link para seus clientes fazerem pedidos</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm text-muted-foreground overflow-x-auto whitespace-nowrap">
                {menuLink}
              </div>
              <Button variant="outline" size="icon" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <a href={menuLink} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="icon">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Este é o link exclusivo do seu restaurante: <span className="font-semibold">{restaurant.name}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Dashboard;