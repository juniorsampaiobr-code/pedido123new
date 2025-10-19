import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { FeatureCard } from "@/components/FeatureCard";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QrCode, Bike, Link2, Printer } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <Logo />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 md:py-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start max-w-6xl mx-auto">
          {/* Left Column - Auth Card */}
          <div className="order-2 lg:order-1">
            <Card className="shadow-xl border-2 animate-fade-in">
              <CardContent className="p-8">
                <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
                  Entrar no Pedido 123
                </h1>
                <p className="text-muted-foreground mb-6">
                  Utilize uma das opções abaixo para criar sua conta ou fazer login
                </p>
                <Link to="/auth">
                  <Button size="lg" className="w-full mb-6">
                    Criar conta ou fazer login
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Features */}
          <div className="order-1 lg:order-2 space-y-8">
            <div className="space-y-6">
              <FeatureCard
                icon={QrCode}
                title="QR Code"
                description="Tenha seu cardápio na mesa ou em panfletos para acesso rápido dos seus clientes"
              />
              <FeatureCard
                icon={Bike}
                title="Delivery"
                description="Sem limite de pedidos e taxas de entrega por distância e bairro"
              />
              <FeatureCard
                icon={Link2}
                title="Link da loja"
                description="Seu cliente acessa seu link e faz o pedido sem complicações de cadastro ou instalação de apps"
              />
              <FeatureCard
                icon={Printer}
                title="Impressão"
                description="Impressão automática dos seus pedidos para agilizar ainda mais sua operação"
              />
            </div>

            {/* Stats Section */}
            <Card className="bg-gradient-secondary shadow-lg border-2">
              <CardContent className="p-8">
                <div className="grid grid-cols-3 gap-4">
                  <StatCard value="+30 mil" label="cardápios criados" delay={100} />
                  <StatCard value="+18 milhões" label="em pedidos" delay={200} />
                  <StatCard value="+260 mil" label="pessoas por mês" delay={300} />
                </div>
              </CardContent>
            </Card>

            {/* Bottom CTA */}
            <div className="text-center animate-fade-in" style={{ animationDelay: '400ms' }}>
              <Link to="/auth">
                <Button size="lg" className="w-full">
                  Entrar no Pedido 123
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
