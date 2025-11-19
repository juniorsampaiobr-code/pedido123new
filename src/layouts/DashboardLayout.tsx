import { useEffect, useState, useRef, useCallback, memo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { toast } from "sonner";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Tables, Enums } from '@/integrations/supabase/types';
import { ShoppingCart, Volume2, VolumeX, AlertCircle, Loader2, User } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EnableSoundModal } from "@/components/EnableSoundModal";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MobileSidebar } from "@/components/MobileSidebar"; 
import { useIsMobile } from "@/hooks/use-mobile"; 
import { SoundContext, useSound } from "@/hooks/use-sound"; // Importando do novo hook
import { AdminProfileModal } from "@/components/AdminProfileModal"; // NOVO IMPORT

type Restaurant = Tables<'restaurants'>;
type SoundStatus = 'disabled' | 'enabled' | 'error';
type AudioReadyState = 'loading' | 'ready' | 'error';
type OrderStatus = Enums<'order_status'>;
type AppRole = Enums<'app_role'>;

export type DashboardContextType = {
  restaurant: Restaurant;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Produtos" },
  { href: "/orders", label: "Pedidos" },
  { href: "/cashier", label: "Caixa" },
  { href: "/hours", label: "Horários" },
  { href: "/payments", label: "Pagamentos" },
  { href: "/delivery", label: "Taxa de Entrega" },
  { href: "/settings", label: "Configurações" },
];

const getPageTitle = (pathname: string) => {
  const page = navItems.find(item => item.href === pathname);
  return page ? page.label : "Dashboard";
};

// Função para verificar a role do usuário
const checkUserRole = async (userId: string): Promise<AppRole | null> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'moderator'])
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error("Error checking role:", error);
    return null;
  }
  return data?.role || null;
};


const DashboardLayoutComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null | undefined>(undefined); // undefined = loading
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioReadyState, setAudioReadyState] = useState<AudioReadyState>('loading');
  const [isEnableSoundModalOpen, setIsEnableSoundModalOpen] = useState(false);
  const [loopingOrderId, setLoopingOrderId] = useState<string | null>(null);
  const isMobile = useIsMobile(); 
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false); // NOVO ESTADO

  const [soundStatus, setSoundStatus] = useState<SoundStatus>(() => {
    const savedStatus = localStorage.getItem('soundNotificationStatus');
    return (savedStatus as SoundStatus) || 'disabled';
  });

  useEffect(() => {
    localStorage.setItem('soundNotificationStatus', soundStatus);
  }, [soundStatus]);

  const { data: restaurant, isLoading: isRestaurantLoading } = useQuery<Restaurant>({
    queryKey: ['dashboardRestaurant'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('*').limit(1).single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user && (userRole === 'admin' || userRole === 'moderator'), // Só busca se for admin/moderator
    staleTime: Infinity, // Restaurant data is stable, fetch once
  });

  // Efeito de Autenticação e Verificação de Role
  useEffect(() => {
    const checkAuthAndRole = async (session: any) => {
      if (!session?.user) {
        setUser(null);
        setUserRole(null);
        navigate("/admin-auth", { replace: true });
        return;
      }
      
      const role = await checkUserRole(session.user.id);
      setUser(session.user);
      setUserRole(role);

      if (role !== 'admin' && role !== 'moderator') {
        toast.error("Acesso restrito.", {
          description: "Você não tem permissão para acessar o painel. Redirecionando para o login de administrador.",
          duration: 5000,
        });
        // Redireciona para o login de admin, que pode forçar o logout se necessário
        navigate("/admin-auth", { replace: true });
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserRole(null);
        navigate("/admin-auth", { replace: true });
      } else {
        checkAuthAndRole(session);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkAuthAndRole(session);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);


  // Efeito para redefinir o estado do áudio quando a URL de notificação muda
  useEffect(() => {
    if (restaurant?.notification_sound_url) {
      // Se a URL for diferente da que está sendo carregada, redefina o estado
      if (audioRef.current?.src !== restaurant.notification_sound_url) {
        setAudioReadyState('loading');
      }
    } else {
      setAudioReadyState('error');
    }
  }, [restaurant?.notification_sound_url]);


  useEffect(() => {
    const hasSeenModal = localStorage.getItem('hasSeenSoundPermissionModal');
    if (!hasSeenModal && soundStatus !== 'enabled' && audioReadyState === 'ready') {
      setIsEnableSoundModalOpen(true);
    }
  }, [soundStatus, audioReadyState]);

  const stopSoundLoop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.loop = false;
      setLoopingOrderId(null);
    }
  }, []);

  const startSoundLoop = useCallback((orderId: string) => {
    if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
      if (loopingOrderId) return; 
      setLoopingOrderId(orderId);
      audioRef.current.loop = true;
      audioRef.current.play().catch(error => {
        console.error("Erro na reprodução automática de áudio:", error);
        setLoopingOrderId(null);
        toast.warning("Não foi possível tocar o som automaticamente.", {
          description: "Interaja com a página para permitir a reprodução de som.",
        });
      });
    }
  }, [soundStatus, audioReadyState, loopingOrderId]);

  useEffect(() => {
    // Só se inscreve se o usuário for admin/moderator
    if (userRole !== 'admin' && userRole !== 'moderator') return;
    
    const channel = supabase.channel('new-orders-toast')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        const newOrder = payload.new as Tables<'orders'>;
        
        // Toca o som APENAS se o status for 'pending' (pagamento na entrega ou online aprovado)
        if (newOrder.status === 'pending' && newOrder.id) {
          toast.info("🔔 Novo pedido recebido!", { 
            description: `Pedido #${newOrder.id.slice(-4)} está aguardando confirmação.`,
            duration: 15000,
          });
          startSoundLoop(newOrder.id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        const updatedOrder = payload.new as Tables<'orders'>;
        
        // Se o pedido que estava tocando o som for atualizado, paramos o loop.
        if (updatedOrder.id === loopingOrderId) {
          stopSoundLoop();
        }
        
        // Exibe toast para confirmação de pagamento online, mas sem tocar o som
        // O status agora muda de 'pending_payment' para 'pending' (não 'confirmed')
        if (updatedOrder.status === 'pending' && updatedOrder.id && payload.old.status === 'pending_payment') {
          toast.success("✅ Pagamento Confirmado!", { 
            description: `Pedido #${updatedOrder.id.slice(-4)} foi pago e está pronto para preparo.`,
            duration: 5000,
          });
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, startSoundLoop, stopSoundLoop, loopingOrderId, userRole]);

  const playSound = useCallback(() => {
    if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
      stopSoundLoop();
      audioRef.current.loop = false;
      audioRef.current.currentTime = 0;
      
      // Tentar tocar o som e lidar com erros
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Som tocado com sucesso
            console.log("Som de teste tocado com sucesso");
          })
          .catch((error) => {
            console.error("Erro ao tocar som de teste:", error);
            setSoundStatus('error'); // Define como erro se a reprodução falhar
            toast.error("Não foi possível tocar o som de teste.", {
              description: "Seu navegador pode ter bloqueado a reprodução. Interaja com a página e tente novamente.",
            });
          });
      }
    } else if (audioReadyState === 'ready') {
        // Se o som está pronto, mas desativado, tentamos ativar e tocar
        setSoundStatus('enabled');
        // Chamamos playSound novamente para tentar tocar
        setTimeout(() => playSound(), 100); 
    } else {
      toast.error("Som de notificação não está pronto ou configurado.", {
        description: "Verifique se a URL do som está correta nas Configurações.",
      });
      setSoundStatus('error');
    }
  }, [soundStatus, audioReadyState, stopSoundLoop]);

  const handleEnableSoundFromModal = async () => {
    if (audioReadyState !== 'ready' || !audioRef.current) {
      toast.error("O arquivo de som ainda não está pronto. Tente novamente em um momento.");
      return;
    }
    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setSoundStatus('enabled');
      toast.success('Notificações sonoras ativadas!');
      localStorage.setItem('hasSeenSoundPermissionModal', 'true');
    } catch (err) {
      console.error("Audio activation failed from modal:", err);
      toast.error("Falha ao ativar o som.", { description: "Seu navegador pode ter bloqueado a reprodução. Por favor, tente ativar manualmente no ícone do cabeçalho." });
      setSoundStatus('error');
    } finally {
      setIsEnableSoundModalOpen(false);
    }
  };

  const handleToggleSound = async () => {
    if (soundStatus === 'enabled') {
      stopSoundLoop();
      setSoundStatus('disabled');
      toast.info('Notificações sonoras desativadas.');
      return;
    }
    if (audioReadyState !== 'ready' || !audioRef.current) {
      toast.error("Som de notificação não está pronto ou configurado.");
      setSoundStatus('error');
      return;
    }
    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setSoundStatus('enabled');
      toast.success('Notificações sonoras ativadas!', { description: 'Você ouviu o som de teste.' });
    } catch (err) {
      console.error("Audio activation failed:", err);
      toast.error("Falha ao ativar o som.", { description: "Seu navegador pode ter bloqueado. Clique na página e tente novamente." });
      setSoundStatus('error');
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  // Se estiver carregando a role ou os dados do restaurante, mostra o spinner
  if (userRole === undefined || isRestaurantLoading) {
    return <LoadingSpinner />;
  }
  
  // Se o usuário não for admin/moderator, ele já foi redirecionado no useEffect.
  // Se ele chegou aqui e userRole não é undefined, mas também não é admin/moderator, 
  // significa que o redirecionamento está em andamento, mas por segurança, 
  // garantimos que o layout não seja renderizado.
  if (userRole !== 'admin' && userRole !== 'moderator') {
    return <LoadingSpinner />;
  }

  // Se o restaurante não for encontrado (e não estiver carregando), algo está errado
  if (!restaurant) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro Crítico</AlertTitle>
          <AlertDescription>
            Não foi possível carregar os dados do restaurante. Verifique as configurações ou entre em contato com o suporte.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isSoundControlDisabled = audioReadyState !== 'ready';

  return (
    <SoundContext.Provider value={{ playSound, stopSoundLoop, soundStatus, loopingOrderId }}>
      <EnableSoundModal 
        isOpen={isEnableSoundModalOpen} 
        onEnable={handleEnableSoundFromModal} 
      />
      {/* NOVO MODAL DE PERFIL */}
      <AdminProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userId={user?.id || null}
      />
      <div className="flex min-h-screen bg-muted/40">
        {/* Sidebar de Desktop (Visível apenas em telas grandes) */}
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-background sticky top-0 z-40">
            <div className="container max-w-none mx-auto px-4 sm:px-8 h-16 flex justify-between items-center">
              <div className="flex items-center gap-4">
                {/* Mobile Sidebar Trigger (Visível em telas pequenas) */}
                <div className="lg:hidden">
                  <MobileSidebar /> 
                </div>
                <ShoppingCart className="h-6 w-6 hidden sm:block" />
                <h1 className="text-xl font-semibold">{getPageTitle(location.pathname)}</h1>
              </div>
              <div className="flex items-center gap-2">
                {/* Botão de Perfil do Admin */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => setIsProfileModalOpen(true)}
                      aria-label="Meu Perfil"
                    >
                      <User className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Meu Perfil</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={playSound} disabled={isSoundControlDisabled}>
                      Testar Som
                    </Button>
                  </TooltipTrigger>
                  {isSoundControlDisabled && (
                    <TooltipContent>
                      {audioReadyState === 'loading' ? 'Carregando som...' : 'Som não disponível'}
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={handleToggleSound} 
                      disabled={isSoundControlDisabled}
                      aria-label={soundStatus === 'enabled' ? "Desativar som" : "Ativar som"}
                    >
                      {audioReadyState === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                      {audioReadyState === 'ready' && soundStatus === 'enabled' && <Volume2 className="h-4 w-4 text-green-500" />}
                      {audioReadyState === 'ready' && soundStatus === 'disabled' && <VolumeX className="h-4 w-4" />}
                      {audioReadyState === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                    </Button>
                  </TooltipTrigger>
                  {isSoundControlDisabled && (
                    <TooltipContent>
                      {audioReadyState === 'loading' ? 'Carregando som...' : 'Som não disponível'}
                    </TooltipContent>
                  )}
                </Tooltip>
                <Button variant="outline" onClick={handleSignOut}>Sair</Button>
              </div>
            </div>
          </header>
          <Outlet context={{ restaurant }} />
        </div>
        {restaurant?.notification_sound_url && (
          <audio
            ref={audioRef}
            // A URL já contém o parâmetro de cache forçado do Settings.tsx
            src={restaurant.notification_sound_url}
            onCanPlayThrough={() => {
              setAudioReadyState('ready');
              console.log("Áudio carregado e pronto para tocar.");
            }}
            onError={(e) => {
              console.error("Erro ao carregar o áudio:", e);
              toast.error("Erro ao carregar o som de notificação.", { 
                description: "Verifique o arquivo em Configurações." 
              });
              setAudioReadyState('error');
              setSoundStatus('error');
            }}
            className="hidden"
          />
        )}
      </div>
    </SoundContext.Provider>
  );
};

const DashboardLayout = memo(DashboardLayoutComponent);
export default DashboardLayout;