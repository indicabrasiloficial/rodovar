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
  Clock, 
  ArrowRight, 
  AlertCircle,
  Copy,
  Check,
  Lock,
  Unlock,
  Trash2,
  Share2,
  Play,
  Pause,
  Headphones,
  Volume2,
  VolumeX,
  ShieldCheck,
  FolderSync,
  Info
} from 'lucide-react';
import { GroupChatMessage } from '../types';
import { 
  sendGroupChatMessage, 
  subscribeToGroupChatRealtime, 
  deleteGroupChatMessage, 
  getEntregas,
  clearAllGroupChatMessages,
  kickUser,
  reinitUser,
  subscribeToKickList,
  updatePresence,
  subscribeToPresence,
  getBlacklist,
  getBlacklistClientes
} from '../db/storage';

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
  const [activeCategory, setActiveCategory] = useState<'comercial' | 'operacional' | 'diretoria'>('comercial');
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Traditional WebSpeech API (Speech-To-Text / dictation)
  const [isSpeechToTextRecording, setIsSpeechToTextRecording] = useState(false);
  const [speechToTextRecognition, setSpeechToTextRecognition] = useState<any>(null);

  // Real Audio Audio Notes state (Envio de Voz Real)
  const [isRealVoiceRecording, setIsRealVoiceRecording] = useState(false);
  const [voiceRecordTime, setVoiceRecordTime] = useState(0);
  const [voiceNoteData, setVoiceNoteData] = useState<{
    name: string;
    mimeType: string;
    data: string; // Base64
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showRules, setShowRules] = useState(true);
  
  // File upload state (Upped limit to 50MB)
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    data: string; // Base64
  } | null>(null);

  // Access check state for Secret Diretoria tab
  const [unlockedDiretoria, setUnlockedDiretoria] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinErrorMsg, setPinErrorMsg] = useState('');
  const [copiedDailyCode, setCopiedDailyCode] = useState(false);

  // Message forwarding state
  const [forwardMessageTarget, setForwardMessageTarget] = useState<GroupChatMessage | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);

  // Secret Live Audio Meeting room state
  const [isConnectedToMeeting, setIsConnectedToMeeting] = useState(false);
  const [isMeetingMuted, setIsMeetingMuted] = useState(false);
  const [meetingParticipants, setMeetingParticipants] = useState<Array<{ name: string; role: string; isSpeaking: boolean }>>([
    { name: "Genivaldo", role: "Gerente Supremo", isSpeaking: false },
    { name: "Diretor Operacional", role: "Gestor Geral", isSpeaking: true },
    { name: "Diretor Comercial", role: "Comercial Principal", isSpeaking: false }
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Currently playing audio references to prevent overlapping playbacks
  const [currentlyPlayingMsgId, setCurrentlyPlayingMsgId] = useState<string | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Deterministic daily invitation code
  const getDailyCode = (): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    // e.g. RDV-1306-DIR
    return `RDV-${day}${month}-DIR`;
  };

  // Check if current user is Director role
  const isDirector = useMemo(() => {
    const curRole = user.role?.toLowerCase() || '';
    const curName = user.username?.toLowerCase() || '';
    const curDisp = user.displayName?.toLowerCase() || '';
    return (
      curRole.includes('diretor') || 
      curRole.includes('financeiro') || 
      curRole === 'master' || 
      curName === 'master' ||
      curName.includes('diretor') ||
      curName.includes('jairo') ||
      curDisp.includes('jairo')
    );
  }, [user]);

  // Real-time kicked list
  const [kickedList, setKickedList] = useState<string[]>([]);
  
  // Real-time dynamic Firestore presence records
  const [dbPresence, setDbPresence] = useState<Array<{ username: string; displayName: string; role: string; lastActive: string; isOnline: boolean }>>([]);

  // Real-time list of online members (Simulated & actual merged)
  const [onlineMembers, setOnlineMembers] = useState<Array<{ username: string; displayName: string; role: string; isOnline: boolean }>>([
    { username: 'diretor_comercial', displayName: 'Diretor Comercial', role: 'Diretor Comercial', isOnline: true },
    { username: 'diretor_operacional', displayName: 'Diretor Operacional', role: 'Diretor de Operações', isOnline: true },
    { username: 'diretor_financeiro', displayName: 'Diretor Financeiro', role: 'Diretor Financeiro', isOnline: true },
    { username: 'gerente_logistica', displayName: 'Gerente Comercial', role: 'Operacional Superior', isOnline: true },
    { username: 'fiscal_pista', displayName: 'Fiscal de Rodovia', role: 'Fiscal Operacional', isOnline: false },
    { username: 'rodovar_ai', displayName: 'Agente Rodovar IA', role: 'Inteligência Corporativa', isOnline: true }
  ]);

  // Synchronize actual real-time presence heartbeat in the room "Chat do Futuro"
  useEffect(() => {
    if (!user || !user.username) return;

    // Register active
    updatePresence(user.username, user.displayName, user.role, true).catch(err => console.error(err));

    // Heartbeat every 25 seconds
    const intervalId = setInterval(() => {
      updatePresence(user.username, user.displayName, user.role, true).catch(err => console.error(err));
    }, 25000);

    // Unload page hook to go offline immediately
    const handleUnload = () => {
      updatePresence(user.username, user.displayName, user.role, false).catch(err => console.error(err));
    };
    window.addEventListener('beforeunload', handleUnload);

    // Subscribe to all users presence in database
    const unsubscribePresence = subscribeToPresence((list) => {
      setDbPresence(list);
    });

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleUnload);
      updatePresence(user.username, user.displayName, user.role, false).catch(err => console.error(err));
      unsubscribePresence();
    };
  }, [user]);

  // Synchronize dynamic DB presence to onlineMembers
  useEffect(() => {
    const seedBase = [
      { username: 'diretor_comercial', displayName: 'Diretor Comercial', role: 'Diretor Comercial', isOnline: true },
      { username: 'diretor_operacional', displayName: 'Diretor Operacional', role: 'Diretor de Operações', isOnline: true },
      { username: 'diretor_financeiro', displayName: 'Diretor Financeiro', role: 'Diretor Financeiro', isOnline: true },
      { username: 'gerente_logistica', displayName: 'Gerente Comercial', role: 'Operacional Superior', isOnline: true },
      { username: 'fiscal_pista', displayName: 'Fiscal de Rodovia', role: 'Fiscal Operacional', isOnline: false },
      { username: 'rodovar_ai', displayName: 'Agente Rodovar IA', role: 'Inteligência Corporativa', isOnline: true }
    ];

    const merged = [...seedBase];

    dbPresence.forEach(p => {
      if (!p.username) return;
      const index = merged.findIndex(m => m.username === p.username);
      
      const now = new Date().getTime();
      const lastActiveTime = new Date(p.lastActive).getTime();
      // Active in the last 2 minutes is considered online
      const isActiveRealTime = p.isOnline && (now - lastActiveTime < 120000); 

      if (index !== -1) {
        if (p.username !== 'rodovar_ai') { 
          merged[index] = {
            ...merged[index],
            isOnline: isActiveRealTime
          };
        }
      } else {
        merged.push({
          username: p.username,
          displayName: p.displayName || p.username,
          role: p.role || 'Monitorador',
          isOnline: isActiveRealTime
        });
      }
    });

    setOnlineMembers(merged);
  }, [dbPresence]);

  // Is current user capable of kicking? (Diretor de operações, Diretor Comercial, Financeiro)
  const canKickUser = useMemo(() => {
    const curRole = user.role?.toLowerCase() || '';
    const curName = user.role?.toLowerCase() || user.username?.toLowerCase() || '';
    const curDisp = user.displayName?.toLowerCase() || '';
    return (
      curRole.includes('operacion') || 
      curRole.includes('comercial') || 
      curRole.includes('financeir') || 
      curRole.includes('diretor') || 
      curRole === 'master' || 
      curName === 'master' ||
      curName.includes('diretor') ||
      curName.includes('financeiro') ||
      curName.includes('jairo') ||
      curDisp.includes('jairo')
    );
  }, [user]);

  // Professional emoji selection
  const promptEmojis = [
    { char: '📦', name: 'Carga' },
    { char: '🚛', name: 'Frota' },
    { char: '🤝', name: 'Fechado' },
    { char: '📊', name: 'Faturamento' },
    { char: '🚨', name: 'Alerta' },
    { char: '💰', name: 'Pix/Frete' },
    { char: '✅', name: 'Canhoto OK' },
    { char: '🛑', name: 'Bloqueio' }
  ];

  // VALAA Clear Entire Conversation
  const handleValaaClearChat = async () => {
    const confirmValaa = confirm("⚠️ ATENÇÃO COMANDO VALAA: Deseja realmente APAGAR TODA A CONVERSA do canal " + activeCategory.toUpperCase() + "? Esta operação irá eliminar todas as mensagens de áudio, textos e imagens anexadas de forma permanente do servidor para todos!");
    if (!confirmValaa) return;
    
    setIsAiLoading(true);
    await clearAllGroupChatMessages(activeCategory);
    setIsAiLoading(false);
    
    if (!isSpeechMuted) {
      onSpeak("Toda a conversa deste canal foi apagada permanentemente usando o botão Vala");
    }
  };

  // Kick out member from session
  const handleKickMember = async (usernameToKick: string) => {
    if (usernameToKick === user.username) {
      alert("Operação inválida: Você não pode expulsar você mesmo!");
      return;
    }
    const confirmKick = confirm(`⚠️ EXPULSÃO: Deseja realmente EXPULSAR o usuário @${usernameToKick} da sala de reuniões? Ele perderá acesso ao chat imediatamente.`);
    if (!confirmKick) return;

    await kickUser(usernameToKick);
    // update local list status
    setOnlineMembers(prev => prev.map(m => m.username === usernameToKick ? { ...m, isOnline: false } : m));
  };

  // Reinstate/unban member
  const handleReinstateMember = async (usernameToReinstate: string) => {
    const confirmReinstate = confirm(`Deseja revogar a suspensão de @${usernameToReinstate} e restabelecer sua entrada à central?`);
    if (!confirmReinstate) return;

    await reinitUser(usernameToReinstate);
    setOnlineMembers(prev => prev.map(m => m.username === usernameToReinstate ? { ...m, isOnline: true } : m));
  };

  // Export conversations Backup safely
  const handleExportBackup = () => {
    const backupObj = {
      sistema: "Chat do Futuro Rodovar",
      exportadoEm: new Date().toISOString(),
      exportadoPor: user.displayName,
      categoriaChat: activeCategory,
      totalMensagens: messages.length,
      dadosLog: messages.map(m => ({
        id: m.id,
        usuario: m.userName,
        usuarioID: m.userId,
        cargo: m.userRole,
        conteudoTexto: m.text,
        tipoVoz: !!m.isVoiceNote,
        contemAnexo: !!m.attachmentName,
        nomeAnexo: m.attachmentName || null,
        dataHora: m.timestamp
      }))
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const downloadLink = document.createElement('a');
    downloadLink.setAttribute("href", dataStr);
    downloadLink.setAttribute("download", `Backup_Rodovar_${activeCategory}_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    if (!isSpeechMuted) {
      onSpeak("Backup gerado com sucesso");
    }
  };

  // Share Invitation automatically with neighboring chats (Comercial or Operacional)
  const handleShareInvite = async (targetCategory: 'comercial' | 'operacional') => {
    const code = getDailyCode();
    setIsAiLoading(true);
    try {
      await sendGroupChatMessage({
        category: targetCategory,
        text: `📢 CONVITE DA DIRETORIA: O(A) ${user.displayName} (${user.role}) convida os membros autorizados a ingressar na sala secreta de Diretoria nas próximas 24 horas. Código de Acesso: ${code}`,
        userId: user.username,
        userName: user.displayName,
        userRole: user.role,
        timestamp: new Date().toISOString()
      });
      if (!isSpeechMuted) {
        onSpeak(`Convite enviado para o grupo ${targetCategory === 'comercial' ? 'Comercial' : 'Operacional'}`);
      }
      alert(`Convite enviado com sucesso para o canal ${targetCategory.toUpperCase()}!`);
    } catch (err) {
      console.error(err);
      alert('Falha ao compartilhar convite.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Sync Kicking status and auto-approval active category Check
  useEffect(() => {
    if (activeCategory === 'diretoria') {
      if (isDirector) {
        setUnlockedDiretoria(true);
      } else {
        setUnlockedDiretoria(false);
      }
    }
  }, [activeCategory, isDirector]);

  useEffect(() => {
    const unsubscribe = subscribeToKickList((list) => {
      setKickedList(list);
    });
    return () => unsubscribe();
  }, []);

  // Voice note recording timer
  useEffect(() => {
    if (isRealVoiceRecording) {
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordTime(prev => prev + 1);
      }, 1000);
    } else {
      if (voiceTimerRef.current) {
        clearInterval(voiceTimerRef.current);
      }
    }
    return () => {
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    };
  }, [isRealVoiceRecording]);

  // Initialize Speech Recognition for speech-to-text dictation
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
        setIsSpeechToTextRecording(false);
        if (!isSpeechMuted) {
          onSpeak("Ditado processado");
        }
      };

      rec.onerror = (err: any) => {
        console.error('Erro no reconhecimento de voz:', err);
        setIsSpeechToTextRecording(false);
      };

      rec.onend = () => {
        setIsSpeechToTextRecording(false);
      };

      setSpeechToTextRecognition(rec);
    }
  }, [isSpeechMuted, onSpeak]);

  // Listen to Firestore real-time group-chat sync messages
  useEffect(() => {
    const unsubscribe = subscribeToGroupChatRealtime(activeCategory, (syncMsgs) => {
      setMessages(syncMsgs);
    });
    return () => unsubscribe();
  }, [activeCategory]);

  // Scroll smoothly to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  // Setup/Tear down the Secret Meeting Audio Room visualization
  useEffect(() => {
    if (isConnectedToMeeting && canvasRef.current) {
      startVisualizer();
    } else {
      stopVisualizer();
    }
    return () => stopVisualizer();
  }, [isConnectedToMeeting]);

  // Speech-To-Text dictation toggle
  const toggleSpeechToText = () => {
    if (!speechToTextRecognition) {
      alert("Seu navegador não oferece suporte para reconhecimento de fala WebSpeech nativo.");
      return;
    }

    if (isSpeechToTextRecording) {
      speechToTextRecognition.stop();
    } else {
      setIsSpeechToTextRecording(true);
      speechToTextRecognition.start();
    }
  };

  // Gravar Áudio Real de Voz (Real Audio Media Note Recording)
  const startRealVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1];
          setVoiceNoteData({
            name: `Áudio_Voz_${new Date().toLocaleTimeString().replace(/:/g, '-')}.webm`,
            mimeType: 'audio/webm',
            data: base64Data
          });
        };
        reader.readAsDataURL(audioBlob);

        // Turn off stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRealVoiceRecording(true);
      setVoiceRecordTime(0);
      if (!isSpeechMuted) {
        onSpeak("Gravando áudio");
      }
    } catch (err) {
      console.error("Erro ao acessar permissão de gravação:", err);
      alert("Não foi possível acessar seu microfone para gravação de áudio real de reunião.");
    }
  };

  const stopRealVoiceRecording = () => {
    if (mediaRecorderRef.current && isRealVoiceRecording) {
      mediaRecorderRef.current.stop();
      setIsRealVoiceRecording(false);
    }
  };

  // Convert files to base64 with strict 50MB check
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxLimit = 50 * 1024 * 1024; // 50MB Limit
    if (file.size > maxLimit) {
      alert(`⚠️ Erro de Limite: O tamanho do arquivo (${(file.size / (1024 * 1024)).toFixed(1)} MB) excede o limite máximo configurado de 50 MB.`);
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

  // Submit messages
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachment && !voiceNoteData) return;

    const currentText = inputText;
    const currentAttachment = attachment;
    const currentVoice = voiceNoteData;

    // Reset input fields
    setInputText('');
    setAttachment(null);
    setVoiceNoteData(null);

    const messagePayload: Omit<GroupChatMessage, 'id'> = {
      category: activeCategory,
      text: currentVoice ? "🎙️ Mensagem de Voz Enviada" : currentText,
      userId: user.username,
      userName: user.displayName,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      ...(currentAttachment && {
        attachmentName: currentAttachment.name,
        attachmentType: currentAttachment.mimeType,
        attachmentPreview: currentAttachment.data
      }),
      ...(currentVoice && {
        attachmentName: currentVoice.name,
        attachmentType: currentVoice.mimeType,
        attachmentPreview: currentVoice.data,
        isVoiceNote: true
      })
    };

    await sendGroupChatMessage(messagePayload);

    // AI Agent callback
    const isAiTrigger = !currentVoice && (
      currentText.toLowerCase().includes('@rodovar') || 
      currentText.toLowerCase().includes('ia') || 
      currentText.toLowerCase().includes('ajuda') || 
      currentText.toLowerCase().includes('assistente')
    );

    if (isAiTrigger) {
      setIsAiLoading(true);
      try {
        const deliveriesContext = getEntregas().map(ent => ({
          id: ent.id,
          origem: ent.origem,
          destino: ent.destino,
          cliente: ent.cliente,
          motorista: ent.motorista,
          tel_motorista: ent.tel_motorista,
          cpf_motorista: ent.cpf_motorista,
          status: ent.status,
          km: ent.km,
          valor_carga: ent.valor_carga,
          categoria_risco: ent.categoria_risco
        }));

        const bodyData = {
          prompt: currentText,
          context: {
            activeDeliveriesCount: getEntregas().length,
            allDeliveries: deliveriesContext,
            blacklistMotoristas: getBlacklist(),
            blacklistClientes: getBlacklistClientes(),
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

          if (!isSpeechMuted) {
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

  // Confirm authorization PIN
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirector) {
      setPinErrorMsg('Acesso negado: Operadores e funcionários não possuem autorização para ingressar.');
      return;
    }
    const cleanPin = pinInput.trim().toUpperCase();
    const correctPin = getDailyCode();

    if (cleanPin === correctPin) {
      setUnlockedDiretoria(true);
      setPinErrorMsg('');
      setPinInput('');
    } else {
      setPinErrorMsg('Código inválido para hoje. Verifique com um diretor de plantão.');
    }
  };

  // Delete message
  const handleDeleteMessage = async (msgId: string) => {
    if (confirm("Tem certeza que deseja deletar permanentemente esta mensagem?")) {
      await deleteGroupChatMessage(msgId);
    }
  };

  // Open forwarding
  const handleOpenForward = (msg: GroupChatMessage) => {
    setForwardMessageTarget(msg);
    setShowForwardModal(true);
  };

  // Execute forwarding
  const handleForwardMessage = async (targetCategory: 'comercial' | 'operacional' | 'diretoria') => {
    if (!forwardMessageTarget) return;

    const payload: Omit<GroupChatMessage, 'id'> = {
      category: targetCategory,
      text: `🔄 [Encaminhado por ${user.displayName}]: ${forwardMessageTarget.text}`,
      userId: user.username,
      userName: user.displayName,
      userRole: user.role,
      timestamp: new Date().toISOString(),
      ...(forwardMessageTarget.attachmentName && {
        attachmentName: forwardMessageTarget.attachmentName,
        attachmentType: forwardMessageTarget.attachmentType,
        attachmentPreview: forwardMessageTarget.attachmentPreview
      }),
      ...(forwardMessageTarget.isVoiceNote && {
        isVoiceNote: true
      })
    };

    await sendGroupChatMessage(payload);
    setShowForwardModal(false);
    setForwardMessageTarget(null);
    alert(`Mensagem encaminhada com sucesso para o grupo ${targetCategory.toUpperCase()}!`);
  };

  // Play audio voice notes cleanly
  const togglePlayAudio = (msgId: string, base64Audio: string) => {
    if (currentlyPlayingMsgId === msgId) {
      // Pause
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      setCurrentlyPlayingMsgId(null);
    } else {
      // Spot cleanup
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }

      const audioUri = `data:audio/webm;base64,${base64Audio}`;
      const audio = new Audio(audioUri);
      activeAudioRef.current = audio;
      setCurrentlyPlayingMsgId(msgId);

      audio.play().catch(err => {
        console.error("Erro ao reproduzir nota de voz:", err);
        setCurrentlyPlayingMsgId(null);
      });

      audio.onended = () => {
        setCurrentlyPlayingMsgId(null);
      };
    }
  };

  // Audio room visuals
  const startVisualizer = async () => {
    try {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyzerRef.current = audioCtxRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      if (stream) {
        micStreamRef.current = stream;
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        source.connect(analyzerRef.current);
      }

      drawWave();
    } catch (e) {
      console.warn("Nenhum microfone real capturado para visualização, usando fluxo de simulação.");
      drawWave(); // simulate anyway
    }
  };

  const stopVisualizer = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
    }
    micStreamRef.current = null;
    audioCtxRef.current = null;
    analyzerRef.current = null;
  };

  const drawWave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const bufferLength = analyzerRef.current ? analyzerRef.current.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);

      if (analyzerRef.current) {
        analyzerRef.current.getByteFrequencyData(dataArray);
      } else {
        // Mock data
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(Date.now() * 0.005 + i * 0.1) * 30 + 35;
        }
      }

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // Draw futuristic wave
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] * 0.6;

        const grad = ctx.createLinearGradient(0, height - barHeight, 0, height);
        grad.addColorStop(0, '#FFD600');
        grad.addColorStop(0.5, '#ffd90033');
        grad.addColorStop(1, '#ffd90000');

        ctx.fillStyle = grad;
        // Draw double mirrored visualizer
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        ctx.fillRect(width - x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth + 1;
      }
    };

    render();
  };

  // Quick prompt trigger handler
  const handleQuickQuestion = (question: string) => {
    setInputText(`@rodovar ${question}`);
  };

  const handleCopyDailyCode = () => {
    navigator.clipboard.writeText(getDailyCode());
    setCopiedDailyCode(true);
    setTimeout(() => setCopiedDailyCode(false), 2000);
  };

  if (kickedList.includes(user.username)) {
    return (
      <div className="flex flex-col h-[calc(100vh-14rem)] items-center justify-center bg-black border border-red-900/60 rounded-2xl p-8 text-center text-zinc-300 relative overflow-hidden font-sans shadow-2xl">
        <div className="absolute top-4 left-4 flex items-center gap-1.5 opacity-40">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FFD600]" />
          <span className="text-[10px] font-black uppercase tracking-wider font-mono text-white">Rodovar</span>
        </div>
        <div className="w-20 h-20 rounded-full bg-red-950/40 border border-red-500/50 flex items-center justify-center text-red-500 mb-6 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.25)]">
          <X className="w-10 h-10" />
        </div>
        <h2 className="text-sm font-black uppercase text-red-500 tracking-widest">ACESSO BLOQUEADO / EXPULSO</h2>
        <p className="text-xs text-zinc-400 mt-2 max-w-md leading-relaxed">
          Sua credencial <strong className="text-white">@{user.username}</strong> foi suspensa temporariamente da sala de reuniões virtuais por decisão direta dos <strong className="text-red-400">Diretores Operacional, Comercial ou Financeiro</strong> da Rodovar.
        </p>
        <div className="mt-8 p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl max-w-sm">
          <p className="text-[9px] text-zinc-550 font-mono m-0 leading-normal">
            Código de Resolução: RDV-BAN-RESTRITO
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] bg-[#0d0d0d] border border-zinc-805/80 rounded-2xl overflow-hidden font-sans shadow-2xl relative">
      
      {/* Top Header Row of Future Chat */}
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
            <p className="text-[10px] text-zinc-500 m-0 font-mono mt-0.5">Canal integrado de alta cupula e comunicação empresarial</p>
          </div>
        </div>

        {/* Categories Tab Picker & Valaa shortcut */}
        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto w-full md:w-auto">
          <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setActiveCategory('comercial')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'comercial'
                ? 'bg-[#FFD600] text-[#0a0a0a] shadow-lg font-black'
                : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Comercial</span>
            </button>
            
            <button
              type="button"
              onClick={() => setActiveCategory('operacional')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'operacional'
                ? 'bg-[#FFD600] text-[#0a0a0a] shadow-lg font-black'
                : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Operacional</span>
            </button>
            
            <button
              type="button"
              onClick={() => {
                setActiveCategory('diretoria');
                // Automatically check if user is director otherwise ask for code
                if (!isDirector) {
                  setUnlockedDiretoria(false);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'diretoria'
                ? 'bg-rose-600 text-white shadow-lg font-black'
                : 'text-zinc-500 hover:text-red-400'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-rose-500 group-hover:text-white" />
              <span>Diretoria</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleValaaClearChat}
            className="px-2.5 py-1.5 bg-[#85162a]/15 hover:bg-[#85162a]/30 border border-rose-900/40 rounded-xl text-[10px] font-mono font-extrabold text-rose-500 hover:text-rose-450 transition-all cursor-pointer uppercase flex items-center gap-1 leading-none shadow-sm"
            title="VALAA: Apagar toda a conversa deste canal"
          >
            <Trash2 className="w-3 h-3 text-rose-500" />
            <span>VALAA</span>
          </button>

          {isDirector && (
            <div className="flex items-center gap-1.5 bg-[#1b0d0f] border border-rose-950/40 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold text-rose-400 leading-none shadow-sm shrink-0 ml-auto md:ml-0">
              <ShieldCheck className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="opacity-70 font-sans text-[8.5px]">CÓD:</span>
              <span className="font-mono font-black text-rose-300 tracking-wider text-[10px]">{getDailyCode()}</span>
              <button
                type="button"
                onClick={handleCopyDailyCode}
                className="p-1 bg-zinc-950 hover:bg-zinc-800 rounded text-zinc-400 hover:text-[#FFD600] transition-colors cursor-pointer ml-1 active:scale-95 flex items-center justify-center h-5 w-5"
                title="Copiar Código"
              >
                {copiedDailyCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rules Banner */}
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
                <p className="font-bold uppercase tracking-wider text-[11px] text-[#FFD600] m-0">Informativo Geral:</p>
                {activeCategory === 'comercial' ? (
                  <div className="m-0 text-zinc-400 text-[11px] space-y-1">
                    <p className="m-0"><strong className="text-[#FFD600] uppercase">Diretrizes de Negociação Rodovar (Exclusivo para Funcionários):</strong></p>
                    <p className="m-0">• <strong className="text-zinc-200">Auditoria Preventiva:</strong> Utilize o comando do Agente de Segurança para verificar se o motorista consta em nossa lista de restrições antes de pré-aprovar a entrega.</p>
                    <p className="m-0">• <strong className="text-zinc-200">Destaque Operacional:</strong> Enfatize a velocidade de pagamento via Pix adiantado e a credibilidade de nossas rotas assistidas para fechar a negociação com rapidez.</p>
                    <p className="m-0">• <strong className="text-zinc-200">Preservação de Margem:</strong> Sempre faça o cálculo cruzado de distância e faturamentos para garantir a viabilidade do frete entre empresa e terceiros.</p>
                  </div>
                ) : activeCategory === 'operacional' ? (
                  <div className="m-0 text-zinc-400 text-[11px] space-y-1">
                    <p className="m-0"><strong className="text-yellow-400">SUPREME OPERACIONAL:</strong> Canal corporativo exclusivo para o controle ágil de anomalias logísticas críticas e auditoria sistemática de canhotos.</p>
                  </div>
                ) : (
                  <div className="m-0 text-zinc-400 text-[11px] space-y-1">
                    <p className="m-0"><strong className="text-rose-400">DIRETORIA SECRETA RODOVAR (ACESSO CONFIDENCIAL):</strong> Canal exclusivo de governância para validação de fluxos de alto escalão corporativo.</p>
                  </div>
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

      {/* Main Container Core Partition */}
      {activeCategory === 'diretoria' && !unlockedDiretoria ? (
        
        /* SECRET LOCK SCREEN FOR DIRETORIA */
        <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-300 select-none">
          <div className="w-20 h-20 rounded-full bg-[#1c0c10] border border-rose-900/65 flex items-center justify-center text-rose-500 mb-6 relative">
            <Lock className="w-8 h-8 animate-pulse text-rose-500" />
            <div className="absolute -top-1 -right-1 bg-yellow-500 text-black p-1 text-[8px] font-bold uppercase rounded font-mono">
              Rodovar Sec
            </div>
          </div>

          <div className="max-w-md space-y-4">
            <h3 className="text-lg font-black uppercase tracking-wider text-rose-500">PAINEL EXCLUSIVO DA DIRETORIA</h3>

            {!isDirector ? (
              <div className="bg-[#1f0d11] border border-rose-950 px-5 py-6 rounded-2xl space-y-3 shadow-lg">
                <p className="text-xs text-rose-400 font-extrabold leading-relaxed m-0 uppercase tracking-wider flex items-center justify-center gap-1.5">
                  ⚠️ ACESSO RESTRITO AOS DIRETORES
                </p>
                <p className="text-[11px] text-zinc-400 leading-relaxed m-0 font-sans">
                  O perfil de <strong className="text-white">{user.role || 'Operador'}</strong> não possui direitos ou privilégios de acesso a este canal. De acordo com as diretrizes de conformidade da central Rodovar, a sala de reuniões virtuais confidencial é <span className="text-rose-400 font-bold">exclusiva para diretores</span>.
                </p>
                <div className="pt-3 text-[9px] font-mono text-rose-900 border-t border-rose-950/40">
                  CÓDIGO DE SEGURANÇA: BLOQUEADO POR CLASSIFICAÇÃO DE CARGO
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                  Você está prestes a acessar a sala de reuniões confidenciais da Rodovar. Confirme seu <span className="text-yellow-500 font-bold">Código de Convite Diário</span> para autenticar sua sessão.
                </p>
                
                <form onSubmit={handlePinSubmit} className="pt-2 max-w-xs mx-auto space-y-3.5">
                  <input
                    type="text"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Ex: RDV-DDMM-DIR"
                    className="w-full text-center font-mono font-black uppercase tracking-widest bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-700 rounded-xl px-4 py-3 focus:outline-none focus:border-rose-500 text-sm"
                  />
                  {pinErrorMsg && (
                    <p className="text-[10px] text-rose-500 font-mono mt-1 font-bold">{pinErrorMsg}</p>
                  )}
                  <button
                    type="submit"
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Auditar & Entrar
                  </button>
                </form>
              </>
            )}

            <p className="text-[10px] text-zinc-650 pt-3 font-mono">
              Identificação do Usuário: {user.displayName} ({user.role})
            </p>
          </div>
        </div>

      ) : (

        /* STANDARD AND AUTHORIZED CHAT SYSTEM VIEW */
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
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest font-mono">Nenhum despacho ou gravação</h4>
                    <p className="text-[10px] text-zinc-650 font-sans leading-relaxed mt-1">
                      Este canal de {activeCategory.toUpperCase()} está ocioso. Digite uma mensagem, grave uma nota de voz real de reunião ou use @rodovar.
                    </p>
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
                      {/* Character Avatar */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono border uppercase shrink-0 ${
                        isAi 
                        ? 'bg-[#FFD600]/10 border-[#FFD600]/30 text-[#FFD600]' 
                        : isMe 
                        ? 'bg-zinc-900 border-zinc-800 text-[#FFD600]' 
                        : 'bg-zinc-950 border-zinc-900 text-zinc-300'
                      }`}>
                        {isAi ? <Bot className="w-4 h-4 text-[#FFD600]" /> : msg.userName.charAt(0)}
                      </div>

                      <div className="space-y-1 w-full">
                        {/* Name label meta strip */}
                        <div className={`flex items-center gap-1.5 text-[9px] font-mono ${isMe ? 'justify-end' : ''}`}>
                          <span className="font-extrabold text-zinc-300 uppercase tracking-wide">{msg.userName}</span>
                          <span className="text-zinc-600 bg-zinc-900/60 border border-zinc-850 px-1 rounded text-[8px] tracking-wider uppercase">{msg.userRole}</span>
                          <span className="text-zinc-600 flex items-center gap-0.5 font-sans"><Clock className="w-2.5 h-2.5" />{formattedTime}</span>
                        </div>

                        {/* Speech Bubble */}
                        <div className={`p-3 rounded-xl text-xs leading-relaxed break-words font-sans relative group ${
                          isAi 
                          ? 'bg-[#121204] border border-yellow-950/40 text-yellow-101 shadow-[0_0_15px_rgba(255,214,0,0.03)]' 
                          : isMe 
                          ? 'bg-zinc-900 border border-zinc-850 text-zinc-200' 
                          : 'bg-zinc-950 border border-zinc-905 text-zinc-400'
                        }`}>
                          
                          {/* Options tool strip (Hover to show - highly elegant and low noise) */}
                          <div className={`absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all bg-black/75 px-1.5 py-1 rounded-lg border border-zinc-800`}>
                            {/* Forward Button */}
                            <button
                              onClick={() => handleOpenForward(msg)}
                              className="text-zinc-400 hover:text-[#FFD600] transition-colors p-0.5 cursor-pointer"
                              title="Compartilhar / Encaminhar carga"
                            >
                              <Share2 className="w-3 h-3" />
                            </button>

                            {/* Delete Button (Allowed for owner OR director moderator role) */}
                            {(isMe || isDirector) && (
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="text-zinc-500 hover:text-rose-500 transition-colors p-0.5 cursor-pointer"
                                title="Deletar mensagem"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Render actual media elements depending on note type */}
                          {msg.isVoiceNote ? (
                            
                            /* INTERACTIVE REAL VOICE PLAYER */
                            <div className="space-y-2 py-1 max-w-sm">
                              <div className="flex items-center gap-3 bg-zinc-950/90 border border-zinc-900 px-3 py-2.5 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() => msg.attachmentPreview && togglePlayAudio(msg.id, msg.attachmentPreview)}
                                  className="w-8 h-8 rounded-full bg-[#FFD600] text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                  title="Reproduzir nota de voz real"
                                >
                                  {currentlyPlayingMsgId === msg.id ? (
                                    <Pause className="w-4 h-4 fill-black" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-black ml-0.5" />
                                  )}
                                </button>
                                
                                <div className="flex-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                                    <span className="text-[#FFD600] font-bold">Nota de Voz Real</span>
                                    <span>{currentlyPlayingMsgId === msg.id ? "Reproduzindo..." : "Áudio Pronto"}</span>
                                  </div>
                                  
                                  {/* Simulated equalizer visual bar while this speech audio note is playing */}
                                  <div className="h-4 flex items-center gap-[3px] overflow-hidden">
                                    {Array.from({ length: 18 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`w-[3px] rounded-full bg-zinc-800 transition-all duration-300 ${
                                          currentlyPlayingMsgId === msg.id 
                                          ? 'bg-[#FFD600]' 
                                          : ''
                                        }`}
                                        style={{
                                          height: currentlyPlayingMsgId === msg.id 
                                            ? `${Math.max(4, Math.floor(Math.sin((i + Date.now()) * 0.3) * 16))}%` 
                                            : '25%'
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-zinc-500 italic m-0 px-1">Gravado em alta definição</p>
                            </div>

                          ) : (
                            /* TEXT RENDERING */
                            (() => {
                              const isInvitation = msg.text.includes("📢 CONVITE") && msg.text.includes("Acesso");
                              if (isInvitation) {
                                if (!isDirector) {
                                  return (
                                    <div className="bg-[#12080a] border border-rose-950/50 rounded-xl p-3.5 my-1 max-w-sm shadow-md select-none">
                                      <div className="flex items-center gap-2 pb-2 border-b border-rose-950/25">
                                        <div className="w-6 h-6 rounded-lg bg-rose-950/20 border border-rose-950 flex items-center justify-center text-zinc-500 shrink-0">
                                          <Lock className="w-3.5 h-3.5 text-rose-500/60 animate-pulse" />
                                        </div>
                                        <div>
                                          <h4 className="text-[9px] font-mono font-black text-zinc-500 uppercase tracking-widest leading-none m-0">Convite Confidencial</h4>
                                        </div>
                                      </div>
                                      <p className="text-[10px] text-zinc-500 leading-relaxed m-0 font-sans mt-2">
                                        🔒 [CONTEÚDO INDISPONÍVEL] Convite restrito exclusivamente aos Diretores da Central. Operadores não possuem direitos ou privilégios de acesso.
                                      </p>
                                    </div>
                                  );
                                }

                                // Extract code RDV-XXXX-DIR from text
                                const codeMatch = msg.text.match(/RDV-\d+-DIR/);
                                const code = codeMatch ? codeMatch[0] : getDailyCode();

                                return (
                                  <div className="bg-[#1a0c0e] border border-rose-900/40 rounded-xl p-3.5 space-y-3.5 my-1 max-w-sm shadow-[0_0_20px_rgba(244,63,94,0.06)] relative overflow-hidden select-none">
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
                                    
                                    <div className="flex items-center gap-2 pb-2 border-b border-rose-950/20">
                                      <div className="w-7 h-7 rounded-lg bg-rose-950/40 border border-rose-500/40 flex items-center justify-center text-rose-500 shrink-0">
                                        <ShieldCheck className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <h4 className="text-[10px] font-mono font-black text-rose-500 uppercase tracking-widest leading-none m-0">Convite da Diretoria</h4>
                                        <span className="text-[7.5px] font-sans text-zinc-500 leading-none">Acesso Confidencial Rotativo</span>
                                      </div>
                                    </div>

                                    <p className="text-[10px] text-zinc-300 leading-relaxed m-0 font-sans">
                                      O(A) <strong className="text-white">{msg.userName}</strong> convida você a ingressar no canal restrito do alto escalão. Use a credencial de segurança de hoje abaixo:
                                    </p>

                                    <div className="bg-[#0b0607] border border-rose-950/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
                                      <div className="flex flex-col">
                                        <span className="text-[7.5px] font-mono text-zinc-650 leading-none uppercase font-bold">Código do Convite</span>
                                        <span className="text-xs font-mono font-black text-[#FFD600] tracking-widest mt-1">{code}</span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(code);
                                          if (!isSpeechMuted) {
                                            onSpeak("Código de convite copiado com sucesso! Insira-o ao acessar o fórum da diretoria.");
                                          }
                                          alert(`Chave ${code} copiada para a área de transferência!`);
                                          setPinInput(code);
                                          setActiveCategory('diretoria');
                                        }}
                                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-mono font-black tracking-wider uppercase rounded-lg transition-transform cursor-pointer flex items-center gap-1 active:scale-95 shadow-md shrink-0"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>Copiar & Entrar</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return <p className="m-0 whitespace-pre-wrap">{msg.text}</p>;
                            })()
                          )}

                          {/* Attachment files rendering */}
                          {msg.attachmentName && !msg.isVoiceNote && (
                            <div className="mt-3 p-2.5 bg-zinc-950/85 border border-zinc-900 rounded-xl flex items-center gap-2 max-w-sm">
                              {msg.attachmentType?.startsWith('image/') ? (
                                <div className="w-10 h-10 rounded overflow-hidden shrink-0 border border-zinc-800 bg-zinc-900">
                                  <img 
                                    src={`data:${msg.attachmentType};base64,${msg.attachmentPreview}`} 
                                    alt="Preview" 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded bg-zinc-900 flex items-center justify-center text-zinc-650 shrink-0 border border-zinc-850">
                                  <FileText className="w-5 h-5 text-zinc-500" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-mono text-zinc-300 truncate m-0 font-bold" title={msg.attachmentName}>{msg.attachmentName}</p>
                                <p className="text-[8px] text-zinc-500 font-mono m-0 uppercase mt-0.5">Anexo ({msg.attachmentType?.substring(0, 10)})</p>
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

              {/* AI Agent Loading bubble */}
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
                    className="p-1 text-zinc-550 hover:text-red-450 cursor-pointer"
                    title="Remover anexo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Audio recording preview panel */}
              {voiceNoteData && (
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs text-zinc-301">
                  <div className="flex items-center gap-2.5">
                    <Mic className="w-4 h-4 text-[#FFD600] shrink-0 animate-bounce" />
                    <div>
                      <p className="text-[10px] font-mono font-bold text-yellow-500 m-0">Novo Áudio Real Gravado</p>
                      <p className="text-[8px] text-zinc-500 font-mono m-0 uppercase mt-0.5">Pronto para despacho de reunião secreta</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePlayAudio('draft-audio', voiceNoteData.data)}
                      className="px-2 py-1 bg-[#FFD600]/10 hover:bg-[#FFD600]/25 text-[#FFD600] rounded-lg text-[9px] font-mono uppercase font-bold"
                    >
                      {currentlyPlayingMsgId === 'draft-audio' ? 'Pausar' : 'Ouvir Rascunho'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceNoteData(null)}
                      className="p-1.5 text-zinc-550 hover:text-red-400 cursor-pointer"
                      title="Deletar gravação"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {/* File clip selector (Limit increased to 50MB) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-[#FFD600] border border-zinc-850/60 transition-colors cursor-pointer shrink-0"
                  title="Anexar arquivo de carga ou planilha (Máx 50MB)"
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

                {/* Input text field (or recording indicator) */}
                {isRealVoiceRecording ? (
                  <div className="flex-1 flex items-center gap-3 px-3 bg-red-950/20 rounded-xl border border-red-900/40 py-2.5 text-xs text-red-400 font-mono animate-pulse">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                    <span>GRAVANDO ÁUDIO REAL OPERACIONAL RODOVAR...</span>
                    <span className="ml-auto text-white bg-red-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {Math.floor(voiceRecordTime / 60)}:{(voiceRecordTime % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      isSpeechToTextRecording 
                      ? "Ouvindo e convertendo voz em texto..." 
                      : activeCategory === 'diretoria' 
                      ? "Escreva ou grave notas confidenciais..." 
                      : "Envie instruções de frete ou use @rodovar..."
                    }
                    className="flex-1 bg-transparent border-0 ring-0 focus:outline-none focus:ring-0 text-xs text-zinc-100 placeholder-zinc-700 min-w-0 py-2"
                  />
                )}

                {/* SpeechToText (WebSpeech dictation tool) */}
                <button
                  type="button"
                  onClick={toggleSpeechToText}
                  className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                    isSpeechToTextRecording 
                    ? 'bg-emerald-950/25 text-emerald-500 border-emerald-900/60 animate-pulse' 
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-[#FFD600] border-zinc-850/60'
                  }`}
                  title="Ativar Ditado de Voz (converte fala para texto)"
                >
                  <Bot className={`w-4 h-4 ${isSpeechToTextRecording ? 'text-emerald-400 animate-spin' : ''}`} />
                </button>

                {/* REAL MICROPHONE VOICE NOTE RECORDER */}
                {isRealVoiceRecording ? (
                  <button
                    type="button"
                    onClick={stopRealVoiceRecording}
                    className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all cursor-pointer shrink-0 animate-bounce shadow-lg"
                    title="Parar Gravação & Salvar"
                  >
                    <MicOff className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRealVoiceRecording}
                    className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-red-500 border border-zinc-850/60 rounded-xl transition-colors cursor-pointer shrink-0"
                    title="Gravar Áudio Real (Envio de Voz)"
                  >
                    <Mic className="w-4 h-4 text-rose-500" />
                  </button>
                )}

                {/* Main Send button */}
                <button
                  type="submit"
                  disabled={!inputText.trim() && !attachment && !voiceNoteData}
                  className={`p-2.5 rounded-xl transition-all font-mono font-extrabold uppercase text-[10px] tracking-wider shrink-0 cursor-pointer ${
                    inputText.trim() || attachment || voiceNoteData
                    ? 'bg-[#FFD600] text-black hover:bg-[#ffe23b] hover:scale-[1.02] shadow-[0_0_15px_rgba(255,214,0,0.15)]'
                    : 'bg-zinc-900 border border-zinc-850 text-zinc-650 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Professional emojis palette */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-2 border-t border-zinc-900/80 no-scrollbar select-none shrink-0">
                <span className="text-[7.5px] font-mono font-bold text-zinc-500 tracking-wider uppercase shrink-0 mr-1 opacity-60">Emojis Úteis:</span>
                {promptEmojis.map((emoji) => (
                  <button
                    key={emoji.char}
                    type="button"
                    onClick={() => setInputText(prev => prev + ' ' + emoji.char + ' ')}
                    className="px-2 py-1 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-850/60 rounded text-xs transition-all cursor-pointer text-zinc-300 hover:text-white flex items-center gap-1 shrink-0 whitespace-nowrap active:scale-95"
                    title={`Inserir ${emoji.name}`}
                  >
                    <span>{emoji.char}</span>
                    <span className="text-[7.5px] font-mono text-zinc-555 font-semibold">{emoji.name}</span>
                  </button>
                ))}
              </div>
            </form>
          </div>

          {/* Dynamic Information Side Pane */}
          <div className="hidden lg:flex w-72 bg-zinc-950 border-l border-zinc-905 p-5 flex-col justify-between shrink-0 overflow-y-auto">
            
            <div className="space-y-5">
              
              {/* Daily PIN Section for Directorate Tab (Visible strictly to Authorized Directors/Finance) */}
              {isDirector && (
                <div className="bg-[#1a0e11] border border-rose-950/50 p-4 rounded-xl space-y-3 relative overflow-hidden">
                  <div className="flex items-center gap-1.5 pb-2 border-b border-rose-950/40">
                    <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                    <h3 className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-rose-400 m-0">Gerador de Convites</h3>
                  </div>
                  
                  <p className="text-[9px] text-zinc-400 leading-normal m-0 font-sans">
                    Código de Convite Diário rotativo (muda a cada 24 horas). Somente diretores e financeiro possuem acesso a esta credencial:
                  </p>

                  <div className="bg-zinc-900/80 border border-zinc-850/90 rounded-lg p-2.5 flex items-center justify-between gap-1">
                    <span className="font-mono font-black text-rose-400 tracking-wider text-xs">
                      {getDailyCode()}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyDailyCode}
                      className="p-1.5 bg-zinc-950 hover:bg-zinc-800 rounded text-zinc-400 hover:text-[#FFD600] flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95"
                      title="Copiar Código"
                    >
                      {copiedDailyCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <span className="text-[8.5px] font-mono font-bold text-zinc-500 uppercase tracking-widest block font-sans">Convidar Compartilhando:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleShareInvite('comercial')}
                        className="py-1.5 px-1 bg-zinc-900/60 hover:bg-[#FFD600]/10 border border-zinc-900 hover:border-[#FFD600]/30 hover:text-[#FFD600] rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap active:scale-95 text-zinc-400"
                        title="Enviar convite ao Comercial"
                      >
                        <Users className="w-3 h-3 text-[#FFD600]" />
                        <span>Comercial</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareInvite('operacional')}
                        className="py-1.5 px-1 bg-zinc-900/60 hover:bg-rose-500/10 border border-zinc-900 hover:border-rose-500/30 hover:text-rose-400 rounded-lg text-[9px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap active:scale-95 text-zinc-400"
                        title="Enviar convite ao Operacional"
                      >
                        <Shield className="w-3 h-3 text-rose-500" />
                        <span>Operacional</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECRET MEETING AUDIO ROOM INTERACTIVE WIDGET */}
              <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                  <div className="flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-[#FFD600] shrink-0" />
                    <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-300 m-0">Sala Secreta de Reunião</h3>
                  </div>
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping" />
                </div>

                {isConnectedToMeeting ? (
                  <div className="space-y-3">
                    <div className="p-2.5 bg-red-950/15 border border-red-900/40 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-black text-red-500 uppercase tracking-widest leading-none">CONEXÃO ATIVA</span>
                        <span className="text-[8px] text-zinc-400 font-mono">Criptografado</span>
                      </div>
                      
                      {/* Audio visualizer canvas */}
                      <canvas 
                        ref={canvasRef} 
                        width={240} 
                        height={55} 
                        className="w-full h-[55px] bg-[#0a0a0a] rounded-lg border border-zinc-850"
                      />
                    </div>

                    {/* Participants list */}
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-mono uppercase tracking-widest text-zinc-500 m-0 font-bold">Membros Conectados:</p>
                      
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        <div className="flex items-center justify-between text-[9px] font-mono bg-[#0c0c0c] p-1.5 border border-zinc-900 rounded">
                          <span className="text-zinc-300">Você ({user.displayName})</span>
                          <span className="text-[8px] text-emerald-400 bg-emerald-900/10 px-1 border border-emerald-900/30 uppercase rounded">Falando...</span>
                        </div>
                        {meetingParticipants.map((part, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[9px] font-mono bg-zinc-950 p-1.5 border border-zinc-900 rounded">
                            <span className="text-zinc-400">{part.name}</span>
                            <span className={`text-[8px] px-1 rounded uppercase ${part.isSpeaking ? 'text-yellow-400 bg-yellow-900/10' : 'text-zinc-650 bg-zinc-900/50'}`}>
                              {part.isSpeaking ? "Falando..." : "Mutado"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1.5">
                      <button
                        type="button"
                        onClick={() => setIsMeetingMuted(!isMeetingMuted)}
                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-mono uppercase font-black tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 border ${
                          isMeetingMuted 
                          ? 'bg-rose-950/30 text-rose-500 border-rose-900/50' 
                          : 'bg-zinc-900 text-zinc-300 border-zinc-850 hover:bg-zinc-800'
                        }`}
                      >
                        {isMeetingMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        <span>{isMeetingMuted ? "Silenciado" : "Silenciar"}</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setIsConnectedToMeeting(false)}
                        className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[9px] font-mono uppercase font-black transition-colors cursor-pointer"
                        title="Desconectar Sala"
                      >
                        Sair
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-zinc-500 font-sans leading-normal m-0">
                      Inicie e participe de canais de transmissão de áudio corporativo secreto para debates com a central.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsConnectedToMeeting(true)}
                      className="w-full bg-[#FFD600] text-[#0a0a0a] hover:bg-[#ffe23b] text-center font-mono font-black text-[10px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:scale-[1.01] transition-all uppercase"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Conectar ao Canal de Áudio</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Bot intelligence instructions */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-zinc-900">
                  <Sparkles className="w-4 h-4 text-[#FFD600] shrink-0" />
                  <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-300 m-0">Comandos de Agentes</h3>
                </div>

                <p className="text-[10px] text-zinc-550 font-sans leading-relaxed m-0">
                  Clique para preencher o chat com o comando do Agente de IA correspondente:
                </p>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInputText('@rodovar calcular rota de São Paulo para Rio de Janeiro');
                      const inp = document.getElementById('chat-input-text');
                      if (inp) inp.focus();
                    }}
                    className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                    title="Calcular Rota Completa"
                  >
                    <span>🚚 Calcular Rota</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputText('@rodovar consultar cpf ');
                      const inp = document.getElementById('chat-input-text');
                      if (inp) inp.focus();
                    }}
                    className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                    title="Consultar CPF na Lista Negra"
                  >
                    <span>🔍 Consultar CPF</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputText('@rodovar consultar telefone ');
                      const inp = document.getElementById('chat-input-text');
                      if (inp) inp.focus();
                    }}
                    className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                    title="Consultar Telefone do Motorista"
                  >
                    <span>📞 Consultar Telefone</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputText('@rodovar consultar placa ABC1D23');
                      const inp = document.getElementById('chat-input-text');
                      if (inp) inp.focus();
                    }}
                    className="w-full text-left p-2.5 bg-zinc-900/40 border border-zinc-900 hover:border-[#FFD600]/40 rounded-xl transition-all cursor-pointer text-[10px] font-mono text-zinc-400 hover:text-white flex items-center justify-between group"
                    title="Consultar Placa do Veículo"
                  >
                    <span>🚘 Consultar Placa</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600] shrink-0 ml-1" />
                  </button>
                </div>
              </div>

              {/* MEMBERS ONLINE & BAN CONTROLS */}
              <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#FFD600] shrink-0" />
                    <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-300 m-0">Membros de Plantão</h3>
                  </div>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                  {onlineMembers.map((member) => {
                    const isBanned = kickedList.includes(member.username);
                    const isSelf = member.username === user.username;
                    const displayOnline = member.isOnline && !isBanned;

                    return (
                      <div 
                        key={member.username} 
                        className="flex flex-col gap-1 p-2 bg-zinc-950/80 border border-zinc-900 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${displayOnline ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-700'}`} />
                            <span className="text-[10px] font-bold text-zinc-300 truncate">
                              {member.displayName} {isSelf && '(Você)'}
                            </span>
                          </div>
                          
                          {/* Kick command */}
                          {!isSelf && canKickUser && (
                            isBanned ? (
                              <button
                                type="button"
                                onClick={() => handleReinstateMember(member.username)}
                                className="text-[8px] font-mono font-bold uppercase bg-emerald-950/20 text-emerald-400 border border-emerald-900/40 px-1 py-0.5 rounded cursor-pointer hover:bg-emerald-900/45 transition-all leading-none"
                              >
                                Ativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleKickMember(member.username)}
                                className="text-[8px] font-mono font-bold uppercase bg-rose-950/20 text-rose-500 border border-rose-900/40 px-1 py-0.5 rounded cursor-pointer hover:bg-[#85162a]/30 transition-all hover:text-rose-400 leading-none"
                                title="Expulsar Usuário"
                              >
                                Expulsar
                              </button>
                            )
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[8px] font-mono text-zinc-500 leading-none">
                          <span>@{member.username}</span>
                          <span className={`${isBanned ? 'text-red-500 font-extrabold uppercase' : 'text-zinc-450'}`}>
                            {isBanned ? 'Expulso' : member.role}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* INTEGRITY CONTROLS (VALAA & BACKUP) */}
              <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center gap-1.5 pb-2 border-b border-zinc-900">
                  <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                  <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-300 m-0">Controles de Canal</h3>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="w-full text-center p-2 bg-zinc-900 hover:bg-zinc-850 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer font-bold"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-[#FFD600]" />
                    <span>Gerar Backup (.json)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleValaaClearChat}
                    className="w-full text-center p-2 bg-[#85162a]/15 hover:bg-[#85162a]/30 border border-rose-900/40 hover:border-rose-800 rounded-lg text-[10px] font-mono text-rose-550 hover:text-rose-400 flex items-center justify-center gap-1.5 transition-all cursor-pointer font-extrabold shadow-sm animate-pulse"
                    title="VALAA: Apagar toda a conversa deste canal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Comando VALAA</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-900/30 border border-zinc-900 rounded-xl text-center space-y-1 mt-6">
              <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 uppercase">
                Segurança Integral
              </span>
              <p className="text-[8.5px] text-zinc-550 font-mono m-0 leading-normal mt-1 leading-relaxed">
                As comunicações e notas de voz transitam criptografadas em canais segregados.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SHARE / FORWARD MESSAGE POPUP MODAL */}
      <AnimatePresence>
        {showForwardModal && forwardMessageTarget && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-zinc-850 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl font-sans"
            >
              <div className="bg-zinc-900 p-4 border-b border-zinc-805 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-[#FFD600]" />
                  <h3 className="text-xs font-black uppercase text-white tracking-wider">Encaminhar Carga / Arquivo</h3>
                </div>
                <button
                  onClick={() => {
                    setShowForwardModal(false);
                    setForwardMessageTarget(null);
                  }}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-850 space-y-1.5">
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Visualização da Mensagem:</p>
                  <p className="text-xs text-zinc-300 italic truncate m-0">"{forwardMessageTarget.text}"</p>
                  {forwardMessageTarget.attachmentName && (
                    <span className="inline-block text-[8px] font-mono text-yellow-500 bg-yellow-500/10 px-1 py-0.5 rounded">
                      📎 Com anexo: {forwardMessageTarget.attachmentName}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">Para qual canal deseja enviar?</p>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => handleForwardMessage('comercial')}
                      className="w-full text-left p-3.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl border border-zinc-850 text-xs text-white font-bold transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-400 group-hover:text-[#FFD600]" /> 
                        Grupo Comercial
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600]" />
                    </button>

                    <button
                      onClick={() => handleForwardMessage('operacional')}
                      className="w-full text-left p-3.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl border border-zinc-850 text-xs text-white font-bold transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-zinc-400 group-hover:text-[#FFD600]" /> 
                        Grupo Operacional
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-[#FFD600]" />
                    </button>

                    <button
                      onClick={() => handleForwardMessage('diretoria')}
                      className="w-full text-left p-3.5 bg-zinc-900 hover:bg-zinc-850 rounded-xl border border-zinc-850 text-xs text-rose-500 font-bold transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-zinc-400 group-hover:text-rose-500" /> 
                        Grupo Secret Diretoria
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-650 group-hover:text-rose-500" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
