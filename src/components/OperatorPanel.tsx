import { useState, useEffect, useMemo, useCallback } from 'react';
import { Entrega, DeliveryStatus } from '../types';
import { updateEntregaField, getEntregas, fetchEntregasFromServer } from '../db/storage';
import { getDeliveryKm } from '../utils/distance';
import { formatDateBR } from '../utils/date';
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
  X,
  Truck
} from 'lucide-react';

interface OperatorPanelProps {
  user: any;
  onBackToList: () => void;
}

const CACHE_KEY = "rdv_cargas_operador";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cleanVendedor = (name: string): string => {
  if (!name) return '';
  const parts = name.split(/[\/\-\\]/);
  let p = (parts[0] || '').trim().toUpperCase();
  if (p === 'MÔNICA') p = 'MONICA';
  return p;
};

export default function OperatorPanel({ user, onBackToList }: OperatorPanelProps) {
  const [cargas, setCargas] = useState<Entrega[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [activeTab, setActiveTab] = useState<'ativos' | 'etapas_concluidas'>('ativos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCargaId, setSelectedCargaId] = useState<string | null>(null);
  
  // Local notes edit state for debounce
  const [notepadContent, setNotepadContent] = useState<Record<string, string>>({});
  const [salvandoNotaId, setSalvandoNotaId] = useState<string | null>(null);
  const [occurrenceFeedback, setOccurrenceFeedback] = useState<Record<string, string>>({});

  // Calculadora de Rotas & Previsibilidade Real (3 Dias)
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [activeRouteCalcSelected, setActiveRouteCalcSelected] = useState<Entrega | null>(null);
  const [customSpeed, setCustomSpeed] = useState<number>(60); // km/h (default: heavy truck speed)
  const [customDailyHours, setCustomDailyHours] = useState<number>(9); // 9h maximum daily active drive limit (Lei do Motorista)
  const [startingTime, setStartingTime] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16); // format 'YYYY-MM-DDTHH:MM' for HTML input datetime-local
  });
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [salvandoPrevisaoId, setSalvandoPrevisaoId] = useState<string | null>(null);

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
        const isAtivo = item.status !== 'entregue' && !item.etapasOperador?.e13;
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
        "etapasOperador.ultimaAtualizacao": new Date().toISOString()
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
        notasAtualizadaEm: new Date().toISOString()
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

  // Convert custom operator notes permanently to checked and registered occurrences inside histoy + observations
  const handleSalvarOcorrenciaTratada = async (cargaId: string) => {
    const comentario = notepadContent[cargaId] || '';
    if (!comentario.trim()) return;

    setSalvandoNotaId(cargaId);
    try {
      const originalCarga = cargas.find(c => c.id === cargaId);
      if (!originalCarga) return;

      let activeUser = { username: 'sistema', displayName: 'Sistema', role: 'Operador Rodovar' };
      const userStored = localStorage.getItem('rodovar_active_login_v2');
      if (userStored) {
        try {
          activeUser = JSON.parse(userStored);
        } catch {}
      }

      // Generate localized, elegant date formatting
      const dataHoraLocal = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const novoEvento = {
        id: 'evt-' + Math.random().toString(36).substring(2, 11),
        timestamp: new Date().toISOString(),
        usuario: activeUser.username,
        usuarioNome: activeUser.displayName,
        cargo: activeUser.role,
        descricao: `🚨 [OCORRÊNCIA TRATADA] ${comentario.trim()}`
      };

      const historicoAtual = originalCarga.historico || [];
      const novoHistorico = [...historicoAtual, novoEvento].slice(-40);

      // Append comment block permanently to general observations ('observacoes')
      let novasObservacoes = originalCarga.observacoes || '';
      const blocoOcorrencia = `\n[OCORRÊNCIA TRATADA em ${dataHoraLocal} por ${activeUser.displayName}]: ${comentario.trim()}`;
      novasObservacoes = (novasObservacoes + blocoOcorrencia).trim();

      await updateEntregaField(cargaId, {
        historico: novoHistorico,
        observacoes: novasObservacoes,
        notasOperador: '',
        notasAtualizadaEm: new Date().toISOString()
      });

      // Synchronize in-memory react state
      setCargas(prev => {
        const updated = prev.map(c => {
          if (c.id === cargaId) {
            return {
              ...c,
              historico: novoHistorico,
              observacoes: novasObservacoes,
              notasOperador: '',
              notasAtualizadaEm: new Date().toISOString()
            };
          }
          return c;
        });

        // Sync local caches
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

      // Clear scratch input
      setNotepadContent(prev => ({ ...prev, [cargaId]: '' }));
      
      // Flash feedback
      setOccurrenceFeedback(prev => ({ ...prev, [cargaId]: 'Ocorrência gravada no cadastro com sucesso!' }));
      setTimeout(() => {
        setOccurrenceFeedback(prev => ({ ...prev, [cargaId]: '' }));
      }, 4000);

      if (window.falarRodovar) {
        window.falarRodovar("Ocorrência tratada salva com sucesso!");
      }
    } catch (e) {
      console.error("Erro ao registrar ocorrencia tratada no Firestore:", e);
    } finally {
      setSalvandoNotaId(null);
    }
  };

  // Convert Firebase/ISO timestamp safely
  const getTimestampMs = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts === 'string') return new Date(ts).getTime();
    if (ts.seconds) return ts.seconds * 1000;
    if (ts.toDate) return ts.toDate().getTime();
    return Number(ts);
  };

  // Definition of the 13 stages metadata and helper text
  const list_etapas_metadata = [
    { id: 'e01', title: 'Confirmar Cadastro', desc: 'Carga cadastrada e status definido como Coletando', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e02', title: 'Chegada Local Coleta', desc: 'Confirmar com o motorista: já chegou ao local de coleta?', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e03', title: 'Previsão de Carregamento', desc: 'Registrar previsão de coleta informada pelo motorista', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e04', title: 'Documento de Coleta', desc: 'Receber documento físico de coleta assinado', phase: 'coleta', phaseLabel: 'FASE 1 — COLETA' },
    { id: 'e05', title: 'Solicitar MDF', desc: 'Enviar documento de coleta para Mateus gerar o MDF', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e06', title: 'Repassar MDF', desc: 'Receber MDF gerado e enviar ao motorista', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e07', title: 'Notificar Cliente', desc: 'Informar o cliente que a carga está em trânsito', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e08', title: 'Solicitar Localização', desc: 'Solicitar localização exata de entrega ao cliente', phase: 'transito', phaseLabel: 'FASE 2 — TRÂNSITO' },
    { id: 'e09', title: 'Infos de Entrega', desc: 'Repassar todas as informações da entrega ao motorista', phase: 'entrega', phaseLabel: 'FASE 3 — ENTREGA' },
    { id: 'e10', title: 'Canhoto Recebido', desc: 'Receber canhoto assinado e foto da entrega do motorista', phase: 'entrega', phaseLabel: 'FASE 3 — ENTREGA' },
    { id: 'e11', title: 'Informa ao cliente', desc: 'Repassar todas as informações da entrega concluída com canhoto', phase: 'encerrar', phaseLabel: 'FASE 4 — ENCERRAR' },
    { id: 'e12', title: 'CanhotoAXD', desc: 'Enviar canhoto ao grupo AXD/RODOVAR marcando @Mateus', phase: 'encerrar', phaseLabel: 'FASE 4 — ENCERRAR' },
    { id: 'e13', title: 'Finalizar Rota', desc: 'Atualizar status da carga para Entregue no sistema', phase: 'encerrar', phaseLabel: 'FASE 4 — ENCERRAR' }
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

    // 3. Prazo de entrega é hoje e etapa 13 não concluída
    const hojeStr = new Date().toISOString().split('T')[0];
    if (!etapas.e13 && e.prazo === hojeStr) {
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

  // Memoized carga list for exactly last 3 days of updates or registration (72 hours)
  const cargasUltimos3Dias = useMemo(() => {
    const agora = Date.now();
    const limite3Dias = 3 * 24 * 60 * 60 * 1000; // 72 hours
    return cargas.filter(c => {
      const tc = c.created_at ? new Date(c.created_at).getTime() : 0;
      const tu = c.updated_at ? new Date(c.updated_at).getTime() : agora;
      return (agora - tc < limite3Dias) || (agora - tu < limite3Dias);
    });
  }, [cargas]);

  const filteredRouteCargas = useMemo(() => {
    const q = routeSearchQuery.toLowerCase().trim();
    if (!q) return cargasUltimos3Dias;
    return cargasUltimos3Dias.filter(c => 
      (c.motorista || '').toLowerCase().includes(q) ||
      (c.origem || '').toLowerCase().includes(q) ||
      (c.destino || '').toLowerCase().includes(q) ||
      (cleanVendedor(c.vendedor || '')).toLowerCase().includes(q) ||
      (c.cliente || '').toLowerCase().includes(q)
    );
  }, [cargasUltimos3Dias, routeSearchQuery]);

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
      return listConcluidas <= 4; // Phase 1 (Coleta) is done up to etapa 4
    }).length;

    const emTransito = cargas.filter(c => {
      return c.status === 'em_transito' && !c.etapasOperador?.e13;
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
    const prazoBR = formatDateBR(e.prazo);
    const notas = e.notasOperador || '';

    // Extract potential confirm items from Operator notes
    const endConfirmado = (e.observacoes || notas || '').trim() || 'Pendente (confirmar com as instruções na etapa 8)';

    // Helper helper to get logged username/displayName
    const getActiveUserFullName = () => {
      if (user && user.displayName) return user.displayName;
      const stored = localStorage.getItem('rodovar_active_login_v2');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.displayName) return parsed.displayName;
        } catch {}
      }
      return 'Jairo Bahia'; // Safe fallback
    };

    const jairoName = getActiveUserFullName();

    // Time of day greeting helper: Bom dia, Boa tarde, Boa noite
    const getGreeting = (): string => {
      const hr = new Date().getHours();
      if (hr >= 5 && hr < 12) return 'Bom dia';
      if (hr >= 12 && hr < 18) return 'Boa tarde';
      return 'Boa noite';
    };

    const greeting = getGreeting();

    switch (etapaId) {
      case 'e01':
        return `${greeting}, ${motorista}! Tudo bem? Aqui é o ${jairoName} da Rodovar. Passando para informar de maneira respeitosa que sua carga já foi registrada como Coletando em nosso sistema. Desejamos uma excelente viagem!`;
      case 'e02':
        return `${greeting}, ${motorista}! Tudo bem? Por gentileza, poderia nos confirmar se você já chegou com sucesso ao local de coleta em ${origem}? Agradeço a atenção.`;
      case 'e03':
        return `${greeting}, ${motorista}! Tudo bem? Por favor, você teria uma previsão aproximada de que horas deve finalizar o seu carregamento aí em ${origem}? Aguardo seu retorno para alinhamento.`;
      case 'e04':
        return `${greeting}, ${motorista}! Tudo bem? Concluiu o carregamento? Por gentileza, nos envie uma foto bem nítida do documento físico de coleta assinado para que possamos validar no sistema. Muito obrigado!`;
      case 'e05':
        return `${greeting}, Mateus! Tudo bem? Segue em anexo o documento de coleta assinado referente ao motorista ${motorista} (Origem: ${origem} ➔ Destino: ${destino}). Por favor, dê início à emissão do MDF-e para liberação do frete. Obrigado!`;
      case 'e06':
        return `${greeting}, ${motorista}! Tudo bem? Segue em anexo o arquivo do seu MDF-e para viagem. Sua documentação e rota estão 100% autorizadas e liberadas em nosso sistema. Desejamos uma ótima estrada e siga em total segurança!`;
      case 'e07':
        return `${greeting}, tudo bem? Aqui é o ${jairoName} da Rodovar. Passando com muito respeito para informar que a sua carga já se encontra em trânsito com o motorista ${motorista}. A nossa previsão estimada de entrega é para o dia ${prazoBR || 'planejado'}. Qualquer dúvida, estou à inteira disposição!`;
      case 'e08':
        return `${greeting}, tudo bem? Para garantirmos total exatidão e agilidade na realização do descarrego da sua carga em ${destino}, por gentileza, nos envie o link da localização exata ou o endereço de destino confirmado com pontos de referência. Muito obrigado pelo valioso suporte!`;
      case 'e09':
        return `${greeting}, ${motorista}! Tudo bem? Seguem todas as coordenadas e informações completas confirmadas para a realização de sua entrega em ${destino}:\n📦 Cliente: ${cliente}\n📍 Endereço de Entrega: ${endConfirmado}\nPor gentileza, siga com toda atenção e segurança. Excelente trabalho!`;
      case 'e10':
        return `${greeting}, ${motorista}! Tudo bem? Parabéns pela viagem concluída com sucesso! Por gentileza, assim que possível, nos envie uma foto bem legível e foca do canhoto assinado e da entrega realizada do motorista, para darmos baixa em nosso sistema e liberarmos o seu saldo de frete com faturamento. Fique com Deus!`;
      case 'e11':
        return `${greeting}, tudo bem? Aqui é o ${jairoName} da Rodovar. Passando de forma formal e educada para informar com grande satisfação que a entrega de sua mercadoria foi concluída com sucesso absoluto. O canhoto assinado já se encontra em nossa base. Agradecemos muito pela confiança e pela parceria!`;
      case 'e12':
        return `${greeting}, Mateus! Tudo bem? Segue em anexo o canhoto de entrega assinado pelo motorista ${motorista} referente ao trajeto ${origem} ➔ ${destino}. Documentação em perfeita ordem. Favor processar e registrar no sistema do grupo AXD/RODOVAR. Muito obrigado!`;
      case 'e13':
        return `${greeting}! Rota concluída. Etapa administrativa de finalização executada com sucesso no sistema para o motorista ${motorista}. Status do frete atualizado para Entregue.`;
      default:
        return '';
    }
  };

  // Helper helper to calculate realistic route predictions with Brazilian truck routing limits
  const calculateRouteDetails = (e: Entrega | null) => {
    if (!e) return null;
    const distance = getDeliveryKm(e);
    const speed = customSpeed > 0 ? customSpeed : 60;
    const dailyHours = customDailyHours > 0 ? customDailyHours : 9;

    // Driving time in decimal hours
    const totalHoursActive = distance / speed;

    // Brazilian driver's law (Lei 13.103): 30 minutes rest stop every 4 hours
    const restStopsCount = Math.floor(totalHoursActive / 4);
    const totalRestHours = restStopsCount * 0.5;

    // Overnight rest: 11 hours rest required if total hours exceed dailyHours driving limit
    const daysOfActiveDrive = totalHoursActive / dailyHours;
    const pernoitesCount = Math.max(0, Math.floor(daysOfActiveDrive - 0.01));
    const totalPernoiteHours = pernoitesCount * 11;

    // Combined durations
    const totalTravelHours = totalHoursActive + totalRestHours + totalPernoiteHours;

    // Calculate actual ETA (Date)
    const startDate = startingTime ? new Date(startingTime) : new Date();
    const etaMs = startDate.getTime() + totalHoursActive * 60 * 60 * 1000 + totalRestHours * 60 * 60 * 1000 + totalPernoiteHours * 60 * 60 * 1000;
    const etaDate = new Date(etaMs);

    // Format ETA
    const weekDaysArr = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const weekday = weekDaysArr[etaDate.getDay()];
    const formattedETA = etaDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ` às ${String(etaDate.getHours()).padStart(2, '0')}:${String(etaDate.getMinutes()).padStart(2, '0')}h`;

    const activeHoursInt = Math.floor(totalHoursActive);
    const activeMinutesInt = Math.round((totalHoursActive - activeHoursInt) * 60);

    const getActiveUserFullName = () => {
      if (user && user.displayName) return user.displayName;
      const stored = localStorage.getItem('rodovar_active_login_v2');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.displayName) return parsed.displayName;
        } catch {}
      }
      return 'Jairo Bahia'; // Safe fallback
    };
    const activeOperator = getActiveUserFullName();

    return {
      distance,
      activeHours: activeHoursInt,
      activeMinutes: activeMinutesInt,
      restStopsCount,
      pernoitesCount,
      totalTravelHours,
      formattedETA,
      etaWeekday: weekday,
      motoristaMessage: `Fala, ${e.motorista || 'Amigo'}! Tudo bem? Aqui é o ${activeOperator} da Rodovar. Calculamos seu plano de viagem realista de ${e.origem} até ${e.destino} (${distance} km):\n⏱️ Limite diário programado: ${dailyHours}h de direção ativa a ${speed} km/h.\n⚠️ Lembre-se de realizar ${restStopsCount} paradas obrigatórias de 30min para descanso regulamentar e no total realizar ${pernoitesCount} pernoites para sua segurança na estrada.\n🏁 Previsão realista de chegada no descarregamento estimada para: ${formattedETA} (${weekday}).\nSiga em paz, com tranquilidade e boa viagem! 🛣️🚚`,
      clienteMessage: `Olá, tudo bem? Aqui é o ${activeOperator} da Rodovar. Para sua total previsibilidade, realizamos um cálculo em tempo real de rota para a sua carga com origem em ${e.origem} e destino ${e.destino}. Sob condução profissional do motorista ${e.motorista}, com velocidade média regulamentada de ${speed} km/h e considerando o tempo de descanso por lei, a nossa previsão realista de chegada para descarregamento é para o dia: ${formattedETA} (${weekday}). Qualquer novidade informamos. Seguimos monitorando! 👍`
    };
  };

  const handleSalvarPrevisaoRealista = async (carga: Entrega, msg: string, formattedETA: string) => {
    setSalvandoPrevisaoId(carga.id);
    try {
      const novaNota = `[PREVISÃO EM TEMPO REAL] Rota ${carga.origem} ➔ ${carga.destino}. Chegada estimada realista: ${formattedETA}.`;
      await updateEntregaField(carga.id, {
        notasOperador: msg,
        notasAtualizadaEm: new Date().toISOString()
      });

      // Update locally
      setCargas(prev => prev.map(item => item.id === carga.id ? { ...item, notasOperador: msg } : item));
      if (activeRouteCalcSelected?.id === carga.id) {
        setActiveRouteCalcSelected(prev => prev ? { ...prev, notasOperador: msg } : null);
      }
      alert(`Previsão calculada gravada com sucesso absoluto nas anotações da carga! 🛣️✅`);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao gravar previsão realista: ${err.message}`);
    } finally {
      setSalvandoPrevisaoId(null);
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
            className="flex items-center gap-2 bg-[#FFD600] hover:bg-[#ffe23b] text-black rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider cursor-pointer font-sans shadow-md active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            {carregando ? '...' : 'Atualizar'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsRouteModalOpen(true);
              if (cargasUltimos3Dias.length > 0) {
                setActiveRouteCalcSelected(cargasUltimos3Dias[0]);
              }
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider cursor-pointer font-sans shadow-md active:scale-95 transition-all border border-emerald-500/30"
          >
            <span>🛣️</span> Rotas & Previsão (3d)
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
                        c.status === 'entregue' || c.etapasOperador?.e13 ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400' :
                        c.status === 'em_transito' ? 'bg-amber-950/20 border-amber-900 text-[#FFD600]' :
                        'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}>
                        {c.etapasOperador?.e13 ? 'entregue' : c.status.replace('_', ' ')}
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
                        <div>Atendente: <strong className="text-zinc-205 text-white">{cleanVendedor(e.vendedor) || 'Sem Atendente'}</strong></div>
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

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 border-t border-zinc-900/30">
                      <div className="flex-1">
                        {occurrenceFeedback[e.id] ? (
                          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 animate-pulse">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            {occurrenceFeedback[e.id]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-500 block leading-tight font-sans">
                            Clique ao lado para registrar esta anotação como Ocorrência Tratada na linha do tempo e observações da carga.
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSalvarOcorrenciaTratada(e.id)}
                        disabled={salvandoNotaId === e.id || !(notepadContent[e.id] || '').trim()}
                        className="px-4 py-2 rounded bg-zinc-900 hover:bg-[#FFD600] hover:text-black border border-zinc-800 hover:border-yellow-600 text-xs font-black uppercase text-[#FFD600] tracking-wider transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 self-end shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Salvar Ocorrência Tratada
                      </button>
                    </div>
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
                        const phoneToUse = et.id === 'e07' || et.id === 'e08' || et.id === 'e11' ? e.tel_cliente : e.tel_motorista;
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
                                <div className="w-full mt-2.5 space-y-2">
                                  <div className="flex items-center gap-2">
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

                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(textMsg);
                                        // Temporary state indicator is nice, but alert is rugged and safe
                                        alert("Script copiado para a área de transferência! 📋");
                                      }}
                                      className="px-2.5 py-1 rounded text-[10px] bg-zinc-850 hover:bg-zinc-700 text-zinc-300 font-bold border border-zinc-800 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                                    >
                                      <span>📋</span> Copiar Script
                                    </button>
                                  </div>

                                  <div className="bg-zinc-950/40 p-2 rounded border border-zinc-900/60 font-mono text-[9px] text-zinc-400 leading-tight whitespace-pre-wrap">
                                    <span className="text-zinc-500 font-bold uppercase tracking-wider text-[8px] block mb-1">Preview do Script ({et.id === 'e07' || et.id === 'e08' ? 'Cliente' : 'Motorista'}):</span>
                                    "{textMsg}"
                                  </div>
                                </div>
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

                              {/* Suggest updateDoc "entregue" automatically at Step 13 */}
                              {et.id === 'e13' && !isConcluida && e.status !== 'entregue' && (
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
                                    await handleToggleEtapa(e.id, 'e13', false);
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

                  {/* PARTE 4 — Finalizing message when all 13 stages completed */}
                  {concluidas === 13 && (
                    <div className="bg-emerald-950/25 border-2 border-emerald-500/60 rounded-xl p-4 md:p-5 text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 animate-bounce">
                        ✓
                      </div>
                      <h4 className="text-sm font-black text-white uppercase tracking-wider font-sans">CARGA FINALIZADA COM SUCESSO</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed max-w-lg mx-auto">
                        Excelente trabalho operacional! Todas as 13 etapas, do cadastro ao canhoto de pagamento de Mateus AXD, foram registradas. Rota entre <strong>{e.origem}</strong> e <strong>{e.destino}</strong> foi concluída sem incidentes e sob controle total comercial.
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

      {/* MODAL: CALCULADORA DE ROTAS E PREVISÃO REALISTA */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col md:h-auto overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-zinc-900 bg-zinc-900/40">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🛣️</span>
                <div>
                  <h3 className="text-sm font-black uppercase text-white tracking-wider font-sans">
                    Calculadora de Rotas & Previsibilidade Real (3 Dias)
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-sans mt-0.5">
                    Modela frotas e descansos regulamentares da Lei do Motorista em tempo real
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRouteModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-805 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Two-column Layout */}
            <div className="p-4 md:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[350px] max-h-[70vh]">
              
              {/* Column 1: Selector & Config inputs (5 Cols) */}
              <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-4">
                
                {/* Search & Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans block">
                    1. Selecionar Rota/Carga de Trabalho
                  </label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Filtrar motorista, destino, atendente..."
                      value={routeSearchQuery}
                      onChange={(e) => setRouteSearchQuery(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg py-2 pl-8 pr-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FFD600] font-sans"
                    />
                  </div>

                  <div className="border border-zinc-900 rounded-lg max-h-40 overflow-y-auto space-y-1 p-1 bg-zinc-950/40">
                    {filteredRouteCargas.length === 0 ? (
                      <p className="text-[10px] text-zinc-500 text-center py-4 italic font-sans font-medium">Nenhuma carga recente (últimos 3 dias) encontrada.</p>
                    ) : (
                      filteredRouteCargas.map((c) => {
                        const isSelected = activeRouteCalcSelected?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveRouteCalcSelected(c)}
                            className={`w-full text-left p-2 rounded-md transition-all flex flex-col gap-0.5 cursor-pointer text-xs ${
                              isSelected 
                                ? 'bg-[#FFD600]/10 border border-[#FFD600]/45 text-white' 
                                : 'hover:bg-zinc-900 border border-transparent text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <div className="flex justify-between items-center w-full font-bold">
                              <span className="text-white truncate max-w-[150px]">{c.motorista}</span>
                              <span className="text-[9px] px-1.5 bg-zinc-900 rounded text-zinc-500 font-mono font-normal">
                                {getDeliveryKm(c)} km
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-zinc-500 truncate">
                              <span>{c.origem}</span>
                              <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                              <span className="text-[#FFD600]/85">{c.destino}</span>
                            </div>
                            <div className="text-[8px] text-zinc-650 font-mono mt-0.5">
                              Aten: {cleanVendedor(c.vendedor || '')} • Criado em: {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : 'Sem data'}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Simulated routing attributes */}
                <div className="bg-zinc-900/40 border border-[#FFD600]/10 p-4 rounded-xl space-y-4">
                  <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#FFD600] font-sans">
                    2. Variáveis de Simulação Logística
                  </h4>

                  {/* Average speed */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-300">Velocidade Média Programada:</span>
                      <span className="text-white font-mono">{customSpeed} km/h</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="90"
                      step="5"
                      value={customSpeed}
                      onChange={(e) => setCustomSpeed(Number(e.target.value))}
                      className="w-full accent-[#FFD600] bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-[#FFD600]/60 font-mono">
                      <span>40 km/h (Chuvas / Serra)</span>
                      <span>90 km/h (Pista Dupla)</span>
                    </div>
                  </div>

                  {/* Active driving hour limit per day */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-300">Jornada Diária de Direção:</span>
                      <span className="text-white font-mono">{customDailyHours} horas/dia</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="11"
                      step="1"
                      value={customDailyHours}
                      onChange={(e) => setCustomDailyHours(Number(e.target.value))}
                      className="w-full accent-[#FFD600] bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-[#FFD600]/60 font-mono">
                      <span>6h/dia (Fins de semana)</span>
                      <span>11h/dia (Lei do Motorista)</span>
                    </div>
                  </div>

                  {/* Starting Date Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300 block">
                      Horário Estipulado de Saída:
                    </label>
                    <input
                      type="datetime-local"
                      value={startingTime}
                      onChange={(e) => setStartingTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FFD600]"
                    />
                  </div>
                </div>

              </div>

              {/* Column 2: Simulated ETA and copyable ready scripts (7 Cols) */}
              <div className="lg:col-span-12 xl:col-span-7 flex flex-col justify-between gap-4">
                {activeRouteCalcSelected ? (
                  (() => {
                    const results = calculateRouteDetails(activeRouteCalcSelected);
                    if (!results) return null;

                    return (
                      <div className="space-y-4 h-full flex flex-col justify-between">
                        
                        {/* Summary statistics */}
                        <div className="bg-zinc-900/20 border border-zinc-850 rounded-xl p-4 space-y-3">
                          <h4 className="text-[10px] uppercase font-bold tracking-widest text-[#FFD600] pb-2 border-b border-zinc-900 font-sans flex items-center justify-between">
                            <span>Previsão Realista Calculada</span>
                            <span className="text-[9px] font-mono font-normal text-zinc-500 uppercase">Fórmula Lei 13.103</span>
                          </h4>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                            <div className="bg-zinc-950/60 p-2.5 rounded border border-zinc-900">
                              <span className="text-[9px] text-zinc-500 block uppercase">Km Total</span>
                              <strong className="text-sm text-[#FFD600] block mt-0.5">{results.distance} km</strong>
                            </div>
                            <div className="bg-zinc-950/60 p-2.5 rounded border border-zinc-900">
                              <span className="text-[9px] text-zinc-500 block uppercase">Direção Pura</span>
                              <strong className="text-sm text-white block mt-0.5">{results.activeHours}h {results.activeMinutes}m</strong>
                            </div>
                            <div className="bg-zinc-950/60 p-2.5 rounded border border-zinc-900">
                              <span className="text-[9px] text-zinc-500 block uppercase">Paradas 30m</span>
                              <strong className="text-xs text-amber-500 block mt-1">{results.restStopsCount} paradas</strong>
                            </div>
                            <div className="bg-zinc-950/60 p-2.5 rounded border border-zinc-900">
                              <span className="text-[9px] text-zinc-500 block uppercase">Pernoite (11h)</span>
                              <strong className="text-xs text-indigo-400 block mt-1">{results.pernoitesCount} pernoites</strong>
                            </div>
                          </div>

                          <div className="bg-[#FFD600]/5 border border-[#FFD600]/30 rounded-lg p-3 flex items-center gap-3 mt-1">
                            <div className="w-9 h-9 rounded-full bg-[#FFD600]/10 flex items-center justify-center shrink-0 text-[#FFD600]">
                              <Clock className="w-5 h-5" />
                            </div>
                            <div>
                              <span className="text-[9px] text-zinc-400 uppercase font-mono block">Previsão Estimada de Entrega (ETA Realista)</span>
                              <strong className="text-sm md:text-base text-[#FFD600] uppercase font-sans tracking-tight">
                                {results.formattedETA}
                              </strong>
                              <span className="text-xs text-white block font-sans font-medium">({results.etaWeekday})</span>
                            </div>
                          </div>
                        </div>

                        {/* Script boxes with instant copy */}
                        <div className="space-y-4 overflow-y-auto max-h-[350px] pr-1">
                          
                          {/* Motorista script block */}
                          <div className="space-y-1.5 p-3 rounded-lg bg-zinc-900/10 border border-zinc-900/60">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider font-sans">
                                💬 WhatsApp: Script de Viagem ao Motorista ({activeRouteCalcSelected.motorista})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(results.motoristaMessage);
                                  alert("Script de viagem para o Motorista copiado! 📋");
                                }}
                                className="text-[9px] font-mono text-zinc-400 hover:text-white cursor-pointer transition-colors bg-zinc-950 px-2 py-1 rounded border border-zinc-800"
                              >
                                Copiar Script
                              </button>
                            </div>
                            <textarea
                              readOnly
                              value={results.motoristaMessage}
                              className="w-full h-24 bg-zinc-950 border border-zinc-900 rounded-lg p-2.5 text-xs text-zinc-300 font-mono leading-relaxed"
                            />
                            <div className="flex justify-end gap-2 text-right mt-1.5">
                              <button
                                type="button"
                                onClick={() => handleSalvarPrevisaoRealista(activeRouteCalcSelected, results.motoristaMessage, results.formattedETA)}
                                disabled={salvandoPrevisaoId === activeRouteCalcSelected.id}
                                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-[#FFD600] text-[#FFD600] hover:text-black hover:border-yellow-600 transition-all border border-zinc-800 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                              >
                                {salvandoPrevisaoId === activeRouteCalcSelected.id ? 'Salvando...' : '💾 Salvar Previsão no Cadastro'}
                              </button>
                            </div>
                          </div>

                          {/* Cliente script block */}
                          <div className="space-y-1.5 p-3 rounded-lg bg-zinc-900/10 border border-zinc-900/60">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider font-sans">
                                🤝 WhatsApp: Informativo de Previsibilidade ao Cliente ({activeRouteCalcSelected.cliente || 'Sem Cliente'})
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(results.clienteMessage);
                                  alert("Informativo para o Cliente copiado! 📋");
                                }}
                                className="text-[9px] font-mono text-zinc-400 hover:text-white cursor-pointer transition-colors bg-zinc-950 px-2 py-1 rounded border border-zinc-800"
                              >
                                Copiar Script
                              </button>
                            </div>
                            <textarea
                              readOnly
                              value={results.clienteMessage}
                              className="w-full h-24 bg-zinc-950 border border-zinc-900 rounded-lg p-2.5 text-xs text-zinc-300 font-mono leading-relaxed"
                            />
                            <div className="flex justify-end gap-2 text-right mt-1.5">
                              <button
                                type="button"
                                onClick={() => handleSalvarPrevisaoRealista(activeRouteCalcSelected, results.clienteMessage, results.formattedETA)}
                                disabled={salvandoPrevisaoId === activeRouteCalcSelected.id}
                                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-[#FFD600] text-[#FFD600] hover:text-black hover:border-yellow-600 transition-all border border-zinc-800 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                              >
                                {salvandoPrevisaoId === activeRouteCalcSelected.id ? 'Salvando...' : '💾 Salvar Previsão no Cadastro'}
                              </button>
                            </div>
                          </div>

                        </div>

                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-zinc-900/10 border border-dashed border-zinc-850 rounded-2xl p-8 text-center h-full flex flex-col justify-center items-center gap-2">
                    <span className="text-3xl">🛣️</span>
                    <strong className="text-zinc-400 font-sans text-xs uppercase">Sem Carga Selecionada</strong>
                    <p className="text-[10px] text-zinc-500 max-w-sm mx-auto">
                      Escolha um dos roteiros ativos do painel do lado esquerdo para calcular previsões realistas de rota e gerar scripts de comunicação customizados.
                    </p>
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
