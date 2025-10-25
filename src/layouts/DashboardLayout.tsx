import { useEffect, useState, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { toast } from "sonner";
import { User } from '@supabase/supabase-js';
import { Tables } from '@/integrations/supabase/types';
import { ShoppingCart, Volume2, VolumeX, AlertCircle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Order = Tables<'orders'> & { customer: Tables<'customers'> | null };
type Restaurant = Tables<'restaurants'>;
type SoundStatus = 'disabled' | 'enabled' | 'error';
type AudioReadyState = 'loading' | 'ready' | 'error';

const getPageTitle = (pathname: string) => {
  const page = navItems.find(item => item.href === pathname);
  return page ? page.label : "Dashboard";
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

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioReadyState, setAudioReadyState] = useState<AudioReadyState>('loading');

  const [soundStatus, setSoundStatus] = useState<SoundStatus>(() => {
    const savedStatus = localStorage.getItem('soundNotificationStatus');
    return (savedStatus as SoundStatus) || 'disabled';
  });

  useEffect(() => {
    localStorage.setItem('soundNotificationStatus', soundStatus);
  }, [soundStatus]);

  const { data: restaurant } = useQuery<Restaurant>({
    queryKey: ['restaurantForLayout'],
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('id, notification_sound_url').limit(1).single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) navigate("/auth"); else setUser(session.user);
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') navigate("/"); else if (!session?.user) navigate("/auth"); else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (restaurant?.notification_sound_url) {
      setAudioReadyState('loading');
      const audio = new Audio(restaurant.notification_sound_url);
      
      const handleCanPlay = () => setAudioReadyState('ready');
      const handleError = () => {
        toast.error("Erro ao carregar o som de notificação.", { description: "Verifique o arquivo em Configurações." });
        setAudioReadyState('error');
        setSoundStatus('error');
      };

      audio.addEventListener('canplaythrough', handleCanPlay);
      audio.addEventListener('error', handleError);
      
      audioRef.current = audio;

      return () => {
        audio.removeEventListener('canplaythrough', handleCanPlay);
        audio.removeEventListener('error', handleError);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    } else if (restaurant) {
      setAudioReadyState('error');
    }
  }, [restaurant]);

  useEffect(() => {
    const channel = supabase.channel('new-orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      const newOrder = payload.new as Order;
      if (newOrder.status === 'pending') {
        toast.info("🔔 Novo pedido recebido!", { 
          description: `Pedido de ${newOrder.customer?.name || 'um cliente'} aguardando confirmação.`,
          duration: 10000,
        });
        
        if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
          audioRef.current.play().catch(error => {
            console.error("Erro na reprodução automática de áudio:", error);
            toast.warning("Não foi possível tocar o som automaticamente.", {
              description: "Clique para tocar o som do novo pedido.",
              action: {
                label: "Tocar Som",
                onClick: () => audioRef.current?.play(),
              },
              duration: Infinity,
            });
          });
        }
      }
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, soundStatus, audioReadyState]);

  const handleToggleSound = async () => {
    if (soundStatus === 'enabled') {
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
      // Play the sound fully as a confirmation and to unlock audio context
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

  const handleTestSound = () => {
    if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        toast.error("Não foi possível tocar o som de teste.");
        console.error(err);
      });
    } else {
      toast.info("O som está desativado ou não está pronto.", { description: "Clique no ícone de som para ativar as notificações." });
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  const isSoundControlDisabled = audioReadyState !== 'ready';

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background sticky top-0 z-40">
          <div className="container max-w-none mx-auto px-8 h-16 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <ShoppingCart className="h-6 w-6" />
              <h1 className="text-xl font-semibold">{getPageTitle(location.pathname)}</h1>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleTestSound} disabled={isSoundControlDisabled || soundStatus !== 'enabled'}>Testar Som</Button>
                </TooltipTrigger>
                {isSoundControlDisabled && <TooltipContent><p>Carregando som...</p></TooltipContent>}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleToggleSound} disabled={isSoundControlDisabled}>
                    {audioReadyState === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
                    {audioReadyState === 'ready' && soundStatus === 'enabled' && <Volume2 className="h-4 w-4 text-green-500" />}
                    {audioReadyState === 'ready' && soundStatus === 'disabled' && <VolumeX className="h-4 w-4" />}
                    {audioReadyState === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                  </Button>
                </TooltipTrigger>
                {isSoundControlDisabled && <TooltipContent><p>Carregando som...</p></TooltipContent>}
              </Tooltip>
              <Button variant="outline" onClick={handleSignOut}>Sair</Button>
            </div>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;