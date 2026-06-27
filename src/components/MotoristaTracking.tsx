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
  const wakeLockRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const latestDeliveryRef = useRef<Entrega | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Synchronize dynamic delivery collection state to our mutable reference to avoid React closure locks
  useEffect(() => {
    latestDeliveryRef.current = delivery;
  }, [delivery]);

  // Base64 micro silent WAV track loop (keeps browser audio context alive and prevents OS freeze)
  const SILENT_SOUND = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAAAAAA==";

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        console.log('Rodovar Monitora: Screen Wake Lock activated');
      } catch (err) {
        console.warn('Rodovar Monitora: Screen Wake Lock ignored:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch (err) {
        console.error(err);
      }
      wakeLockRef.current = null;
    }
  };

  const startWebAudioKeepAlive = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      
      // Dynamic micro synthesizer bypass: Plays infrasound at 15Hz (inaudible/sub-audible)
      // This establishes an active Media Playback Session under Android or iOS.
      // The OS will grant background CPU cycles preventing standard GPS sleep triggers.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(15, ctx.currentTime);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime); // Inaudible to human ear, fully active to mobile OS
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      oscillatorRef.current = osc;
      gainNodeRef.current = gain;
      console.log('Rodovar Monitora: Background Web Audio Synth loop established');
    } catch (err) {
      console.warn('Rodovar Monitora: Background audio context exception ignored:', err);
    }
  };

  // Automated visibility listener: re-request lock if screen lights back up or tab is foregrounded
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isSharing) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSharing]);

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
      // Clean up watch position and locks on unmount
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      releaseWakeLock();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
        } catch (e) {}
        oscillatorRef.current = null;
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {}
        audioCtxRef.current = null;
      }
    };
  }, [trackingCode]);

  // Handle Geolocation Sharing (With multi-layered anti-sleep hacks for background tracking)
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

      const activeDelivery = latestDeliveryRef.current;
      if (activeDelivery && activeDelivery.id) {
        try {
          // Direct real-time upload to Firestore
          const docRef = doc(db, 'entregas', activeDelivery.id);
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
      // We do not silently stop tracking on temporary timeouts to ensure continuous tracing attempt
      if (err.code !== err.TIMEOUT) {
        stopTracking();
      }
      if (window.falarRodovar) {
        window.falarRodovar("Ocorreu um erro com o seu sinal de GPS. Por favor verifique o sinal e tente novamente.");
      }
    };

    try {
      // 1. Trigger user-initiated silent audio keeps alive play (crucial bypass for Android/iOS tabs freeze)
      if (!audioRef.current) {
        const audio = document.createElement('audio');
        audio.src = SILENT_SOUND;
        audio.loop = true;
        audio.volume = 0.05;
        audioRef.current = audio;
      }
      audioRef.current.play().catch(e => console.log('Audio keep-alive allowed outline:', e));

      // 2. Trigger infrasound Web Audio API Session to secure high-priority background execution in mobile browsers
      startWebAudioKeepAlive();

      // 3. Trigger user-initiated screen wake lock (prevents phone lock and sensor standby)
      requestWakeLock();

      // 4. Start active streaming watchPosition listener
      const id = navigator.geolocation.watchPosition(successCallback, errorCallback, options);
      watchIdRef.current = id;

      // 4b. Fetch initial position immediately to register coordinates instantly
      navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);

      // 5. Build an aggressive double heartbeat. Many mobile browsers sleep passive watchPosition callbacks if screen is off.
      // Launching active getCurrentPosition calls every 25 seconds requests direct hardware satellite refresh.
      heartbeatIntervalRef.current = setInterval(() => {
        if (navigator.geolocation && watchIdRef.current !== null) {
          navigator.geolocation.getCurrentPosition(
            successCallback, 
            (fallbackErr) => {
              console.warn('Rodovar Background: Fallback active GPS heartrate pulse skipped:', fallbackErr.message);
            }, 
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          );
        }
      }, 25000);

      setIsSharing(true);
    } catch (err: any) {
      setGpsError('Falha ao iniciar captura física: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const stopTracking = () => {
    // Clear GPS watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    // Clear Redundant Heartbeat Fallback
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    setIsSharing(false);
    
    // Release keeps alive audio and screen wake locks
    releaseWakeLock();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Release and stop background Web Audio context
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {}
      oscillatorRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
    }

    if (window.falarRodovar) {
      window.falarRodovar("Compartilhamento de rastreio encerrado pelo motorista.");
    }
  };

  const getLabelForStatus = (st: string): string => {
    const labels: Record<string, string> = {
      coletando: 'Coletando 📦',
      em_transito: 'Trânsito 🚚',
      parado: 'Parado 🛑',
      descarregando: 'Descarregando 🏢',
      entregue: 'Entregue ✅'
    };
    return labels[st] || st;
  };

  const handleRestartJourney = async () => {
    if (!delivery || !delivery.id) return;
    try {
      // 1. Direct real-time upload to Firestore to change status to 'em_transito'
      const docRef = doc(db, 'entregas', delivery.id);
      await updateDoc(docRef, {
        status: 'em_transito',
        updated_at: new Date().toISOString()
      });
      
      // 2. Activate tracking instantly
      startTracking();
      
      if (window.falarRodovar) {
        window.falarRodovar("Viagem iniciada com sucesso! Rastreamento de localização ativado e atualizando no mapa.");
      }
    } catch (err: any) {
      console.error('Error restarting journey:', err);
      setGpsError('Falha ao reiniciar viagem no servidor central: ' + (err.message || 'Sem permissão'));
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
            
            {/* Status Banner */}
            <div className="bg-zinc-950 p-4.5 rounded-2xl border border-zinc-900 shadow-xl flex items-center justify-between gap-3" id="driver-status-banner">
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 font-bold">Status Atual da Viagem:</span>
              <span className={`px-3 py-1 rounded-full text-xs font-mono font-black uppercase ${
                delivery.status === 'coletando' ? 'bg-blue-950/55 text-blue-400 border border-blue-900/40' :
                delivery.status === 'em_transito' ? 'bg-yellow-950/55 text-[#FFD600] border border-yellow-900/40' :
                delivery.status === 'parado' ? 'bg-red-950/55 text-red-400 border border-red-900/40' :
                delivery.status === 'descarregando' ? 'bg-purple-950/55 text-purple-400 border border-purple-900/40' :
                'bg-emerald-950/55 text-emerald-400 border border-emerald-900/40'
              }`}>
                {getLabelForStatus(delivery.status)}
              </span>
            </div>
            
            {/* Delivery Core Identity */}
            <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#00E5FF] font-bold block mb-0.5">VIAGEM CONFIRMADA</span>
                  <h2 className="text-lg font-black font-mono text-white tracking-tight">{delivery.trackingCode}</h2>
                </div>
                
                {delivery.cte && (
                  <div className="text-right flex flex-col items-end gap-1 max-w-[200px]">
                    <span className="text-[8px] uppercase font-mono text-zinc-500 block leading-none mb-0.5">
                      {delivery.cte.includes(',') || delivery.cte.includes(';') ? 'Nºs CT-es' : 'Nº CT-e'}
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {delivery.cte.split(/[,;]+/).map(c => c.trim()).filter(Boolean).map((item, idx) => (
                        <span 
                          key={idx} 
                          className="text-[10px] font-black font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20 leading-tight block text-right"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
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
              {delivery?.status === 'coletando' || delivery?.status === 'parado' ? (
                <div className="space-y-2" id="driver-restart-btn-container">
                  <button
                    type="button"
                    onClick={handleRestartJourney}
                    className="w-full py-4.5 bg-[#FFD600] hover:bg-[#ffe23b] active:scale-[0.98] text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_25px_rgba(255,214,0,0.25)] flex items-center justify-center gap-2 cursor-pointer border border-[#FFD600]/20 animate-pulse"
                    id="driver-btn-recomecar"
                  >
                    <Play className="w-5 h-5 text-black fill-black" />
                    <span>RECOMEÇAR VIAGEM</span>
                  </button>
                  <p className="text-[10px] text-zinc-500 font-mono text-center bg-zinc-950/80 p-2.5 border border-zinc-900 rounded-xl leading-relaxed select-none">
                    Clique acima para iniciar/retomar a viagem. O sistema passará o status para Trânsito 🚚 e atualizará seu GPS em tempo real no mapa.
                  </p>
                </div>
              ) : isSharing ? (
                <div className="space-y-2" id="driver-stop-sharing-btn-container">
                  <button
                    type="button"
                    disabled={delivery?.status !== 'entregue'}
                    onClick={stopTracking}
                    className={`w-full py-4.5 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 border ${
                      delivery?.status === 'entregue' 
                        ? 'bg-red-600 hover:bg-red-700 border-red-600/20 cursor-pointer' 
                        : 'bg-zinc-800 border-zinc-700/50 cursor-not-allowed opacity-60'
                    }`}
                    id="driver-btn-stop-sharing"
                  >
                    <StopCircle className="w-5 h-5 animate-pulse" />
                    <span>PARAR RASTREAMENTO</span>
                  </button>
                  {delivery?.status !== 'entregue' && (
                    <p className="text-[10px] text-zinc-500 font-mono text-center bg-zinc-950/80 p-2.5 border border-zinc-900 rounded-xl leading-relaxed select-none" id="tracking-security-protocol-info">
                      ⚠️ RASTREAMENTO COMPULSÓRIO EM TRÂNSITO<br />
                      Bloqueado por protocolo de segurança da Rodovar até a confirmação de chegada no destino final (Status: Entregue).
                    </p>
                  )}
                </div>
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
