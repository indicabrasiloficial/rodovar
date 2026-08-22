import React, { useState, useEffect } from 'react';
import { dbAdapter } from '../db/databaseAdapter';
import { Entrega } from '../types';
import { TrackingCard } from './TrackingCard';
import { Search, ArrowLeft, ShieldAlert, AlertCircle, Loader2 } from 'lucide-react';
import { playEntregueAudio } from '../utils/audioNotification';

interface RastrearProps {
  onClose?: () => void;
  userLogged?: any;
  onAccessColaborador?: () => void;
}

export const Rastrear: React.FC<RastrearProps> = ({ onClose, userLogged, onAccessColaborador }) => {
  const [inputText, setInputText] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [carga, setCarga] = useState<Entrega | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with URL query string on load (?code=RDV0123 ou ?rastreio=RDV0123 etc)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code') || params.get('rastreio') || params.get('rastrear') || params.get('id') || params.get('c');
    if (codeParam && codeParam !== 'undefined' && codeParam !== 'null' && codeParam.trim() !== '') {
      const cleanCode = codeParam.toUpperCase().trim();
      setInputText(cleanCode);
      setSearchCode(cleanCode);
    }
  }, []);

  // Set up real-time listener to Firestore when searchCode changes
  useEffect(() => {
    if (!searchCode) {
      setCarga(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = dbAdapter.inscreverCargaPorCodigoRastreio(
      searchCode,
      (cargaResult) => {
        setLoading(false);
        if (cargaResult) {
          setCarga(cargaResult);
          setError(null);
          
          // Se estiver com status entregue, toca o som 1 vez
          const st = (cargaResult.status || '').toLowerCase().trim();
          if (st === 'entregue' || st.includes('entregue') || st.includes('concluid')) {
            playEntregueAudio(cargaResult.trackingCode || cargaResult.id);
          }
        } else {
          setCarga(null);
          setError('Código de rastreio não encontrado. Verifique os dígitos e tente novamente.');
        }
      }
    );

    return () => unsubscribe();
  }, [searchCode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const code = inputText.toUpperCase().trim();
    setSearchCode(code);
    
    // Update the URL query params without reloading the page for a real routing feel
    const newUrl = `${window.location.pathname}?code=${code}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleClear = () => {
    setInputText('');
    setSearchCode('');
    setCarga(null);
    setError(null);
    
    // Reset the URL query params
    window.history.pushState({ path: window.location.pathname }, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col justify-between" id="public-tracking-view">
      {/* Top Header Row WITHOUT session or sensitive information */}
      <header className="p-4 border-b border-zinc-900 bg-black/40 backdrop-blur" id="public-tracking-header">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="https://rodovar.com.br/wp-content/uploads/2026/02/logo.png" 
              alt="Rodovar Logo" 
              className="h-9 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-sm font-black tracking-tight text-[#FFD700] uppercase font-mono hidden sm:inline">
              RODOVAR MONITORA
            </span>
          </div>

          {/* Menu Superior - Colaborador button (no 'Voltar' option) */}
          {userLogged ? (
            <button 
              onClick={onClose}
              className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-[#FFD700] bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 hover:border-[#FFD700]/40 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer font-bold uppercase"
              id="back-to-system-btn"
            >
              <span>Painel</span>
            </button>
          ) : (
            <button 
              onClick={onAccessColaborador}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-[#FFD700] bg-zinc-900/40 hover:bg-zinc-900/90 border border-zinc-800 hover:border-[#FFD700]/30 px-3 py-1.5 rounded-lg transition-all cursor-pointer font-bold uppercase"
              id="access-colaborador-btn"
            >
              <span>Colaborador</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center" id="public-tracking-main">
        <div className="w-full text-center mb-8" id="intro-headline">
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight uppercase mb-2">
            Consulte seu <span className="text-[#FFD700]">Frete!</span>
          </h1>
          <p className="text-sm text-zinc-400 md:max-w-md mx-auto">
            Digite o código fornecido pelo seu operador para acompanhar o status e o progresso da sua entrega em tempo real.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSearchSubmit} className="w-full max-w-xl mb-12" id="tracking-search-form">
          <div className="flex flex-col sm:flex-row gap-3 bg-zinc-950 p-2 rounded-2xl border border-zinc-900 shadow-xl" id="input-container">
            <div className="flex-1 flex items-center gap-3 px-3 py-1 bg-zinc-900/40 rounded-xl border border-transparent focus-within:border-[#FFD700]/40 transition-all">
              <Search className="w-5 h-5 text-zinc-500" />
              <input 
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Digite ou cole o código de rastreio (Ex: RDV0123)"
                className="w-full bg-transparent text-sm text-white border-0 outline-none placeholder-zinc-500 font-bold uppercase tracking-wider"
                maxLength={20}
                required
                id="search-input-field"
              />
            </div>
            
            <div className="flex gap-2">
              {searchCode && (
                <button 
                  type="button"
                  onClick={handleClear}
                  className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer"
                  id="search-clear-btn"
                >
                  Limpar
                </button>
              )}
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 sm:flex-initial px-6 py-3 bg-[#FFD700] hover:bg-[#FFE042] text-[#0a0a0a] rounded-xl text-xs font-black uppercase transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(255,215,0,0.15)]"
                id="search-submit-btn"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>RASTREAR</span>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Loading and Results feedback rendering */}
        <div className="w-full max-w-2xl" id="tracking-results-area">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3" id="loading-spinner">
              <Loader2 className="w-10 h-10 text-[#FFD700] animate-spin" />
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest text-[#FFD700]">
                Buscando carga nos servidores...
              </p>
            </div>
          )}

          {!loading && error && (
            <div 
              className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl text-center shadow-lg"
              id="error-feedback"
            >
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Carga Não Localizada</h3>
              <p className="text-sm text-zinc-400">{error}</p>
            </div>
          )}

          {!loading && carga && (
            <div className="animate-fade-in space-y-6" id="card-holder-anim">
              <TrackingCard carga={carga} />
            </div>
          )}
        </div>
      </main>

      {/* Public Footer */}
      <footer className="p-6 border-t border-zinc-950 bg-black/60 text-center" id="public-tracking-footer">
        <p className="text-xs text-zinc-650 tracking-wide">
          © {new Date().getFullYear()} RODOVAR TRANSPORTES LTDA. TODOS OS DIREITOS RESERVADOS.
        </p>
      </footer>
    </div>
  );
};
