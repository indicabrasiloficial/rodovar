import { useState, useEffect, useMemo } from 'react';
import { getEntregas, deleteEntrega, subscribeToRealtime, saveEntrega } from './db/storage';
import { auth } from './db/firebase';
import { Entrega } from './types';
import { parsePastedTextToDeliveries } from './components/DeliveryList';
import { useVoice } from './hooks/useVoice';
import Dashboard from './components/Dashboard';
import DeliveryList from './components/DeliveryList';
import DeliveryDetails from './components/DeliveryDetails';
import DeliveryForm from './components/DeliveryForm';
import Statistics from './components/Statistics';
import WhatsAppScheduler from './components/WhatsAppScheduler';
import ManagerSupport from './components/ManagerSupport';
import Login from './components/Login';
import ChangePasswordModal from './components/ChangePasswordModal';
import EmployeeRegistration from './components/EmployeeRegistration';
import AgentManual from './components/AgentManual';
import BlacklistManager from './components/BlacklistManager';
import BackupRegistry from './components/BackupRegistry';
import { Rastrear } from './components/Rastrear';
import { MotoristaTracking } from './components/MotoristaTracking';
import OperatorPanel from './components/OperatorPanel';
import Agenda from './components/Agenda';
import TrackingModeSelector from './components/TrackingModeSelector';
import ApiIntegration from './components/ApiIntegration';
import ActivityLogs from './components/ActivityLogs';
import FloatingChat from './components/FloatingChat';
import TelegramIntegration from './components/TelegramIntegration';
import SystemMigration from './components/SystemMigration';
import PainelFretesVisitantes from './components/PainelFretesVisitantes';
import Pagamentos from './components/Pagamentos';

