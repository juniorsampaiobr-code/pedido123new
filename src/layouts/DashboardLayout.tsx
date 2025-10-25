import { useEffect, useState, useRef, createContext, useContext, useCallback } from "react";
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
import { EnableSoundModal } from "@/components/EnableSoundModal";

type Restaurant = Tables<'restaurants'>;
type SoundStatus = 'disabled' | 'enabled' | 'error';
type AudioReadyState = 'loading' | 'ready' | 'error';

interface SoundContextType {
  playSound: () => void;
  stopSoundLoop: () => void;
  soundStatus: SoundStatus;
  loopingOrderId: string | null;
}

export const SoundContext = createContext<SoundContextType | null>(null);

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a DashboardLayout');
  }
  return context;
};

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
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioReadyState, setAudioReadyState] = useState<AudioReadyState>('loading');
  const [isEnableSoundModalOpen, setIsEnableSoundModalOpen] = useState(false);
  const [loopingOrderId, setLoopingOrderId] = useState<string | null>(null);

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
    const hasSeenModal = localStorage.getItem('hasSeenSoundPermissionModal');
    if (!hasSeenModal && soundStatus !== 'enabled' && audioReadyState === 'ready') {
      setIsEnableSoundModalOpen(true);
    }
  }, [soundStatus, audioReadyState]);

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
    const channel = supabase.channel('new-orders-toast').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      const newOrder = payload.new as Tables<'orders'>;
      toast.info("🔔 Novo pedido recebido!", { 
        description: `Pedido #${newOrder.id.slice(-4)} está aguardando confirmação.`,
        duration: 15000,
      });
      if (newOrder.id) {
        startSoundLoop(newOrder.id);
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, startSoundLoop]);

  const playSound = useCallback(() => {
    if (soundStatus === 'enabled' && audioRef.current && audioReadyState === 'ready') {
      stopSoundLoop();
      audioRef.current.loop = false;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(error => {
        console.error("Erro na reprodução de áudio de teste:", error);
      });
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
      await playSound();
      setSoundStatus('enabled');
      toast.success('Notificações sonoras ativadas!', { description: 'Você ouviu o som de teste.' });
    } catch (err) {
      console.error("Audio activation failed:", err);
      toast.error("Falha ao ativar o som.", { description: "Seu navegador pode ter bloqueado. Clique na página e tente novamente." });
      setSoundStatus('error');
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  if (!user) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  const isSoundControlDisabled = audioReadyState !== 'ready';

  return (
    <SoundContext.Provider value={{ playSound, stopSoundLoop, soundStatus, loopingOrderId }}>
      <EnableSoundModal 
        isOpen={isEnableSoundModalOpen} 
        onEnable={handleEnableSoundFromModal} 
      />
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
                    <Button variant="outline" size="sm" onClick={playSound} disabled={isSoundControlDisabled}>Testar Som</Button>
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
        {restaurant?.notification_sound_url && (
          <audio
            ref={audioRef}
            src={restaurant.notification_sound_url}
            onCanPlayThrough={() => setAudioReadyState('ready')}
            onError={() => {
              toast.error("Erro ao carregar o som de notificação.", { description: "Verifique o arquivo em Configurações." });
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

export default DashboardLayout;