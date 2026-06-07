import { useState, useEffect, useMemo, useRef } from 'react';
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

import { 
  Truck, 
  BarChart3, 
  ListFilter, 
  User, 
  Volume2, 
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Trash2,
  List,
  MessageSquare,
  Clipboard,
  LogOut,
  Lock,
  Shield,
  Users,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ViewMode = 'dashboard' | 'list' | 'details' | 'form' | 'statistics' | 'whatsapp' | 'manager';


export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [selectedView, setSelectedView] = useState<ViewMode>('dashboard');
  const [selectedEntregaId, setSelectedEntregaId] = useState<string | undefined>(undefined);
  const [editingEntregaId, setEditingEntregaId] = useState<string | undefined>(undefined);

  // Filter states maintained in parent to support Voice query syncs
  const [searchFilter, setSearchFilter] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('all');

  // Load user session on start
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
    setIsAuthLoading(false);
    setEntregas(getEntregas());
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

  // Greeting trigger on login with automatic voice listening activation
  const hasGreetedRef = useRef<string | null>(null);
  const voiceSpeakRef = useRef<any>(null);
  const voiceStartRef = useRef<any>(null);
  const voiceSetCtxRef = useRef<any>(null);

  // Keep references to voice helper methods up-to-date in refs
  useEffect(() => {
    voiceSpeakRef.current = voice?.speak;
    voiceStartRef.current = voice?.startListening;
    voiceSetCtxRef.current = voice?.setContext;
  });

  const activeUserId = user?.username || '';

  useEffect(() => {
    if (activeUserId && hasGreetedRef.current !== activeUserId) {
      hasGreetedRef.current = activeUserId;
      
      let greeting = `Seja bem vindo ao sistema Rodovar Monitora, ${user?.displayName || 'colaborador'}! Painel ativado.`;
      const lowerRole = (user?.role || '').toLowerCase();
      const lowerUser = activeUserId.toLowerCase();
      
      if (lowerUser === 'master') {
        greeting = `Olá, Administrador Mestre! O sistema Rodovar está totalmente liberado. O painel de controle e cadastro de funcionários foi desbloqueado com segurança.`;
      } else if (lowerUser === 'jairobahia' || lowerRole.includes('operador')) {
        greeting = `Seja bem vindo ao sistema Rodovar Monitora, Jairo Bahia! Painel de controle operacional ativo. Como estão as coletas e os envios de WhatsApp hoje?`;
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

      setTimeout(() => {
        if (voiceSpeakRef.current && voiceSetCtxRef.current) {
          // Set context to 'greeting' before speaking so the response is listened to under the greeting flow
          voiceSetCtxRef.current('greeting');
          voiceSpeakRef.current(greeting, () => {
            if (voiceStartRef.current) {
              voiceStartRef.current();
            }
          });
        }
      }, 1200); // Soft layout breathing space
    } else if (!activeUserId) {
      hasGreetedRef.current = null;
    }
  }, [activeUserId]);

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

  // Views selector router
  const renderCurrentView = () => {
    switch (selectedView) {
      case 'dashboard':
        return (
          <Dashboard 
            entregas={entregas} 
            onSelectDelivery={handleSelectDelivery}
            voiceHook={voice}
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

  if (!user) {
    return (
      <Login 
        onLoginSuccess={(userData) => {
          setUser(userData);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-[#FFD600] selection:text-black">
      
      {/* Top Header Rail bar structure (High Density Theme) */}
      <header className="border-b border-zinc-800 bg-[#0a0a0a] sticky top-0 z-[1010] backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-col md:flex-row items-center justify-between gap-4 h-auto md:h-16">
          
          {/* Logo and Branding exactly from design specifications */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedView('dashboard')}>
            <img 
              src="https://rodovar.com.br/wp-content/uploads/2026/02/logo.png" 
              alt="Rodovar" 
              className="h-8 md:h-10 w-auto transition-transform hover:scale-105 object-contain" 
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-lg font-black tracking-tighter text-[#FFD600] flex items-center gap-2 m-0 leading-none">
                RODOVAR MONITORA
              </h1>
            </div>
          </div>

          {/* Navigation with High Density spacing */}
          <nav className="flex items-center flex-wrap justify-center gap-1 md:gap-1.5">
            
            {/* Nav Dashboard */}
            <button
              onClick={() => setSelectedView('dashboard')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'dashboard' 
                ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-dashboard"
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Painel Geral</span>
              <span className="inline sm:hidden">Painel</span>
            </button>

            {/* Nav List */}
            <button
              onClick={() => setSelectedView('list')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'list' || selectedView === 'details'
                ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-list"
            >
              <List className="w-3.5 h-3.5 shrink-0" />
              <span>Cargas</span>
            </button>

            {/* Nav Stats */}
            <button
              onClick={() => setSelectedView('statistics')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'statistics' 
                ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-stats"
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Desempenho</span>
              <span className="inline sm:hidden">Desemp.</span>
            </button>

            {/* Nav WhatsApp */}
            <button
              onClick={() => setSelectedView('whatsapp')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'whatsapp' 
                ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                : 'text-[#0a0a0a]-400 text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-whatsapp"
            >
              <MessageSquare className="w-3.5 h-3.5 " />
              <span className="hidden sm:inline">Agenda Zap</span>
              <span className="inline sm:hidden">Zap</span>
            </button>

            {/* Nav Manager */}
            <button
              onClick={() => setSelectedView('manager')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'manager' 
                ? 'bg-red-650 text-white font-extrabold shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-manager"
            >
              <Shield className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="hidden sm:inline">Gerente Genivaldo</span>
              <span className="inline sm:hidden">Suporte</span>
            </button>

            {/* Nav Manual */}
            <button
              onClick={() => setSelectedView('manual')}
              className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                selectedView === 'manual' 
                ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
              }`}
              id="nav-manual"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
              <span className="hidden sm:inline">Manual Agente</span>
              <span className="inline sm:hidden">Manual</span>
            </button>

            {/* Nav Registration */}
            {user && (user.username === 'master' || user.role === 'Master') && (
              <button
                onClick={() => setSelectedView('registration')}
                className={`px-2 md:px-3 py-1.5 rounded text-xs font-bold font-sans tracking-tight transition-all cursor-pointer flex items-center gap-1 md:gap-1.5 ${
                  selectedView === 'registration' 
                  ? 'bg-[#FFD600] text-[#0a0a0a] font-extrabold shadow-[0_0_15px_rgba(255,214,0,0.2)]' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/60'
                }`}
                id="nav-registration"
              >
                <Users className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                <span className="hidden sm:inline">Cadastro</span>
                <span className="inline sm:hidden">Cad.</span>
              </button>
            )}

             {/* Floating Quick Action removed to prioritize only importing */}

          </nav>

          {/* High Density Right Side Info Items */}
          <div className="flex items-center gap-4">
            {/* Cadastrar Carga Button */}
            <button
              onClick={handleAddNewDelivery}
              className="flex items-center bg-[#FFD600] hover:bg-[#ffe23b] text-[#0a0a0a] rounded-full px-4 py-1.5 gap-1.5 transition-all text-[10px] font-mono uppercase font-black cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.15)] hover:scale-[1.02] active:scale-95"
              id="global-cadastrar-btn"
            >
              <Truck className="w-3.5 h-3.5 text-black shrink-0" />
              <span>Cadastrar Carga</span>
            </button>

            {/* User badge customized */}
            <div className="flex items-center gap-2.5 border-l border-zinc-800 pl-4">
              <div className="text-right hidden sm:block">
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
                <span className="hidden md:inline">Senha</span>
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
      </header>

      {/* Main Container structure */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 font-sans">
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
                    DATA &nbsp;&nbsp;➔&nbsp;&nbsp; VENDEDOR &nbsp;&nbsp;➔&nbsp;&nbsp; CLIENTE &nbsp;&nbsp;➔&nbsp;&nbsp; TEL CLIENTE &nbsp;&nbsp;➔&nbsp;&nbsp; MOTORISTA &nbsp;&nbsp;➔&nbsp;&nbsp; TEL MOTORISTA &nbsp;&nbsp;➔&nbsp;&nbsp; ORIGEM &nbsp;&nbsp;➔&nbsp;&nbsp; DESTINO &nbsp;&nbsp;➔&nbsp;&nbsp; FRETE EMP. &nbsp;&nbsp;➔&nbsp;&nbsp; FRETE MOT. &nbsp;&nbsp;➔&nbsp;&nbsp; STATUS &nbsp;&nbsp;➔&nbsp;&nbsp; PRAZO &nbsp;&nbsp;➔&nbsp;&nbsp; OBS
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
    </div>
  );
}
