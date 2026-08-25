import React, { useState, useEffect } from 'react';
import { Entrega } from '../../types';
import { CheckCircle2, Image, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playEntregueAudio } from '../../utils/audioNotification';

interface DeliveryCompletionSectionProps {
  carga: Entrega;
}

export const DeliveryCompletionSection: React.FC<DeliveryCompletionSectionProps> = ({ carga }) => {
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // 1. Música de entrega imediata e confetes na abertura da página
  useEffect(() => {
    // Dispara a música de entrega automaticamente
    playEntregueAudio(carga.trackingCode || carga.id);

    try {
      // Confetes dourados e verdes elegantes
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.55 },
        colors: ['#FFD700', '#10B981', '#F59E0B', '#FFFFFF']
      });
    } catch (err) {
      // Silent catch
    }
  }, [carga.id, carga.trackingCode]);

  // Find delivery receipts/attachments if available
  const receipts = [
    ...(carga.anexosPagamento || []).filter(a => a.tipo === 'entrega' || a.tipo === 'coleta'),
    ...(carga.documentos || []).map(d => ({
      id: d.id,
      nomeArquivo: d.nome || 'Comprovante de Entrega',
      url: d.url,
      dataUpload: d.dataUpload || ''
    }))
  ];

  return (
    <div className="space-y-6 animate-fade-in" id="delivery-completion-root">
      {/* Success Celebration Card */}
      <div className="bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 border border-emerald-500/40 rounded-3xl p-6 shadow-[0_0_35px_rgba(16,185,129,0.15)] relative overflow-hidden text-center">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-bounce">
          <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
        </div>

        <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-bold bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-700/50 inline-block mb-2">
          ENTREGA CONCLUÍDA COM SUCESSO
        </span>

        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-1">
          Mercadoria Entregue ao Destinatário
        </h2>
        
        <p className="text-xs text-zinc-400 max-w-md mx-auto">
          O veículo finalizou a rota e a documentação de recebimento foi conferida pela central de monitoramento.
        </p>
      </div>

      {/* Comprovante / Canhoto de Entrega */}
      <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-white tracking-wider">
                Comprovante & Canhoto de Entrega
              </h3>
              <span className="text-[10px] text-zinc-500 font-mono">
                Assinatura e registro fotográfico do recebimento
              </span>
            </div>
          </div>

          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded font-bold">
            CONFIRMADO
          </span>
        </div>

        {receipts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {receipts.map((rec, i) => (
              <div 
                key={rec.id || i}
                onClick={() => setSelectedProofUrl(rec.url)}
                className="bg-zinc-900/60 border border-zinc-800 hover:border-[#FFD700]/50 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer transition-all hover:bg-zinc-900 group"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[#FFD700] shrink-0 group-hover:scale-105 transition">
                    <Image className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-bold text-white block truncate">{rec.nomeArquivo}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Clique para visualizar</span>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#FFD700] underline shrink-0">Ver Foto</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900/40 border border-zinc-850 rounded-xl p-4 text-center">
            <p className="text-xs text-zinc-300 font-medium mb-1">
              📄 Canhoto Físico Assinado e Arquivado na Central
            </p>
            <p className="text-[10px] text-zinc-500 font-mono">
              Código de autenticação operacional: <strong className="text-zinc-400 font-bold">{carga.trackingCode || carga.id}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Modal for proof image zoom */}
      {selectedProofUrl && (
        <div className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full p-4 relative">
            <button
              onClick={() => setSelectedProofUrl(null)}
              className="absolute top-3 right-3 text-zinc-400 hover:text-white bg-zinc-900 px-3 py-1 rounded-lg text-xs font-mono font-bold"
            >
              Fechar
            </button>
            <h4 className="text-sm font-bold text-white mb-3">Comprovante de Entrega</h4>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-black rounded-xl">
              <img 
                src={selectedProofUrl} 
                alt="Comprovante de Entrega" 
                className="max-h-[65vh] w-auto object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


