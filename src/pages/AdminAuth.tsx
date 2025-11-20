import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { Loader2, Lock, UserPlus } from "lucide-react";
import { Enums } from "@/integrations/supabase/types";
import { PhoneInput } from "@/components/PhoneInput";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/LoadingSpinner"; // Importando LoadingSpinner

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

const checkUserRoleAndRestaurant = async (userId: string): Promise<{ role: Enums<'app_role'> | null, restaurantId: string | null }> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, restaurant_id')
    .eq('user_id', userId)
    .in('role', ['admin', 'moderator'])
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error checking role and restaurant:", error);
    return { role: null, restaurantId: null };
  }
  
  if (!data) {
      return { role: null, restaurantId: null };
  }
  
  return { role: data.role, restaurantId: data.restaurant_id };
};

// Novo: Função para configurar a loja inicial e promover o usuário a admin, se for o primeiro
const setupNewStoreAndRole = async (user: User): Promise<{ role: Enums<'app_role'> | null, restaurantId: string | null }> => {
  // 1. Check current role and restaurant link
  let { role, restaurantId } = await checkUserRoleAndRestaurant(user.id);

  // 2. If user is not admin/moderator OR is admin/moderator but missing restaurantId, run setup
  if (role !== 'admin' && role !== 'moderator' || !restaurantId) {
    console.log(`[AdminAuth] Running setup for user ${user.id}. Current role: ${role}, Restaurant ID: ${restaurantId}`);
    
    const fullName = user.user_metadata.full_name || 'Novo Usuário';
    
    const { error: setupError } = await supabase.functions.invoke('ensure-admin-access', {
      body: { userId: user.id, fullName: fullName },
    });
    
    if (setupError) {
      console.error("Error setting up admin access:", setupError);
      throw new Error("Falha ao configurar acesso de administrador.");
    }
    
    // Se a Edge Function rodou com sucesso, refetch a role e o restaurantId
    const updatedData = await checkUserRoleAndRestaurant(user.id);
    role = updatedData.role;
    restaurantId = updatedData.restaurantId;
  }
  
  return { role, restaurantId };
};


const AdminAuth = () => {
  const navigate = useNavigate();
  const [isAuthLoading, setIsAuthLoading] = useState(true); // Novo estado para carregamento de autenticação/permissão
  const [isFormLoading, setIsFormLoading] = useState(false); // Estado para submissão do formulário
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const handleRedirect = async (user: User) => {
    setIsAuthLoading(true);
    try {
      // 1. Tenta configurar a loja e obter a role atualizada
      const { role, restaurantId } = await setupNewStoreAndRole(user);
      
      if (role === 'admin' || role === 'moderator') {
        if (restaurantId) {
            toast.success("Acesso ao painel concedido.");
            navigate("/dashboard", { replace: true });
        } else {
            // Se a role é admin, mas o restaurantId ainda está faltando (erro na Edge Function)
            throw new Error("Sua conta de administrador não está vinculada a um restaurante. Tente novamente ou contate o suporte.");
        }
      } else {
        // Se a role não for admin/moderator após o setup
        toast.error("Acesso negado.", {
          description: "Esta conta não possui permissão de administrador/moderador. Redirecionando para o menu.",
          duration: 5000,
        });
        // Desloga o usuário para evitar confusão
        await supabase.auth.signOut();
        // Redireciona para o menu público
        const menuUrl = `${window.location.origin}${window.location.pathname}#/menu`;
        window.location.href = menuUrl;
      }
    } catch (error) {
      console.error("Error during admin setup/redirect:", error);
      toast.error("Erro crítico de autenticação.", {
          description: error instanceof Error ? error.message : "Ocorreu um erro desconhecido. Tente novamente.",
          duration: 8000,
      });
      await supabase.auth.signOut();
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user) {
        // Se houver sessão, inicia o processo de verificação de permissões
        handleRedirect(session.user);
      } else {
        // Nenhuma sessão, mostra o formulário
        setIsAuthLoading(false);
      }
    };
    
    checkSession();
    
    // Monitora mudanças de estado
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === 'SIGNED_IN' && session?.user) {
          // Quando o login/signup é concluído, o handleRedirect é chamado
          handleRedirect(session.user);
        } else if (event === 'SIGNED_OUT') {
          setIsAuthLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);
  
  const validateForm = () => {
    if (isSignUp) {
      if (!fullName.trim()) {
        toast.error("O Nome Completo é obrigatório.");
        return false;
      }
      const cleanedPhone = cleanPhoneNumber(phone);
      if (cleanedPhone.length !== 11) {
        toast.error("O Telefone deve conter 11 dígitos (DDD + 9 dígitos).");
        return false;
      }
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
    if (!validateForm()) return;
    
    setIsFormLoading(true);

    try {
      if (isSignUp) {
        const cleanedPhone = cleanPhoneNumber(phone);
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: cleanedPhone,
            },
          }
        });
        
        if (error) throw error;
        
        if (data.session) {
          // O onAuthStateChange/handleRedirect será chamado automaticamente
          toast.success("Conta de administrador criada e login efetuado!");
        } else {
          toast.success("Conta criada! Verifique seu email para confirmar.");
          setIsFormLoading(false); // Se precisar de confirmação, não fica em loading de auth
        }
        
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast.success("Login realizado com sucesso!");
        // O onAuthStateChange/handleRedirect será chamado automaticamente
      }
    } catch (error: any) {
      if (error.message.includes("Email not confirmed")) {
        toast.error("Por favor, verifique seu e-mail para confirmar sua conta.");
      } else {
        toast.error(error.message || "Erro ao processar autenticação");
      }
      setIsFormLoading(false);
    }
  };

  if (isAuthLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo className="justify-center mb-4" />
        </div>

        <Card className="shadow-xl border-2">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
              {isSignUp ? <UserPlus className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-destructive" />}
              {isSignUp ? "Cadastre sua Loja" : "Acesso do Restaurante"}
            </CardTitle>
            <CardDescription className="text-center">
              {isSignUp ? "Crie sua conta de administrador para gerenciar sua loja." : "Utilize seu email e senha de administrador para acessar o painel."}
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
                disabled={isFormLoading}
              >
                {isFormLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isSignUp ? "Criar Conta Admin" : "Entrar no Painel"}
              </Button>
            </form>
            
            <div className="text-center">
              <Button
                variant="link"
                type="button"
                className="p-0 h-auto"
                onClick={() => setIsSignUp(!isSignUp)}
              >
                {isSignUp ? "Já tem uma conta? Faça login" : "Não tem uma conta? Cadastre-se agora"}
              </Button>
            </div>

            <Separator className="my-4" />
            
            <div className="text-center text-sm text-muted-foreground">
              É um cliente? <Link to="/auth" className="text-primary hover:underline">Acesse como Cliente</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminAuth;