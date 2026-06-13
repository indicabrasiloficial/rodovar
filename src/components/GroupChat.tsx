import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Paperclip, 
  Mic, 
  MicOff, 
  Sparkles, 
  Bot, 
  Shield, 
  Users, 
  FileText, 
  Image as ImageIcon, 
  X, 
  Volume2, 
  VolumeX,
  Clock,
  ArrowRight,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { GroupChatMessage, Entrega } from '../types';
import { sendGroupChatMessage, subscribeToGroupChatRealtime, getEntregas } from '../db/storage';

interface GroupChatProps {
  user: {
    username: string;
    displayName: string;
    role: string;
  };
  isSpeechMuted: boolean;
  onSpeak: (text: string) => void;
}

export default function GroupChat({ user, isSpeechMuted, onSpeak }: GroupChatProps) {
  const [activeCategory, setActiveCategory] = useState<'comercial' | 'operacional'>('comercial');
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showRules, setShowRules] = useState(true);
  
  // File upload state
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    data: string; // Base64
  } | null>(null);

  const [recognition, setRecognition] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechVal = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechVal) {
      const rec = new SpeechVal();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'pt-BR';

      rec.onresult = (event: any) => {
        const text = event.results[event.results.length - 1][0].transcript;
        setInputText(prev => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + text;
        });
        setIsRecording(false);
        // Feed audio notification
        if (!isSpeechMuted) {
          onSpeak("Áudio capturado");
        }
      };

      rec.onerror = (err: any) => {
        console.error('Erro no reconhecimento de voz:', err);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      setRecognition(rec);
    }
  }, [isSpeechMuted, onSpeak]);

  // Real-time listener for current active segment messages
  useEffect(() => {
    const unsubscribe = subscribeToGroupChatRealtime(activeCategory, (syncMsgs) => {
      setMessages(syncMsgs);
    });
    return () => unsubscribe();
  }, [activeCategory]);

  // Scroll to bottom on updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  // Voice recording toggle
  const toggleRecording = () => {
    if (!recognition) {
      alert("Seu navegador não oferece suporte para reconhecimento de fala local.");
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      setIsRecording(true);
      recognition.start();
    }
  };

  // Convert File to Base64 easily
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("O tamanho do arquivo excede o limite máximo de 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setAttachment({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64Data
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment) return;

    const currentText = inputText;
    const currentAttachment = attachment;

    // Reset input fields
    setInputText('');
    setAttachment(null);

    // 1. Send the primary user message to Firebase
    const messagePayload: Omit<GroupChatMessage, 'id'> = {
      category: activeCategory,
      text: currentText,
      userId: user.username,
      userName: user.displayName,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      ...(currentAttachment && {
        attachmentName: currentAttachment.name,
        attachmentType: currentAttachment.mimeType,
        attachmentPreview: currentAttachment.data
      })
    };

    await sendGroupChatMessage(messagePayload);

    // 2. Check if user has triggered @rodovar AI helper or if we are in assistance mode
    const isAiTrigger = currentText.toLowerCase().includes('@rodovar') || 
                        currentText.toLowerCase().includes('ia') || 
                        currentText.toLowerCase().includes('ajuda') || 
                        currentText.toLowerCase().includes('assistente');

    if (isAiTrigger) {
      setIsAiLoading(true);
      try {
        const deliveriesContext = getEntregas().slice(0, 5).map(ent => ({
          id: ent.id,
          origem: ent.origem,
          destino: ent.destino,
          cliente: ent.cliente,
          motorista: ent.motorista,
          status: ent.status
        }));

        const bodyData = {
          prompt: currentText,
          context: {
            activeDeliveriesCount: getEntregas().length,
            sample: deliveriesContext,
            currentUser: user,
            category: activeCategory
          },
          ...(currentAttachment && {
            attachment: currentAttachment
          })
        };

        const response = await fetch('/api/chat/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bodyData)
        });

        const data = await response.json();

        if (data.success && data.text) {
          // Append the AI reply
          const aiPayload: Omit<GroupChatMessage, 'id'> = {
            category: activeCategory,
            text: data.text,
            userId: 'rodovar_ai',
            userName: 'Agente Rodovar IA',
            userRole: 'Inteligência Logística',
            timestamp: new Date().toISOString(),
            isAiTriggered: true
          };

          await sendGroupChatMessage(aiPayload);

          // TTS read out AI answer
          if (!isSpeechMuted) {
            // Clean markdown syntax before speaking
            const voiceClbkText = data.text
              .replace(/[*#_\-\[\]`]/g, '')
              .replace(/RODOVAR_AI/g, 'Rodovar')
              .substring(0, 180);
            onSpeak(voiceClbkText);
          }
        }
      } catch (err) {
        console.error('Falha ao acionar o Agente IA:', err);
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  // Quick prompt questions
  const handleQuickQuestion = (question: string) => {
    setInputText(`@rodovar ${question}`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] bg-[#0d0d0d] border border-zinc-805/80 rounded-2xl overflow-hidden font-sans shadow-2xl relative">
      {/* Top Navigation Row */}
      <div className="bg-zinc-950 border-b border-zinc-900 px-5 py-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFD600]/10 flex items-center justify-center border border-[#FFD600]/25 animate-pulse">
            <Bot className="w-5 h-5 text-[#FFD600]" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white m-0 flex items-center gap-1.5">
              Chat do Futuro Rodovar
              <span className="text-[9px] font-mono tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase animate-fade-in">
                Realtime
              </span>
            </h2>
            <p className="text-[10px] text-zinc-500 m-0 font-mono mt-0.5">Canal integrado para colaboração instantânea de times e motoristas</p>
          </div>
        </div>

        {/* Group Tab Category Picker */}
        <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80 self-start md:self-auto">
          <button
            onClick={() => setActiveCategory('comercial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeCategory === 'comercial'
              ? 'bg-[#FFD600] text-[#0a0a0a] shadow-lg font-black'
              : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Comercial</span>
          </button>
          <button
            onClick={() => setActiveCategory('operacional')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
              activeCategory === 'operacional'
              ? 'bg-[#FFD600] text-[#0a0a0a] shadow-lg font-black'
              : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Operacional</span>
          </button>
        </div>
      </div>

      {/* Corporate Rule Banner */}
      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#14120a] border-b border-yellow-950/40 p-4.5 flex gap-3 text-xs text-yellow-300 relative justify-between leading-relaxed shrink-0"
          >
            <div className="flex gap-2.5 items-start">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#FFD600] mt-0.5" />
              <div className="font-sans space-y-1">
                <p className="font-bold uppercase tracking-wider text-[11px] text-[#FFD600] m-0">Regras e Dinâminca Operacional da Central Rodovar:</p>
                {activeCategory === 'comercial' ? (
                  <p className="m-0 text-zinc-400 text-[11px]">
                    <strong className="text-yellow-400">COMERCIAL FECHA CARGA COM OS MOTORISTAS:</strong> Use este espaço para negociar propostas, alinhar coletas, confirmar dados bancários de Pix e despachar rotas. Todos os demais perfis assistem e mantêm suporte de base passivo.
                  </p>
                ) : (
                  <p className="m-0 text-zinc-400 text-[11px]">
                    <strong className="text-yellow-400">OPERADOR MONITORA TODA CARGA (SUPREMO DO PAINEL):</strong> Use este canal para incidentes críticos de desvios, confirmações de chegada em cercas eletrônicas, envio de canhotos fiscais e auditorias de velocidade.
                  </p>
                )}
              </div>
            </div>
            <button 
              onClick={() => setShowRules(false)}
              className="text-zinc-550 hover:text-zinc-200 cursor-pointer p-0.5 shrink-0"
              title="Fechar Banner"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Messages Panel + Interactive sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0a0a0a]">
        {/* Messages Feed column */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative p-5 max-w-full">
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center space-y-3.5 max-w-sm mx-auto">
                <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-850 flex items-center justify-center text-zinc-700">
                  <Bot className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">Nenhuma mensagem no momento</h4>
                  <p className="text-[10px] text-zinc-600 font-sans leading-relaxed mt-1">Este canal está vazio. Digite uma mensagem operacional abaixo ou mencione o agente usando <strong className="text-yellow-500 font-mono">@rodovar</strong> para ativar a Inteligência Artificial corporativa.</p>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.userId === user.username;
                const isAi = msg.userId === 'rodovar_ai';
                const formattedTime = new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div 
                    key={msg.id || index}
                    className={`flex items-start gap-3 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    {/* Character avatar badge */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono border uppercase shrink-0 ${
                      isAi 
                      ? 'bg-[#FFD600]/10 border-[#FFD600]/30 text-[#FFD600]' 
                      : isMe 
                      ? 'bg-zinc-900 border-zinc-800 text-[#FFD600]' 
                      : 'bg-zinc-950 border-zinc-900 text-zinc-300'
                    }`}>
                      {isAi ? <Bot className="w-4 h-4 text-[#FFD600]" /> : msg.userName.charAt(0)}
                    </div>

                    <div className="space-y-1">
                      {/* Name metadata tag */}
                      <div className={`flex items-center gap-1.5 text-[9px] font-mono ${isMe ? 'justify-end' : ''}`}>
                        <span className="font-extrabold text-zinc-300 uppercase tracking-wide">{msg.userName}</span>
                        <span className="text-zinc-650 bg-zinc-900/60 border border-zinc-850 px-1 rounded text-[8px] tracking-wider uppercase">{msg.userRole}</span>
                        <span className="text-zinc-600 flex items-center gap-0.5 font-sans"><Clock className="w-2.5 h-2.5" />{formattedTime}</span>
                      </div>

                      {/* Bubble content */}
                      <div className={`p-3.5 rounded-xl text-xs leading-relaxed break-words font-sans selection:bg-[#FFD600]/30 selection:text-white ${
                        isAi 
                        ? 'bg-[#121204] border border-yellow-950/40 text-yellow-100 shadow-[0_0_15px_rgba(255,214,0,0.03)]' 
                        : isMe 
                        ? 'bg-zinc-900 border border-zinc-850 text-zinc-200' 
                        : 'bg-zinc-950 border border-zinc-905 text-zinc-400'
                      }`}>
                        {/* Text block rendering */}
                        <p className="m-0 whitespace-pre-wrap">{msg.text}</p>

                        {/* Attachment files rendering */}
                        {msg.attachmentName && (
                          <div className="mt-3.5 p-2 bg-zinc-950/80 border border-zinc-900 rounded-lg flex items-center gap-2 max-w-sm">
                            {msg.attachmentType?.startsWith('image/') ? (
                              <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-zinc-800">
                                <img 
                                  src={`data:${msg.attachmentType};base64,${msg.attachmentPreview}`} 
                                  alt="Preview" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded bg-zinc-900 flex items-center justify-center text-zinc-600 shrink-0 border border-zinc-850">
                                <FileText className="w-5 h-5 text-zinc-500" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-mono text-zinc-300 truncate m-0 font-bold" title={msg.attachmentName}>{msg.attachmentName}</p>
                              <p className="text-[8px] text-zinc-500 font-mono m-0 uppercase mt-0.5">Anexo Enviado</p>
                            </div>
                            <a
                              href={`data:${msg.attachmentType};base64,${msg.attachmentPreview}`}
                              download={msg.attachmentName}
                              className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#FFD600] hover:underline shrink-0 ml-1.5"
                            >
                              Baixar
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* AI Agent Loading bubble animation */}
            {isAiLoading && (
              <div className="flex items-start gap-3 max-w-[85%] animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-[#FFD600]/10 border border-[#FFD600]/30 flex items-center justify-center animate-bounce">
                  <Bot className="w-4 h-4 text-[#FFD600]" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    <span className="font-extrabold text-[#FFD600] tracking-wide uppercase">Agente Rodovar IA</span>
                    <span className="text-zinc-650">Processando resposta inteligente...</span>
                  </div>
                  <div className="bg-[#121204] border border-yellow-950/30 p-3.5 rounded-xl flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Prompt input Form container */}
          <form 
            onSubmit={handleSendMessage} 
            className="border border-zinc-850 rounded-2xl bg-zinc-950 mt-4 p-2 focus-within:border-[#FFD600]/35 transition-colors shrink-0 flex flex-col gap-1.5"
          >
            {/* Attachment preview panel */}
            {attachment && (
              <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-2 flex items-center justify-between gap-3 text-xs text-zinc-300">
                <div className="flex items-center gap-2 min-w-0">
                  {attachment.mimeType.startsWith('image/') ? (
                    <ImageIcon className="w-4 h-4 text-[#FFD600] shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#FFD600] shrink-0" />
                  )}
                  <span className="font-mono text-[10px] text-zinc-300 truncate font-bold">{attachment.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="p-1 text-zinc-550 hover:text-red-400 cursor-pointer"
                  title="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* File clip click trigger */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-[#FFD600] border border-zinc-850/60 transition-colors cursor-pointer shrink-0"
                title="Anexar arquivo de carga ou planilha (Máx 8MB)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf,.xlsx,.csv,.txt"
              />

              {/* Main message text input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isRecording ? "Ouvindo sua voz..." : "Envie instruções de frete ou use @rodovar..."}
                className="flex-1 bg-transparent border-0 ring-0 focus:outline-none focus:ring-0 text-xs text-zinc-100 placeholder-zinc-700 min-w-0"
              />

              {/* Voice recognition toggle */}
              <button
                type="button"
                onClick={toggleRecording}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                  isRecording 
                  ? 'bg-red-950/20 text-red-500 border-red-900/60 animate-pulse' 
                  : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-[#FFD600] border-zinc-850/60'
                }`}
                title="Ativar comando de voz por microfone"
              >
                {isRecording ? <MicOff className="w-4 h-4 text-red-500" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Primary send button */}
              <button
                type="submit"
                disabled={!inputText.trim() && !attachment}
                className={`p-2.5 rounded-xl transition-all font-mono font-extrabold uppercase text-[10px] tracking-wider shrink-0 cursor-pointer ${
                  inputText.trim() || attachment
                  ? 'bg-[#FFD600] text-black hover:bg-[#ffe23b] hover:scale-[1.02] shadow-lg'
                  : 'bg-zinc-900 border border-zinc-850 text-zinc-650 cursor-not-allowed'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Dynamic informational sidebar columns (Professional AI Operations Helpers) */}
        <div className="hidden xl:flex w-72 bg-zinc-950 border-l border-zinc-905 p-5 flex-col justify-between shrink-0">
          <div className="space-y-5">
            <div className="flex items-center gap-2 pb-3.5 border-b border-zinc-900">
              <Sparkles className="w-4 h-4 text-[#FFD600] shrink-0" />
              <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-300 m-0">Assistência Rodovar IA</h3>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] text-zinc-400 font-sans leading-relaxed m-0">
                Você pode obter insights rápidos de logística conversando com o <strong className="text-yellow-400 font-mono">@rodovar</strong> na linha de texto! Experimente as perguntas baseadas nos dados do painel:
              </p>

              {/* Fast triggers panel */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleQuickQuestion('Qual o status atual do monitoramento de combustível ?')}
                  className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                >
                  <span className="truncate">Como estão nossas cargas?</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickQuestion('Existe algum desvio de rota crítico ativo nas últimas horas?')}
                  className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                >
                  <span className="truncate">Alerta de desvio de rota?</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickQuestion('Como podemos otimizar o tempo de escoamento e segurança da frota interestadual?')}
                  className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                >
                  <span className="truncate">Dicas de segurança de frete?</span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 bg-zinc-900/30 border border-zinc-900 rounded-xl text-center space-y-1">
            <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 uppercase">
              Operação Segura
            </span>
            <p className="text-[9px] text-zinc-550 font-mono m-0 leading-normal mt-1 leading-relaxed">
              Respostas de IA utilizam a chave Gemini. As informações de faturamento e chaves Pix são protegidas por integridade de ponta a ponta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
