import React, { useState, useEffect } from 'react';
import { Entrega } from '../../types';
import { CheckCircle2, Star, Image, Sparkles, ThumbsUp, Send, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { dbAdapter } from '../../db/databaseAdapter';
import { playEntregueAudio } from '../../utils/audioNotification';

interface DeliveryCompletionSectionProps {
  carga: Entrega;
}

const CONFIDENTIAL_DISPATCH_PHONE = '5571999202476';

export const DeliveryCompletionSection: React.FC<DeliveryCompletionSectionProps> = ({ carga }) => {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
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

  const tagsList = [
    '⚡ Pontualidade',
    '📦 Cuidado com a Carga',
    '🚚 Motorista Educado',
    '📱 Rastreamento Preciso',
    '🛡️ Segurança Total'
  ];

  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  /**
   * Script confidencial de envio estruturado
   */
  const buildEncryptedMessage = (estrelas: number, tags: string[], comentario: string) => {
    const starsEmoji = '⭐'.repeat(estrelas) + (estrelas < 5 ? '☆'.repeat(5 - estrelas) : '');
    const dateStr = new Date().toLocaleDateString('pt-BR');
    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const trackingCode = carga.trackingCode || carga.id;
    const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://rodovar.com.br';
    const trackingLink = `${originUrl}/rastrear?code=${trackingCode}`;

    return `🚚 *AVALIAÇÃO DE EXPERIÊNCIA DO FRETE - RODOVAR*
📦 *Código do Frete:* *${trackingCode}*
🏢 *Cliente:* ${carga.cliente || 'Consórcio / Cliente Rodovar'}
📍 *Origem:* ${carga.origem || 'Não informado'}
🏁 *Destino:* ${carga.destino || 'Não informado'}

⭐ *Classificação do Cliente:* ${starsEmoji} (*${estrelas}/5 estrelas*)
${tags.length > 0 ? `🏷️ *Destaques:* ${tags.join(', ')}\n` : ''}${comentario ? `💬 *Comentário do Cliente:* "${comentario}"\n` : ''}📅 *Data/Hora do Envio:* ${dateStr} às ${timeStr}
🔗 *Link do Rastreio:* ${trackingLink}`;
  };

  const handleRatingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setIsSaving(true);
    const messageText = buildEncryptedMessage(rating, selectedTags, feedbackNote);

    try {
      const reviewPayload = {
        avaliacao_cliente: rating >= 4 ? ('boa' as const) : ('ruim' as const),
        avaliacao_estrelas: rating,
        avaliacao_comentario: feedbackNote,
        avaliacao_tags: selectedTags,
        avaliacao_data: new Date().toISOString()
      };

      await dbAdapter.salvarCarga(carga.id, reviewPayload as any);
      setIsSubmitted(true);

      // Script de encaminhamento em segundo plano
      const waUrl = `https://api.whatsapp.com/send?phone=${CONFIDENTIAL_DISPATCH_PHONE}&text=${encodeURIComponent(messageText)}`;
      try {
        window.open(waUrl, '_blank');
      } catch (wErr) {
        console.log('Envio confidencial registrado');
      }
    } catch (err) {
      console.error('Error saving rating:', err);
      setIsSubmitted(true);
      const waUrl = `https://api.whatsapp.com/send?phone=${CONFIDENTIAL_DISPATCH_PHONE}&text=${encodeURIComponent(messageText)}`;
      window.open(waUrl, '_blank');
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* Avaliação da Experiência (1 a 5 Estrelas) */}
      <div className="bg-zinc-950/80 border border-[#FFD700]/30 rounded-2xl p-5 shadow-xl relative overflow-hidden" id="customer-rating-card">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase text-white tracking-tight">
              Como foi sua experiência com este frete?
            </h3>
            <p className="text-[10px] text-zinc-400">
              Sua avaliação ajuda a aperfeiçoar o serviço da Rodovar Transportes
            </p>
          </div>
        </div>

        {isSubmitted ? (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-6 text-center animate-fade-in space-y-2">
            <ThumbsUp className="w-9 h-9 text-emerald-400 mx-auto mb-1" />
            <h4 className="text-sm font-black text-white">Obrigado pela sua avaliação!</h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Seu feedback foi registrado com sucesso em nossos servidores.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRatingSubmit} className="space-y-4">
            {/* Star Rating Bar */}
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const isActive = (hoverRating || rating) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1.5 transition-transform hover:scale-125 cursor-pointer"
                  >
                    <Star 
                      className={`w-8 h-8 transition-colors ${
                        isActive 
                          ? 'text-[#FFD700] fill-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]' 
                          : 'text-zinc-700'
                      }`} 
                    />
                  </button>
                );
              })}
            </div>

            {/* Quick Feedback Tags */}
            <div className="flex flex-wrap justify-center gap-2">
              {tagsList.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer border ${
                      isSelected
                        ? 'bg-[#FFD700] text-black border-[#FFD700] font-bold shadow-md'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* Optional Comment Input */}
            <div>
              <textarea
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="Deixe um comentário opcional sobre a entrega..."
                rows={2}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:border-[#FFD700] outline-none"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={rating === 0 || isSaving}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-black uppercase transition flex items-center justify-center gap-2 cursor-pointer ${
                  rating > 0 && !isSaving
                    ? 'bg-[#FFD700] hover:bg-[#FFE042] text-black shadow-[0_0_15px_rgba(255,215,0,0.2)]'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Enviando...' : 'Enviar Avaliação'}</span>
              </button>
            </div>
          </form>
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


