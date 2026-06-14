import React from 'react';
import { Truck, CheckCircle2, ChevronRight, Package, Navigation, AlertTriangle, CheckSquare } from 'lucide-react';

interface TrackingProgressBarProps {
  status: 'coletando' | 'em_transito' | 'parado' | 'entregue' | string;
}

export const TrackingProgressBar: React.FC<TrackingProgressBarProps> = ({ status }) => {
  const steps = [
    { label: 'Coletando', key: 'coletando', icon: Package, desc: 'Carga aguardando coleta' },
    { label: 'Trânsito', key: 'em_transito', icon: Navigation, desc: 'Veículo em movimento' },
    { label: 'Parado', key: 'parado', icon: AlertTriangle, desc: 'Parada programada / fiscal' },
    { label: 'Entregue', key: 'entregue', icon: CheckSquare, desc: 'Entregue com canhoto assinado' }
  ];

  const getStatusIndex = (currentStatus: string): number => {
    switch (currentStatus) {
      case 'coletando': return 0;
      case 'em_transito': return 1;
      case 'parado': return 2;
      case 'entregue': return 3;
      default: return 0;
    }
  };

  const currentIndex = getStatusIndex(status);

  return (
    <div className="w-full py-6 px-2 sm:px-4" id="tracking-progress-bar-container">
      {/* Track progress line */}
      <div className="relative mb-8" id="progress-line-track">
        {/* Background line */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 bg-zinc-800 -translate-y-1/2 rounded-full" />
        
        {/* Filled line (Yellow) */}
        <div 
          className="absolute top-1/2 left-0 h-1.5 bg-[#FFD700] -translate-y-1/2 rounded-full transition-all duration-1000 ease-in-out shadow-[0_0_10px_rgba(255,215,0,0.45)]"
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
          id="progress-line-filled"
        />

        {/* Animated truck positioning */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 -ml-5 transition-all duration-1000 ease-in-out z-10"
          style={{ left: `${(currentIndex / (steps.length - 1)) * 100}%` }}
          id="animated-truck-marker"
        >
          <div className="bg-[#FFD700] text-[#0a0a0a] p-2.5 rounded-full shadow-[0_0_15px_#FFD700] animate-bounce flex items-center justify-center">
            <span className="text-lg inline-block" style={{ transform: 'scaleX(-1)' }} id="truck-emoji-reversed">🚛</span>
          </div>
        </div>
      </div>

      {/* Steps indicators */}
      <div className="grid grid-cols-4 gap-2 text-center" id="progress-steps-labels">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          const isFuture = idx > currentIndex;
          const IconComponent = step.icon;

          return (
            <div key={step.key} className="flex flex-col items-center" id={`step-node-${step.key}`}>
              {/* Step circle */}
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 mb-2.5 ${
                  isActive 
                    ? 'bg-[#FFD700]/10 border-[#FFD700] text-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.3)] scale-110' 
                    : isCompleted 
                    ? 'bg-[#FFD700] border-[#FFD700] text-[#0a0a0a]' 
                    : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                }`}
                style={isActive ? { animation: 'pulse 2s infinite' } : {}}
                id={`step-circle-${step.key}`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <IconComponent className="w-5 h-5" />
                )}
              </div>

              {/* Step info */}
              <span 
                className={`text-xs font-bold leading-tight block mb-0.5 ${
                  isActive ? 'text-[#FFD700]' : isCompleted ? 'text-zinc-200' : 'text-zinc-500'
                }`}
                id={`step-label-${step.key}`}
              >
                {step.label}
              </span>
              
              <span className="text-[10px] text-zinc-650 hidden sm:inline" id={`step-desc-${step.key}`}>
                {step.desc}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
