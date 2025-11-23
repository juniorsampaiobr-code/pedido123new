import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
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
import { SoundContext, useSound } from "@/hooks/use-sound";
import { AdminProfileModal } from "@/components/AdminProfileModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Restaurant = Tables<'restaurants'>;
type SoundStatus = 'disabled' | 'enabled' | 'error';
type AudioReadyState = 'loading' | 'ready' | 'error';
type OrderStatus = Enums<'order_status'>;
type AppRole = Enums<'app_role'>;
type UserRole = Tables<'user_roles'>;

export type DashboardContextType = {
  restaurant: Restaurant;
  userRestaurantId: string;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Produtos" },
  { href: "/orders", label: "Pedidos" },
  { href: "/cashier", label: "Caixa" },
  { href: "/hours", label: "Horários" },
  { href: "/payments", label: "Pagamentos" },
  { href: "/delivery", label: "Taxa de Entrega" },
  { href: "/settings", label: "Configurações", icon: User },
];

const getPageTitle = (pathname: string) => {
  const page = navItems.find(item => item.href === pathname);
  return page ? page.label : "Dashboard";
};

const checkUserRoleAndRestaurant = async (userId: string): Promise<{ role: AppRole | null, restaurantId: string | null }> => {
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

const DashboardLayoutComponent = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null | undefined>(undefined);
  const [userRestaurantId, setUserRestaurantId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioReadyState, setAudioReadyState] = useState<AudioReadyState>('loading');
  const [isEnableSoundModalOpen, setIsEnableSoundModalOpen] = useState(false);
  const [loopingOrderId, setLoopingOrderId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [soundStatus, setSoundStatus] = useState<SoundStatus>(() => {
    const savedStatus = localStorage.getItem('soundNotificationStatus');
    return (savedStatus as SoundStatus) || 'disabled';
  });

  useEffect(() => {
    localStorage.setItem('soundNotificationStatus', soundStatus);
  }, [soundStatus]);

  const { data: restaurant, isLoading: isRestaurantLoading, isError: isRestaurantError, error: restaurantError } = useQuery<Restaurant>({
    queryKey: ['dashboardRestaurant', userRestaurantId],
    queryFn: async () => {
      if (!userRestaurantId) throw new Error('Restaurant ID not found for user.');
      
      const { data, error } = await supabase.from('restaurants').select('*').eq('id', userRestaurantId).single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user && (userRole === 'admin' || userRole === 'moderator') && !!userRestaurantId,
    staleTime: Infinity,
  });
  
  // Ajuste no fallback para usar caminho relativo
  const notificationSoundUrl = useMemo(() => {
    // Se o campo no DB for NULL ou VAZIO, usa o caminho relativo do som padrão
    if (!restaurant?.notification_sound_url || restaurant.notification_sound_url.trim() === '') {
        return './default-notification.mp3';
    }
    // Caso contrário, usa a URL configurada no DB
    return restaurant.notification_sound_url;
  }, [restaurant?.notification_sound_url]);


  useEffect(() => {
    const checkAuthAndRole = async (session: any) => {
      if (!session?.user) {
        setUser(null);
        setUserRole(null);
        setUserRestaurantId(null);
        navigate("/admin-auth", { replace: true });
        return;
      }
      
      const { role, restaurantId } = await checkUserRoleAndRestaurant(session.user.id);
      setUser(session.user);
      setUserRole(role);
      setUserRestaurantId(restaurantId);

      if (role === 'user') {
        toast.error("Acesso restrito.", {
          description: "Esta conta é de cliente e não tem permissão para acessar o painel.",
          duration: 5000,
        });
        await supabase.auth.signOut();
        const menuUrl = `${window.location.origin}${window.location.pathname}#/`;
        window.location.href = menuUrl;
        return;
      }

      if (role !== 'admin' && role !== 'moderator') {
        toast.error("Acesso restrito.", {
          description: "Você não tem permissão para acessar o painel. Redirecionando para o login de administrador.",
          duration: 5000,
        });
        navigate("/admin-auth", { replace: true });
      }
      
      if ((role === 'admin' || role === 'moderator') && !restaurantId) {
          console.error("Admin logged in but missing restaurant ID.");
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserRole(null);
        setUserRestaurantId(null);
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


  useEffect(() => {
    if (notificationSoundUrl) {
      if (audioRef.current?.src !== `${window.location.origin}${window.location.pathname}${notificationSoundUrl}`) {
        setAudioReadyState('loading');
      }
    } else {
      setAudioReadyState('error');
    }
  }, [notificationSoundUrl]);


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
    if ((userRole !== 'admin' && userRole !== 'moderator') || !userRestaurantId) return;
    
    const channel = supabase.channel('new-orders-toast')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        const newOrder = payload.new as Tables<'orders'>;
        
        if (newOrder.status === 'pending' && newOrder.id && newOrder.restaurant_id === userRestaurantId) {
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
        
        if (updatedOrder.id === loopingOrderId) {
          stopSoundLoop();
        }
        
        if (updatedOrder.status === 'pending' && updatedOrder.id && payload.old.status === 'pending_payment' && updatedOrder.restaurant_id === userRestaurantId) {
          toast.success("✅ Pagamento Confirmado!", { 
            description: `Pedido #${updatedOrder.id.slice(-4)} foi pago e está pronto para preparo.`,
            duration: 5000,
          });
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, startSoundLoop, stopSoundLoop, loopingOrderId, userRole, userRestaurantId]);

  const playSound = useCallback(() => {
    if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
      stopSoundLoop();
      audioRef.current.loop = false;
      audioRef.current.currentTime = 0;
      
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Som de teste tocado com sucesso");
          })
          .catch((error) => {
            console.error("Erro ao tocar som de teste:", error);
            setSoundStatus('error');
            toast.error("Não foi possível tocar o som de teste.", {
              description: "Interaja com a página para permitir a reprodução de som.",
            });
          });
      }
    } else if (audioReadyState === 'ready') {
        setSoundStatus('enabled');
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

  if (userRole === undefined || isRestaurantLoading) {
    return <LoadingSpinner />;
  }
  
  if (userRole !== 'admin' && userRole !== 'moderator') {
    return <LoadingSpinner />;
  }
  
  if (!userRestaurantId) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro de Configuração</AlertTitle>
            <AlertDescription>
              Sua conta não está vinculada a um restaurante. Por favor, tente fazer login novamente. Se o erro persistir, entre em contato com o suporte.
            </AlertDescription>
          </Alert>
        </div>
      );
  }

  if (isRestaurantError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao Carregar Restaurante</AlertTitle>
          <AlertDescription>
            {restaurantError instanceof Error ? restaurantError.message : "Não foi possível carregar os dados do seu restaurante."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!restaurant) {
      return <LoadingSpinner />;
  }

  const isSoundControlDisabled = audioReadyState !== 'ready';

  return (
    <SoundContext.Provider value={{ playSound, stopSoundLoop, soundStatus, loopingOrderId }}>
      <EnableSoundModal 
        isOpen={isEnableSoundModalOpen} 
        onEnable={handleEnableSoundFromModal} 
      />
      <AdminProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        userId={user?.id || null}
      />
      <div className="flex min-h-screen bg-muted/40">
        <div className="hidden lg:flex">
          <Sidebar />
        </div>
        
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-background sticky top-0 z-40">
            <div className="container max-w-none mx-auto px-4 sm:px-8 h-16 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="lg:hidden">
                  <MobileSidebar /> 
                </div>
                <ShoppingCart className="h-6 w-6 hidden sm:block" />
                <h1 className="text-xl font-semibold">{getPageTitle(location.pathname)}</h1>
              </div>
              <div className="flex items-center gap-2">
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
          <Outlet context={{ restaurant, userRestaurantId }} />
        </div>
        {/* Garantindo que a URL seja resolvida corretamente */}
        {notificationSoundUrl && (
          <audio
            ref={audioRef}
            src={notificationSoundUrl.startsWith('http') ? notificationSoundUrl : `${window.location.origin}${window.location.pathname}${notificationSoundUrl}`}
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