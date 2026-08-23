import React, { useState } from 'react';
import { Entrega } from '../../types';
import { Bell, MessageSquare, Copy, Check, X, Send, Share2, Smartphone } from 'lucide-react';

interface TrackingNotificationModalProps {
  carga: Entrega;
  isOpen: boolean;
  onClose: () => void;
}

export const TrackingNotificationModal: React.FC<TrackingNotificationModalProps> = ({
  carga,
  isOpen,
  onClose
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'all'>('current');
  const [phoneNumber, setPhoneNumber] = useState(carga.tel_cliente || '');
  const [subscribedSuccess, setSubscribedSuccess] = useState(false);

  if (!isOpen) return null;

  const trackingLink = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?code=${carga.trackingCode || carga.id}`
    : `https://rodovar.com.br/rastrear?code=${carga.trackingCode || carga.id}`;

  const clienteName = carga.cliente || 'Prezado Cliente';
  const trackingCode = carga.trackingCode || carga.id;
  const origem = carga.origem || 'Origem';
  const destino = carga.destino || 'Destino';

  // Templates for each status
  const templates = [
    {
      key: 'coletando',
      statusName: 'Coletando',
      emoji: '📦',
      color: 'text-blue-400 border-blue-500/30 bg-blue-950/20',
      title: 'Etapa 1: Coleta Realizada',
      text: `📦 *RODOVAR LOGÍSTICA*\nOlá, *${clienteName}*!\n\nSeu frete código *${trackingCode}* está na fase de *Coleta* em *${origem}*.\nPrevisão de início de viagem em breve.\n\nAcompanhe seu frete ao vivo pelo link:\n👉 ${trackingLink}`
    },
    {
      key: 'em_transito',
      statusName: 'Em Trânsito',
      emoji: '🚚',
      color: 'text-yellow-400 border-yellow-500/30 bg-yellow-950/20',
      title: 'Etapa 2: Veículo em Viagem',
      text: `🚚 *RODOVAR LOGÍSTICA*\nOlá, *${clienteName}*!\n\nSeu frete *${trackingCode}* já iniciou a viagem rodoviária com destino a *${destino}*.\nO veículo está sendo monitorado em tempo real via satélite.\n\nAcesse o mapa e a linha do tempo:\n👉 ${trackingLink}`
    },
    {
      key: 'parado',
      statusName: 'Parada Programada',
      emoji: '🛑',
      color: 'text-red-400 border-red-500/30 bg-red-950/20',
      title: 'Etapa 3: Parada de Descanso / Fiscalização',
      text: `🛑 *RODOVAR LOGÍSTICA*\nOlá, *${clienteName}*!\n\nInformamos que o veículo do frete *${trackingCode}* realizou uma *Parada Programada* para descanso/fiscalização dentro da rota para *${destino}*.\nO cronograma segue sob monitoramento 24h.\n\nVerifique a posição:\n👉 ${trackingLink}`
    },
    {
      key: 'descarregando',
      statusName: 'Descarregando',
      emoji: '🏢',
      color: 'text-purple-400 border-purple-500/30 bg-purple-950/20',
      title: 'Etapa 4: Chegada ao Destino',
      text: `🏢 *RODOVAR LOGÍSTICA*\nOlá, *${clienteName}*!\n\nO veículo do frete *${trackingCode}* já chegou em *${destino}* e está no processo de *Descarga e Conferência*.\n\nAcompanhe a finalização:\n👉 ${trackingLink}`
    },
    {
      key: 'entregue',
      statusName: 'Entregue',
      emoji: '✅',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20',
      title: 'Etapa 5: Entrega Concluída',
      text: `✅ *RODOVAR LOGÍSTICA*\nOlá, *${clienteName}*!\n\nSua entrega referente ao código *${trackingCode}* foi *CONCLUÍDA COM SUCESSO* em *${destino}*!\nO canhoto e o comprovante já foram registrados em nosso sistema.\n\nAgradecemos a preferência! Consulte o comprovante:\n👉 ${trackingLink}`
    }
  ];

  const currentTemplate = templates.find(t => t.key === carga.status) || templates[1];

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSendWhatsApp = (text: string) => {
    const cleanTel = phoneNumber.replace(/\D/g, '');
    const waUrl = cleanTel 
      ? `https://wa.me/55${cleanTel}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribedSuccess(true);
    setTimeout(() => setSubscribedSuccess(false), 5000);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-xl p-5 sm:p-6 shadow-2xl relative my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700] block">
                NOTIFICAÇÕES AUTOMÁTICAS
              </span>
              <h2 className="text-lg font-black text-white tracking-tight">
                Avisos por WhatsApp & SMS
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subscribe for Instant Alerts */}
        <div className="bg-zinc-900/60 border border-zinc-850 rounded-2xl p-4 mb-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 mb-1 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-[#FFD700]" />
            Receber atualizações automáticas neste celular
          </h4>
          <p className="text-xs text-zinc-400 mb-3">
            Cadastre seu WhatsApp para receber o aviso instantâneo a cada mudança no percurso.
          </p>

          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="(DD) 99999-9999"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:border-[#FFD700] outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#FFD700] hover:bg-[#FFE042] text-black font-bold text-xs uppercase rounded-xl transition cursor-pointer shadow-md"
            >
              Ativar Avisos
            </button>
          </form>

          {subscribedSuccess && (
            <p className="text-xs text-emerald-400 font-mono mt-2 flex items-center gap-1.5 animate-fade-in">
              <Check className="w-4 h-4" /> Alertas ativados com sucesso para este frete!
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-900 mb-4 gap-2">
          <button
            onClick={() => setActiveTab('current')}
            className={`pb-2 px-3 text-xs font-bold uppercase transition border-b-2 cursor-pointer ${
              activeTab === 'current'
                ? 'border-[#FFD700] text-[#FFD700]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Etapa Atual ({currentTemplate.statusName})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-2 px-3 text-xs font-bold uppercase transition border-b-2 cursor-pointer ${
              activeTab === 'all'
                ? 'border-[#FFD700] text-[#FFD700]'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Todos os Templates (5 Etapas)
          </button>
        </div>

        {/* Template List */}
        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
          {(activeTab === 'current' ? [currentTemplate] : templates).map((t) => (
            <div key={t.key} className={`border rounded-2xl p-4 bg-zinc-950/70 ${t.color}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black uppercase tracking-tight flex items-center gap-1.5">
                  <span>{t.emoji}</span>
                  <span>{t.title}</span>
                </span>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(t.text, t.key)}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                    title="Copiar mensagem"
                  >
                    {copiedKey === t.key ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(t.text)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-md transition cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Message Box */}
              <pre className="bg-zinc-950 p-3 rounded-xl border border-zinc-900 text-zinc-300 text-xs font-sans whitespace-pre-wrap leading-relaxed select-all">
                {t.text}
              </pre>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-zinc-900 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
