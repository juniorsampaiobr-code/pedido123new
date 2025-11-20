import { useState, useRef, useCallback, createContext, useContext } from 'react';

type SoundStatus = 'disabled' | 'enabled' | 'error';

interface SoundContextType {
  playSound: () => void;
  stopSoundLoop: () => void;
  soundStatus: SoundStatus;
  loopingOrderId: string | null;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

const useSound = () => {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};

export { SoundContext, useSound };
export type { SoundContextType, SoundStatus };