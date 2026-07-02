import React, { useState, useEffect, useRef } from 'react';
import { dbAdapter } from '../db/databaseAdapter';
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

// Helper function to generate a perfect 2-second silent/sub-audible hum WAV file Blob dynamically.
// Playing a continuous varying wave at a sub-audible 35Hz frequency with extremely low amplitude
// establishes a fully active audio pipeline on mobile browsers without audible sound to the driver.
// This prevents mobile OS/Chrome from freezing the JS thread when minimized or the screen is off.
const generateSilentWav = (): string => {
  const sampleRate = 8000;
  const duration = 2; // 2 seconds
  const numSamples = sampleRate * duration;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  const writeString = (v: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + numSamples, true);
  /* WAVE identifier */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate */
  view.setUint32(28, sampleRate, true);
  /* block align */
  view.setUint16(32, 1, true);
  /* bits per sample */
  view.setUint16(34, 8, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* chunk length */
  view.setUint32(40, numSamples, true);

  // Generate a sub-audible 35Hz hum wave (small amplitude to guarantee inaudibility but ensure active signal)
  const freq = 35;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const val = Math.round(128 + 3 * Math.sin(2 * Math.PI * freq * t));
    view.setUint8(44 + i, val);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

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
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  
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

  // Dynamically generated silent/hum WAV track loop
  const SILENT_SOUND = generateSilentWav();

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

    const unsubscribe = dbAdapter.inscreverCargaPorCodigoRastreio(
      trackingCode,
      (cargaResult) => {
        setLoading(false);
        if (cargaResult) {
          setDelivery(cargaResult);
          setError(null);
        } else {
          setDelivery(null);
          setError(`Viagem com código ${trackingCode} não localizada na base de dados.`);
        }
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
          // Direct real-time upload via Database Adapter
          await dbAdapter.salvarCarga(activeDelivery.id, {
            localizacaoAtual: { lat, lng },
            ultimaAtualizacao: nowStr
          });
          setIsSharing(true);

          // Also save to Realtime Database to trigger immediate pulsing green "AO VIVO" indicator
          try {
            await dbAdapter.atualizarTrackingCargo(activeDelivery.id, {
              connected: true,
              lastSeen: Date.now(),
              location: {
                lat,
                lng,
                timestamp: Date.now(),
                accuracy: position.coords.accuracy || 0
              },
              status: activeDelivery.status || 'em_transito',
              updatedAt: Date.now()
            });
          } catch (rtdbErr) {
            console.error('Error writing positions to Realtime Database:', rtdbErr);
          }
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
      // Only stop tracking if permission is permanently denied (code 1)
      if (err.code === err.PERMISSION_DENIED) {
        stopTracking();
      }
      if (window.falarRodovar) {
        window.falarRodovar("Ocorreu um erro com o seu sinal de GPS. Por favor verifique o sinal e tente novamente.");
      }
    };

    try {
      // 1. Trigger user-initiated silent/hum audio keeps alive play (crucial bypass for Android/iOS tabs freeze)
      if (!audioRef.current) {
        const audio = document.createElement('audio');
        audio.src = SILENT_SOUND;
        audio.loop = true;
        audio.volume = 0.05;
        audioRef.current = audio;
      }
      audioRef.current.play().then(() => {
        console.log('Rodovar: Background silent/hum audio playback started');
      }).catch(e => console.log('Audio keep-alive allowed outline:', e));

      // 1b. Inject browser Media Session metadata to render active audio playback status bar controls
      const activeDelivery = latestDeliveryRef.current;
      if ('mediaSession' in navigator && activeDelivery) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `Rastreamento Ativo (${activeDelivery.trackingCode || 'Rodovar'})`,
            artist: 'Rodovar Monitora - Em Viagem',
            album: 'Sinal de Satélite em 2º Plano (100% Ativo)',
            artwork: [
              { src: 'https://rodovar.com.br/wp-content/uploads/2026/02/logo.png', sizes: '512x512', type: 'image/png' }
            ]
          });
          navigator.mediaSession.setActionHandler('play', () => {
            audioRef.current?.play().catch(e => console.log(e));
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            // Keep playing to ensure OS doesn't stop background context execution
            audioRef.current?.play().catch(e => console.log(e));
          });
        } catch (e) {
          console.warn('MediaSession initialization ignored:', e);
        }
      }

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

      // Sync initial active state to Realtime Database
      if (activeDelivery && activeDelivery.id) {
        dbAdapter.atualizarTrackingCargo(activeDelivery.id, {
          connected: true,
          lastSeen: Date.now(),
          status: activeDelivery.status || 'em_transito',
          updatedAt: Date.now()
        }).catch(e => console.error('Error writing initial RTDB state:', e));
      }

      setIsSharing(true);
    } catch (err: any) {
      setGpsError('Falha ao iniciar captura física: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const stopTracking = () => {
    const activeDelivery = latestDeliveryRef.current;
    if (activeDelivery && activeDelivery.id) {
      // Sync offline state to Realtime Database
      dbAdapter.atualizarTrackingCargo(activeDelivery.id, {
        connected: false,
        lastSeen: Date.now()
      }).catch(e => console.error('Error writing offline state to RTDB:', e));
    }

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

    // Clear mediaSession handlers
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
      } catch (e) {}
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
      // 1. Direct real-time upload via Database Adapter to change status to 'em_transito'
      await dbAdapter.salvarCarga(delivery.id, {
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

            {/* Background Tracking Settings Guide / Manual */}
            <div className="bg-zinc-950 rounded-2xl border border-zinc-900 overflow-hidden shadow-xl" id="bg-tracking-guide-card">
              <button
                type="button"
                onClick={() => setShowSetupGuide(!showSetupGuide)}
                className="w-full p-4 flex items-center justify-between text-left text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 hover:bg-zinc-900/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚙️</span>
                  <span>Rastrear em 2º Plano (Tela Desligada)</span>
                </div>
                <span className="text-zinc-500 font-sans text-[10px] lowercase">{showSetupGuide ? '▲ fechar' : '▼ abrir instruções'}</span>
              </button>
              
              {showSetupGuide && (
                <div className="p-4 pt-0 border-t border-zinc-900/60 space-y-4 text-xs text-zinc-400 leading-relaxed font-sans">
                  <p className="text-[11px]">
                    Para garantir que o sinal de localização não feche ou congele quando você bloquear o celular ou abrir outros aplicativos (WhatsApp, Waze, etc.), siga estas orientações rápidas:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60 space-y-1">
                      <span className="font-extrabold text-amber-400 font-mono block uppercase text-[10px]">🔋 1. SEM RESTRIÇÕES DE BATERIA</span>
                      <p className="text-[11px]">
                        Alguns aparelhos (Samsung, Xiaomi, Motorola) suspendem o Chrome com a tela apagada para economizar bateria. 
                      </p>
                      <ul className="list-disc pl-4 mt-1 text-[11px] space-y-0.5 text-zinc-300">
                        <li>Mantenha pressionado o ícone do <strong>Google Chrome</strong> e clique em <strong>"Informações do app"</strong>.</li>
                        <li>Vá em <strong>"Bateria"</strong> e selecione a opção <strong>"Sem Restrições"</strong> (ou desligue a otimização).</li>
                      </ul>
                    </div>

                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60 space-y-1">
                      <span className="font-extrabold text-[#00E5FF] font-mono block uppercase text-[10px]">📍 2. LOCALIZAÇÃO "SEMPRE PERMITIDA"</span>
                      <p className="text-[11px]">
                        Nas permissões do Chrome, certifique-se de que a Localização está configurada como <strong>"Permitir o tempo todo"</strong>. Se não existir essa opção, mantenha a tela do app ativa.
                      </p>
                    </div>

                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60 space-y-1">
                      <span className="font-extrabold text-emerald-400 font-mono block uppercase text-[10px]">🎧 3. NOSSO SISTEMA DE INFRASOM CONTÍNUO</span>
                      <p className="text-[11px]">
                        Ao ativar o rastreamento, o app passa a reproduzir um som silencioso contínuo e cria uma notificação de mídia no celular. Isso faz com que o sistema entenda que o Chrome é um tocador de música, impedindo-o de congelar a localização em 2º plano!
                      </p>
                    </div>
                  </div>
                </div>
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
