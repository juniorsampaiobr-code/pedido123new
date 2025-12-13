import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";
import { PhoneInput } from "@/components/PhoneInput";
import { Loader2, Lock, Mail, ArrowLeft } from "lucide-react";
import { useActiveRestaurantId } from "@/hooks/use-active-restaurant-id";
import { CpfCnpjInput } from "@/components/CpfCnpjInput";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useQueryClient } from "@tanstack/react-query";
import { Controller } from "react-hook-form";

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const { data: activeRestaurantId, isLoading: isLoadingRestaurantId } = useActiveRestaurantId();
  const restaurantIdFromState = location.state?.restaurantId as string | undefined;

  const handleRedirect = (user: User, restaurantId: string | undefined) => {
    const from = location.state?.from;
    const finalRestaurantId = restaurantId || activeRestaurantId;
    
    if (from === '/checkout') {
      console.log("User logged in, redirecting to checkout.");
      // Se veio do checkout, redireciona para /checkout, garantindo que o restaurantId seja passado no state
      navigate('/checkout', { 
        replace: true, 
        state: { restaurantId: restaurantIdFromState } // Usa o ID que veio do PreCheckout
      });
    } else if (finalRestaurantId) {
      // Se não veio do checkout, mas temos um ID de restaurante (do estado ou ativo), vai para o menu
      console.log("User logged in, redirecting to specific menu:", finalRestaurantId);
      navigate(`/menu/${finalRestaurantId}`, { replace: true });
    } else {
      // Último recurso: se não há restaurante ativo, volta para a Index
      console.log("User logged in, no active restaurant found, redirecting to index.");
      navigate('/', { replace: true });
    }
  };

  useEffect(() => {
    if (isLoadingRestaurantId) return;
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Se o evento for SIGNED_IN, a query já foi invalidada no handleEmailAuth
          // Se for INITIAL_SESSION ou outro evento, faz o redirect
          handleRedirect(session.user, restaurantIdFromState);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        handleRedirect(session.user, restaurantIdFromState);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, location.state, isLoadingRestaurantId, activeRestaurantId, restaurantIdFromState]);

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
    
    const cleanedCpfCnpj = cleanCpfCnpj(cpfCnpj);
    if (cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14) {
      toast.error("O CPF deve ter 11 dígitos ou CNPJ 14 dígitos.");
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
    
    if (location.state?.from === '/checkout' && !restaurantIdFromState) {
      toast.error("Erro: ID do restaurante de origem não encontrado.");
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        if (!validateSignUp()) {
          setIsLoading(false);
          return;
        }
        
        const cleanedPhone = cleanPhoneNumber(phone);
        const cleanedCpfCnpj = cleanCpfCnpj(cpfCnpj);
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: cleanedPhone,
              // Salvamos o CPF/CNPJ no user_metadata para ser usado no checkout
              cpf_cnpj: cleanedCpfCnpj,
            },
          }
        });
        
        if (error) throw error;
        
        if (data.session) {
          toast.success("Conta criada e login efetuado com sucesso!");
          // NOVO: Invalida a query de status de autenticação
          queryClient.invalidateQueries({ queryKey: ['authStatus'] });
        } else {
          toast.success("Conta criada! Verifique seu email para confirmar.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast.success("Login realizado com sucesso!");
        // NOVO: Invalida a query de status de autenticação
        queryClient.invalidateQueries({ queryKey: ['authStatus'] });
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

  // NOVO: Função para recuperação de senha
  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("O Email é obrigatório para recuperação de senha.");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // CORREÇÃO: Redireciona para a página de recuperação de senha
      const baseUrl = window.location.origin + window.location.pathname;
      const redirectToUrl = `${baseUrl}#/password-recovery`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectToUrl,
      });
      
      if (error) throw error;
      
      toast.success("Email de recuperação enviado!", {
        description: "Verifique sua caixa de entrada (e spam) para o link de redefinição de senha.",
        duration: 8000,
      });
      
      setIsForgotPassword(false); // Volta para a tela de login
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de recuperação.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingRestaurantId) {
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
            <CardTitle className="text-2xl font-bold text-center">
              {isForgotPassword ? "Recuperar Senha" : isSignUp ? "Crie sua conta" : "Acesse sua conta"}
            </CardTitle>
            <CardDescription className="text-center">
              {isForgotPassword ? "Digite seu email para receber o link de redefinição." : isSignUp ? "Preencha os campos para começar" : "Utilize seu email e senha para fazer login"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {isForgotPassword ? (
              // Formulário de Recuperação de Senha
              <form onSubmit={handlePasswordRecovery} className="space-y-4">
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
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                  Enviar Link de Recuperação
                </Button>
                <div className="text-center">
                  <Button
                    variant="link"
                    type="button"
                    className="p-0 h-auto"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setEmail('');
                    }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para o Login
                  </Button>
                </div>
              </form>
            ) : (
              // Formulário de Login/Cadastro
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
                    <div className="space-y-2">
                      <Label htmlFor="cpfCnpj">CPF/CNPJ *</Label>
                      <CpfCnpjInput
                        id="cpfCnpj"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(e.target.value)}
                        required
                        className="h-12"
                      />
                      <p className="text-xs text-muted-foreground">CPF (11 dígitos) ou CNPJ (14 dígitos).</p>
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
                
                {!isSignUp && (
                  <div className="text-right">
                    <Button
                      variant="link"
                      type="button"
                      className="p-0 h-auto text-sm text-muted-foreground hover:text-primary"
                      onClick={() => setIsForgotPassword(true)}
                    >
                      Esqueci minha senha
                    </Button>
                  </div>
                )}
                
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading || isLoadingRestaurantId}
                >
                  {isLoading || isLoadingRestaurantId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isSignUp ? "Criar conta" : "Entrar"}
                </Button>
                
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;