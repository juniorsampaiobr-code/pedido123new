import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { toast } from "sonner";
import { User as SupabaseUser } from '@supabase/supabase-js';
import { Tables, Enums } from '@/integrations/supabase/types';
import { ShoppingCart, Loader2, User, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { MobileSidebar } from "@/components/MobileSidebar"; 
import { useIsMobile } from "@/hooks/use-mobile"; 
import { SoundContext } from "@/hooks/use-sound"; // Mantendo SoundContext para tipagem, mas removendo useSound
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
  const [loopingOrderId, setLoopingOrderId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Remove soundStatus state and related localStorage logic

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
      // Força o carregamento do áudio
      if (audioRef.current?.src !== `${window.location.origin}${window.location.pathname}${notificationSoundUrl}`) {
        setAudioReadyState('loading');
      }
    } else {
      setAudioReadyState('error');
    }
  }, [notificationSoundUrl]);


  // Remove useEffect para modal de permissão de som

  const stopSoundLoop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.loop = false;
      setLoopingOrderId(null);
    }
  }, []);

  const startSoundLoop = useCallback((orderId: string) => {
    // Tenta tocar o som se estiver pronto
    if (audioRef.current && audioReadyState === 'ready') {
      if (loopingOrderId) return; 
      setLoopingOrderId(orderId);
      audioRef.current.loop = true;
      audioRef.current.play().catch(error => {
        console.error("Erro na reprodução automática de áudio:", error);
        setLoopingOrderId(null);
        // Não mostra toast de aviso, pois o usuário não tem controle sobre isso
      });
    }
  }, [audioReadyState, loopingOrderId]);

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

  // Remove playSound, handleEnableSoundFromModal, handleToggleSound functions

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

  // O SoundContext.Provider é mantido, mas com valores mockados, para evitar que outros componentes que usam useSound quebrem.
  const soundContextValue = useMemo(() => ({
    playSound: () => { /* no-op */ },
    stopSoundLoop,
    soundStatus: audioReadyState === 'ready' ? 'enabled' as SoundStatus : 'disabled' as SoundStatus,
    loopingOrderId,
  }), [stopSoundLoop, audioReadyState, loopingOrderId]);

  return (
    <SoundContext.Provider value={soundContextValue}>
      {/* Remove EnableSoundModal */}
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
                
                {/* Botões de controle de som removidos daqui */}
                
                <Button variant="outline" onClick={handleSignOut}>Sair</Button>
              </div>
            </div>
          </header>
          <Outlet context={{ restaurant, userRestaurantId }} />
        </div>
        {/* Mantém a tag de áudio para reprodução automática de novos pedidos */}
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