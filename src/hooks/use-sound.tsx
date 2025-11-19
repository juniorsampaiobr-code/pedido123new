import { createContext, useContext } from "react";
import { Tables, Enums } from '@/integrations/supabase/types';

type SoundStatus = 'disabled' | 'enabled' | 'error';

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
    // Se o erro #306 ocorrer, esta mensagem será mais clara.
    throw new Error('useSound must be used within the SoundContext.Provider (DashboardLayout)');
  }
  return context;
};