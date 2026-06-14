import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../db/firebase';
import { Entrega } from '../types';
import { 
  Truck, 
  MapPin, 
  Compass, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  StopCircle, 
  Play, 
  Map, 
  PhoneCall, 
  ArrowLeft,
  FileText
} from 'lucide-react';

interface MotoristaTrackingProps {
  onClose?: () => void;
}

export const MotoristaTracking: React.FC<MotoristaTrackingProps> = ({ onClose }) => {
  const [trackingCode, setTrackingCode] = useState('');
  const [delivery, setDelivery] = useState<Entrega | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Geolocation watch ID and status
  const [isSharing, setIsSharing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastTime, setLastTime] = useState<string | null>(null);
  
  const watchIdRef = useRef<number | null>(null);

  // Extract code from pathname (/motorista/RDV0123)
  useEffect(() => {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/motorista\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      setTrackingCode(match[1].toUpperCase().trim());
    } else {
      setError('Código de rastreio inválido fornecido na URL.');
      setLoading(false);
    }
  }, []);

  // Set up real-time listener to Firestore for this trackingCode
  useEffect(() => {
    if (!trackingCode) return;

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'entregas'),
      where('trackingCode', '==', trackingCode)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoading(false);
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          const data = docSnap.data();
          setDelivery({
            id: docSnap.id,
            ...data
          } as Entrega);
          setError(null);
        } else {
          setDelivery(null);
          setError(`Viagem com código ${trackingCode} não localizada na base de dados.`);
        }
      },
      (err) => {
        console.error('Error listening to driver delivery doc:', err);
        setError('Erro de conexão ao carregar os dados da viagem.');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      // Clean up watch position on unmount
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [trackingCode]);

  // Handle Geolocation Sharing
  const startTracking = () => {
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError('Seu celular ou navegador não possui suporte a GPS / Geolocalização.');
      return;
    }

    if (watchIdRef.current !== null) {
      // Already running
      return;
    }

    if (window.falarRodovar) {
      window.falarRodovar("Iniciando rastreamento da carga. Por favor, autorize a permissão de GPS na tela.");
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    const successCallback = async (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      
      setLastCoords({ lat, lng });
      const nowStr = new Date().toISOString();
      setLastTime(nowStr);

      if (delivery && delivery.id) {
        try {
          const docRef = doc(db, 'entregas', delivery.id);
          await updateDoc(docRef, {
            localizacaoAtual: { lat, lng },
            ultimaAtualizacao: nowStr
          });
          setIsSharing(true);
        } catch (err: any) {
          console.error('Error writing positions to Firestore:', err);
          setGpsError('Falha ao sincronizar posição com o servidor central: ' + (err.message || 'Sem permissão'));
        }
      }
    };

    const errorCallback = (err: GeolocationPositionError) => {
      console.error('GPS WatchPosition error:', err);
      let errorMsg = 'Permissão de GPS negada. Ative a localização nas configurações do seu celular.';
      if (err.code === err.POSITION_UNAVAILABLE) {
        errorMsg = 'Sinal de GPS indisponível. Vá para um local aberto.';
      } else if (err.code === err.TIMEOUT) {
        errorMsg = 'Tempo limite esgotado ao buscar localização GPS.';
      }
      setGpsError(errorMsg);
      stopTracking();
      if (window.falarRodovar) {
        window.falarRodovar("Ocorreu um erro com o seu sinal de GPS. Por favor verifique o sinal e tente novamente.");
      }
    };

    try {
      const id = navigator.geolocation.watchPosition(successCallback, errorCallback, options);
      watchIdRef.current = id;
      setIsSharing(true);
    } catch (err: any) {
      setGpsError('Falha ao iniciar captura física: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsSharing(false);
    if (window.falarRodovar) {
      window.falarRodovar("Compartilhamento de rastreio encerrado pelo motorista.");
    }
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '---';
    try {
      return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '---';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col justify-between" id="motorista-tracking-root">
      {/* Header */}
      <header className="p-4 border-b border-zinc-900 bg-black/40 backdrop-blur">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-cyan-400 shrink-0" />
            <span className="text-xs uppercase tracking-widest font-mono text-zinc-400 font-bold">
              Painel do Motorista
            </span>
          </div>

          <button 
            onClick={onClose}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors cursor-pointer uppercase font-mono"
            id="driver-btn-back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>
        </div>
      </header>

      {/* Main Panel Content */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col gap-5 justify-center py-8">
        
        {loading && (
          <div className="text-center py-16 space-y-3" id="driver-loading-wrap">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto" />
            <p className="text-xs font-mono text-cyan-500 uppercase tracking-widest animate-pulse">
              Buscando dados da viagem...
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-6 text-center space-y-4 shadow-lg" id="driver-error-card">
            <div className="w-12 h-12 bg-red-500/15 rounded-full flex items-center justify-center text-red-400 mx-auto">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-red-400">Código Inexistente</h3>
              <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                Este link ou código de viagem não corresponde a nenhuma rota de transporte ativa no sistema Rodovar.
              </p>
            </div>
          </div>
        )}

        {!loading && delivery && (
          <div className="space-y-5 animate-fade-in" id="driver-core-view">
            
            {/* Delivery Core Identity */}
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#00E5FF] font-bold block mb-0.5">VIAGEM CONFIRMADA</span>
                  <h2 className="text-lg font-black font-mono text-white tracking-tight">{delivery.trackingCode}</h2>
                </div>
                
                {delivery.cte && (
                  <div className="text-right">
                    <span className="text-[8px] uppercase font-mono text-zinc-500 block">Nº CT-e</span>
                    <span className="text-xs font-bold font-mono text-cyan-400">{delivery.cte}</span>
                  </div>
                )}
              </div>

              {/* Rota */}
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="bg-emerald-500/15 border border-emerald-500/40 p-1.5 rounded-lg text-emerald-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="w-[1px] h-6 border-l border-dashed border-zinc-800" />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-semibold text-zinc-500 block leading-none mb-1">Local de Coleta</span>
                    <span className="text-xs font-bold text-zinc-200">{delivery.origem}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="bg-cyan-500/15 border border-cyan-500/40 p-1.5 rounded-lg text-cyan-400">
                    <MapPin className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-semibold text-zinc-500 block leading-none mb-1">Local de Entrega</span>
                    <span className="text-xs font-bold text-zinc-200">{delivery.destino}</span>
                  </div>
                </div>
              </div>

              {/* Motorista Details */}
              <div className="bg-zinc-900/40 rounded-xl p-3 border border-zinc-900/80 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-[8px] text-zinc-650 block">MOTORISTA ESCALADO:</span>
                  <span className="font-bold text-zinc-300 uppercase shrink-0 leading-none block mt-1">{delivery.motorista}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-zinc-650 block">TEL MOTORISTA:</span>
                  <span className="text-zinc-400 block mt-1">{delivery.tel_motorista}</span>
                </div>
              </div>
            </div>

            {/* Tracking Controls Button and Card */}
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-xl space-y-4">
              <h3 className="text-xs uppercase font-mono tracking-wider font-bold text-cyan-400">
                🛰️ Rastreamento via Satélite
              </h3>
              
              <p className="text-xs text-zinc-400 leading-relaxed">
                Ao ativar o rastreamento, o sistema enviará suas coordenadas geográficas de forma criptografada para a central de monitoramento da Rodovar e para o link de consulta do cliente.
              </p>

              {/* Status Indicator */}
              {isSharing ? (
                <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-4 flex items-center gap-3 text-green-400 font-mono text-xs animate-pulse">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping shrink-0" />
                  <div>
                    <span className="font-extrabold uppercase text-[11px] block text-green-400 leading-none mb-1">🟢 Compartilhando Localização</span>
                    <span className="text-[10px] text-zinc-400">Sinal enviado com sucesso em tempo real</span>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex items-center gap-3 text-zinc-500 font-mono text-xs">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-650 shrink-0" />
                  <div>
                    <span className="font-bold uppercase text-[11px] block text-zinc-500 leading-none mb-1">Compartilhamento Desativado</span>
                    <span className="text-[10px]">O cliente e o operador não podem ler seus dados de GPS</span>
                  </div>
                </div>
              )}

              {gpsError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 text-red-400 font-mono text-xs">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 animate-bounce" />
                  <div>
                    <span className="font-bold uppercase text-[11px] block leading-none mb-1 text-red-400">Erro de GPS</span>
                    <span>{gpsError}</span>
                  </div>
                </div>
              )}

              {/* Action Big Button */}
              {isSharing ? (
                <button
                  type="button"
                  onClick={stopTracking}
                  className="w-full py-4.5 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer border border-red-600/20"
                  id="driver-btn-stop-sharing"
                >
                  <StopCircle className="w-5 h-5 animate-pulse" />
                  <span>PARAR RASTREAMENTO</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startTracking}
                  className="w-full py-4.5 bg-cyan-500 hover:bg-cyan-500/90 active:scale-[0.98] text-[#0a0a0a] font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_25px_rgba(6,182,212,0.18)] flex items-center justify-center gap-2 cursor-pointer border border-cyan-500/20"
                  id="driver-btn-start-sharing"
                >
                  <Compass className="w-5 h-5 animate-spin-slow text-zinc-950" />
                  <span>ATIVAR RASTREAMENTO AO VIVO</span>
                </button>
              )}
            </div>

            {/* GPS Telemetry Info Display */}
            {isSharing && lastCoords && (
              <div className="bg-zinc-950/40 rounded-2xl border border-zinc-900 p-4.5 font-mono text-[11px] space-y-2.5">
                <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Conecção de Telemetria</span>
                <div className="flex justify-between border-b border-zinc-900 pb-1.5 text-zinc-300">
                  <span>LATITUDE:</span>
                  <span className="font-bold">{lastCoords.lat.toFixed(6)}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-900 pb-1.5 text-zinc-300">
                  <span>LONGITUDE:</span>
                  <span className="font-bold">{lastCoords.lng.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>ATUALIZADO EM:</span>
                  <span className="font-bold text-cyan-400">{formatTime(lastTime)}</span>
                </div>
              </div>
            )}
            
          </div>
        )}
        
      </main>

      {/* Footer */}
      <footer className="p-4 bg-black/40 border-t border-zinc-950 text-center font-mono text-[9px] text-zinc-650 tracking-wider">
        CENTRAL DE GERENCIAMENTO DE RISCO RODOVAR MONITORA — PROTEÇÃO TOTAL AO MOTORISTA
      </footer>
    </div>
  );
};
