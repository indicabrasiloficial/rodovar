import { useEffect, useState } from 'react';
import { ref, onValue, set, off } from 'firebase/database';
import { database } from '../db/firebase';

interface ModeOption {
  key: 'economy' | 'express' | 'normal';
  label: string;
  icon: string;
  desc: string;
  color: string;
  saving: string;
}

const modes: ModeOption[] = [
  {
    key: 'economy',
    label: 'Economy',
    icon: '🌿',
    desc: 'A cada 2 min',
    color: '#22c55e',
    saving: '-91% DB',
  },
  {
    key: 'express',
    label: 'Express',
    icon: '⚡',
    desc: 'A cada 30s',
    color: '#eab308', // yellow-500
    saving: '-67% DB',
  },
  {
    key: 'normal',
    label: 'Normal',
    icon: '🎯',
    desc: 'A cada 10s',
    color: '#3b82f6', // blue-500
    saving: 'Máx. precisão',
  },
];

export default function TrackingModeSelector() {
  const [activeMode, setActiveMode] = useState<'economy' | 'express' | 'normal'>('express');
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync mode with Firebase Realtime DB
  useEffect(() => {
    const modeRef = ref(database, 'config/tracking/mode');

    const unsubscribe = onValue(modeRef, (snap) => {
      if (snap.exists()) {
        const value = snap.val();
        if (value === 'economy' || value === 'express' || value === 'normal') {
          setActiveMode(value);
        }
      }
    });

    return () => {
      off(modeRef, 'value', unsubscribe);
    };
  }, []);

  const handleSelectMode = async (mode: 'economy' | 'express' | 'normal') => {
    setIsUpdating(true);
    try {
      const modeRef = ref(database, 'config/tracking/mode');
      await set(modeRef, mode);
      setActiveMode(mode);
    } catch (err) {
      console.error("Erro ao atualizar o modo de rastreamento no Firebase:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 p-2 bg-[#0a0a0a]/80 border border-zinc-850 rounded-xl backdrop-blur-md" id="tracking-mode-selector-container">
      <div className="flex items-center justify-between px-1.5 border-b border-zinc-900 pb-1 mb-1">
        <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-[#FFD600]">Frequência GPS</span>
        <span className="text-[8px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.2 rounded uppercase">Sinc. Nuvem</span>
      </div>
      <div className="flex items-center gap-1.5">
        {modes.map((mode) => {
          const isActive = activeMode === mode.key;
          return (
            <button
              key={mode.key}
              type="button"
              disabled={isUpdating}
              onClick={() => handleSelectMode(mode.key)}
              style={{
                borderColor: isActive ? mode.color : '#27272a',
                color: isActive ? mode.color : '#71717a',
                backgroundColor: isActive ? `${mode.color}15` : 'transparent',
              }}
              className={`px-2.5 py-1 border rounded-lg text-[10px] font-mono font-bold uppercase tracking-tight transition-all duration-250 flex items-center gap-1 cursor-pointer hover:border-zinc-500 ${
                isActive ? 'shadow-sm font-black scale-102' : 'hover:text-zinc-300'
              }`}
              title={`${mode.label}: ${mode.desc} (${mode.saving})`}
            >
              <span>{mode.icon}</span>
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
