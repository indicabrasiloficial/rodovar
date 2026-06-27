import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  X, 
  Minimize2, 
  Search, 
  Send, 
  Mic, 
  MicOff,
  Paperclip, 
  Trash2, 
  Play, 
  Pause, 
  Image, 
  Shield, 
  Users, 
  Volume2, 
  Check, 
  Folder, 
  ChevronRight,
  Smile
} from 'lucide-react';
import { 
  sendGroupChatMessage, 
  subscribeToGroupChatRealtime, 
  deleteGroupChatMessage,
  subscribeToPresence
} from '../db/storage';
import { getRegisteredEmployees } from './EmployeeRegistration';
import { GroupChatMessage } from '../types';

interface FloatingChatProps {
  currentUser: {
    username: string;
    displayName: string;
    role: string;
  };
}

type ChatTab = 'chats' | 'people';

export default function FloatingChat({ currentUser }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTab>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Active conversation target
  // Can be a standard group channel ('operacional', 'diretoria', 'comercial')
  // Or a private DM ID ('dm_username1_username2')
  const [activeRoom, setActiveRoom] = useState<{
    id: string;
    name: string;
    isDM: boolean;
    dmUser?: string;
    role?: string;
  }>({
    id: 'operacional',
    name: '📢 Canal Operacional',
    isDM: false
  });

  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [registeredEmployees, setRegisteredEmployees] = useState<any[]>([]);
  
  // Message input states
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  // Audio player instances
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayersRef = useRef<Record<string, HTMLAudioElement>>({});

  // Chat scroll anchor
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Unread badge tracker
  const [unreadCount, setUnreadCount] = useState(0);
  const lastViewedRoomTimeRef = useRef<Record<string, number>>({});

  // Fetch employees on mount
  useEffect(() => {
    const list = getRegisteredEmployees();
    setRegisteredEmployees(list);

    // Setup periodic reload of employees list
    const interval = setInterval(() => {
      setRegisteredEmployees(getRegisteredEmployees());
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to real-time presence list from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToPresence((list) => {
      setOnlineUsers(list);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to the active room messages from Firebase
  useEffect(() => {
    setMessages([]);
    const unsubscribe = subscribeToGroupChatRealtime(activeRoom.id as any, (msgs) => {
      setMessages(msgs);
      
      // Update last read time for this room
      if (isOpen) {
        lastViewedRoomTimeRef.current[activeRoom.id] = Date.now();
      }
    });

    return () => unsubscribe();
  }, [activeRoom.id, isOpen]);

  // Global unread messages calculator (simplistic approach via localStorage & memory)
  useEffect(() => {
    if (!isOpen) {
      // Setup listener for general operational messages when closed
      const unsubscribe = subscribeToGroupChatRealtime('operacional', (msgs) => {
        const lastViewed = lastViewedRoomTimeRef.current['operacional'] || 0;
        const unread = msgs.filter(m => new Date(m.timestamp).getTime() > lastViewed && m.userId !== currentUser.username);
        setUnreadCount(unread.length);
      });
      return () => unsubscribe();
    } else {
      setUnreadCount(0);
    }
  }, [isOpen, activeRoom.id, currentUser.username]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle Text message send
  const handleSendMessage = async () => {
    if (!inputText.trim() && !imagePreview) return;

    const payload: Omit<GroupChatMessage, 'id'> = {
      category: activeRoom.id as any,
      text: inputText.trim(),
      userId: currentUser.username,
      userName: currentUser.displayName,
      userRole: currentUser.role,
      timestamp: new Date().toISOString()
    };

    if (imagePreview) {
      payload.attachmentPreview = imagePreview;
      payload.attachmentName = imageName || 'photo.jpg';
      payload.attachmentType = 'image/jpeg';
    }

    setInputText('');
    setImagePreview(null);
    setImageName('');

    try {
      await sendGroupChatMessage(payload);
    } catch (e) {
      console.error('[FloatingChat] Error sending message:', e);
    }
  };

  // Handle voice recording start
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Convert audio Blob to Base64 data URL
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;

          // Dispatch voice note message
          await sendGroupChatMessage({
            category: activeRoom.id as any,
            text: '🎙️ Mensagem de Voz',
            userId: currentUser.username,
            userName: currentUser.displayName,
            userRole: currentUser.role,
            timestamp: new Date().toISOString(),
            audioUrl: base64Audio,
            isVoiceNote: true
          });
        };

        // Turn off media stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Falha ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone para gravação de áudio.');
    }
  };

  // Handle voice recording stop and send
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  // Handle file photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('A foto selecionada é muito grande! Escolha uma imagem de no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  // Delete message handler
  const handleDeleteMessage = async (msgId: string) => {
    if (window.confirm('Tem certeza que deseja apagar essa mensagem de áudio ou texto para todos?')) {
      await deleteGroupChatMessage(msgId);
    }
  };

  // Presence helper
  const isUserOnline = (username: string) => {
    const presence = onlineUsers.find(u => u.username === username);
    return presence ? presence.isOnline : false;
  };

  // Format record timer (e.g. 0:05)
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Audio play/pause controls
  const toggleAudioPlay = (msgId: string, url: string) => {
    if (playingAudioId === msgId) {
      audioPlayersRef.current[msgId]?.pause();
      setPlayingAudioId(null);
    } else {
      // Pause any existing playing audio
      if (playingAudioId && audioPlayersRef.current[playingAudioId]) {
        audioPlayersRef.current[playingAudioId].pause();
      }

      if (!audioPlayersRef.current[msgId]) {
        const audio = new Audio(url);
        audio.onended = () => setPlayingAudioId(null);
        audioPlayersRef.current[msgId] = audio;
      }

      audioPlayersRef.current[msgId].play().catch(() => {});
      setPlayingAudioId(msgId);
    }
  };

  // Separated segments compilation list
  const getEmployeesBySegment = () => {
    const defaultList = [
      { name: 'Jairo Bahia', username: 'jairobahia', role: 'Operador' },
      { name: 'Priscila', username: 'priscila', role: 'Operador' },
      { name: 'Mateus', username: 'mateus', role: 'Operador' },
      { name: 'Genivaldo', username: 'genivaldo', role: 'Gerente' },
      { name: 'Alexandre', username: 'alexandre', role: 'Diretor Comercial' },
      { name: 'Vitor', username: 'vitor', role: 'Diretor de Operações' },
      { name: 'Ricardo', username: 'ricardo', role: 'Diretor de Operações' },
      { name: 'Petrônio', username: 'petronio', role: 'Financeiro' }
    ];

    // Combine loaded with default list and filter duplicates
    const all = [...defaultList];
    registeredEmployees.forEach(emp => {
      if (!all.some(item => item.username === emp.username)) {
        all.push({ name: emp.name, username: emp.username, role: emp.role });
      }
    });

    // Remove current user from lists
    const filtered = all.filter(emp => emp.username !== currentUser.username);

    // Search query filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return filtered.filter(emp => 
        emp.name.toLowerCase().includes(query) || 
        emp.role.toLowerCase().includes(query) ||
        emp.username.toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  // Grouped segments helper
  const getGroupedSegments = () => {
    const employees = getEmployeesBySegment();
    const groups: Record<string, typeof employees> = {
      'Diretoria': [],
      'Operador': [],
      'Visitante': [],
      'Outros': []
    };

    employees.forEach(emp => {
      const roleLower = emp.role.toLowerCase();
      if (roleLower.includes('diretor') || roleLower.includes('comercial')) {
        groups['Diretoria'].push(emp);
      } else if (roleLower.includes('operador')) {
        groups['Operador'].push(emp);
      } else if (roleLower.includes('visitante')) {
        groups['Visitante'].push(emp);
      } else {
        groups['Outros'].push(emp);
      }
    });

    return groups;
  };

  const startDMWith = (emp: any) => {
    // Generate private DM channel ID
    const dmId = 'dm_' + [currentUser.username, emp.username].sort().join('_');
    setActiveRoom({
      id: dmId,
      name: `💬 DM: ${emp.name}`,
      isDM: true,
      dmUser: emp.username,
      role: emp.role
    });
    setActiveTab('chats');
  };

  const getVoiceExpirationState = (msgTimestamp: string) => {
    const msgTime = new Date(msgTimestamp).getTime();
    const nowTime = new Date().getTime();
    // 48 hours = 48 * 60 * 60 * 1000 = 172800000 ms
    const hoursElapsed = (nowTime - msgTime) / (1000 * 60 * 60);
    const isExpired = hoursElapsed >= 48;
    return { isExpired, hoursRemaining: Math.max(0, Math.round(48 - hoursElapsed)) };
  };

  return (
    <>
      {/* FLOATING ACTION LAUNCHER BUTTON */}
      <div className="fixed bottom-6 right-6 z-[2500]" id="chat-launcher-outer">
        <motion.button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              lastViewedRoomTimeRef.current[activeRoom.id] = Date.now();
            }
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-14 h-14 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] rounded-full shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex items-center justify-center text-[#FFD600] cursor-pointer transition-all focus:outline-none"
          id="chat-floating-launcher-btn"
        >
          {isOpen ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <MessageSquare className="w-6 h-6 text-[#FFD600]" />
          )}

          {/* Unread count badge */}
          {!isOpen && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full border-2 border-zinc-950 animate-pulse">
              {unreadCount}
            </span>
          )}
        </motion.button>
      </div>

      {/* EXPANDED PANEL WRAPPER */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed bottom-24 right-6 w-full max-w-sm h-[560px] bg-[#121212] border border-zinc-800 rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.85)] flex flex-col z-[2500] overflow-hidden"
            id="chat-expanded-panel-container"
          >
            {/* Header Area */}
            <div className="bg-zinc-950 px-4 py-3 flex items-center justify-between border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <h3 className="text-xs font-black font-sans uppercase tracking-wider text-[#FFD600]">
                    Canal Interno RodoVar
                  </h3>
                  <p className="text-[9px] font-mono text-zinc-500 uppercase mt-0.5">
                    {currentUser.displayName} ({currentUser.role})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-500 hover:text-white transition-colors"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs (Rooms vs People) */}
            <div className="flex bg-zinc-950/40 border-b border-zinc-900 text-xs font-bold uppercase font-mono">
              <button
                onClick={() => setActiveTab('chats')}
                className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
                  activeTab === 'chats' 
                    ? 'border-[#FFD600] text-[#FFD600] bg-[#FFD600]/5' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Canais & DM
              </button>
              <button
                onClick={() => setActiveTab('people')}
                className={`flex-1 py-2.5 text-center transition-colors border-b-2 ${
                  activeTab === 'people' 
                    ? 'border-[#FFD600] text-[#FFD600] bg-[#FFD600]/5' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Colaboradores
              </button>
            </div>

            {/* Main Interactive Stream */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c]">
              {activeTab === 'people' ? (
                /* TAB: HABILITATED PEOPLE LIST BY SEGMENT */
                <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                      <Search className="w-3.5 h-3.5" />
                    </span>
                    <input 
                      type="text"
                      placeholder="Procurar por nome ou perfil..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-850 text-xs text-zinc-200 placeholder-zinc-650 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-[#FFD600] transition-colors"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                    {Object.entries(getGroupedSegments()).map(([segment, members]) => {
                      if (members.length === 0) return null;
                      return (
                        <div key={segment} className="space-y-1.5">
                          <h4 className="text-[9px] uppercase font-mono tracking-widest text-[#FFD600]/80 font-bold bg-zinc-950 px-2 py-1 rounded">
                            {segment} ({members.length})
                          </h4>
                          <div className="space-y-0.5">
                            {members.map((emp) => {
                              const online = isUserOnline(emp.username);
                              return (
                                <button
                                  key={emp.username}
                                  onClick={() => startDMWith(emp)}
                                  className="w-full flex items-center justify-between p-2 hover:bg-zinc-900/60 rounded-xl transition-all border border-transparent hover:border-zinc-850 cursor-pointer text-left"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="relative">
                                      <div className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-850 flex items-center justify-center text-[#FFD600] font-black text-xs font-mono shadow-inner">
                                        {emp.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                                      </div>
                                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${online ? 'bg-green-500' : 'bg-zinc-650'}`} />
                                    </div>
                                    <div>
                                      <h5 className="text-xs font-bold text-zinc-200 leading-none">{emp.name}</h5>
                                      <span className="text-[9px] text-zinc-500 font-mono tracking-wide mt-1 block">{emp.role}</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* TAB: CHAT ROOM CHANNEL + MESSAGE DISPLAY */
                <div className="flex-1 flex flex-col min-h-0">
                  
                  {/* Active Room Sub-selector Header */}
                  <div className="bg-zinc-950/80 px-3 py-2 border-b border-zinc-900 flex items-center justify-between gap-1">
                    <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider truncate">
                      {activeRoom.name}
                    </span>
                    
                    {/* Channel Selector Toggle */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setActiveRoom({ id: 'operacional', name: '📢 Canal Operacional', isDM: false })}
                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase font-mono ${activeRoom.id === 'operacional' ? 'bg-[#FFD600] text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
                      >
                        Operacional
                      </button>
                      <button
                        onClick={() => setActiveRoom({ id: 'diretoria', name: '💼 Canal Diretoria', isDM: false })}
                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase font-mono ${activeRoom.id === 'diretoria' ? 'bg-[#FFD600] text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
                      >
                        Diretoria
                      </button>
                      <button
                        onClick={() => setActiveRoom({ id: 'comercial', name: '🏢 Canal Comercial', isDM: false })}
                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase font-mono ${activeRoom.id === 'comercial' ? 'bg-[#FFD600] text-black' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}
                      >
                        Comercial
                      </button>
                    </div>
                  </div>

                  {/* Message Stream */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3.5 scrollbar-thin">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-2 text-zinc-600">
                        <MessageSquare className="w-8 h-8 text-zinc-700 animate-pulse" />
                        <p className="text-xs font-mono uppercase tracking-wider">Silêncio Absoluto...</p>
                        <p className="text-[10px]">Envie uma foto, texto ou áudio de voz para iniciar a rotina.</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isMe = msg.userId === currentUser.username;
                        const isVoice = msg.isVoiceNote === true;
                        
                        // Expiration handler for voice notes
                        const voiceState = isVoice && msg.timestamp ? getVoiceExpirationState(msg.timestamp) : { isExpired: false, hoursRemaining: 0 };

                        return (
                          <div 
                            key={msg.id} 
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                          >
                            {/* Metadata above balloon */}
                            <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 font-mono">
                              <span className="font-bold text-zinc-400">{isMe ? 'Você' : msg.userName}</span>
                              <span className="bg-zinc-900 px-1 py-0.1 rounded border border-zinc-850 text-[8px]">{msg.userRole}</span>
                              <span>•</span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            {/* Main message balloon */}
                            <div className={`relative max-w-[85%] rounded-2xl px-3 py-2.5 text-xs shadow-md border ${
                              isMe 
                                ? 'bg-[#FFD600] text-black rounded-tr-none border-[#E6C000]' 
                                : 'bg-zinc-900 text-zinc-200 rounded-tl-none border-zinc-850'
                            }`}>
                              
                              {/* Attachment Rendering */}
                              {msg.attachmentPreview && (
                                <div className="mb-2 max-w-full overflow-hidden rounded-xl border border-black/10">
                                  <img 
                                    src={msg.attachmentPreview} 
                                    alt={msg.attachmentName || 'Anexo'} 
                                    className="w-full h-auto max-h-[160px] object-cover hover:scale-102 transition-transform cursor-pointer" 
                                    referrerPolicy="no-referrer"
                                    onClick={() => {
                                      // Expand photo preview in new tab
                                      const w = window.open();
                                      if (w) {
                                        w.document.write(`<img src="${msg.attachmentPreview}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                      }
                                    }}
                                  />
                                </div>
                              )}

                              {/* Voice message custom player */}
                              {isVoice ? (
                                voiceState.isExpired ? (
                                  <div className="flex items-center gap-1.5 text-red-500 font-mono text-[10px] py-1 italic">
                                    <MicOff className="w-3.5 h-3.5" />
                                    <span>Áudio de voz expirado (48h)</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1.5 min-w-[150px]">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => toggleAudioPlay(msg.id, msg.audioUrl || '')}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                          isMe ? 'bg-black text-[#FFD600] hover:scale-105' : 'bg-[#FFD600] text-black hover:scale-105'
                                        }`}
                                      >
                                        {playingAudioId === msg.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 pl-0.5" />}
                                      </button>
                                      
                                      {/* Audio Waves design */}
                                      <div className="flex items-center gap-0.5 flex-1 h-4">
                                        <div className={`w-1 rounded ${playingAudioId === msg.id ? 'h-3 animate-pulse bg-current' : 'h-1.5 bg-zinc-550'}`} style={{ animationDelay: '0.1s' }} />
                                        <div className={`w-1 rounded ${playingAudioId === msg.id ? 'h-4 animate-pulse bg-current' : 'h-2 bg-zinc-550'}`} style={{ animationDelay: '0.3s' }} />
                                        <div className={`w-1 rounded ${playingAudioId === msg.id ? 'h-2 animate-pulse bg-current' : 'h-1 bg-zinc-550'}`} style={{ animationDelay: '0.2s' }} />
                                        <div className={`w-1 rounded ${playingAudioId === msg.id ? 'h-3.5 animate-pulse bg-current' : 'h-2 bg-zinc-550'}`} style={{ animationDelay: '0.4s' }} />
                                        <div className={`w-1 rounded ${playingAudioId === msg.id ? 'h-1.5 animate-pulse bg-current' : 'h-1 bg-zinc-550'}`} style={{ animationDelay: '0.15s' }} />
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[8px] font-mono opacity-60">
                                      <span>ÁUDIO MONITORADO</span>
                                      <span>Expira em: {voiceState.hoursRemaining}h</span>
                                    </div>
                                  </div>
                                )
                              ) : (
                                /* Text Message payload */
                                <p className="leading-relaxed whitespace-pre-wrap break-all">{msg.text}</p>
                              )}

                              {/* Deletion triggers for the collaborator */}
                              {isMe && (
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="absolute -top-2.5 -left-2.5 bg-zinc-950 border border-zinc-850 hover:border-red-500 text-zinc-550 hover:text-red-500 p-1 rounded-full shadow transition-all scale-0 group-hover:scale-100 hover:scale-110 cursor-pointer"
                                  title="Excluir mensagem para todos"
                                  style={{ transform: 'none' }} // make it visible on hover cleanly
                                  id={`delete-chat-msg-${msg.id}`}
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Chat Input Controls */}
                  <div className="bg-zinc-950 p-2.5 border-t border-zinc-900 space-y-2">
                    
                    {/* Attachment preview ribbon */}
                    {imagePreview && (
                      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-1.5 rounded-lg text-[10px]">
                        <div className="flex items-center gap-1.5 text-zinc-400 truncate max-w-[80%]">
                          <Image className="w-3.5 h-3.5 text-[#FFD600]" />
                          <span className="truncate">{imageName}</span>
                        </div>
                        <button 
                          onClick={() => { setImagePreview(null); setImageName(''); }}
                          className="text-zinc-500 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5" id="chat-input-wrapper-inner">
                      {/* Photo upload action */}
                      <label 
                        className="w-9 h-9 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition-colors"
                        title="Anexar foto do celular/computador"
                      >
                        <Paperclip className="w-4 h-4" />
                        <input 
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>

                      {/* Text inputs */}
                      <input 
                        type="text"
                        placeholder={isRecording ? "Gravando áudio..." : "Mensagem operacional..."}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        disabled={isRecording}
                        className="flex-1 bg-zinc-900 border border-zinc-850 text-xs text-zinc-200 placeholder-zinc-650 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#FFD600] transition-colors disabled:opacity-50"
                      />

                      {/* Voice Recording Actions */}
                      {isRecording ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-red-500 animate-pulse font-bold bg-red-950/20 px-2 py-1.5 rounded border border-red-900/40">
                            {formatTimer(recordingSeconds)}
                          </span>
                          <button
                            onClick={stopRecording}
                            className="w-9 h-9 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center justify-center animate-pulse cursor-pointer shadow"
                            title="Parar e enviar áudio"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={startRecording}
                          className="w-9 h-9 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] text-zinc-400 hover:text-[#FFD600] rounded-xl flex items-center justify-center transition-all cursor-pointer"
                          title="Gravar áudio de voz"
                        >
                          <Mic className="w-4 h-4" />
                        </button>
                      )}

                      {/* Text send trigger */}
                      {!isRecording && (inputText.trim() || imagePreview) && (
                        <button
                          onClick={handleSendMessage}
                          className="w-9 h-9 bg-[#FFD600] hover:bg-[#ffe23b] text-black rounded-xl flex items-center justify-center transition-all cursor-pointer shadow"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
