import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { PhoneInput } from "@/components/PhoneInput"; // Importando PhoneInput
import { Loader2 } from "lucide-react";

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Para obter parâmetros de redirecionamento
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // Função para obter a URL base correta do menu
  const getMenuUrl = () => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const firstPathSegment = pathname.split('/')[1];
    
    if (firstPathSegment) {
        return `${origin}/${firstPathSegment}/#/menu`;
    }
    return `${origin}/#/menu`;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Redireciona para o menu após o login/cadastro
          const menuUrl = getMenuUrl();
          console.log("Redirecting customer to menu:", menuUrl);
          window.location.href = menuUrl; // Usar window.location.href para garantir navegação externa
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Redireciona para o menu se já estiver logado
        const menuUrl = getMenuUrl();
        console.log("User already logged in, redirecting to menu:", menuUrl);
        window.location.href = menuUrl;
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateSignUp = () => {
    if (!fullName.trim()) {
      toast.error("O Nome Completo é obrigatório.");
      return false;
    }
    const cleanedPhone = cleanPhoneNumber(phone);
    if (cleanedPhone.length !== 11) {
      toast.error("O Telefone deve conter 11 dígitos (DDD + 9 dígitos).");
      return false;
    }
    if (!email.trim()) {
      toast.error("O Email é obrigatório.");
      return false;
    }
    if (password.length < 6) {
      toast.error("A Senha deve ter pelo menos 6 caracteres.");
      return false;
    }
    return true;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!validateSignUp()) {
          setIsLoading(false);
          return;
        }
        
        const cleanedPhone = cleanPhoneNumber(phone);

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: cleanedPhone, // Enviando o número limpo para o Supabase
            },
          }
        });
        
        if (error) throw error;

        // Se a confirmação de email estiver desativada, o usuário já estará logado.
        // O onAuthStateChange cuidará do redirecionamento para /menu.
        if (data.session) {
          toast.success("Conta criada e login efetuado com sucesso!");
        } else {
          // Fallback caso a confirmação ainda esteja ativa por algum motivo
          toast.success("Conta criada! Verifique seu email para confirmar.");
        }

      } else {
        // Login validation (Email and Password are handled by required attribute on Input)
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast.success("Login realizado com sucesso!");
        // O onAuthStateChange cuidará do redirecionamento para /menu.
      }
    } catch (error: any) {
      if (error.message.includes("Email not confirmed")) {
        toast.error("Por favor, verifique seu e-mail para confirmar sua conta antes de fazer login.");
      } else {
        toast.error(error.message || "Erro ao processar autenticação");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo className="justify-center mb-4" />
        </div>

        <Card className="shadow-xl border-2">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              {isSignUp ? "Crie sua conta" : "Acesse sua conta"}
            </CardTitle>
            <CardDescription className="text-center">
              {isSignUp ? "Preencha os campos para começar" : "Utilize seu email e senha para fazer login"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo *</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <PhoneInput
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="h-12"
                    />
                    <p className="text-xs text-muted-foreground">Formato: (99) 99999-9999</p>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isSignUp ? "Criar conta" : "Entrar"}
              </Button>
            </form>

            <div className="text-center">
              <Button
                variant="link"
                type="button"
                className="p-0 h-auto"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Já tem uma conta? Faça login" : "Não tem uma conta? Crie uma agora"}
              </Button>
            </div>
            
            {/* Removendo a seção do link de administração */}
            {/*
            <Separator className="my-4" />
            
            <div className="text-center text-sm text-muted-foreground">
              É o dono de uma loja? <a href="/#/admin-auth" className="text-primary hover:underline">Acesse o painel de administração</a>
            </div>
            */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;