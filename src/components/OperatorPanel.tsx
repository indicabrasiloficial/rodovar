import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../db/firebase';
import { Entrega, DeliveryStatus } from '../types';
import { updateEntregaField, getEntregas, fetchEntregasFromServer } from '../db/storage';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  CheckSquare, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  MessageSquare, 
  Info, 
  ChevronRight, 
  ArrowRight,
  ClipboardList,
  Edit3,
  Sparkles,
  DollarSign,
  FileText,
  User,
  Activity,
  Send,
  MapPin,
  XCircle,
  Truck
} from 'lucide-react';

interface OperatorPanelProps {
  user: any;
  onBackToList: () => void;
}

const CACHE_KEY = "rdv_cargas_operador";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function OperatorPanel({ user, onBackToList }: OperatorPanelProps) {
  const [cargas, setCargas] = useState<Entrega[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [activeTab, setActiveTab] = useState<'ativos' | 'etapas_concluidas'>('ativos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCargaId, setSelectedCargaId] = useState<string | null>(null);
  
  // Local notes edit state for debounce
  const [notepadContent, setNotepadContent] = useState<Record<string, string>>({});
  const [salvandoNotaId, setSalvandoNotaId] = useState<string | null>(null);

  // Firestore Reads Counter (economizador Spark)
  const [readsThisSession, setReadsThisSession] = useState<number>(() => {
    return Number(sessionStorage.getItem('rdv_leituras_operador') || '0');
  });

  const contarLeitura = useCallback((tamanho: number) => {
    console.log(`[Firebase Spark Plan] Leituras contabilizadas no lote: ${tamanho}`);
    const current = Number(sessionStorage.getItem('rdv_leituras_operador') || '0') + tamanho;
    sessionStorage.setItem('rdv_leituras_operador', String(current));
    setReadsThisSession(current);
  }, []);

  // Check auth and redirect
  const userData = user;
  const isOperator = userData?.role === "Operador" || userData?.role === "Master";

  const carregarCargas = useCallback(async (forcar = false) => {
    setCarregando(true);
    try {
      if (forcar) {
        await fetchEntregasFromServer(true).catch(err => {
          console.warn("Erro ao forçar atualização:", err);
        });
      } else {
        // Trigger background fetch if needed, but don't await to keep UI fast
        fetchEntregasFromServer(false).catch(() => {});
      }

      // Load from global cached database (extremely fast, offline & quota resilient)
      const todosOsDados = getEntregas();
      contarLeitura(todosOsDados.length);

      // Filter only active charges AND those created or updated in the last 72 hours (3 days)
      const agora = Date.now();
      const limite72Horas = 72 * 60 * 60 * 1000; // 72 hours in ms

      const dadosFiltrados = todosOsDados.filter(item => {
        const isAtivo = item.status !== 'entregue';
        const tempoCriacao = item.created_at ? new Date(item.created_at).getTime() : 0;
        const tempoAtualizacao = item.updated_at ? new Date(item.updated_at).getTime() : 0;
        const registradoUltimas72h = (agora - tempoCriacao < limite72Horas) || (agora - tempoAtualizacao < limite72Horas);
        
        return isAtivo || registradoUltimas72h;
      });

      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        dados: dadosFiltrados, 
        timestamp: agora
      }));
      
      setCargas(dadosFiltrados);
    } catch (err) {
      console.error("Erro ao sincronizar do Firestore:", err);
      // Fallback
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const { dados } = JSON.parse(cached);
          setCargas(dados);
        } catch {}
      }
    } finally {
      setCarregando(false);
    }
  }, [contarLeitura]);

  useEffect(() => {
    carregarCargas();
  }, [carregarCargas]);

  // Handle local memory synchronization with App global changes
  useEffect(() => {
    const handleSync = () => {
      carregarCargas(false);
    };
    window.addEventListener('rodovar_realtime_event', handleSync);
    return () => window.removeEventListener('rodovar_realtime_event', handleSync);
  }, [carregarCargas]);

  // Update specific operator stage
  const handleToggleEtapa = async (cargaId: string, etapaId: string, valorAtual: boolean) => {
    const novoValor = !valorAtual;
    
    // Optimistic Local Updates in state to keep UI lightning fast
    setCargas(prev => {
      const updated = prev.map(c => {
        if (c.id === cargaId) {
          const etapasOld = c.etapasOperador || {};
          return {
            ...c,
            etapasOperador: {
              ...etapasOld,
              [etapaId]: novoValor,
              ultimaAtualizacao: new Date().toISOString()
            }
          };
        }
        return c;
      });
      // persist updated state also in sessionStorage cache
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          parsed.dados = updated;
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
        } catch {}
      }
      return updated;
    });

    try {
      // updateDoc with exact paths specified by instructions
      await updateEntregaField(cargaId, {
        [`etapasOperador.${etapaId}`]: novoValor,
        "etapasOperador.ultimaAtualizacao": serverTimestamp()
      });
    } catch (err) {
      console.error("Erro de persistência de etapa no Firestore:", err);
    }
  };

  // Debounced note save mechanism
  const saveNotepadContentRemote = useCallback(async (cargaId: string, text: string) => {
    setSalvandoNotaId(cargaId);
    try {
      await updateEntregaField(cargaId, {
        notasOperador: text,
        notasAtualizadaEm: serverTimestamp()
      });
      
      // Update local state and cache
      setCargas(prev => {
        const updated = prev.map(c => {
          if (c.id === cargaId) {
            return {
              ...c,
              notasOperador: text,
              notasAtualizadaEm: new Date().toISOString()
            };
          }
          return c;
        });
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            parsed.dados = updated;
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
          } catch {}
        }
        return updated;
      });
    } catch (e) {
      console.error("Erro ao salvar nota:", e);
    } finally {
      setSalvandoNotaId(null);
    }
  }, []);

  // Initialize and handle debounce on notepad change
  const handleNotepadChange = (cargaId: string, content: string) => {
    setNotepadContent(prev => ({ ...prev, [cargaId]: content }));
    
    const timeoutId = (window as any)[`note_timeout_${cargaId}`];
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    (window as any)[`note_timeout_${cargaId}`] = setTimeout(() => {
      saveNotepadContentRemote(cargaId, content);
    }, 1500);
  };

  // Convert Firebase/ISO timestamp safely
  const getTimestampMs = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts === 'string') return new Date(ts).getTime();
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate) return ts.toDate().getTime();
    return Number(ts);
  };

  // Definition of the 12 stages metadata and helper text
  const list_etapas_metadata = [
    { id: 'e01', title: 'Confirmar Cadastro', desc: 'Carga cadastrada e status definido como Coletando', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e02', title: 'Chegada Local Coleta', desc: 'Confirmar com o motorista: já chegou ao local de coleta?', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e03', title: 'Previsão de Carregamento', desc: 'Registrar previsão de coleta informada pelo motorista', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e04', title: 'Documento de Coleta', desc: 'Receber documento físico de coleta assinado', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e05', title: 'Solicitar MDF', desc: 'Enviar documento de coleta para Mateus gerar o MDF', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e06', title: 'Repassar MDF', desc: 'Receber MDF gerado e enviar ao motorista', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e07', title: 'Notificar Cliente', desc: 'Informar o cliente que a carga está em trânsito', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e08', title: 'Solicitar Localização', desc: 'Solicitar localização exata de entrega ao cliente', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e09', title: 'Infos de Entrega', desc: 'Repassar todas as informações de entrega ao motorista', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e10', title: 'Canhoto Recebido', desc: 'Receber canhoto assinado e fotos da entrega do motorista', phase: 'entrega', phaseLabel: 'FASE 3 — ENTREGA' },
    { id: 'e11', title: ' canhotosAXD', desc: 'Enviar canhoto ao grupo AXD/RODOVAR marcando @Mateus', phase: 'entrega', phaseLabel: 'FASE 3 — ENTREGA' },
    { id: 'e12', title: 'Finalizar Rota', desc: 'Atualizar status da carga para Entregue no sistema', phase: 'entrega', phaseLabel: 'FASE 3 — ENTREGA' }
  ];

  // Helper helper to get next pending stage index
  const getProximaEtapa = (e: Entrega) => {
    const etapas = e.etapasOperador || {};
    for (let i = 0; i < list_etapas_metadata.length; i++) {
      const et = list_etapas_metadata[i];
      if (!etapas[et.id as keyof typeof etapas]) {
        return et;
      }
    }
    return null;
  };

  // Helper helper to get completed stages count
  const getConcluidasCount = (e: Entrega) => {
    const etapas = e.etapasOperador || {};
    let count = 0;
    list_etapas_metadata.forEach(et => {
      if (etapas[et.id as keyof typeof etapas]) {
        count++;
      }
    });
    return count;
  };

  // Compute Warnings Locally (Zero operations / Spark budget)
  const getCargaAlertaConfig = (e: Entrega) => {
    const etapas = e.etapasOperador || {};
    const concluidoCount = getConcluidasCount(e);
    const createdTimeMs = new Date(e.created_at || Date.now()).getTime();
    const transitoTimeMs = e.updated_at ? new Date(e.updated_at).getTime() : 0;
    const now = Date.now();

    // 🔴 CRÍTICO
    // 1. Etapa 02 não concluída e carga cadastrada há mais de 1 hora
    if (!etapas.e02 && (now - createdTimeMs > 60 * 60 * 1000)) {
      return {
        level: 'critico',
        label: 'Atraso Chegada Coleta (Motorista sem sinal)',
        desc: 'A carga está cadastrada há mais de 1 hora e o motorista ainda não confirmou presença para iniciar.',
        color: 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse'
      };
    }
    
    // 2. Etapa 04 não concluída e etapa 02 concluída há mais de 3 horas
    if (!etapas.e04 && etapas.e02 && (now - getTimestampMs(etapas.ultimaAtualizacao) > 3 * 60 * 60 * 1000)) {
      return {
        level: 'critico',
        label: 'Aguardando Documento Físico (Carregado)',
        desc: 'O motorista está no local há mais de 3 horas. É necessário obter o canhoto de coleta urgentemente para emitir MDF-e.',
        color: 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
      };
    }

    // 3. Etapa 10 não concluída e status "Em Trânsito" ('em_transito') há mais de 48 horas
    if (!etapas.e10 && e.status === 'em_transito' && (now - transitoTimeMs > 48 * 60 * 60 * 1000)) {
      return {
        level: 'critico',
        label: 'Em Trânsito Prolongado (>48 horas)',
        desc: 'A carga está em circulação há mais de 48 horas sem canhoto recebido ou comprovação de descarrego.',
        color: 'border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.15)] bg-red-950/5'
      };
    }

    // 🟡 ATENÇÃO
    // 1. Etapa 07 não concluída e etapa 06 concluída há mais de 30 minutos
    if (!etapas.e07 && etapas.e06 && (now - getTimestampMs(etapas.ultimaAtualizacao) > 30 * 60 * 1000)) {
      return {
        level: 'atencao',
        label: 'Cliente Não Notificado',
        desc: 'MDF foi emitido e enviado ao caminhoneiro há mais de 30 min, mas o cliente ainda não foi avisado do trânsito.',
        color: 'border-amber-500/60'
      };
    }

    // 2. Etapa 08 não concluída e motorista a menos de 2 horas do destino (estimativa baseada em data_coleta / prazo)
    const dataPrazo = e.prazo ? new Date(e.prazo + 'T18:00:00').getTime() : 0;
    if (!etapas.e08 && dataPrazo > 0 && (dataPrazo - now < 2 * 60 * 60 * 1000) && (dataPrazo > now)) {
      return {
        level: 'atencao',
        label: 'Confirmar Localização de Entrega',
        desc: 'Motorista está próximo ao horário do prazo limite e ainda não confirmamos os dados de quem recebe no destino.',
        color: 'border-amber-500/60'
      };
    }

    // 3. Prazo de entrega é hoje e etapa 12 não concluída
    const hojeStr = new Date().toISOString().split('T')[0];
    if (!etapas.e12 && e.prazo === hojeStr) {
      return {
        level: 'atencao',
        label: 'Prazo Vencendo Hoje',
        desc: 'O roteiro do frete indica entrega para o dia de hoje, verifique andamento imediato.',
        color: 'border-amber-500/60 bg-amber-950/5'
      };
    }

    return {
      level: 'ok',
      label: 'Operação Regular',
      desc: 'Todas as etapas programadas estão em dia e seguem cronograma seguro.',
      color: 'border-zinc-850 hover:border-zinc-700'
    };
  };

  // Filter & Search computation (using custom scoring logic)
  const filteredCargas = useMemo(() => {
    let list = cargas.filter(e => {
      // strict query matches for motorista, vendedor, cliente, origen e destino
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (e.motorista || '').toLowerCase().includes(q) ||
        (e.vendedor || '').toLowerCase().includes(q) ||
        (e.cliente || '').toLowerCase().includes(q) ||
        (e.origem || '').toLowerCase().includes(q) ||
        (e.destino || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q)
      );
    });

    // Sort: Critical / Attention warning alerts first, or by progress if same
    return list.sort((a, b) => {
      const configA = getCargaAlertaConfig(a);
      const configB = getCargaAlertaConfig(b);
      
      const scoreA = configA.level === 'critico' ? 3 : configA.level === 'atencao' ? 2 : 1;
      const scoreB = configB.level === 'critico' ? 3 : configB.level === 'atencao' ? 2 : 1;
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // highest score sorting
      }
      
      // Secondary ordering: progress descending
      return getConcluidasCount(b) - getConcluidasCount(a);
    });
  }, [cargas, searchQuery]);

  // Calculated Panel Summary Stats (0 additional Firestore reads)
  const stats = useMemo(() => {
    const totalAtivos = cargas.length;
    
    const naColeta = cargas.filter(c => {
      const listConcluidas = getConcluidasCount(c);
      return listConcluidas <= 6; // Phase 1 is done up to etapa 6
    }).length;

    const emTransito = cargas.filter(c => {
      return c.status === 'em_transito';
    }).length;

    const hojeStr = new Date().toISOString().split('T')[0];
    const entregaHoje = cargas.filter(c => c.prazo === hojeStr).length;

    return { totalAtivos, naColeta, emTransito, entregaHoje };
  }, [cargas]);

  // Clean format helper for WhatsApp API
  const formatPhoneForWhatsApp = (tel?: string) => {
    if (!tel) return '';
    return tel.replace(/\D/g, '');
  };

  // Custom pre-formated messages list matching Phase descriptions
  const getWhatsAppMsg = (etapaId: string, e: Entrega) => {
    const motorista = e.motorista || 'Amigo';
    const origem = e.origem || '';
    const destino = e.destino || '';
    const cliente = e.cliente || '';
    const prazo = e.prazo ? new Date(e.prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '';
    const notas = e.notasOperador || '';

    // Extract potential confirm items from Operator notes
    const endConfirmado = notas.includes('Endereço:') ? notas : 'Não especificado';

    switch (etapaId) {
      case 'e02':
        return `Olá ${motorista}! Você já chegou no local de coleta em ${origem}? Qual a previsão para iniciar o carregamento?`;
      case 'e05':
        return `Mateus, segue documento de coleta da carga ${origem} ➔ ${destino}, motorista ${motorista}. Favor gerar o MDF.`;
      case 'e06':
        return `Olá ${motorista}! Segue o MDF da sua carga. Pode seguir viagem. Boa estrada!`;
      case 'e07':
        return `Olá! A RODOVAR informa que sua carga saiu de ${origem} e está a caminho de ${destino}. Previsão de chegada: ${prazo || 'Pendente'}. Em breve entraremos em contato para confirmar o endereço de entrega.`;
      case 'e08':
        return `Para garantir a entrega sem problemas, precisamos confirmar:\n1) Endereço completo de entrega com CEP\n2) Ponto de referência\n3) Nome e celular de quem vai receber\nPode nos enviar?`;
      case 'e09':
        return `Olá ${motorista}! Informações de entrega em ${destino}:\nEndereço: ${endConfirmado}\nQualquer dúvida, me chama!`;
      case 'e11':
        return `@Mateus segue canhoto da entrega ${origem} ➔ ${destino}. Motorista: ${motorista}. Favor processar pagamento.`;
      default:
        return '';
    }
  };

  // Protected screen rendering check
  if (!isOperator) {
    onBackToList();
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5 bg-zinc-950/40 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFD600]/10 flex items-center justify-center border border-[#FFD600]/40 text-[#FFD600]">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black font-sans uppercase tracking-wider text-white">Central de Controle do Operador</h2>
            <p className="text-xs text-zinc-400">Gerenciamento assistido e à prova de falhas: rotina sequencial para controle das cargas ativas</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center font-mono">
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-lg px-3.5 py-1.5 text-[10px] text-zinc-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
            Leituras nesta sessão: <strong className="text-white font-extrabold">{readsThisSession}</strong>
          </div>
          
          <button
            onClick={() => carregarCargas(true)}
            disabled={carregando}
            className="flex items-center gap-2 bg-[#FFD600] hover:bg-[#ffe23b] text-black rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer font-sans shadow-md active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* PARTE 7 — RESUMO DO PAINEL */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Cargas Ativas</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-white">{stats.totalAtivos}</span>
            <span className="text-[10px] text-emerald-400 font-mono font-medium">Em andamento</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Na Coleta</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-amber-500">{stats.naColeta}</span>
            <span className="text-[10px] text-zinc-500 font-mono">Etapas 1 a 6</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
          <span className="text-[10px] font-bold text-[#FFD600] uppercase tracking-widest font-mono">Em Trânsito</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-[#FFD600]">{stats.emTransito}</span>
            <span className="text-[10px] text-zinc-500 font-mono">Status em viagem</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700 transition-colors">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest font-mono">Entrega Hoje</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-sky-400">{stats.entregaHoje}</span>
            <span className="text-[10px] text-sky-450/80 font-mono">Prazo programado</span>
          </div>
        </div>

      </div>

      {/* Main operational view divided into list (left) details (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Section: Active operational cards list */}
        <div className="xl:col-span-4 space-y-4">
          <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar por motorista, cliente, cidade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-xs rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-[#FFD600] placeholder-zinc-500 font-sans"
              />
            </div>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
            {carregando && cargas.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs">Carregando cargas ativas...</div>
            ) : filteredCargas.length === 0 ? (
              <div className="p-8 text-center bg-zinc-900/20 border border-dashed border-zinc-800 rounded-xl text-zinc-500 font-mono text-xs">
                {searchQuery ? "Nenhuma carga monitorada com este critério." : "Nenhuma carga cadastrada ativa encontrada!"}
              </div>
            ) : (
              filteredCargas.map(c => {
                const isSelected = selectedCargaId === c.id;
                const concluidasCount = getConcluidasCount(c);
                const pct = Math.round((concluidasCount / 12) * 100);
                const alerta = getCargaAlertaConfig(c);
                const proximo = getProximaEtapa(c);

                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCargaId(c.id);
                      if (c.notasOperador && !notepadContent[c.id]) {
                        setNotepadContent(prev => ({ ...prev, [c.id]: c.notasOperador || '' }));
                      }
                    }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-[#FFD600]/5 border-[#FFD600]/80 shadow-md shadow-[#FFD600]/5' 
                        : alerta.color
                    }`}
                  >
                    
                    {/* Alert Warning Header */}
                    {alerta.level !== 'ok' && (
                      <div className="flex items-start gap-1.5 bg-yellow-950/30 border border-yellow-904/30 rounded-lg p-2 mb-3">
                        <AlertTriangle className={`w-4 h-4 shrink-0 ${alerta.level === 'critico' ? 'text-red-400' : 'text-amber-400'}`} />
                        <div>
                          <span className={`text-[10px] font-black uppercase font-mono leading-none block ${alerta.level === 'critico' ? 'text-red-400' : 'text-amber-400'}`}>
                            {alerta.level === 'critico' ? 'ALERTA CRÍTICO' : 'ATENÇÃO'} : {alerta.label}
                          </span>
                          <p className="text-[9px] text-zinc-400 mt-0.5 leading-tight">{alerta.desc}</p>
                        </div>
                      </div>
                    )}

                    {/* Routing Details */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-mono font-black text-[#FFD600] flex items-center gap-1">
                          <span>{c.origem}</span>
                          <ArrowRight className="w-3 h-3 text-zinc-500" />
                          <span>{c.destino}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">ID: {c.id.slice(0, 8)}...</p>
                      </div>
                      
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                        c.status === 'entregue' ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400' :
                        c.status === 'em_transito' ? 'bg-amber-950/20 border-amber-900 text-[#FFD600]' :
                        'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* People info */}
                    <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] border-t border-zinc-900/60 pt-3">
                      <div>
                        <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">Motorista</span>
                        <span className="text-white font-bold block truncate">{c.motorista}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono uppercase text-zinc-500 font-semibold block">Cliente</span>
                        <span className="text-zinc-300 block truncate">{c.cliente}</span>
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-[10px] font-mono text-zinc-400 font-semibold">
                        <span>Checklist de Controle</span>
                        <span className="text-white font-bold">{concluidasCount} / 12 ({pct}%)</span>
                      </div>
                      
                      {/* Bar */}
                      <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-300" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Next step highlight */}
                    {proximo && (
                      <div className="mt-3.5 pt-3.5 border-t border-zinc-900/60 flex items-center justify-between text-[10px]">
                        <span className="font-mono text-zinc-500 font-bold">Passo seguinte pendente:</span>
                        <span className="font-sans font-extrabold text-[#FFD600] uppercase bg-yellow-950/20 px-2 py-0.5 rounded border border-yellow-900/30">
                          {proximo.id.slice(1)} - {proximo.title}
                        </span>
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Section: Focus active details and operational wizard */}
        <div className="xl:col-span-8">
          {selectedCargaId ? (
            (() => {
              const e = cargas.find(x => x.id === selectedCargaId);
              if (!e) return <div className="p-12 text-center text-zinc-500">Selecione uma carga válida.</div>;

              const concluidas = getConcluidasCount(e);
              const proximoEtapa = getProximaEtapa(e);
              const hasCriticalMissingFields = !e.origem || !e.destino || !e.cliente || !e.motorista || !e.prazo || !e.frete_empresa;

              return (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 md:p-6 space-y-6">
                  
                  {/* Selected Cargo Header banner */}
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded text-[10px] text-[#FFD600] font-bold font-mono">FRETAMENTO ATIVO</span>
                        <span className="text-zinc-500 text-xs font-mono">ID: {e.id}</span>
                      </div>
                      <h3 className="text-base font-black text-white flex items-center gap-2 font-sans tracking-tight">
                        <MapPin className="w-4 h-4 text-emerald-400" />
                        {e.origem} <ChevronRight className="w-4 h-4 text-zinc-600" /> {e.destino}
                      </h3>
                      
                      {/* Financial info if true */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 font-mono text-[11px] text-zinc-400">
                        <div>Vendedor: <strong className="text-zinc-205 text-white">{e.vendedor || 'Sem Vendedor'}</strong></div>
                        <div>•</div>
                        <div>Motorista: <strong className="text-white">{e.motorista} ({e.tel_motorista || 'Sem fone'})</strong></div>
                        <div>•</div>
                        <div>Cliente: <strong className="text-zinc-305">{e.cliente}</strong></div>
                      </div>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-850 p-3 rounded-lg text-center font-mono space-y-1 self-start md:self-center">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Progresso Geral</span>
                      <span className="text-xl font-black text-white block mt-0.5">{concluidas} / 12</span>
                      <div className="w-20 h-1 bg-zinc-950 rounded-full overflow-hidden mx-auto mt-1">
                        <div className="bg-emerald-500 h-full" style={{ width: `${Math.round((concluidas/12)*100)}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* PARTE 5 — CAMPO DE ANOTAÇÕES INTELIGENTE */}
                  <div className="bg-zinc-950/45 border border-zinc-850/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-[#FFD600]" />
                        <span className="text-xs font-black uppercase text-zinc-200 font-sans tracking-wider">Anotações Inteligentes e Apoio de Rota</span>
                      </div>
                      {salvandoNotaId === e.id ? (
                        <span className="text-[10px] text-[#FFD600] font-mono animate-pulse">⚙️ Gravando no Firestore...</span>
                      ) : e.notasAtualizadaEm ? (
                        <span className="text-[9px] text-zinc-500 font-mono">Sincronizado</span>
                      ) : null}
                    </div>

                    <p className="text-[10px] text-zinc-400 leading-normal">
                      Use o espaço abaixo para apontar previsões do motorista, restrições locais de acesso do cliente, contatos de auxiliares de pátio ou outras observações urgentes. Salva automaticamente.
                    </p>

                    <textarea
                      placeholder="Exemplo de Notas Rápidas:&#10;Previsão Coleta: 18/06 às 14:00&#10;Contato Recebedor: Sr. Carlos (11) 98765-4321&#10;Endereço: Rua Augusta, 1500 - Bloco B - São Paulo"
                      value={notepadContent[e.id] || ''}
                      onChange={(e) => handleNotepadChange(selectedCargaId, e.target.value)}
                      className="w-full h-24 bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#FFD600] placeholder-zinc-500 font-sans leading-relaxed"
                    />
                  </div>

                  {/* Wizard / Sequenced steps cards list */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] uppercase font-mono tracking-widest text-zinc-500 font-bold pb-2 border-b border-zinc-850">
                      Fluxo Monitorado Sequencial (Etapas de Controle)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {list_etapas_metadata.map((et, idx) => {
                        const etapasConfig = e.etapasOperador || {};
                        const isConcluida = !!etapasConfig[et.id as keyof typeof etapasConfig];
                        const proximo = proximoEtapa?.id === et.id;
                        
                        // Render indicators formatting
                        let cardStyle = "bg-zinc-950/20 border border-zinc-850/60 opacity-60";
                        if (isConcluida) {
                          cardStyle = "bg-emerald-950/5 border border-emerald-900/40 opacity-70";
                        } else if (proximo) {
                          // PRÓXIMO PASSO: border gold, pulsing visual aspect
                          cardStyle = "bg-zinc-900/80 border-[#FFD600] shadow-[0_0_12px_rgba(255,214,0,0.1)] ring-1 ring-[#FFD600]/40";
                        }

                        // WhatsApp Message Builder
                        const textMsg = getWhatsAppMsg(et.id, e);
                        const isColetaPhase = et.phase === 'coleta';
                        const isTransitoPhase = et.phase === 'transito';
                        
                        // Block step 5 from progressing without step 4 done
                        const isBlockedStep = et.id === 'e05' && !etapasConfig.e04;

                        // Recipient number builder based on target
                        const phoneToUse = et.id === 'e07' || et.id === 'e08' ? e.tel_cliente : e.tel_motorista;
                        const hasPhone = !!phoneToUse;
                        const waLink = hasPhone 
                          ? `https://wa.me/55${formatPhoneForWhatsApp(phoneToUse)}?text=${encodeURIComponent(textMsg)}` 
                          : '';

                        return (
                          <div key={et.id} className={`p-4 rounded-xl relative overflow-hidden transition-all flex flex-col justify-between ${cardStyle}`}>
                            
                            {/* Pulse background effects for next step */}
                            {proximo && (
                              <div className="absolute right-2 top-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono bg-[#FFD600] text-black animate-pulse">
                                Próximo Passo
                              </div>
                            )}

                            {isConcluida && (
                              <div className="absolute right-2 top-2 text-emerald-400">
                                <CheckCircle className="w-4 h-4" />
                              </div>
                            )}

                            <div className="space-y-1.5">
                              {/* Phase banner */}
                              <span className="text-[8px] font-bold font-mono tracking-tight text-zinc-500 uppercase block">
                                {et.phaseLabel}
                              </span>
                              
                              <div className="flex items-start gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isBlockedStep) {
                                      alert("⚠️ BLOQUEADOR OPERACIONAL : Não é possível solicitar MDF-e na etapa 05 sem antes possuir e registrar a confirmação física de recebimento do documento de coleta (Etapa 04)!");
                                      return;
                                    }
                                    handleToggleEtapa(e.id, et.id, isConcluida);
                                  }}
                                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                                    isConcluida 
                                      ? 'bg-emerald-500 border-emerald-400 text-black' 
                                      : 'border-zinc-700 hover:border-[#FFD600]'
                                  }`}
                                >
                                  {isConcluida && <span className="text-xs font-bold font-mono">✓</span>}
                                </button>
                                
                                <div>
                                  <span className="text-xs font-black text-gray-200 font-sans tracking-tight">{et.id.slice(1)} - {et.title}</span>
                                  <p className="text-[10px] text-zinc-400 leading-normal mt-0.5">{et.desc}</p>
                                </div>
                              </div>
                            </div>

                            {/* Phase helpers - Specific conditions and actions inside steps */}
                            <div className="mt-4 pt-3 border-t border-zinc-900/60 flex flex-wrap items-center gap-2">
                              {/* Specific warnings widget */}
                              {et.id === 'e01' && hasCriticalMissingFields && (
                                <span className="text-[9px] bg-red-950/20 border border-red-900/40 text-red-400 px-2 py-0.5 rounded font-mono font-bold leading-none">
                                  ⚠️ FALTAM DADOS CRÍTICOS CADASTRO
                                </span>
                              )}

                              {/* WhatsApp inline action */}
                              {textMsg && (
                                <a
                                  href={waLink ? waLink : '#'}
                                  onClick={(ev) => {
                                    if (!hasPhone) {
                                      ev.preventDefault();
                                      alert("Telefone não cadastrado para o destinatário! Confirme os dados de cadastro da rota.");
                                    }
                                  }}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors no-underline ${
                                    hasPhone 
                                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold' 
                                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                  }`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                                  Chamar Zap
                                </a>
                              )}

                              {/* Suggest updateStatus automatically at Step 6 */}
                              {et.id === 'e06' && !isConcluida && e.status !== 'em_transito' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateEntregaField(e.id, { status: "em_transito" });
                                    // Sunc local state
                                    setCargas(prev => {
                                      const updated = prev.map(item => item.id === e.id ? { ...item, status: 'em_transito' as DeliveryStatus } : item);
                                      return updated;
                                    });
                                    alert("Status da carga atualizado automaticamente para: Em Trânsito! 🚚");
                                  }}
                                  className="px-2.5 py-1 bg-yellow-950/20 border border-[#FFD600]/30 hover:border-[#FFD600]/60 text-[#FFD600] rounded text-[10px] font-mono uppercase font-bold cursor-pointer"
                                >
                                  Mudar para 'Trânsito'
                                </button>
                              )}

                              {/* Suggest updateDoc "entregue" automatically at Step 12 */}
                              {et.id === 'e12' && !isConcluida && e.status !== 'entregue' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateEntregaField(e.id, { status: "entregue" });
                                    // Sunc local state
                                    setCargas(prev => {
                                      const updated = prev.map(item => item.id === e.id ? { ...item, status: 'entregue' as DeliveryStatus } : item);
                                      return updated;
                                    });
                                    // Mark stage as true
                                    await handleToggleEtapa(e.id, 'e12', false);
                                    alert("Status da carga alterado para ENTREGUE com sucesso absoluto! Operação concluída. ✅");
                                  }}
                                  className="px-2.5 py-1 bg-emerald-950/20 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 rounded text-[10px] font-mono uppercase font-bold cursor-pointer"
                                >
                                  Marcar como 'Entregue'
                                </button>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* PARTE 4 — Finalizing message when all 12 stages completed */}
                  {concluidas === 12 && (
                    <div className="bg-emerald-950/25 border-2 border-emerald-500/60 rounded-xl p-4 md:p-5 text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 animate-bounce">
                        ✓
                      </div>
                      <h4 className="text-sm font-black text-white uppercase tracking-wider font-sans">CARGA FINALIZADA COM SUCESSO</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-lg mx-auto">
                        Excelente trabalho operacional! Todas as 12 etapas, do cadastro ao canhoto de pagamento de Mateus AXD, foram registradas. Rota entre <strong>{e.origem}</strong> e <strong>{e.destino}</strong> foi concluída sem incidentes e sob controle total comercial.
                      </p>
                      <div className="font-mono text-[10px] text-zinc-500 border-t border-zinc-900 pt-3 flex items-center justify-center gap-4">
                        <span>Motorista: {e.motorista}</span>
                        <span>•</span>
                        <span>Cliente: {e.cliente}</span>
                        <span>•</span>
                        <span>KM: {e.km || '0'} km</span>
                      </div>
                    </div>
                  )}

                </div>
              );
            })()
          ) : (
            <div className="bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl p-12 text-center h-[50vh] flex flex-col justify-center items-center gap-3">
              <ClipboardList className="w-12 h-12 text-zinc-650/80 animate-pulse text-zinc-700" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 font-sans">Selecione uma Carga Ativa</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Selecione um roteiro de frete no menu esquerdo para acompanhar as coletas, gerar MDF-e, repassar informações via WhatsApp e registrar canhotos de entrega de forma sequencial assistida.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
