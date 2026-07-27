import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Users, Loader2 } from 'lucide-react';
import { toggleAcompanhar } from '../utils/toggleAcompanhar';

interface AcompanharBadgeProps {
  freteId: string;
  operadorId: string;
  operadorNome: string;
  acompanhando?: Record<string, { nome: string; desde: string }>;
  compact?: boolean;
}

export const AcompanharBadge: React.FC<AcompanharBadgeProps> = ({
  freteId,
  operadorId,
  operadorNome,
  acompanhando,
  compact = false
}) => {
  // Check if current logged-in operator is in the server acompanhando dictionary
  const isFollowingServer = Boolean(acompanhando && acompanhando[operadorId]);
  
  // Optimistic UI state
  const [optimisticState, setOptimisticState] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync optimistic state whenever server data updates
  useEffect(() => {
    setOptimisticState(null);
  }, [acompanhando, operadorId]);

  const isFollowing = optimisticState !== null ? optimisticState : isFollowingServer;

  // Filter out other operators
  const entries: Array<[string, { nome: string; desde: string }]> = acompanhando 
    ? Object.entries(acompanhando) as Array<[string, { nome: string; desde: string }]>
    : [];

  const followersList = entries.map(([id, info]) => ({
    id,
    nome: info?.nome || 'Operador',
    desde: info?.desde
  }));

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // CRITICAL: Stop card click navigation
    e.preventDefault();

    if (loading) return;

    const nextState = !isFollowing;
    setOptimisticState(nextState);
    setLoading(true);
    setErrorMsg(null);

    try {
      await toggleAcompanhar(freteId, operadorId, operadorNome, isFollowing);
    } catch (err: any) {
      console.error('Erro ao atualizar acompanhamento:', err);
      // Revert optimistic state
      setOptimisticState(!nextState);
      setErrorMsg('Falha ao atualizar. Verifique sua conexão.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="inline-flex items-center gap-1.5 relative select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Main Toggle Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        title={isFollowing ? 'Você está acompanhando esta carga. Clique para remover.' : 'Clique para acompanhar esta carga em tempo real'}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all duration-150 border cursor-pointer ${
          isFollowing
            ? 'bg-amber-950/60 border-amber-500/80 text-[#FFD600] shadow-[0_0_8px_rgba(255,214,0,0.2)] hover:bg-amber-900/80'
            : 'bg-zinc-900/80 hover:bg-zinc-800/90 border-zinc-800 text-zinc-400 hover:text-zinc-200'
        } ${compact ? 'text-[9px] px-1.5 py-0.5' : ''}`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin text-[#FFD600]" />
        ) : isFollowing ? (
          <Eye className="w-3 h-3 text-[#FFD600] shrink-0" />
        ) : (
          <EyeOff className="w-3 h-3 text-zinc-500 shrink-0" />
        )}
        <span>{isFollowing ? 'Acompanhando' : 'Acompanhar'}</span>
      </button>

      {/* Others Counter & Tooltip */}
      {followersList.length > 0 && (
        <div 
          className="relative inline-block"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span 
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold cursor-help border transition-colors ${
              isFollowing 
                ? 'bg-amber-900/40 border-amber-500/40 text-amber-300' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}
          >
            <Users className="w-2.5 h-2.5" />
            <span>{followersList.length}</span>
          </span>

          {/* Hover Tooltip with list of operators */}
          {showTooltip && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 p-2 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-lg shadow-2xl z-[9999] pointer-events-none text-[10px] font-mono">
              <div className="font-bold text-[#FFD600] border-b border-zinc-800 pb-1 mb-1 flex items-center justify-between">
                <span>Acompanhando ({followersList.length})</span>
              </div>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {followersList.map((f) => (
                  <li key={f.id} className="flex items-center justify-between truncate">
                    <span className={f.id === operadorId ? 'text-[#FFD600] font-bold' : 'text-zinc-300'}>
                      ● {f.nome} {f.id === operadorId ? '(Você)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-950"></div>
            </div>
          )}
        </div>
      )}

      {/* Error Toast Popup */}
      {errorMsg && (
        <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-red-950 border border-red-800 text-red-200 text-[9px] font-mono rounded shadow-lg z-[9999]">
          {errorMsg}
        </div>
      )}
    </div>
  );
};

export default AcompanharBadge;
