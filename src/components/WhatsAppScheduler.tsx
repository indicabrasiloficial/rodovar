import { useState, useEffect, FormEvent } from 'react';
import { Entrega, ScheduledMessage } from '../types';
import { getEntregas, getScheduledMessages, saveScheduledMessage, deleteScheduledMessage } from '../db/storage';
import { 
  Calendar, 
  Clock, 
  Send, 
  Trash2, 
  PlusCircle, 
  CheckCircle, 
  X, 
  MessageSquare, 
  User, 
  AlertCircle,
  AlertTriangle,
  FileCheck,
  Check,
  Smartphone,
  ExternalLink,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function WhatsAppScheduler() {
  const [scheduledList, setScheduledList] = useState<ScheduledMessage[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  
  // New States for Categories Broadcast Panel
  const [activeRightTab, setActiveRightTab] = useState<'agenda' | 'categorias'>('agenda');
  const [categoryTab, setCategoryTab] = useState<'coletas' | 'transito'>('coletas');
  const [broadcastTemplate, setBroadcastTemplate] = useState('Olá {motorista}! Monitoramento Rodovar na escuta. Por favor informe seu status atual no trajeto para {destino}. Obrigado!');

  // Form states
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [recipientType, setRecipientType] = useState<'motorista' | 'cliente'>('motorista');
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [customText, setCustomText] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Load lists
  const loadData = () => {
    setEntregas(getEntregas());
    setScheduledList(getScheduledMessages());
  };

  useEffect(() => {
    loadData();

    // Set default datetime to 1 hour from now formatted
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const tzoffset = now.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(now.getTime() - tzoffset)).toISOString().slice(0, 16);
    setScheduledDateTime(localISOTime);
  }, []);

  // Update templates depending on delivery/recipient selection
  const selectedDelivery = entregas.find(e => e.id === selectedDeliveryId);

  useEffect(() => {
    if (selectedDeliveryId === 'BULK_COLETAS') {
      if (recipientType === 'motorista') {
        setCustomText(
          'Olá {motorista}! Aqui é o Agente Rodovar monitorando seu veículo em fase de Coleta de carga para {destino}. Por favor, nos informe se a coleta já foi concluída e se já iniciou viagem. Obrigado e bom trabalho!'
        );
      } else {
        setCustomText(
          'Prezados da {cliente}! Informamos que a coleta de sua carga com destino a {destino} está em andamento. O motorista {motorista} já se encontra no local pronto para carregar.'
        );
      }
    } else if (selectedDeliveryId === 'BULK_TRANSITO') {
      if (recipientType === 'motorista') {
        setCustomText(
          'Bom dia {motorista}!\n\nPor favor, envie sua localização atual para acompanhamento da viagem.\n\nObrigado e tenha um excelente dia!'
        );
      } else {
        setCustomText(
          'Prezados da {cliente}! Sua carga conduzida pelo motorista {motorista} segue em Trânsito regular sentido {destino}. Nova previsão disponível em nosso painel.'
        );
      }
    } else if (selectedDelivery) {
      if (recipientType === 'motorista') {
        setCustomText(
          `Bom dia, ${selectedDelivery.motorista}!\n\nPor favor, envie sua localização atual para acompanhamento da viagem.\n\nObrigado e tenha um excelente dia!`
        );
      } else {
        setCustomText(
          `Prezados da ${selectedDelivery.cliente}! Gostaríamos de informar que a entrega de sua carga saindo de ${selectedDelivery.origem} está programada. O motorista ${selectedDelivery.motorista} está sob monitoramento e o prazo limite é ${selectedDelivery.prazo}.`
        );
      }
    } else {
      setCustomText('');
    }
  }, [selectedDeliveryId, recipientType]);

  const handleTemplateChange = (type: string) => {
    const isBulk = selectedDeliveryId === 'BULK_COLETAS' || selectedDeliveryId === 'BULK_TRANSITO';

    if (isBulk) {
      let bulkTemplate = '';
      switch (type) {
        case 'loc':
          bulkTemplate = 'Bom dia {motorista}!\n\nPor favor, envie sua localização atual para acompanhamento da viagem.\n\nObrigado e tenha um excelente dia!';
          break;
        case 'atraso':
          bulkTemplate = 'Aviso importante de Logística Rodovar: A carga conduzida pelo motorista {motorista} com destino a {destino} sofreu atrasos térmicos/de trânsito regulamentares. Nova previsão sendo recalculada.';
          break;
        case 'canhoto':
          bulkTemplate = 'Olá {motorista}! Tudo bem? Não se esqueça de solicitar o canhoto assinado na descarga em {destino} e nos enviar a foto nítida por aqui. Bom trabalho!';
          break;
        case 'coleta':
          bulkTemplate = 'Prezados, confirmamos que o veículo do motorista {motorista} está na fila de coleta em {origem}. Em breve iniciaremos o percurso até {destino}.';
          break;
        default:
          bulkTemplate = '';
      }
      setCustomText(bulkTemplate);
      return;
    }

    if (!selectedDelivery) return;

    let template = '';
    const driver = selectedDelivery.motorista;
    const client = selectedDelivery.cliente;
    const dest = selectedDelivery.destino;
    const origin = selectedDelivery.origem;
    const prazo = selectedDelivery.prazo;

    switch (type) {
      case 'loc':
        template = `Bom dia, ${driver}!\n\nPor favor, envie sua localização atual para acompanhamento da viagem.\n\nObrigado e tenha um excelente dia!`;
        break;
      case 'atraso':
        template = `Aviso importante de Logística Rodovar: A carga conduzida por ${driver} com destino ao cliente ${client} sofreu atrasos térmicos/de tráfego regulamentares. Nova previsão sendo recalculada.`;
        break;
      case 'canhoto':
        template = `Olá ${driver}! Tudo bem? Não se esqueça de solicitar o canhoto assinado na descarga da mercadoria em ${dest} e nos enviar a foto nítida por aqui. Bom trabalho!`;
        break;
      case 'coleta':
        template = `Prezados, confirmamos que o veículo do motorista ${driver} está na fila de coleta em ${origin}. Em breve iniciaremos o percurso até o destino.`;
        break;
      default:
        template = '';
    }
    setCustomText(template);
  };

  const handleSaveSchedule = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId) {
      setFeedback({ success: false, message: 'Por favor, selecione uma carga monitorada.' });
      return;
    }
    if (!scheduledDateTime) {
      setFeedback({ success: false, message: 'Por favor, defina um dia e hora para o envio.' });
      return;
    }
    if (!customText.trim()) {
      setFeedback({ success: false, message: 'A mensagem não pode ser vazia.' });
      return;
    }

    const isBulk = selectedDeliveryId === 'BULK_COLETAS' || selectedDeliveryId === 'BULK_TRANSITO';

    if (isBulk) {
      const targetStatusList = selectedDeliveryId === 'BULK_COLETAS' 
        ? ['coletando', 'parado'] 
        : ['em_transito'];

      const targetDeliveries = entregas.filter(del => targetStatusList.includes(del.status) && !del.etapasOperador?.e12);
      
      if (targetDeliveries.length === 0) {
        setFeedback({ 
          success: false, 
          message: `Nenhum motorista ativo encontrado na categoria selecionada (${selectedDeliveryId === 'BULK_COLETAS' ? 'Coletas' : 'Trânsito'}).` 
        });
        return;
      }

      // Schedule for each target delivery
      targetDeliveries.forEach(delivery => {
        const recipientName = recipientType === 'motorista' ? delivery.motorista : delivery.cliente;
        const recipientPhone = recipientType === 'motorista' ? delivery.tel_motorista : delivery.tel_cliente;

        // Personalize the text for this driver
        const personalizedText = customText
          .replace(/{motorista}/g, delivery.motorista)
          .replace(/{destino}/g, delivery.destino)
          .replace(/{origem}/g, delivery.origem)
          .replace(/{cliente}/g, delivery.cliente)
          .replace(/{prazo}/g, delivery.prazo);

        const newSchedule = {
          deliveryId: delivery.id,
          deliveryDriver: delivery.motorista,
          deliveryDestiny: delivery.destino,
          recipientName,
          recipientPhone,
          recipientType,
          scheduledTime: scheduledDateTime,
          messageText: personalizedText,
          status: 'pendente' as const
        };

        saveScheduledMessage(newSchedule);
      });

      setFeedback({ 
        success: true, 
        message: `Programação agendada com sucesso para ${targetDeliveries.length} motoristas!` 
      });
      setSelectedDeliveryId('');
      setTimeout(() => {
        setFeedback(null);
        loadData();
      }, 1500);

    } else {
      const delivery = entregas.find(e => e.id === selectedDeliveryId)!;
      const recipientName = recipientType === 'motorista' ? delivery.motorista : delivery.cliente;
      const recipientPhone = recipientType === 'motorista' ? delivery.tel_motorista : delivery.tel_cliente;

      const newSchedule = {
        deliveryId: delivery.id,
        deliveryDriver: delivery.motorista,
        deliveryDestiny: delivery.destino,
        recipientName,
        recipientPhone,
        recipientType,
        scheduledTime: scheduledDateTime,
        messageText: customText,
        status: 'pendente' as const
      };

      saveScheduledMessage(newSchedule);
      setFeedback({ success: true, message: 'Programação de mensagem salva com sucesso!' });
      
      // Reset selection defaults
      setSelectedDeliveryId('');
      setTimeout(() => {
        setFeedback(null);
        loadData();
      }, 1500);
    }
  };

  const handleDelete = (id: string) => {
    setCancelConfirmId(id);
  };

  const triggerSendMessage = (sch: ScheduledMessage) => {
    // Fire Web WhatsApp link
    const cleanPhone = sch.recipientPhone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(sch.messageText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    // Update state to enviado
    saveScheduledMessage({
      id: sch.id,
      status: 'enviado'
    });
    
    setTimeout(() => loadData(), 500);
  };

  return (
    <div className="space-y-6">
      
      {/* Visual Banner introduction */}
      <div className="bg-[#121212] border border-zinc-800 rounded-xl p-6 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono font-bold uppercase rounded-md flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              Agente Rodovar Conectado
            </span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold font-sans tracking-tight">
            Programação e Disparo de WhatsApp
          </h2>
          <p className="text-sm text-gray-400 max-w-2xl">
            Programe avisos automáticos e lembretes para motoristas e clientes. O Agente Rodovar analisa as janelas de entrega e avisa no horário exato para você abrir o WhatsApp com a mensagem pronta.
          </p>
        </div>

        {/* Decorative Image container */}
        <div className="hidden lg:block">
          <div className="relative p-2 bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center w-28 h-28">
            <img 
              src="https://rodovar.com.br/wp-content/uploads/2026/03/Sua_carga_em_primeiro_lugar_-removebg-preview.png"
              alt="Agente Rodovar"
              className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(255,214,0,0.2)]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Schedule Form */}
        <div className="lg:col-span-5 bg-[#121212] border border-zinc-800 p-5 rounded-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
            <PlusCircle className="w-4 h-4 text-[#FFD600]" />
            <h3 className="font-bold text-sm uppercase tracking-wider font-sans">Nova Programação</h3>
          </div>

          <form onSubmit={handleSaveSchedule} className="space-y-4">
            
            {/* Delivery selection drop */}
            <div>
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Escolher Carga de Destino</label>
              <select
                value={selectedDeliveryId}
                onChange={(e) => setSelectedDeliveryId(e.target.value)}
                className="w-full bg-[#0a0a0a] border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFD600]"
                required
              >
                <option value="">-- Selecionar Carga Monitorada --</option>
                <optgroup label="Disparo em Massa (Por Categoria)">
                  <option value="BULK_COLETAS">📢 [TODOS OS MOTORISTAS] - Categoria: Coletas</option>
                  <option value="BULK_TRANSITO">📢 [TODOS OS MOTORISTAS] - Categoria: Trânsito</option>
                </optgroup>
                <optgroup label="Cargas Individuais">
                  {entregas.filter(e => e.status !== 'entregue' && !e.etapasOperador?.e12).map(e => (
                    <option key={e.id} value={e.id}>
                      {e.motorista} ➔ {e.destino} ({e.status === 'em_transito' ? 'Trânsito' : e.status === 'parado' ? 'Parado' : 'Coletando'})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Recipient select */}
            <div>
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Destinatário da Mensagem</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientType('motorista')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    recipientType === 'motorista'
                      ? 'bg-zinc-800 text-[#FFD600] border-[#FFD600]'
                      : 'bg-zinc-900/40 text-gray-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Motorista
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('cliente')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    recipientType === 'cliente'
                      ? 'bg-zinc-800 text-[#FFD600] border-[#FFD600]'
                      : 'bg-zinc-900/40 text-gray-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Cliente
                </button>
              </div>
            </div>

            {/* Template Assist Buttons */}
            {selectedDeliveryId && (
              <div className="space-y-1">
                <label className="block text-[10px] font-mono text-zinc-500 uppercase">Sugestões de Mensagem</label>
                <div className="flex flex-wrap gap-1.5 pb-2">
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('loc')}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-gray-300 transition"
                  >
                    📍 Localização
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('atraso')}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-gray-300 transition"
                  >
                    ⚠️ Aviso Atraso
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('canhoto')}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-gray-300 transition"
                  >
                    📋 Cobrar Canhoto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateChange('coleta')}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-gray-300 transition"
                  >
                    🚚 Entrada Coleta
                  </button>
                </div>
              </div>
            )}

            {/* Scheduled Date/Time selection */}
            <div>
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Data e Hora de Envio</label>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFD600]"
                  required
                />
              </div>
            </div>

            {/* Custom text */}
            <div>
              <label className="block text-xs font-mono text-zinc-400 uppercase tracking-wider mb-1.5">Conteúdo da Mensagem (WhatsApp)</label>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={5}
                className="w-full bg-[#0a0a0a] border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFD600] font-sans resize-none"
                placeholder="Insira o texto da mensagem..."
                required
                disabled={!selectedDeliveryId}
              />
            </div>

            {/* Actions and feedback feedback */}
            <AnimatePresence>
              {feedback && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-3 rounded text-xs font-semibold ${
                    feedback.success 
                      ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' 
                      : 'bg-red-950/40 text-red-400 border border-red-900/40'
                  }`}
                >
                  {feedback.message}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={!selectedDeliveryId}
              className="w-full py-2 bg-[#FFD600] hover:bg-[#ffe23b] disabled:opacity-40 disabled:hover:bg-[#FFD600] text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-lg transition-all cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.15)]"
            >
              Programar Alerta Zap
            </button>

          </form>
        </div>

        {/* Right Side: List of upcoming schedules OR Category Broadcast List */}
        <div className="lg:col-span-7 bg-[#121212] border border-zinc-800 p-5 rounded-xl flex flex-col justify-between space-y-4">
          
          {/* Header and main tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#FFD600]" />
              <h3 className="font-bold text-sm uppercase tracking-wider font-sans">Controles de Envio Zap</h3>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveRightTab('agenda')}
                className={`px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider rounded-lg border transition-all flex items-center gap-1 cursor-pointer uppercase ${
                  activeRightTab === 'agenda'
                    ? 'bg-zinc-800 text-[#FFD600] border-[#FFD600]'
                    : 'bg-zinc-900/40 text-gray-400 border-zinc-800 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Agenda Geral
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('categorias')}
                className={`px-3 py-1.5 text-[11px] font-bold font-mono tracking-wider rounded-lg border transition-all flex items-center gap-1 cursor-pointer uppercase ${
                  activeRightTab === 'categorias'
                    ? 'bg-zinc-800 text-[#FFD600] border-[#FFD600]'
                    : 'bg-zinc-900/40 text-gray-400 border-zinc-800 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Por Categoria
              </button>
            </div>
          </div>

          {activeRightTab === 'agenda' ? (
            // ================== GENERAL AGENDA VIEW ==================
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between bg-zinc-900/10 border border-zinc-800/40 px-3 py-2 rounded-lg">
                <span className="text-xs font-mono text-zinc-400">Mensagens agendadas cronologicamente</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-850 px-2 py-0.5 rounded border border-zinc-800 flex items-center gap-1">
                  {scheduledList.filter(s => s.status === 'pendente').length} Pendentes
                </span>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[480px] space-y-3 min-h-[300px] pr-1">
                {scheduledList.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs font-mono">
                    Nenhum envio programado no momento. Use o painel ao lado para registrar.
                  </div>
                ) : (
                  scheduledList.map((item) => {
                    const triggerTime = new Date(item.scheduledTime);
                    const isOverdue = triggerTime.getTime() <= Date.now() && item.status === 'pendente';
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`p-3.5 rounded-lg border transition-all flex flex-col justify-between gap-3 ${
                          item.status === 'enviado'
                            ? 'bg-emerald-950/5 border-emerald-900/20 opacity-70'
                            : isOverdue
                            ? 'bg-yellow-950/10 border-yellow-800/40 shadow-[0_0_10px_rgba(255,100,0,0.05)]'
                            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-bold text-gray-200">{item.recipientName}</span>
                              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 rounded text-zinc-400 font-mono">
                                {item.recipientType === 'motorista' ? 'Motorista 🚚' : 'Cliente 🏢'}
                              </span>
                              <span className="text-zinc-600 font-mono text-[9px]">• carga para: {item.deliveryDestiny}</span>
                            </div>
                            
                            {/* Message Preview */}
                            <p className="text-zinc-300 text-xs font-sans leading-relaxed italic bg-black/20 p-2 rounded-md border border-zinc-900 mt-1">
                              "{item.messageText}"
                            </p>
                          </div>

                          {/* Status Badges */}
                          <div className="flex flex-col items-end gap-1.5 font-mono text-[9px]">
                            {item.status === 'pendente' ? (
                              isOverdue ? (
                                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 font-bold rounded animate-pulse">
                                  ⏳ PRONTO PARA AGIR
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                                  AGENDADO
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" /> ENVIADO
                              </span>
                            )}

                            {/* Trigger Datetime speaking */}
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-600" />
                              <span>{triggerTime.toLocaleDateString('pt-BR')} {triggerTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom controller row */}
                        <div className="flex justify-between items-center border-t border-zinc-900/60 pt-2.5">
                          <span className="text-[10px] font-mono text-zinc-500">
                            Tel: <span className="text-zinc-400 font-bold">55 {item.recipientPhone}</span>
                          </span>

                          <div className="flex items-center gap-2">
                            {item.status === 'pendente' && (
                              <button
                                onClick={() => triggerSendMessage(item)}
                                className={`px-3 py-1 text-[11px] font-bold font-mono rounded cursor-pointer transition-all flex items-center gap-1 ${
                                  isOverdue
                                    ? 'bg-[#FFD600] text-black shadow-[0_0_10px_rgba(255,214,0,0.3)] animate-bounce font-extrabold'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                                }`}
                              >
                                <Send className="w-3 h-3" />
                                Disparar Zap {isOverdue && 'Agora!'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-950/20 rounded transition cursor-pointer"
                              title="Excluir agendamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            // ================== CATEGORIES DIRECT LAUNCHER VIEW ==================
            <div className="flex-1 flex flex-col space-y-4">
              
              {/* Category sub-tabs */}
              <div className="flex items-center justify-between bg-zinc-900/20 border border-zinc-800/65 p-2 rounded-lg">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCategoryTab('coletas')}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-bold tracking-wider uppercase transition cursor-pointer border ${
                      categoryTab === 'coletas'
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 font-black'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-gray-200'
                    }`}
                  >
                    📦 Coletas ({entregas.filter(e => e.status === 'coletando' || e.status === 'parado').length})
                  </button>
                  <button
                    onClick={() => setCategoryTab('transito')}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-bold tracking-wider uppercase transition cursor-pointer border ${
                      categoryTab === 'transito'
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 font-black'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-gray-200'
                    }`}
                  >
                    🚚 Trânsito ({entregas.filter(e => e.status === 'em_transito' && !e.etapasOperador?.e12).length})
                  </button>
                </div>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest hidden sm:inline">
                  Frota Programada
                </span>
              </div>

              {/* Broadcast Message Customizer Widget */}
              <div className="bg-zinc-900/40 border border-zinc-800 p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-extrabold text-[#FFD600]">
                    Modelo de Mensagem da Categoria
                  </label>
                  <span className="text-[9px] font-mono text-zinc-500">
                    Use tags: {'{motorista}'}, {'{destino}'}, {'{cliente}'}
                  </span>
                </div>
                
                <textarea
                  value={broadcastTemplate}
                  onChange={(e) => setBroadcastTemplate(e.target.value)}
                  rows={2}
                  className="w-full bg-black/45 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none font-sans resize-none leading-relaxed"
                  placeholder="Olá {motorista}! Monitoramento Rodovar na escuta..."
                />
                
                <div className="flex gap-1.5 flex-wrap items-center">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase">Sugestões rápidas:</span>
                  <button
                    type="button"
                    onClick={() => setBroadcastTemplate(categoryTab === 'coletas' 
                      ? 'Olá {motorista}! Tudo bem? A equipe Rodovar notou que você está em fase de coleta para {destino}. Consegue nos informar se o carregamento já foi finalizado? Obrigado!'
                      : 'Olá {motorista}! Aqui é do Monitoramento Rodovar. Por favor, nos forneça um ponto de referência do veículo em rota para {destino} no momento. Obrigado e boa viagem!'
                    )}
                    className="px-2 py-0.5 bg-zinc-950 hover:bg-zinc-900 rounded text-[9px] font-mono text-zinc-400 border border-zinc-805 hover:text-white transition cursor-pointer"
                  >
                    📋 Cobrar Status
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastTemplate(categoryTab === 'coletas'
                      ? 'Olá {motorista}! Favor nos enviar sua localização atualizada em tempo real no local de coleta.'
                      : 'Olá {motorista}! Favor nos enviar sua localização em tempo real atualizada no WhatsApp para registrarmos no mapa. Obrigado e boa viagem!'
                    )}
                    className="px-2 py-0.5 bg-zinc-950 hover:bg-zinc-900 rounded text-[9px] font-mono text-zinc-400 border border-zinc-805 hover:text-white transition cursor-pointer"
                  >
                    📍 Localização
                  </button>
                  <button
                    type="button"
                    onClick={() => setBroadcastTemplate(categoryTab === 'coletas'
                      ? 'Olá {motorista}! Lembre-se que o prazo estimado de carga para {destino} é hoje ({prazo}). Por favor nos avise ao liberar a nota.'
                      : 'Olá {motorista}! Lembramos que o prazo estimado de entrega em {destino} é {prazo}. Tudo sob controle no percurso? Um abraço!'
                    )}
                    className="px-2 py-0.5 bg-zinc-950 hover:bg-zinc-905 rounded text-[9px] font-mono text-zinc-400 border border-zinc-805 hover:text-white transition cursor-pointer"
                  >
                    📅 Lembrar Prazo
                  </button>
                </div>
              </div>

              {/* Scrollable list of category drivers */}
              <div className="flex-1 overflow-y-auto max-h-[360px] space-y-2.5 min-h-[250px] pr-1">
                {(() => {
                  const targetStatus = categoryTab === 'coletas' ? ['coletando', 'parado'] : ['em_transito'];
                  const filteredDrivers = entregas.filter(e => e.status !== 'entregue' && !e.etapasOperador?.e12 && targetStatus.includes(e.status));

                  if (filteredDrivers.length === 0) {
                    return (
                      <div className="py-12 text-center text-zinc-500 text-xs font-mono">
                        Nenhum motorista ativo nesta categoria no momento.
                      </div>
                    );
                  }

                  return filteredDrivers.map(driver => {
                    const pendingSchedulesCount = scheduledList.filter(s => s.deliveryId === driver.id && s.status === 'pendente').length;
                    const hasSchedules = pendingSchedulesCount > 0;

                    // Compute dynamic personalized message for dispatch
                    const formattedMsg = broadcastTemplate
                      .replace(/{motorista}/g, driver.motorista)
                      .replace(/{destino}/g, driver.destino)
                      .replace(/{origem}/g, driver.origem)
                      .replace(/{cliente}/g, driver.cliente)
                      .replace(/{prazo}/g, driver.prazo);

                    const handleSendClick = () => {
                      const cleanPhone = driver.tel_motorista.replace(/\D/g, '');
                      const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(formattedMsg)}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    };

                    return (
                      <div 
                        key={driver.id}
                        className="p-3 bg-zinc-900/40 border border-zinc-800/85 hover:border-zinc-700/85 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition"
                      >
                        <div className="space-y-1 text-left">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-gray-200">{driver.motorista}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono border ${
                              driver.status === 'em_transito' 
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                : driver.status === 'parado'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                            }`}>
                              {driver.status === 'em_transito' ? 'TRÂNSITO ⚡' : driver.status === 'parado' ? 'PARADO 🚨' : 'COLETANDO 📦'}
                            </span>
                          </div>
                          
                          <div className="text-[11px] text-zinc-400 font-mono">
                            Rota: <span className="text-zinc-350 font-bold">{driver.origem} ➔ {driver.destino}</span>
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Tel: <span className="text-zinc-400 font-bold">55 {driver.tel_motorista}</span>
                            </span>
                            <span className="text-zinc-700 font-mono text-[9px]">•</span>
                            {hasSchedules ? (
                              <span className="text-[9px] text-yellow-450 bg-yellow-450/10 px-1.5 py-0.2 border border-yellow-450/20 rounded font-mono animate-pulse flex items-center gap-1 font-bold">
                                🔔 {pendingSchedulesCount} ALERTA AGENDADO
                              </span>
                            ) : (
                              <span className="text-[9px] text-zinc-600 font-mono">
                                Sem agendamentos pendentes
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <button
                            onClick={handleSendClick}
                            className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#1ebd53] text-black font-extrabold font-mono rounded-lg text-[10px] uppercase cursor-pointer flex items-center gap-1 transition-all hover:shadow-[0_0_10px_rgba(37,211,102,0.2)]"
                          >
                            <Send className="w-3 h-3 fill-black text-black" />
                            Disparar Alerta
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

            </div>
          )}

          {/* Quick Informational note */}
          <div className="mt-4 p-3 bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg text-[10px] text-zinc-500 font-mono leading-relaxed flex gap-2">
            <AlertCircle className="w-4 h-4 text-[#FFD600] shrink-0" />
            <span className="space-y-1 block">
              <span className="block">
                Ao disparar, o Agente Rodovar abre uma nova aba no seu navegador integrada diretamente com o WhatsApp Web (ou aplicativo celular) contendo a mensagem preenchida sequencialmente. Gratuito e 100% legal sem necessidade de APIs pagas da Meta.
              </span>
              <span className="block text-[#FFD600] font-bold uppercase mt-1">
                ⚠️ IMPORTANTE: O envio das mensagens NÃO é automático. Toda ação e disparo de mensagens é MANUAL e requer a confirmação do operador para enviar no WhatsApp.
              </span>
            </span>
          </div>

        </div>

      </div>

      {/* Scheduler Custom Delete Confirmation Modal */}
      {cancelConfirmId && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[2100] p-4 animate-fade-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121212] border-2 border-red-900/40 rounded-2xl max-w-sm w-full shadow-2xl relative overflow-hidden text-center"
          >
            <div className="bg-red-950/20 border-b border-zinc-800/80 p-5 flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-sans">Cancelar Programação?</h3>
            </div>
            
            <div className="p-6 space-y-4 font-sans text-left">
              <p className="text-xs text-gray-300 leading-relaxed">
                Deseja realmente excluir e cancelar esta programação de lembrete de WhatsApp?
              </p>
            </div>

            <div className="border-t border-zinc-900 p-4 bg-zinc-950 flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                onClick={() => setCancelConfirmId(null)}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  deleteScheduledMessage(cancelConfirmId);
                  setCancelConfirmId(null);
                  loadData();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg hover:shadow-lg hover:shadow-red-950/30 transition-all cursor-pointer font-extrabold"
              >
                Sim, Remover
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
