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
import { Loader2, Lock, UserPlus, Mail, ArrowLeft } from "lucide-react";
import { Enums } from "@/integrations/supabase/types";
import { PhoneInput } from "@/components/PhoneInput";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { CpfCnpjInput } from "@/components/CpfCnpjInput";

const cleanPhoneNumber = (phone: string) => phone.replace(/\D/g, '');
const cleanCpfCnpj = (doc: string) => doc.replace(/\D/g, '');

const checkUserRoleAndRestaurant = async (userId: string): Promise<{ role: Enums<'app_role'> | null, restaurantId: string | null }> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, restaurant_id')
    .eq('user_id', userId)
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

const setupNewStoreAndRole = async (user: User): Promise<{ role: Enums<'app_role'> | null, restaurantId: string | null }> => {
  let { role, restaurantId } = await checkUserRoleAndRestaurant(user.id);

  if ((role === 'admin' || role === 'moderator') && restaurantId) {
      return { role, restaurantId };
  }

  console.log(`[AdminAuth] Running setup for user ${user.id}. Current role: ${role}, Restaurant ID: ${restaurantId}`);
  
  const fullName = user.user_metadata.full_name || 'Novo Usuário';
  const storeName = user.user_metadata.store_name || fullName;
  const cpfCnpj = user.user_metadata.cpf_cnpj || null;
  const phone = user.user_metadata.phone || null;
  
  const { error: setupError, data: setupData } = await supabase.functions.invoke('ensure-admin-access', {
    body: { 
      userId: user.id, 
      fullName: fullName,
      storeName: storeName,
      cpfCnpj: cpfCnpj,
      phone: phone,
    },
  });
  
  if (setupError) {
    console.error("Error setting up admin access:", setupError);
    
    let errorMessage = "Falha ao configurar acesso de administrador.";
    if (setupData && typeof setupData === 'object' && 'error' in setupData) {
        errorMessage = setupData.error as string;
    } else if (setupError.message.includes("non-2xx status code")) {
        errorMessage = `Erro interno do servidor (500). Verifique os logs do Supabase.`;
    } else {
        errorMessage = setupError.message;
    }
    
    throw new Error(errorMessage);
  }
  
  const updatedData = await checkUserRoleAndRestaurant(user.id);
  role = updatedData.role;
  restaurantId = updatedData.restaurantId;
  
  return { role, restaurantId };
};


const AdminAuth = () => {
  const navigate = useNavigate();
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isFormLoading, setIsFormLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // Novo estado
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const handleRedirect = async (user: User) => {
    setIsAuthLoading(true);
    try {
      const { role, restaurantId } = await setupNewStoreAndRole(user);
      
      if (role === 'admin' || role === 'moderator') {
        if (restaurantId) {
            toast.success("Acesso ao painel concedido.");
            navigate("/dashboard", { replace: true });
        } else {
            throw new Error("Sua conta de administrador não está vinculada a um restaurante. Tente novamente ou contate o suporte.");
        }
      } else {
        toast.error("Acesso negado.", {
          description: "Esta conta não possui permissão de administrador/moderador. Redirecionando para o menu.",
          duration: 5000,
        });
        await supabase.auth.signOut();
        navigate("/", { replace: true });
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
        handleRedirect(session.user);
      } else {
        setIsAuthLoading(false);
      }
    };
    
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (event === 'SIGNED_IN' && session?.user) {
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
      if (!storeName.trim()) {
        toast.error("O Nome da Loja é obrigatório.");
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
    }
    if (!email.trim()) {
      toast.error("O Email é obrigatório.");
      return false;
    }
    if (password.length < 6) {
      toast.error("A Senha deve ter pelo menos 6 caracteres.");
      return false;
    }

    // Nova validação de confirmação de senha
    if (isSignUp && password !== confirmPassword) {
      toast.error("As senhas não coincidem. Por favor, digite novamente.");
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
        const cleanedCpfCnpj = cleanCpfCnpj(cpfCnpj);
        
        const { data: checkData, error: checkError } = await supabase.rpc('check_registration_data', {
          phone_in: cleanedPhone,
          cpf_cnpj_in: cleanedCpfCnpj
        });

        if (checkError) {
          console.error("Erro ao verificar dados:", checkError);
        } else if (checkData) {
          const { phone_exists, cpf_exists } = checkData as { phone_exists: boolean, cpf_exists: boolean };
          
          if (phone_exists) {
            toast.error("Este telefone já está cadastrado em outra conta.");
            setIsFormLoading(false);
            return;
          }
          
          if (cpf_exists) {
            toast.error("Este CPF/CNPJ já está cadastrado em outra conta.");
            setIsFormLoading(false);
            return;
          }
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone: cleanedPhone,
              store_name: storeName,
              cpf_cnpj: cleanedCpfCnpj,
            },
          }
        });
        
        if (error) {
          if (error.message.includes("User already registered")) {
            toast.warning("Usuário já cadastrado com este email. Tentando fazer login...");
            
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            
            if (signInError) throw signInError;
            
            toast.success("Login realizado com sucesso!");
            return;
          }
          
          throw error;
        }
        
        if (data.session) {
          toast.success("Conta de administrador criada e login efetuado!");
        } else {
          toast.success("Conta criada! Verifique seu email para confirmar.");
          setIsFormLoading(false);
        }
        
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast.success("Login realizado com sucesso!");
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
  
  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("O Email é obrigatório para recuperação de senha.");
      return;
    }
    
    setIsFormLoading(true);
    try {
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
      setIsForgotPassword(false);
      
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar email de recuperação.");
    } finally {
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
              {isForgotPassword ? <Mail className="h-6 w-6 text-primary" /> : isSignUp ? <UserPlus className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-destructive" />}
              {isForgotPassword ? "Recuperar Senha" : isSignUp ? "Cadastre sua Loja" : "Acesso do Restaurante"}
            </CardTitle>
            <CardDescription className="text-center">
              {isForgotPassword ? "Digite seu email para receber o link de redefinição." : isSignUp ? "Crie sua conta de administrador para gerenciar sua loja." : "Utilize seu email e senha de administrador para acessar o painel."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            {isForgotPassword ? (
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
                  disabled={isFormLoading}
                >
                  {isFormLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
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
                      <Label htmlFor="storeName">Nome da Loja *</Label>
                      <Input
                        id="storeName"
                        type="text"
                        placeholder="Nome do seu restaurante"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
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

                {/* Campo de confirmação de senha apenas para cadastro */}
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Senha *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="h-12"
                    />
                  </div>
                )}
                
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
                  disabled={isFormLoading}
                >
                  {isFormLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : isSignUp ? "Criar Conta Admin" : "Entrar no Painel"}
                </Button>
              </form>
            )}
            
            <div className="text-center">
              <Button
                variant="link"
                type="button"
                className="p-0 h-auto"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setConfirmPassword(""); // Limpa o campo ao trocar
                }}
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