import { 
  Truck, 
  BarChart3, 
  ListFilter, 
  User, 
  Volume2, 
  VolumeX,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Trash2,
  List,
  MessageSquare,
  Clipboard,
  Newspaper,
  LogOut,
  Lock,
  Shield,
  Users,
  BookOpen,
  UserX,
  LayoutDashboard,
  Bot,
  Webhook,
  Database,
  Server,
  Globe,
  CheckSquare,
  DollarSign,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ViewMode = 'dashboard' | 'list' | 'details' | 'form' | 'statistics' | 'whatsapp' | 'manager' | 'manual' | 'registration' | 'blacklist' | 'backup' | 'rastrear' | 'motorista' | 'operador_painel' | 'agenda' | 'api_integration' | 'logs' | 'telegram_integration' | 'migration' | 'painel_fretes';


export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [selectedView, setSelectedView] = useState<ViewMode>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    let hasInvite = queryParams.get('invite') || queryParams.get('token');
    if (!hasInvite && window.location.hash) {
      const hashParts = window.location.hash.split('?');
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        hasInvite = hashParams.get('invite') || hashParams.get('token');
      }
    }
    if (hasInvite) {
      return 'list'; // Forces showing the Login/register screen first when not logged in
    }
    return 'rastrear';
  });
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);
  const [selectedEntregaId, setSelectedEntregaId] = useState<string | undefined>(undefined);
  const [editingEntregaId, setEditingEntregaId] = useState<string | undefined>(undefined);

  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState(() => {
    return (window as any).rodovar_quota_exceeded === true;
  });

  // Filter states maintained in parent to support Voice query syncs
  const [searchFilter, setSearchFilter] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('all');

  const [isSpeechMuted, setIsSpeechMuted] = useState(() => {
    return localStorage.getItem('rodovar_mute_speech') === 'true';
  });

  const toggleMuteSpeech = () => {
    const newValue = !isSpeechMuted;
    setIsSpeechMuted(newValue);
    localStorage.setItem('rodovar_mute_speech', String(newValue));
    if (newValue && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('rodovar_light_mode') !== 'false'; // default to true to save quotas!
  });

  const toggleLightMode = () => {
    const newValue = !isLightMode;
    setIsLightMode(newValue);
    localStorage.setItem('rodovar_light_mode', String(newValue));
    // Trigger window storage/cache update
    window.dispatchEvent(new Event('storage'));
  };

  // Load user session on start and sync in real-time
  useEffect(() => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        setUser(parsed);
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
    const path = window.location.pathname;
    const queryParams = new URLSearchParams(window.location.search);
    let hasInvite = queryParams.get('invite') || queryParams.get('token');
    if (!hasInvite && window.location.hash) {
      const hashParts = window.location.hash.split('?');
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        hasInvite = hashParams.get('invite') || hashParams.get('token');
      }
    }

    if (path.startsWith('/motorista/')) {
      setSelectedView('motorista');
    } else if (path === '/operador/painel') {
      setSelectedView('operador_painel');
    } else if (path === '/painel-fretes') {
      setSelectedView('painel_fretes');
    } else if (path === '/pagamentos') {
      setSelectedView('pagamentos');
    } else if (hasInvite) {
      setSelectedView('list');
    }
    setIsAuthLoading(false);
    
    // Initial load
    setEntregas(getEntregas());

    // Listen to real-time updates from cloud Firestore
    const handleRealtimeSync = () => {
      setEntregas(getEntregas());
    };
    window.addEventListener('rodovar_realtime_event', handleRealtimeSync);

    const handleQuotaExceeded = () => {
      setFirestoreQuotaExceeded(true);
    };
    window.addEventListener('rodovar_quota_exceeded_event', handleQuotaExceeded);

    return () => {
      window.removeEventListener('rodovar_realtime_event', handleRealtimeSync);
      window.removeEventListener('rodovar_quota_exceeded_event', handleQuotaExceeded);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('rodovar_active_login_v2');
    setUser(null);
  };

  // Global Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Derived preview using our exported parser
  const parsedRowsPreview = useMemo(() => {
    return parsePastedTextToDeliveries(pastedText);
  }, [pastedText]);

  const handleGlobalImport = () => {
    if (!pastedText.trim()) {
      setImportFeedback({ success: false, message: 'Por favor, cole os dados para importar.' });
      return;
    }

    const parsed = parsePastedTextToDeliveries(pastedText);
    if (parsed.length === 0) {
      setImportFeedback({ success: false, message: 'Nenhuma carga identificada. Verifique os dados inseridos.' });
      return;
    }

    let importedCount = 0;

    parsed.forEach(row => {
      let lat = -23.5505;
      let lng = -46.6333;
      const destinationLower = row.destino.toLowerCase();
      if (destinationLower.includes('salvador') || destinationLower.includes('ba')) {
        lat = -12.9777; lng = -38.5016;
      } else if (destinationLower.includes('são luís') || destinationLower.includes('ma')) {
        lat = -2.5307; lng = -44.3068;
      } else if (destinationLower.includes('rio de janeiro') || destinationLower.includes('rj')) {
        lat = -22.9068; lng = -43.1729;
      } else if (destinationLower.includes('porto alegre') || destinationLower.includes('rs')) {
        lat = -30.0346; lng = -51.2177;
      } else if (destinationLower.includes('goiânia') || destinationLower.includes('go')) {
        lat = -16.6869; lng = -49.2648;
      } else if (destinationLower.includes('curitiba') || destinationLower.includes('pr')) {
        lat = -25.4284; lng = -49.2733;
      } else if (destinationLower.includes('belo horizonte') || destinationLower.includes('mg')) {
        lat = -19.9167; lng = -43.9345;
      }

      const isEntregue = row.status === 'entregue';

      saveEntrega({
        data_coleta: row.data_coleta,
        vendedor: row.vendedor,
        cliente: row.cliente,
        tel_cliente: row.tel_cliente,
        motorista: row.motorista,
        tel_motorista: row.tel_motorista,
        origem: row.origem,
        destino: row.destino,
        frete_empresa: row.frete_empresa,
        frete_motorista: row.frete_motorista,
        status: row.status,
        prazo: row.prazo,
        observacoes: row.observacoes,
        lat,
        lng,
        canhoto_solicitado: isEntregue
      });

      importedCount++;
    });

    if (importedCount > 0) {
      setImportFeedback({ success: true, message: `${importedCount} cargas importadas sequencialmente com sucesso absoluto!` });
      
      if (window.falarRodovar) {
        window.falarRodovar(`${importedCount} novas cargas importadas com sucesso absoluto para monitoramento.`);
      }

      setTimeout(() => {
        setIsImportModalOpen(false);
        setPastedText('');
        setImportFeedback(null);
        setEntregas(getEntregas());
      }, 1500);
    } else {
      setImportFeedback({ success: false, message: 'Nenhum registro pôde ser importado. Por favor, verifique se selecionou e copiou o bloco de campos corretamente.' });
    }
  };

  // Load entregas on start and bind custom event realtime syncer
  useEffect(() => {
    if (user) {
      setEntregas(getEntregas());
    }

    const unsubscribe = subscribeToRealtime((payload) => {
      // Reload from storage upon any changes (Always runs in unauthenticated mode)
      setEntregas(getEntregas());
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Voice Assistant Sync
  const handleSelectDelivery = (id: string) => {
    setSelectedEntregaId(id);
    setSelectedView('details');
  };

  const voice = useVoice(
    handleSelectDelivery,
    (status) => {
      setStatusFilter(status);
      setSelectedView('list');
    },
    (query) => {
      setSearchFilter(query);
      setSelectedView('list');
    }
  );

  // Actions
  const handleEditDelivery = (id: string) => {
    setEditingEntregaId(id);
    setSelectedView('form');
  };

  const handleAddNewDelivery = () => {
    setEditingEntregaId(undefined);
    setSelectedView('form');
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleConfirmDeleteActual = (id: string) => {
    deleteEntrega(id);
    setEntregas(getEntregas()); // Explicit reload to avoid race conditions or event issues
    setSelectedEntregaId(undefined); // Reset active selection
    setDeleteConfirmId(undefined);
    setSelectedView('list');
  };

  const userIsComercialOrExpedicao = useMemo(() => {
    if (!user) return false;
    const r = (user.role || '').toLowerCase();
    return r === 'comercial' || r === 'expedição' || r === 'expedicao';
  }, [user]);

  useEffect(() => {
    if (userIsComercialOrExpedicao && selectedView !== 'painel_fretes') {
      setSelectedView('painel_fretes');
    }
  }, [userIsComercialOrExpedicao, selectedView]);

  // Views selector router
  const renderCurrentView = () => {
    if (userIsComercialOrExpedicao) {
      return (
        <PainelFretesVisitantes 
          currentUser={{ 
            uid: user?.uid, 
            username: user?.username, 
            nome: user?.name, 
            role: user?.role 
          }} 
        />
      );
    }

    switch (selectedView) {
      case 'dashboard':
        return (
          <Dashboard 
            entregas={entregas} 
            onSelectDelivery={handleSelectDelivery}
            voiceHook={voice}
            onFilterCargas={(status) => {
              setStatusFilter(status);
              setSelectedView('list');
            }}
          />
        );
      case 'list':
        return (
          <DeliveryList 
            entregas={entregas}
            onSelectDelivery={handleSelectDelivery}
            onRefresh={() => setEntregas(getEntregas())}
            searchFilter={searchFilter}
            setSearchFilter={setSearchFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onAddDelivery={handleAddNewDelivery}
          />
        );
      case 'details':
        return selectedEntregaId ? (
          <div className="space-y-4">
            <DeliveryDetails 
              entregaId={selectedEntregaId}
              onBack={() => setSelectedView('list')}
              onEdit={handleEditDelivery}
              onDeleted={() => {
                setSelectedView('list');
                setSelectedEntregaId(undefined);
              }}
              onNavigateToManager={(id) => {
                setSelectedEntregaId(id);
                setSelectedView('manager');
              }}
            />
            
            <div className="flex justify-end pt-4 border-t border-zinc-900">
              <button 
                onClick={() => handleDeleteClick(selectedEntregaId)}
                className="px-4 py-2 bg-red-950/20 hover:bg-red-600 hover:text-white border border-red-900/40 text-red-400 text-xs font-mono font-bold uppercase rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                id="app-action-delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Carga do Sistema
              </button>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">Selecione uma carga válida.</div>
        );
      case 'form':
        return (
          <DeliveryForm 
            entregaId={editingEntregaId}
            onBack={() => {
              if (isEditingIdActive()) {
                setSelectedView('details');
              } else {
                setSelectedView('list');
              }
            }}
            onSaved={(savedId) => {
              setSelectedEntregaId(savedId);
              setSelectedView('details');
            }}
            onImportClick={() => setIsImportModalOpen(true)}
          />
        );
      case 'statistics':
        return (
          <Statistics entregas={entregas} />
        );
      case 'whatsapp':
        return (
          <WhatsAppScheduler />
        );
      case 'manager':
        return (
          <ManagerSupport 
            entregas={entregas} 
            initialEntregaId={selectedEntregaId}
          />
        );
      case 'registration':
        return (
          <EmployeeRegistration 
            onClose={() => setSelectedView('dashboard')}
            onSuccess={() => setSelectedView('dashboard')}
          />
        );
      case 'manual':
        return (
          <AgentManual 
            onClose={() => setSelectedView('dashboard')}
          />
        );
      case 'blacklist':
        return (
          <BlacklistManager currentUser={user} />
        );
      case 'backup':
        if (!user || (user.username !== 'master' && user.role !== 'Master')) {
          return <div className="text-center p-12 text-red-500 font-mono font-bold uppercase tracking-wider">Acesso Negado: Apenas o perfil Master tem acesso ao Backup Central.</div>;
        }
        return (
          <BackupRegistry 
            onClose={() => setSelectedView('dashboard')}
          />
        );
      case 'api_integration':
        if (!user || (user.username !== 'master' && user.role !== 'Master')) {
          return <div className="text-center p-12 text-red-500 font-mono font-bold uppercase tracking-wider">Acesso Negado: Apenas o perfil Master tem acesso à integração de API.</div>;
        }
        return (
          <ApiIntegration 
            onClose={() => setSelectedView('dashboard')}
            entregas={entregas}
          />
        );
      case 'telegram_integration':
        if (!user || (user.username !== 'master' && user.role !== 'Master')) {
          return <div className="text-center p-12 text-red-500 font-mono font-bold uppercase tracking-wider">Acesso Negado: Apenas o perfil Master tem acesso à integração do Telegram.</div>;
        }
        return (
          <TelegramIntegration 
            onClose={() => setSelectedView('dashboard')}
          />
        );
      case 'logs':
        if (!user || (user.username !== 'master' && user.role !== 'Master')) {
          return <div className="text-center p-12 text-red-500 font-mono font-bold uppercase tracking-wider">Acesso Negado: Apenas o perfil Master tem acesso à Auditoria de Atividades.</div>;
        }
        return (
          <ActivityLogs currentUser={user} />
        );
      case 'migration':
        if (!user || (user.username !== 'master' && user.role !== 'Master')) {
          return <div className="text-center p-12 text-red-500 font-mono font-bold uppercase tracking-wider">Acesso Negado: Apenas o perfil Master tem acesso à Configuração/Migração do Sistema.</div>;
        }
        return (
          <SystemMigration onClose={() => setSelectedView('dashboard')} />
        );
      case 'pagamentos':
        return (
          <Pagamentos currentUser={user} />
        );
      case 'agenda':
        return (
          <Agenda />
        );
      case 'operador_painel':
        return (
          <OperatorPanel 
            user={user}
            onBackToList={() => {
              setSelectedView('list');
              window.history.pushState({ path: '/' }, '', '/');
            }}
          />
        );
      case 'painel_fretes':
        return (
          <PainelFretesVisitantes
            currentUser={user}
            onNavigateHome={() => setSelectedView('list')}
          />
        );
      default:
        return <div className="text-center p-12 text-gray-500">Selecione uma opção válida.</div>;
    }
  };

  const isEditingIdActive = () => !!editingEntregaId;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <Truck className="w-12 h-12 text-[#FFD600] animate-bounce" />
          <div className="text-[#FFD600] text-sm font-mono tracking-widest uppercase">CONECTANDO AO SISTEMA...</div>
        </div>
      </div>
    );
  }

  // Bypass login check for public tracking page
  if (selectedView === 'rastrear') {
    return (
      <Rastrear 
        userLogged={user}
        onClose={() => {
          setSelectedView('list');
          window.history.pushState({ path: '/' }, '', '/');
        }}
        onAccessColaborador={() => {
          setSelectedView('list');
        }}
      />
    );
  }

  // Bypass login check for public driver live tracking page
  if (selectedView === 'motorista') {
    return (
      <MotoristaTracking 
        onClose={() => {
          setSelectedView('rastrear');
          window.history.pushState({ path: '/' }, '', '/');
        }}
      />
    );
  }

  if (!user) {
    return (
      <Login 
        onBackToTracking={() => setSelectedView('rastrear')}
        onLoginSuccess={(userData) => {
          setUser(userData);
          // Personalized vocal greeting on successful login based on role
          if ((window as any).falarRodovar) {
            let greeting = `Seja bem vindo ao sistema Rodovar Monitora, ${userData.displayName}! Painel ativado.`;
            const lowerRole = (userData.role || '').toLowerCase();
            const lowerUser = (userData.username || '').toLowerCase();
            
            if (lowerUser === 'master') {
              greeting = `Olá, Administrador Mestre! O sistema Rodovar está totalmente liberado. O painel de controle e cadastro de funcionários foi desbloqueado com segurança.`;
            } else if (lowerUser === 'mateus') {
              greeting = `Seja bem vindo ao sistema Rodovar Monitora, Mateus! O painel operacional está pronto para uso. Vamos acompanhar as cargas juntos hoje?`;
            } else if (lowerUser === 'priscila') {
              greeting = `Seja bem vindo ao sistema Rodovar Monitora, Priscila! Painel de controle operacional ativo. Quais rotas vamos vigiar hoje?`;
            } else if (lowerUser === 'jairobahia') {
              greeting = `Seja bem vindo ao sistema Rodovar Monitora, Jairo Bahia! Painel de controle operacional ativo. Como estão as coletas e os envios de WhatsApp hoje?`;
            } else if (lowerRole.includes('operador')) {
              greeting = `Seja bem vindo ao sistema Rodovar Monitora, ${userData.displayName}! Painel operacional ativo com sucesso.`;
            } else if (lowerUser === 'genivaldo' || lowerRole.includes('gerente')) {
              greeting = `Olá, Gerente Genivaldo! O painel gerencial da Rodovar está pronto. Notei alguns veículos parados na rota, deseja iniciar uma varredura?`;
            } else if (lowerUser === 'alexandre' || lowerRole.includes('comercial')) {
              greeting = `Olá, Diretor Alexandre! Painel de faturamento e carteira comercial ativo. Deseja analisar o valor total das cargas monitoradas no sistema?`;
            } else if (lowerUser === 'petronio' || lowerRole.includes('financeiro')) {
              greeting = `Olá, Petrônio! Painel financeiro carregado com sucesso. Como estão as conciliações de frete e aprovação de repasses hoje?`;
            } else if (lowerUser === 'ricardo') {
              greeting = `Olá, Diretor Ricardo! Painel operacional carregado com sucesso. Como estão o monitoramento de rotas e o desempenho de entrega do sistema Rodovar hoje?`;
            } else if (lowerUser === 'vitor' || lowerRole.includes('operações') || lowerRole.includes('operacoes')) {
              greeting = `Olá, Diretor Vitor! Painel geral carregado. O índice de pontualidade operacional e monitoramento geográfico segue cem por cento atualizado.`;
            }
            
            (window as any).falarRodovar(greeting);
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-[#FFD600] selection:text-black">
      
      {/* Top Header Rail bar structure (High Density Theme) */}
      <header className="border-b border-zinc-800 bg-[#0a0a0a] sticky top-0 z-[1010] backdrop-blur-md">
        {/* Mobile and Tablet Header Container (lg:hidden) */}
        <div className="lg:hidden max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3">
          
          {/* Row 1: Logo and Quick User Actions */}
          <div className="flex items-center justify-between w-full pb-2 border-b border-zinc-900">
            {/* Logo and Branding exactly from design specifications */}
            <div className="flex items-center gap-2 cursor-pointer select-none shrink-0" onClick={() => setSelectedView('list')}>
              <img 
                src="https://rodovar.com.br/wp-content/uploads/2026/02/logo.png" 
                alt="Rodovar" 
                className="h-8 w-auto object-contain shrink-0" 
                referrerPolicy="no-referrer"
              />
              <div className="hidden sm:block shrink-0">
                <h1 className="text-sm font-black tracking-tight text-[#FFD600] m-0 leading-none">
                  RODOVAR MONITORA
                </h1>
              </div>
            </div>

            {/* Compact Right Side Actions */}
            <div className="flex items-center gap-2">
              {/* Mute Speech Button */}
              <button
                onClick={toggleMuteSpeech}
                className={`p-1.5 px-2.5 border rounded transition-all cursor-pointer h-8 flex items-center gap-1 text-[9px] uppercase font-mono font-bold ${
                  isSpeechMuted 
                    ? 'bg-red-950/20 text-red-400 border-red-900/60' 
                    : 'bg-emerald-950/15 text-emerald-400 border-emerald-900/60'
                }`}
                title={isSpeechMuted ? "Fala desativada" : "Fala ativa"}
                id="mute-speech-toggle-btn"
              >
                {isSpeechMuted ? <VolumeX className="w-3.5 h-3.5 text-red-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span className="hidden sm:inline">{isSpeechMuted ? "MUDO" : "FALA"}</span>
              </button>

              {/* User badge */}
              <div className="flex items-center gap-1.5 bg-zinc-900/40 p-1 pr-2 rounded-lg border border-zinc-850">
                <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 font-bold text-[9px] text-[#FFD600]" title={user.displayName}>
                  {user.displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <span className="text-[10px] font-bold text-zinc-300 hidden sm:inline">{user.displayName.split(' ')[0]}</span>
                
                {/* Password Change Button */}
                <button
                  onClick={() => setIsChangePasswordOpen(true)}
                  className="p-1 text-zinc-400 hover:text-[#FFD600] transition-colors cursor-pointer ml-1"
                  title="Alterar Senha"
                >
                  <Lock className="w-3 h-3 text-[#FFD600]" />
                </button>

                <button
                  onClick={handleLogout}
                  className="p-1 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Sair do Sistema"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Core Primary Navigation (Segmented Grid Control) */}
          <div className="grid grid-cols-4 gap-1 w-full bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-900">
            {/* Cargas */}
            <button
              onClick={() => setSelectedView('list')}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                selectedView === 'list' || selectedView === 'details'
                ? 'bg-[#FFD600] text-black shadow-md font-extrabold' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
              id="nav-list"
            >
              <Truck className="w-4 h-4 shrink-0" />
              <span className="text-[9px]">Cargas</span>
            </button>

            {/* Colaborador */}
            <button
              onClick={() => setSelectedView('rastrear')}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                selectedView === 'rastrear'
                ? 'bg-[#FFD600] text-black shadow-md font-extrabold' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
              id="nav-rastrear"
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span className="text-[9px]">Equipe</span>
            </button>

            {/* Painel */}
            <button
              onClick={() => setSelectedView('dashboard')}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                selectedView === 'dashboard'
                ? 'bg-[#FFD600] text-black shadow-md font-extrabold' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
              id="nav-dashboard"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span className="text-[9px]">Painel</span>
            </button>

            {/* Agenda */}
            <button
              onClick={() => {
                setSelectedView('agenda');
                window.history.pushState({ path: '/agenda' }, '', '/agenda');
              }}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                selectedView === 'agenda'
                ? 'bg-[#FFD600] text-black shadow-md font-extrabold' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
              id="nav-agenda"
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="text-[9px]">Agenda</span>
            </button>
          </div>

          {/* Row 3: Collapsible Secondary Tools Accordion */}
          <div className="w-full">
            <button
              onClick={() => setIsToolsExpanded(!isToolsExpanded)}
              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-[10px] uppercase font-mono font-bold transition-all ${
                isToolsExpanded || ['statistics', 'whatsapp', 'manager', 'blacklist', 'manual', 'backup', 'registration', 'migration', 'pagamentos'].includes(selectedView)
                  ? 'bg-zinc-900 border-zinc-850 text-[#FFD600]'
                  : 'bg-zinc-950/50 border-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
                {['statistics', 'whatsapp', 'manager', 'blacklist', 'manual', 'backup', 'registration', 'migration', 'pagamentos'].includes(selectedView)
                  ? `Ferramenta: ${selectedView.toUpperCase()}`
                  : 'Mais Ferramentas & Suporte'}
              </span>
              {isToolsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence>
              {(isToolsExpanded || ['statistics', 'whatsapp', 'manager', 'blacklist', 'manual', 'backup', 'registration', 'migration', 'pagamentos'].includes(selectedView)) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-1.5 bg-zinc-950/90 border border-zinc-900 rounded-xl p-2.5"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {/* Pagamentos */}
                    {!userIsComercialOrExpedicao && (
                      <button
                        onClick={() => {
                          setSelectedView('pagamentos');
                          window.history.pushState({ path: '/pagamentos' }, '', '/pagamentos');
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'pagamentos' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-pagamentos-mobile"
                      >
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        <span>Pagamentos</span>
                      </button>
                    )}

                    {/* Desempenho */}
                    <button
                      onClick={() => setSelectedView('statistics')}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                        selectedView === 'statistics' 
                        ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                      }`}
                      id="nav-stats"
                    >
                      <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                      <span>Desempenho</span>
                    </button>

                    {/* AgenteZAP */}
                    <button
                      onClick={() => setSelectedView('whatsapp')}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                        selectedView === 'whatsapp' 
                        ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                      }`}
                      id="nav-whatsapp"
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span>AgenteZAP</span>
                    </button>

                    {/* Gerente Genivaldo */}
                    <button
                      onClick={() => setSelectedView('manager')}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                        selectedView === 'manager' 
                        ? 'bg-red-950/30 text-red-400 border-red-900/40 font-black' 
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                      }`}
                      id="nav-manager"
                    >
                      <Shield className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>Gerente</span>
                    </button>

                    {/* Lista Negra */}
                    <button
                      onClick={() => setSelectedView('blacklist')}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                        selectedView === 'blacklist' 
                        ? 'bg-red-950/30 text-red-400 border-red-900/40 font-black' 
                        : 'text-zinc-400 hover:text-white hover:bg-[#181010]/60 border-transparent'
                      }`}
                      id="nav-blacklist"
                    >
                      <UserX className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>Lista Negra</span>
                    </button>

                    {/* Manual Agente */}
                    <button
                      onClick={() => setSelectedView('manual')}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                        selectedView === 'manual' 
                        ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                      }`}
                      id="nav-manual"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                      <span>Manual Agente</span>
                    </button>

                    {/* Backup Central (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('backup')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'backup' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-backup"
                      >
                        <Database className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Backup Central</span>
                      </button>
                    )}

                    {/* Cadastro (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('registration')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'registration' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-registration"
                      >
                        <Users className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Cadastro Colab.</span>
                      </button>
                    )}

                    {/* Integração API (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('api_integration')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'api_integration' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-api-integration"
                      >
                        <Webhook className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Integração API</span>
                      </button>
                    )}

                    {/* Integração Telegram (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('telegram_integration')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'telegram_integration' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-telegram-integration"
                      >
                        <Bot className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Integração Telegram</span>
                      </button>
                    )}

                    {/* Auditoria Logs (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('logs')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'logs' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-logs"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Logs Auditoria</span>
                      </button>
                    )}

                    {/* Migração (Admin-only) */}
                    {user && (user.username === 'master' || user.role === 'Master') && (
                      <button
                        onClick={() => setSelectedView('migration')}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                          selectedView === 'migration' 
                          ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/40 font-black' 
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60 border-transparent'
                        }`}
                        id="nav-migration"
                      >
                        <Server className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span>Sist. / Migração</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Row 4: Tracking frequency (Sinc. Nuvem) & Cadastrar Carga Button */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full items-stretch border-t border-zinc-900 pt-3">
            {/* Left Col: Tracking frequency selector */}
            <div className="w-full flex justify-center">
              <TrackingModeSelector />
            </div>

            {/* Right Col: Cadastrar Carga Button */}
            {user?.role !== 'Visitante' && (
              <div className="flex items-center justify-center">
                <button
                  onClick={handleAddNewDelivery}
                  className="w-full h-11 flex items-center justify-center bg-[#FFD600] hover:bg-[#ffe23b] text-[#0a0a0a] rounded-xl gap-2 transition-all text-xs font-mono uppercase font-black cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.2)] active:scale-95"
                  id="global-cadastrar-btn"
                >
                  <Truck className="w-4 h-4 text-black shrink-0 animate-bounce" />
                  <span>Cadastrar Carga</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Desktop Header Container (hidden lg:flex) */}
        <div className="hidden lg:flex flex-col max-w-7xl mx-auto px-4 py-3 gap-3">
          {/* Top Row: Logo & Profile */}
          <div className="flex items-center justify-between">
            {/* Logo and Branding exactly from design specifications */}
            <div className="flex items-center gap-3.5 cursor-pointer select-none" onClick={() => setSelectedView('list')}>
              <img 
                src="https://rodovar.com.br/wp-content/uploads/2026/02/logo.png" 
                alt="Rodovar" 
                className="h-10 w-auto transition-transform hover:scale-105 object-contain" 
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="text-lg font-black tracking-tighter text-[#FFD600] flex items-center gap-2 m-0 leading-none">
                  RODOVAR MONITORA
                </h1>
              </div>
            </div>

            {/* High Density Right Side Info Items */}
            <div className="flex items-center gap-3.5">
              {/* Quota Saving Mode (Modo Light) Toggle Button */}
              <button
                onClick={toggleLightMode}
                className={`p-1.5 px-3 border rounded transition-all cursor-pointer h-8 flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold ${
                  isLightMode 
                    ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/45' 
                    : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white'
                }`}
                title={isLightMode ? "Modo Light ativo para economia de banco de dados. Clique para Sincronismo Rápido." : "Modo Express ativo. Clique para ativar economia de banco de dados."}
                id="desktop-light-mode-toggle-btn"
              >
                <Database className="w-3.5 h-3.5 text-[#FFD600]" />
                <span>{isLightMode ? "MODO LIGHT" : "MODO EXPRESS"}</span>
              </button>

              {/* Tracking Frequency Mode Selector */}
              <TrackingModeSelector />

              {/* Mute Speech Button */}
              <button
                onClick={toggleMuteSpeech}
                className={`p-1.5 px-3 border rounded transition-all cursor-pointer h-8 flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold ${
                  isSpeechMuted 
                    ? 'bg-red-950/20 text-red-400 border-red-900/60 hover:text-red-355' 
                    : 'bg-emerald-950/15 text-emerald-400 border-emerald-900/60 hover:text-emerald-355'
                }`}
                title={isSpeechMuted ? "Fala desativada temporariamente. Clique para reativar." : "Fala ativa. Clique para desativar temporariamente."}
                id="desktop-mute-speech-toggle-btn"
              >
                {isSpeechMuted ? <VolumeX className="w-3.5 h-3.5 text-red-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isSpeechMuted ? "FALA DESATIVADA" : "FALA ATIVA"}</span>
              </button>

              {/* Cadastrar Carga Button */}
              {user?.role !== 'Visitante' && (
                <button
                  onClick={handleAddNewDelivery}
                  className="flex items-center bg-[#FFD600] hover:bg-[#ffe23b] text-[#0a0a0a] rounded-full px-4 py-1.5 gap-1.5 transition-all text-[10px] font-mono uppercase font-black cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.15)] hover:scale-[1.02] active:scale-95"
                  id="desktop-global-cadastrar-btn"
                >
                  <Truck className="w-3.5 h-3.5 text-black shrink-0" />
                  <span>Cadastrar Carga</span>
                </button>
              )}

              {/* User badge customized */}
              <div className="flex items-center gap-2.5 border-l border-zinc-800 pl-4">
                <div className="text-right">
                  <p className="text-xs font-bold leading-none uppercase text-zinc-200 m-0">{user.displayName}</p>
                  <p className="text-[9px] text-zinc-500 font-mono leading-none mt-1 mb-0">{user.role}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 font-bold text-xs text-[#FFD600]" title={user.displayName}>
                  {user.displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                
                {/* Password Change Button */}
                <button
                  onClick={() => setIsChangePasswordOpen(true)}
                  className="p-1 px-2.5 border border-zinc-800 hover:border-[#FFD600] text-zinc-400 hover:text-[#FFD600] bg-zinc-900/40 rounded transition-colors cursor-pointer ml-1 h-8 flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold"
                  title="Alterar Senha"
                >
                  <Lock className="w-3 h-3 text-[#FFD600]" />
                  <span>Senha</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="p-1 px-2 border border-zinc-800 hover:border-red-900 text-zinc-400 hover:text-red-400 bg-zinc-900/40 rounded transition-colors cursor-pointer h-8 flex items-center"
                  title="Sair do Sistema"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Divider line separating rows for sleek structural organization */}
          <div className="border-t border-zinc-900 my-0.5" />

          {/* Bottom Row: Navigation Redesigned in Spatially Partitioned Modules with auto-wrap to Prevent Overlap */}
          <nav className="flex flex-wrap items-center justify-start xl:justify-between gap-3 py-2 border-t border-zinc-900/85 mt-2 w-full">
            
            {/* Section 1: Core Operations */}
            <div className="flex items-center gap-1.5 bg-zinc-950/50 p-1 rounded-xl border border-zinc-900/60 shrink-0">
              <span className="text-[10px] font-bold font-mono tracking-widest text-zinc-500 px-2 uppercase">Geral</span>
              <div className="flex items-center gap-1">
                {/* Nav List */}
                <button
                  onClick={() => setSelectedView('list')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'list' || selectedView === 'details'
                    ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                    : 'bg-zinc-900/20 border-transparent text-zinc-400 hover:text-[#FFD600]'
                  }`}
                  id="desktop-nav-list"
                >
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  <span>Cargas</span>
                </button>

                {/* Nav Rastreamento Público (Alteração 3) */}
                <button
                  onClick={() => setSelectedView('rastrear')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'rastrear'
                    ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                    : 'bg-zinc-900/20 border-transparent text-zinc-400 hover:text-[#FFD600]'
                  }`}
                  id="desktop-nav-rastrear"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>Colaborador</span>
                </button>

                {/* Nav Dashboard */}
                <button
                  onClick={() => setSelectedView('dashboard')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'dashboard'
                    ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                    : 'bg-zinc-900/20 border-transparent text-zinc-400 hover:text-[#FFD600]'
                  }`}
                  id="desktop-nav-dashboard"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                  <span>Painel</span>
                </button>

                {/* Nav Agenda Rodovar button (replaces desktop Painel Operador) */}
                <button
                  onClick={() => {
                    setSelectedView('agenda');
                    window.history.pushState({ path: '/agenda' }, '', '/agenda');
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'agenda'
                    ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                    : 'bg-zinc-900/20 border-transparent text-zinc-350 hover:text-[#FFD600]'
                  }`}
                  id="desktop-nav-agenda"
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0 animate-pulse text-inherit" />
                  <span>Agenda</span>
                </button>

                {/* Nav Painel Comercial & Expedição */}
                <button
                  onClick={() => {
                    setSelectedView('painel_fretes');
                    window.history.pushState({ path: '/painel-fretes' }, '', '/painel-fretes');
                  }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'painel_fretes'
                    ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                    : 'bg-zinc-900/20 border-transparent text-zinc-350 hover:text-[#FFD600]'
                  }`}
                  id="desktop-nav-painel-fretes"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-inherit" />
                  <span>Painel Comercial</span>
                </button>

                {/* Nav Pagamentos (Bloqueado para Comercial e Expedição) */}
                {!userIsComercialOrExpedicao && (
                  <button
                    onClick={() => {
                      setSelectedView('pagamentos');
                      window.history.pushState({ path: '/pagamentos' }, '', '/pagamentos');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold font-sans uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'pagamentos'
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-extrabold shadow-sm' 
                      : 'bg-zinc-900/20 border-transparent text-zinc-350 hover:text-[#FFD600]'
                    }`}
                    id="desktop-nav-pagamentos"
                  >
                    <DollarSign className="w-3.5 h-3.5 shrink-0 text-inherit" />
                    <span>Pagamentos</span>
                  </button>
                )}
              </div>
            </div>

            {/* Section 2: Support & Tools */}
            <div className="flex items-center gap-1.5 bg-zinc-950/50 p-1 rounded-xl border border-zinc-900/60 shrink-0">
              <span className="text-[10px] font-bold font-mono tracking-widest text-zinc-500 px-2 uppercase">Suporte</span>
              <div className="flex items-center gap-1">
                {/* Nav Stats */}
                <button
                  onClick={() => setSelectedView('statistics')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'statistics' 
                    ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/45 font-bold' 
                    : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                  }`}
                  id="desktop-nav-stats"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                  <span>Desempenho</span>
                </button>

                {/* Nav WhatsApp */}
                <button
                  onClick={() => setSelectedView('whatsapp')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'whatsapp' 
                    ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/45 font-bold' 
                    : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                  }`}
                  id="desktop-nav-whatsapp"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                  <span>AgenteZAP</span>
                </button>

                {/* Nav Manager */}
                <button
                  onClick={() => setSelectedView('manager')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'manager' 
                    ? 'bg-red-950/45 text-red-500 border-red-900/50 font-bold' 
                    : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                  }`}
                  id="desktop-nav-manager"
                >
                  <Shield className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>Gerente Genivaldo</span>
                </button>
              </div>
            </div>

            {/* Section 3: Safety & Auditing */}
            <div className="flex items-center gap-1.5 bg-zinc-950/50 p-1 rounded-xl border border-zinc-900/60 shrink-0">
              <span className="text-[10px] font-bold font-mono tracking-widest text-zinc-500 px-2 uppercase">Segurança</span>
              <div className="flex items-center gap-1">
                {/* Nav Blacklist */}
                <button
                  onClick={() => setSelectedView('blacklist')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'blacklist' 
                    ? 'bg-red-950/45 text-red-500 border-red-900/50 font-bold' 
                    : 'text-zinc-400 border-transparent hover:text-white hover:bg-[#181010]/60'
                  }`}
                  id="desktop-nav-blacklist"
                >
                  <UserX className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>Lista Negra</span>
                </button>

                {/* Nav Manual */}
                <button
                  onClick={() => setSelectedView('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                    selectedView === 'manual' 
                    ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/45 font-bold' 
                    : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                  }`}
                  id="desktop-nav-manual"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                  <span>Manual Agente</span>
                </button>
              </div>
            </div>

            {/* Section 4: Master Panel (Saves massive space, high-end design, visible only to Master) */}
            {user && (user.username === 'master' || user.role === 'Master') && (
              <div className="flex items-center gap-1.5 bg-[#FFD600]/5 p-1 rounded-xl border border-[#FFD600]/25 shrink-0">
                <span className="text-[10px] font-black font-mono tracking-widest text-[#FFD600] px-2.5 uppercase">Master</span>
                <div className="flex items-center gap-1">
                  {/* Nav Backup */}
                  <button
                    onClick={() => setSelectedView('backup')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'backup' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-backup"
                  >
                    <Database className="w-3.5 h-3.5 shrink-0" />
                    <span>Backup Central</span>
                  </button>

                  {/* Nav Registration */}
                  <button
                    onClick={() => setSelectedView('registration')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'registration' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-registration"
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>Cadastro</span>
                  </button>

                  {/* Nav API Integration */}
                  <button
                    onClick={() => setSelectedView('api_integration')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'api_integration' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-api-integration"
                  >
                    <Webhook className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                    <span>Integração API</span>
                  </button>

                  {/* Nav Telegram Integration */}
                  <button
                    onClick={() => setSelectedView('telegram_integration')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'telegram_integration' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-telegram-integration"
                  >
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>Telegram (Agente IA)</span>
                  </button>

                  {/* Nav Logs Auditoria */}
                  <button
                    onClick={() => setSelectedView('logs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'logs' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-logs"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                    <span>Auditoria</span>
                  </button>

                  {/* Nav Migração */}
                  <button
                    onClick={() => setSelectedView('migration')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1.5 border ${
                      selectedView === 'migration' 
                      ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] font-black' 
                      : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/40'
                    }`}
                    id="desktop-nav-migration"
                  >
                    <Server className="w-3.5 h-3.5 shrink-0" />
                    <span>Sist. / Migração</span>
                  </button>
                </div>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container structure */}
      <main className="flex-1 max-w-7xl xl:max-w-[1450px] 2xl:max-w-[1600px] w-full mx-auto px-4 py-6 font-sans">
        {firestoreQuotaExceeded && (
          <div className="mb-6 p-4 rounded-xl bg-amber-950/20 border border-amber-900/60 text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in" id="rodovar-quota-banner">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] uppercase font-mono font-black tracking-widest block text-amber-400">COTA DIÁRIA DO FIREBASE ESGOTADA (EXCEEDED)</span>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans mt-0.5">
                  Prezado Operador, o limite gratuito do Firebase se esgotou para hoje. Ativamos o <strong>Módulo de Resiliência Local (Off-line)</strong> com as informações salvas no seu navegador, permitindo que você continue acompanhando as rotas logísticas e cargas normalmente. Amanhã a cota do servidor se renovará de forma totalmente automática!
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] uppercase font-mono rounded cursor-pointer whitespace-nowrap self-end sm:self-center transition-colors"
            >
              🔄 Tentar Reconectar
            </button>
          </div>
        )}
        <div className="min-h-[500px]">
          {renderCurrentView()}
        </div>
      </main>

      {/* Humble Footer with High Density elements */}
      <footer className="h-10 bg-zinc-950 border-t border-zinc-900 px-6 flex items-center justify-end text-[10px] text-zinc-500 uppercase font-mono">
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
            Rodovar Transportadora LTDA
          </span>
          <span>© 2026</span>
        </div>
      </footer>

      {/* Global Import modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-fade-in">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
            
            {/* Header */}
            <div className="border-b border-zinc-800 p-5 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2">
                <Clipboard className="w-5 h-5 text-[#FFD600]" />
                <div>
                  <h3 className="text-sm font-bold font-sans uppercase tracking-wider text-white">Importador Inteligente de Planilhas</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Copie linhas inteiras do Excel ou Google Planilhas (Ctrl+C) e cole abaixo (Ctrl+V)</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setPastedText('');
                  setImportFeedback(null);
                }}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider font-mono border border-zinc-800 px-2.5 py-1 rounded bg-zinc-900"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <p className="text-xs text-zinc-400 mb-2 leading-relaxed">
                  Para uma importação perfeita, certifique-se de que a ordem das colunas da planilha copiada segue o fluxo padrão abaixo:
                </p>
                <div className="bg-zinc-950/80 border border-zinc-900 p-3 mb-4 select-all rounded-lg">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-tight block overflow-x-auto whitespace-nowrap">
                    DATA &nbsp;&nbsp;➔&nbsp;&nbsp; ATENDENTE &nbsp;&nbsp;➔&nbsp;&nbsp; CLIENTE &nbsp;&nbsp;➔&nbsp;&nbsp; TEL CLIENTE &nbsp;&nbsp;➔&nbsp;&nbsp; MOTORISTA &nbsp;&nbsp;➔&nbsp;&nbsp; TEL MOTORISTA &nbsp;&nbsp;➔&nbsp;&nbsp; ORIGEM &nbsp;&nbsp;➔&nbsp;&nbsp; DESTINO &nbsp;&nbsp;➔&nbsp;&nbsp; FRETE EMP. &nbsp;&nbsp;➔&nbsp;&nbsp; FRETE MOT. &nbsp;&nbsp;➔&nbsp;&nbsp; STATUS &nbsp;&nbsp;➔&nbsp;&nbsp; PRAZO &nbsp;&nbsp;➔&nbsp;&nbsp; OBS
                  </span>
                </div>
              </div>

              {/* Text Area Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Área de Transferência (Cole aqui):</label>
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    setImportFeedback(null);
                  }}
                  placeholder="Cole (Ctrl + V) as linhas copiadas da sua planilha aqui..."
                  className="w-full h-44 bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-200 placeholder-zinc-650 focus:border-[#FFD600] focus:ring-0 focus:outline-none resize-none transition-colors"
                />
              </div>

              {/* Feedback messages */}
              {importFeedback && (
                <div className={`p-4 rounded-xl text-xs font-semibold border ${
                  importFeedback.success 
                  ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
                  : 'bg-red-950/30 border-red-900/50 text-red-400'
                }`}>
                  {importFeedback.message}
                </div>
              )}

              {/* Instant Live Preview */}
              {parsedRowsPreview.length > 0 && (
                <div className="space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-gray-300">
                      Pré-visualização da Importação ({parsedRowsPreview.length} cargas identificadas):
                    </span>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono">
                      Formato reconhecido
                    </span>
                  </div>

                  <div className="border border-zinc-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs font-sans">
                      <thead className="bg-zinc-950 text-gray-500 uppercase text-[9px] tracking-wider font-mono border-b border-zinc-800 sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Data Coleta</th>
                          <th className="py-2.5 px-3 font-semibold">Cliente</th>
                          <th className="py-2.5 px-3 font-semibold">Motorista</th>
                          <th className="py-2.5 px-3 font-semibold">Origem / Destino</th>
                          <th className="py-2.5 px-3 font-semibold">Status Previsto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900 bg-zinc-900/30">
                        {parsedRowsPreview.map((row, idx) => (
                          <tr key={idx} className="hover:bg-zinc-900/50">
                            <td className="py-2 px-3 font-mono text-[10px] text-gray-400">{row.data}</td>
                            <td className="py-2 px-3 text-zinc-300 truncate max-w-[120px]" title={row.cliente}>{row.cliente}</td>
                            <td className="py-2 px-3 text-zinc-300 truncate max-w-[120px]">{row.motorista}</td>
                            <td className="py-2 px-3 text-zinc-400 font-mono text-[10px] truncate max-w-[180px]">
                              {row.origem} ➔ {row.destino}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-mono font-bold ${
                                row.status === 'entregue' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
                                row.status === 'em_transito' ? 'bg-yellow-950/40 text-[#FFD600] border border-yellow-900/50' :
                                row.status === 'parado' ? 'bg-red-950/40 text-red-400 border border-red-900/50' :
                                'bg-blue-950/40 text-blue-400 border border-blue-900/50'
                              }`}>
                                {row.status === 'entregue' ? 'Entregue ✅' :
                                 row.status === 'em_transito' ? 'Trânsito 🚚' :
                                 row.status === 'parado' ? 'Parado 🛑' :
                                 'Coletando 📦'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Actions footer */}
            <div className="border-t border-zinc-800 p-5 bg-zinc-950 flex items-center justify-end gap-3 font-sans">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setPastedText('');
                  setImportFeedback(null);
                }}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGlobalImport}
                disabled={parsedRowsPreview.length === 0}
                className={`px-5 py-2 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-all cursor-pointer ${
                  parsedRowsPreview.length > 0 
                  ? 'bg-[#FFD600] text-black hover:bg-[#ffe23b] shadow-lg' 
                  : 'bg-zinc-850 text-zinc-600 cursor-not-allowed border border-zinc-800'
                }`}
              >
                Confirmar Importação ({parsedRowsPreview.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details View Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[2100] p-4 animate-fade-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121212] border-2 border-red-900/40 rounded-2xl max-w-md w-full shadow-2xl relative overflow-hidden text-center"
          >
            <div className="bg-red-950/20 border-b border-zinc-800/80 p-5 flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-sans">Excluir Carga do Sistema?</h3>
            </div>
            
            <div className="p-6 space-y-4 font-sans text-left">
              <p className="text-xs text-gray-300 leading-relaxed">
                Tem certeza de que deseja excluir permanentemente esta carga monitorada do sistema? Todos os dados históricos e monitoramentos serão eliminados imediatamente de forma irreversível.
              </p>
            </div>

            <div className="border-t border-zinc-900 p-4 bg-zinc-950 flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                onClick={() => setDeleteConfirmId(undefined)}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmDeleteActual(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg hover:shadow-lg hover:shadow-red-950/30 transition-all cursor-pointer font-extrabold"
              >
                Excluir Carga
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <ChangePasswordModal 
          username={user.username}
          onClose={() => setIsChangePasswordOpen(false)}
          onSuccess={() => setIsChangePasswordOpen(false)}
        />
      )}

      {/* Persistent Floating Chat (Removido para Comercial e Expedição) */}
      {user && !userIsComercialOrExpedicao && (
        <FloatingChat currentUser={user} />
      )}
    </div>
  );
}
