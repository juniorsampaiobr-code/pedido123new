import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lock, CheckCircle, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/Logo';

// Função auxiliar para extrair parâmetros de uma string de hash (ex: #access_token=...&type=...)
const extractTokensFromHash = (hash: string) => {
  // Remove o primeiro '#' e divide a string em partes
  const parts = hash.substring(1).split('#');
  
  // A parte que contém os tokens é geralmente a segunda parte (após o segundo #)
  const tokenString = parts.length > 1 ? parts[1] : parts[0];
  
  const params = new URLSearchParams(tokenString);
  
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    type: params.get('type'),
  };
};

const PasswordRecovery = () => {
  const navigate = useNavigate();
  // Não usaremos useSearchParams diretamente, mas manteremos a importação por convenção
  const [isProcessing, setIsProcessing] = useState(true);
  const [isSessionSet, setIsSessionSet] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // 1. Tenta capturar os tokens da URL e definir a sessão
  useEffect(() => {
    const { accessToken, refreshToken, type } = extractTokensFromHash(window.location.hash);

    if (accessToken && refreshToken && type === 'recovery') {
      const setSession = async () => {
        try {
          // Define a sessão usando os tokens da URL
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;

          setIsSessionSet(true);
          toast.success("Sessão de recuperação ativada. Defina sua nova senha.");
          
          // Limpa os parâmetros da URL (remove o segundo hash e os tokens)
          // Redireciona para a rota limpa: /#/password-recovery
          navigate('/password-recovery', { replace: true }); 

        } catch (error: any) {
          console.error("Erro ao definir sessão:", error);
          toast.error("Link de recuperação inválido ou expirado.");
          navigate('/admin-auth', { replace: true });
        } finally {
          setIsProcessing(false);
        }
      };
      setSession();
    } else {
      // Se não houver tokens na URL, verifica se o usuário já está logado
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setIsSessionSet(true);
          toast.info("Você já está logado. Defina sua nova senha abaixo.");
        }
        setIsProcessing(false);
      });
    }
  }, [navigate]);

  // 2. Lógica de atualização de senha
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      toast.success("Senha redefinida com sucesso! Redirecionando para o login.");
      
      // Força o logout para que o usuário use a nova senha
      await supabase.auth.signOut(); 
      
      navigate('/admin-auth', { replace: true });
    } catch (error: any) {
      toast.error(error.message || "Erro ao redefinir a senha.");
      setIsUpdatingPassword(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Verificando link de recuperação...</p>
      </div>
    );
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
              <Lock className="h-6 w-6 text-primary" />
              Redefinir Senha
            </CardTitle>
            <CardDescription className="text-center">
              {isSessionSet ? "Digite e confirme sua nova senha." : "Link inválido ou expirado. Tente novamente."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSessionSet ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha *</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha *</Label>
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
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isUpdatingPassword}
                >
                  {isUpdatingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Atualizar Senha
                </Button>
              </form>
            ) : (
              <div className="text-center">
                <p className="text-destructive mb-4">Não foi possível ativar a sessão de recuperação.</p>
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin-auth', { replace: true })}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para o Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PasswordRecovery;