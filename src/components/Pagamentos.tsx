import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Camera,
  Package,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  Trash2,
  Eye,
  FileCode,
  MapPin,
  ArrowRight,
  RefreshCw,
  UploadCloud,
  Truck,
  UserCheck,
  Building2,
  Filter,
  CheckCheck,
  ShieldCheck,
  Maximize2,
  FileUp,
  FileCheck,
  MessageSquare,
  Send
} from 'lucide-react';
import { Entrega, AnexoPagamento } from '../types';
import { getEntregas, updatePagamentoEntrega } from '../db/storage';
import { processAndCompressFile } from '../utils/imageCompressor';
import { formatDateBR, formatDateTimeBR } from '../utils/date';
import { parseRapFile } from '../utils/rapParser';

interface PagamentosProps {
  currentUser?: {
    uid?: string;
    username?: string;
    name?: string;
    role?: string;
  } | null;
}

type FilterPill = 'TODOS' | 'NO_PRAZO' | 'PAGO_HOJE' | 'ATRASADOS';

export const Pagamentos: React.FC<PagamentosProps> = ({ currentUser }) => {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFilterPill, setSelectedFilterPill] = useState<FilterPill>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Date selector defaulting to today in YYYY-MM-DD
  const todayIso = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // Expanded attachments section per card
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Loading state for upload per file type per card
  const [uploadingState, setUploadingState] = useState<Record<string, boolean>>({});

  // Dropdown "Marcar como Pago" per card
  const [pagoDropdownOpenId, setPagoDropdownOpenId] = useState<string | null>(null);

  // Modal Script de Pagamento
  const [scriptModalEntrega, setScriptModalEntrega] = useState<Entrega | null>(null);
  const [copiedScriptType, setCopiedScriptType] = useState<'adiantamento' | 'saldo' | null>(null);

  // Modal Preview Anexo
  const [previewAnexo, setPreviewAnexo] = useState<AnexoPagamento | null>(null);

  // Pagination state (20 motoristas por vez para controle de cota)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 20;

  // Modal Lançar / Escanear RPA
  const [rpaModalEntrega, setRpaModalEntrega] = useState<Entrega | null>(null);
  const [rpaFreteTotal, setRpaFreteTotal] = useState<string>('');
  const [rpaAdiantamento, setRpaAdiantamento] = useState<string>('');
  const [rpaSaldo, setRpaSaldo] = useState<string>('');
  const [rpaCte, setRpaCte] = useState<string>('');
  const [rpaFavorecido, setRpaFavorecido] = useState<string>('');
  const [rpaChavePix, setRpaChavePix] = useState<string>('');
  const [rpaBancoPix, setRpaBancoPix] = useState<string>('');
  const [rpaSaving, setRpaSaving] = useState<boolean>(false);

  // Open RPA Modal with prefilled values
  const openRpaModal = (entrega: Entrega) => {
    setRpaModalEntrega(entrega);
    const totalMot = Number(entrega.frete_motorista) || 0;
    const valAd = entrega.valorAdiantamento !== undefined ? entrega.valorAdiantamento : Math.round(totalMot * 0.7);
    const valSal = entrega.valorSaldo !== undefined ? entrega.valorSaldo : Math.round(totalMot * 0.3);

    setRpaFreteTotal(totalMot ? String(totalMot) : '');
    setRpaAdiantamento(valAd ? String(valAd) : '');
    setRpaSaldo(valSal ? String(valSal) : '');
    setRpaCte(entrega.cte || entrega.contratoNum || '');
    setRpaFavorecido(entrega.favorecidoPix || entrega.motorista || '');
    setRpaChavePix(entrega.chavePix || entrega.tel_motorista || '');
    setRpaBancoPix(entrega.bancoPix || '');
  };

  // Save RPA & CTA data automatically
  const handleSaveRpa = async () => {
    if (!rpaModalEntrega) return;
    setRpaSaving(true);

    try {
      const freteTotNum = parseFloat(rpaFreteTotal.replace(',', '.')) || 0;
      const adiantNum = parseFloat(rpaAdiantamento.replace(',', '.')) || Math.round(freteTotNum * 0.7);
      const saldoNum = parseFloat(rpaSaldo.replace(',', '.')) || Math.round(freteTotNum * 0.3);

      await updatePagamentoEntrega(rpaModalEntrega.id, {
        frete_motorista: freteTotNum,
        valorAdiantamento: adiantNum,
        valorSaldo: saldoNum,
        cte: rpaCte || 'RPA-' + Math.floor(Math.random() * 10000),
        contratoNum: rpaCte || rpaModalEntrega.contratoNum,
        favorecidoPix: rpaFavorecido,
        chavePix: rpaChavePix,
        bancoPix: rpaBancoPix
      });

      setRpaModalEntrega(null);
    } catch (err) {
      console.error('Erro ao salvar dados do RPA:', err);
      alert('Erro ao salvar dados do RPA. Tente novamente.');
    } finally {
      setRpaSaving(false);
    }
  };

  // RAP Upload & Auto-Read State
  const [readingRapState, setReadingRapState] = useState<Record<string, boolean>>({});
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  const handleRapFileUpload = async (entrega: Entrega, file: File) => {
    if (!file) return;
    setReadingRapState(prev => ({ ...prev, [entrega.id]: true }));

    try {
      // Compress/process file for storage/preview
      const processed = await processAndCompressFile(file);

      // Parse text & values from RAP document
      const parsed = await parseRapFile(file);

      const newAnexo: AnexoPagamento = {
        id: `anexo_rap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tipo: 'rap',
        url: processed.dataUrl,
        nomeArquivo: file.name,
        dataUpload: new Date().toISOString(),
        tamanhoKb: Math.round(processed.dataUrl.length / 1024)
      };

      const existingAnexos = entrega.anexosPagamento || [];
      const updatedAnexos = [...existingAnexos.filter(a => a.tipo !== 'rap'), newAnexo];

      const valAdiantamento = parsed.valorAdiantamento !== undefined ? parsed.valorAdiantamento : (entrega.valorAdiantamento ?? 0);
      const valSaldo = parsed.valorSaldo !== undefined ? parsed.valorSaldo : (entrega.valorSaldo ?? 0);
      const freteTotal = parsed.freteTotal || (valAdiantamento + valSaldo > 0 ? valAdiantamento + valSaldo : entrega.frete_motorista || 0);
      const contratoNum = parsed.contratoNum || entrega.cte || entrega.contratoNum || file.name.replace(/\.[^/.]+$/, "");
      const favorecido = parsed.favorecidoPix || entrega.favorecidoPix || entrega.motorista;

      await updatePagamentoEntrega(entrega.id, {
        valorAdiantamento: valAdiantamento,
        valorSaldo: valSaldo,
        frete_motorista: freteTotal,
        cte: contratoNum,
        contratoNum: contratoNum,
        favorecidoPix: favorecido,
        rpaLido: true,
        rpaNomeArquivo: file.name,
        anexosPagamento: updatedAnexos
      });

      const data = getEntregas();
      setEntregas(data);

      alert(`✅ ARQUIVO RAP LIDO E DADOS ATUALIZADOS!\n\n` +
            `• Contrato/CTRC: ${contratoNum}\n` +
            `• Adiantamento: R$ ${valAdiantamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
            `• Saldo: R$ ${valSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n` +
            `Os scripts de pagamento foram atualizados com segurança.`);
    } catch (err) {
      console.error('Erro ao ler arquivo RAP:', err);
      alert('Erro ao ler arquivo RAP. Verifique o formato e tente novamente.');
    } finally {
      setReadingRapState(prev => ({ ...prev, [entrega.id]: false }));
    }
  };

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilterPill, searchTerm, selectedDate]);

  // Load and subscribe to entregas sync
  useEffect(() => {
    const loadEntregas = () => {
      const data = getEntregas();
      setEntregas(data);
      setLoading(false);
    };

    loadEntregas();

    const handleSync = () => {
      loadEntregas();
    };

    window.addEventListener('rodovar_realtime_event', handleSync);
    return () => {
      window.removeEventListener('rodovar_realtime_event', handleSync);
    };
  }, []);

  // Helper to compute payment status for an item
  const getPaymentCalculatedStatus = (entrega: Entrega) => {
    const isAdiantamentoPago = entrega.statusPagamentoAdiantamento === 'pago';
    const isSaldoPago = entrega.statusPagamentoSaldo === 'pago';

    // If both marked as paid or overall item marked paid
    if (isAdiantamentoPago && isSaldoPago) {
      return 'PAGO';
    }

    const prazoTarget = entrega.prazoAdiantamento || entrega.prazo || entrega.data_coleta;
    if (prazoTarget && prazoTarget < todayIso && (!isAdiantamentoPago || !isSaldoPago)) {
      return 'ATRASADO';
    }

    return 'NO_PRAZO';
  };

  // Filtered list
  const filteredEntregas = useMemo(() => {
    return entregas.filter(entrega => {
      // Date filter match: either collection date, payment deadline or created date
      if (selectedDate) {
        const coletaMatch = entrega.data_coleta === selectedDate;
        const prazoMatch = entrega.prazo === selectedDate || entrega.prazoAdiantamento === selectedDate || entrega.prazoSaldo === selectedDate;
        if (!coletaMatch && !prazoMatch) return false;
      }

      // Search term filter match (driver name, client, order ID, CTRC)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const mot = (entrega.motorista || '').toLowerCase();
        const cli = (entrega.cliente || '').toLowerCase();
        const id = (entrega.id || '').toLowerCase();
        const cte = (entrega.cte || '').toLowerCase();
        if (!mot.includes(term) && !cli.includes(term) && !id.includes(term) && !cte.includes(term)) {
          return false;
        }
      }

      // Pill Filter Match
      const status = getPaymentCalculatedStatus(entrega);
      if (selectedFilterPill === 'NO_PRAZO') {
        return status === 'NO_PRAZO';
      }
      if (selectedFilterPill === 'ATRASADOS') {
        return status === 'ATRASADO';
      }
      if (selectedFilterPill === 'PAGO_HOJE') {
        const isPaidAd = entrega.statusPagamentoAdiantamento === 'pago';
        const isPaidSal = entrega.statusPagamentoSaldo === 'pago';
        const isPaidToday = (entrega.dataPagoAdiantamento === formatDateBR(todayIso) || entrega.dataPagoSaldo === formatDateBR(todayIso) || isPaidAd || isPaidSal);
        return isPaidToday;
      }

      return true; // TODOS
    });
  }, [entregas, selectedDate, searchTerm, selectedFilterPill, todayIso]);

  // Pagination calculations (20 motoristas por vez para otimizar cota)
  const totalPages = Math.max(1, Math.ceil(filteredEntregas.length / ITEMS_PER_PAGE));
  const paginatedEntregas = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEntregas.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntregas, currentPage]);

  // Dynamic Pill Counters
  const counters = useMemo(() => {
    let todos = 0;
    let noPrazo = 0;
    let pagoHoje = 0;
    let atrasados = 0;

    entregas.forEach(entrega => {
      // Apply date and search filters first for counter consistency
      if (selectedDate) {
        const coletaMatch = entrega.data_coleta === selectedDate;
        const prazoMatch = entrega.prazo === selectedDate || entrega.prazoAdiantamento === selectedDate || entrega.prazoSaldo === selectedDate;
        if (!coletaMatch && !prazoMatch) return;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const mot = (entrega.motorista || '').toLowerCase();
        const cli = (entrega.cliente || '').toLowerCase();
        if (!mot.includes(term) && !cli.includes(term)) return;
      }

      todos++;
      const st = getPaymentCalculatedStatus(entrega);
      if (st === 'NO_PRAZO') noPrazo++;
      if (st === 'ATRASADO') atrasados++;
      if (entrega.statusPagamentoAdiantamento === 'pago' || entrega.statusPagamentoSaldo === 'pago') {
        pagoHoje++;
      }
    });

    return { todos, noPrazo, pagoHoje, atrasados };
  }, [entregas, selectedDate, searchTerm, todayIso]);

  // Toggle card attachments accordion
  const toggleCardAccordion = (id: string) => {
    setExpandedCardIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Upload handler with client-side canvas compression
  const handleFileUpload = async (
    entregaId: string,
    tipo: 'nf' | 'coleta' | 'entrega',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const key = `${entregaId}_${tipo}`;
    setUploadingState(prev => ({ ...prev, [key]: true }));

    try {
      // 1. Client-side compression for images (1600px max side, ~75% quality)
      const compressed = await processAndCompressFile(file, 1600, 0.75);

      const novoAnexo: AnexoPagamento = {
        id: 'anx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        tipo,
        url: compressed.dataUrl,
        nomeArquivo: compressed.fileName,
        dataUpload: new Date().toISOString(),
        tamanhoKb: compressed.sizeKb
      };

      // 2. Fetch existing attachments and append
      const targetEntrega = entregas.find(item => item.id === entregaId);
      const anexosAtuais = targetEntrega?.anexosPagamento || [];
      const novosAnexos = [...anexosAtuais, novoAnexo];

      // 3. Save to storage & Firestore
      await updatePagamentoEntrega(entregaId, {
        anexosPagamento: novosAnexos
      });

      // Clear input value
      e.target.value = '';
    } catch (err) {
      console.error('Erro ao processar e enviar anexo:', err);
      alert('Falha ao processar o arquivo. Tente novamente.');
    } finally {
      setUploadingState(prev => ({ ...prev, [key]: false }));
    }
  };

  // Delete attachment
  const handleDeleteAnexo = async (entregaId: string, anexoId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este anexo?')) return;

    const targetEntrega = entregas.find(item => item.id === entregaId);
    if (!targetEntrega) return;

    const novosAnexos = (targetEntrega.anexosPagamento || []).filter(a => a.id !== anexoId);
    await updatePagamentoEntrega(entregaId, {
      anexosPagamento: novosAnexos
    });
  };

  // Payment status updater
  const handleSetStatusPago = async (
    entregaId: string,
    opcao: 'adiantamento' | 'saldo' | 'ambos' | 'reset'
  ) => {
    const dataHojeBR = formatDateBR(new Date().toISOString());
    const targetEntrega = entregas.find(item => item.id === entregaId);
    if (!targetEntrega) return;

    let payload: Partial<Entrega> = {};

    if (opcao === 'adiantamento') {
      payload = {
        statusPagamentoAdiantamento: 'pago',
        dataPagoAdiantamento: dataHojeBR
      };
    } else if (opcao === 'saldo') {
      payload = {
        statusPagamentoSaldo: 'pago',
        dataPagoSaldo: dataHojeBR
      };
    } else if (opcao === 'ambos') {
      payload = {
        statusPagamentoAdiantamento: 'pago',
        statusPagamentoSaldo: 'pago',
        dataPagoAdiantamento: dataHojeBR,
        dataPagoSaldo: dataHojeBR
      };
    } else if (opcao === 'reset') {
      payload = {
        statusPagamentoAdiantamento: 'pendente',
        statusPagamentoSaldo: 'pendente',
        dataPagoAdiantamento: null,
        dataPagoSaldo: null
      };
    }

    await updatePagamentoEntrega(entregaId, payload);
    setPagoDropdownOpenId(null);
  };

  // Copy text helper
  const handleCopyScript = (texto: string, type: 'adiantamento' | 'saldo') => {
    navigator.clipboard.writeText(texto);
    setCopiedScriptType(type);
    setTimeout(() => setCopiedScriptType(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-zinc-100 font-sans p-3 sm:p-6 space-y-6">
      
      {/* ======================================================== */}
      {/* TOPO DA PÁGINA (HEADER RODOVAR MONITORA STYLE)           */}
      {/* ======================================================== */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
        
        {/* Header Title & Subtitle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#FFD600] text-[#0a0a0a] flex items-center justify-center font-black shadow-[0_0_20px_rgba(255,214,0,0.25)] shrink-0">
              <DollarSign className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
                  PAGAMENTOS
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30 uppercase">
                  RODOVAR MONITORA
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Gestão Financeira, Prazos e Comprovantes de Adiantamento e Saldo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 300);
              }}
              className="p-2 bg-zinc-900/80 border border-zinc-800 hover:border-[#FFD600] text-zinc-400 hover:text-[#FFD600] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono"
              title="Atualizar dados"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Controls: Search, Date Selector & Filter Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* TODOS */}
            <button
              onClick={() => setSelectedFilterPill('TODOS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'TODOS'
                  ? 'bg-[#FFD600] text-[#0a0a0a] border-[#FFD600] shadow-[0_0_15px_rgba(255,214,0,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              <span>TODOS</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'TODOS' ? 'bg-[#0a0a0a] text-[#FFD600]' : 'bg-zinc-800 text-zinc-300'
              }`}>
                {counters.todos}
              </span>
            </button>

            {/* NO PRAZO */}
            <button
              onClick={() => setSelectedFilterPill('NO_PRAZO')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'NO_PRAZO'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-900/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>NO PRAZO</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'NO_PRAZO' ? 'bg-zinc-950 text-amber-400' : 'bg-zinc-800 text-amber-400'
              }`}>
                {counters.noPrazo}
              </span>
            </button>

            {/* PAGO HOJE */}
            <button
              onClick={() => setSelectedFilterPill('PAGO_HOJE')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'PAGO_HOJE'
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PAGO HOJE</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'PAGO_HOJE' ? 'bg-zinc-950 text-emerald-400' : 'bg-zinc-800 text-emerald-400'
              }`}>
                {counters.pagoHoje}
              </span>
            </button>

            {/* ATRASADOS */}
            <button
              onClick={() => setSelectedFilterPill('ATRASADOS')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'ATRASADOS'
                  ? 'bg-red-600 text-white border-red-500 font-extrabold shadow-[0_0_15px_rgba(220,38,38,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ATRASADOS</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'ATRASADOS' ? 'bg-zinc-950 text-red-400' : 'bg-zinc-800 text-red-400'
              }`}>
                {counters.atrasados}
              </span>
            </button>

          </div>

          {/* Search Input & Date Selector */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Motorista ou Cliente..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:border-[#FFD600] focus:ring-0 focus:outline-none transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date Selector */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 w-full sm:w-auto">
              <Calendar className="w-4 h-4 text-[#FFD600] shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="text-[10px] font-mono text-zinc-500 hover:text-[#FFD600] underline ml-1"
                  title="Ver todas as datas"
                >
                  Limpar
                </button>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ======================================================== */}
      {/* GRID DE CARDS (3 COLUNAS DESKTOP, 1 COLUNA MOBILE)       */}
      {/* 20 MOTORISTAS POR VEZ PARA PROTEGER COTA FIRESTORE       */}
      {/* ======================================================== */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-[#FFD600]" />
          <p className="text-xs font-mono text-zinc-400">Carregando painel de pagamentos...</p>
        </div>
      ) : filteredEntregas.length === 0 ? (
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-12 text-center space-y-3">
          <DollarSign className="w-12 h-12 text-zinc-700 mx-auto" />
          <h3 className="text-base font-bold text-zinc-300">Nenhum frete encontrado</h3>
          <p className="text-xs text-zinc-500 font-mono">
            Não existem lançamentos de pagamentos para o filtro selecionado ({selectedFilterPill}).
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedEntregas.map(entrega => {
              const overallStatus = getPaymentCalculatedStatus(entrega);
              const isAccordionOpen = !!expandedCardIds[entrega.id];

              // Check if CTA / RPA has been loaded
              const hasRpa = !!entrega.cte || (Number(entrega.frete_motorista) > 0 && !!entrega.favorecidoPix);

              // Check if RAP file has been loaded & parsed
              const isRapLoaded = !!entrega.rpaLido || (entrega.anexosPagamento && entrega.anexosPagamento.some(a => a.tipo === 'rap'));

              // Values calculation: ONLY set if RAP file loaded or manually input
              const valAdiantamento = isRapLoaded && entrega.valorAdiantamento !== undefined ? entrega.valorAdiantamento : null;
              const valSaldo = isRapLoaded && entrega.valorSaldo !== undefined ? entrega.valorSaldo : null;

              // Individual Statuses
              const isAdiantamentoPago = entrega.statusPagamentoAdiantamento === 'pago';
              const isSaldoPago = entrega.statusPagamentoSaldo === 'pago';

              const prazoAdiantamentoIso = entrega.prazoAdiantamento || entrega.data_coleta;
              const prazoSaldoIso = entrega.prazoSaldo || entrega.prazo;

              const isAdiantamentoAtrasado = !isAdiantamentoPago && prazoAdiantamentoIso < todayIso;
              const isSaldoAtrasado = !isSaldoPago && prazoSaldoIso < todayIso;

              // Attachments list
              const anexos = entrega.anexosPagamento || [];
              const countNf = anexos.filter(a => a.tipo === 'nf').length;
              const countColeta = anexos.filter(a => a.tipo === 'coleta').length;
              const countEntrega = anexos.filter(a => a.tipo === 'entrega').length;

              return (
                <div
                  key={entrega.id}
                  className={`bg-zinc-950 border rounded-2xl p-5 shadow-xl hover:border-zinc-800 transition-all space-y-4 flex flex-col justify-between relative ${
                    !hasRpa || !isRapLoaded ? 'border-amber-900/80 shadow-[0_0_15px_rgba(245,158,11,0.12)]' : 'border-zinc-900'
                  }`}
                >
                  
                  {/* 1. TOPO DO CARD */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {/* Ícone Grande Capacete / Caminhão (40px) */}
                        <div className="w-10 h-10 rounded-xl bg-[#FFD600]/10 border border-[#FFD600]/30 text-[#FFD600] flex items-center justify-center shrink-0">
                          <Truck className="w-6 h-6 stroke-[2]" />
                        </div>
                        
                        <div>
                          {/* Nome do Motorista */}
                          <h3 className="text-base font-black text-white uppercase tracking-wide leading-snug line-clamp-1">
                            {entrega.motorista || 'MOTORISTA NÃO INFORMADO'}
                          </h3>
                          {/* Cliente / Empresa */}
                          <p className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1 mt-0.5 line-clamp-1">
                            <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>{entrega.cliente || 'CLIENTE NÃO INFORMADO'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Badge de Status Geral no Canto Superior Direito */}
                      <div>
                        {overallStatus === 'PAGO' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-700/80 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>PAGO</span>
                          </span>
                        ) : overallStatus === 'ATRASADO' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-950/90 text-red-400 border border-red-700/80 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                            <span>ATRASADO</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-950/90 text-[#FFD600] border border-amber-600/80 shadow-[0_0_10px_rgba(255,214,0,0.2)]">
                            <Clock className="w-3.5 h-3.5" />
                            <span>NO PRAZO</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ÁREA DE CARREGAMENTO DO ARQUIVO RAP NO CARD */}
                    <div 
                      onDragOver={(e) => { e.preventDefault(); setDragOverCardId(entrega.id); }}
                      onDragLeave={() => setDragOverCardId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverCardId(null);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleRapFileUpload(entrega, e.dataTransfer.files[0]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-xl p-2.5 text-center transition-all relative ${
                        dragOverCardId === entrega.id
                          ? 'border-[#FFD600] bg-[#FFD600]/20 text-white shadow-[0_0_15px_rgba(255,214,0,0.3)]'
                          : !isRapLoaded
                          ? 'border-amber-500/70 bg-amber-950/30 hover:border-[#FFD600] hover:bg-amber-950/50 text-amber-300'
                          : 'border-emerald-800/60 bg-emerald-950/20 hover:border-emerald-500 text-emerald-300'
                      }`}
                    >
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept="application/pdf,image/*,.pdf,.doc,.docx"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleRapFileUpload(entrega, e.target.files[0]);
                            }
                          }}
                          disabled={readingRapState[entrega.id]}
                          className="hidden"
                        />
                        {readingRapState[entrega.id] ? (
                          <div className="flex items-center justify-center gap-2 py-1">
                            <RefreshCw className="w-4 h-4 animate-spin text-[#FFD600]" />
                            <span className="text-[11px] font-mono font-bold text-white uppercase">
                              LENDO ARQUIVO RAP E ATUALIZANDO DADOS...
                            </span>
                          </div>
                        ) : !isRapLoaded ? (
                          <div className="flex items-center justify-between gap-2 px-1">
                            <div className="flex items-center gap-2 truncate">
                              <FileUp className="w-4.5 h-4.5 text-[#FFD600] animate-bounce shrink-0" />
                              <span className="text-[11px] font-mono font-black uppercase text-[#FFD600] tracking-wider truncate">
                                JOGAR ARQUIVO RAP AQUI (RAP-*.PDF)
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-[#FFD600] text-black font-black text-[9px] uppercase rounded-md shrink-0 shadow-md">
                              CARREGAR
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 px-1">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="text-[11px] font-mono font-bold text-emerald-300 truncate">
                                RAP LIDO: {entrega.rpaNomeArquivo || 'RAP.pdf'}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] uppercase font-bold rounded-md shrink-0">
                              TROCAR RAP
                            </span>
                          </div>
                        )}
                      </label>
                    </div>

                    {/* Rota Resumida: Origem ➔ Destino */}
                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 text-xs font-mono flex items-center justify-between gap-2 text-zinc-300">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[#FFD600] shrink-0" />
                        <span className="truncate">{entrega.origem || 'N/A'}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <div className="flex items-center gap-1.5 truncate text-right">
                        <span className="truncate">{entrega.destino || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                {/* 2. CORPO DO CARD — 2 MINI-BLOCOS LADO A LADO */}
                <div className="grid grid-cols-2 gap-2.5">
                  
                  {/* Bloco ADIANTAMENTO */}
                  <div className={`border rounded-xl p-3 flex flex-col justify-between space-y-2 ${
                    isAdiantamentoPago 
                      ? 'bg-emerald-950/20 border-emerald-900/50' 
                      : isAdiantamentoAtrasado 
                      ? 'bg-red-950/20 border-red-900/50' 
                      : 'bg-zinc-900/80 border-zinc-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#FFD600] flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                        ADIANTAMENTO
                      </span>
                    </div>

                    <div>
                      {valAdiantamento !== null ? (
                        <p className="text-base font-black text-white font-mono">
                          R$ {valAdiantamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      ) : (
                        <p className="text-xs font-black text-amber-400 font-mono italic animate-pulse">
                          R$ -- (Aguardando RAP)
                        </p>
                      )}
                      
                      {/* Individual Status */}
                      <div className="mt-1">
                        {isAdiantamentoPago ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                            <Check className="w-3 h-3" />
                            <span>Pago {entrega.dataPagoAdiantamento ? `(${entrega.dataPagoAdiantamento})` : ''}</span>
                          </span>
                        ) : isAdiantamentoAtrasado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-red-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Atrasado ({formatDateBR(prazoAdiantamentoIso)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400">
                            <Clock className="w-3 h-3" />
                            <span>Prazo: {formatDateBR(prazoAdiantamentoIso)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bloco SALDO */}
                  <div className={`border rounded-xl p-3 flex flex-col justify-between space-y-2 ${
                    isSaldoPago 
                      ? 'bg-emerald-950/20 border-emerald-900/50' 
                      : isSaldoAtrasado 
                      ? 'bg-red-950/20 border-red-900/50' 
                      : 'bg-zinc-900/80 border-zinc-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#FFD600] flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider">
                        SALDO
                      </span>
                    </div>

                    <div>
                      {valSaldo !== null ? (
                        <p className="text-base font-black text-white font-mono">
                          R$ {valSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      ) : (
                        <p className="text-xs font-black text-amber-400 font-mono italic animate-pulse">
                          R$ -- (Aguardando RAP)
                        </p>
                      )}

                      {/* Individual Status */}
                      <div className="mt-1">
                        {isSaldoPago ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                            <Check className="w-3 h-3" />
                            <span>Pago {entrega.dataPagoSaldo ? `(${entrega.dataPagoSaldo})` : ''}</span>
                          </span>
                        ) : isSaldoAtrasado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-red-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Atrasado ({formatDateBR(prazoSaldoIso)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400">
                            <Clock className="w-3 h-3" />
                            <span>Prazo: {formatDateBR(prazoSaldoIso)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                </div>

                {/* BOTÃO GERAR / VER SCRIPTS DE PAGAMENTO NO CARD */}
                <button
                  type="button"
                  onClick={() => setScriptModalEntrega(entrega)}
                  className="w-full py-2 bg-zinc-900 hover:bg-[#FFD600] text-[#FFD600] hover:text-black font-mono font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-zinc-800 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <FileCode className="w-4 h-4" />
                  <span>VER SCRIPTS DE PAGAMENTO</span>
                </button>

                {/* 3. SEÇÃO DE ANEXOS (EXPANSÍVEL / ACCORDION) */}
                <div className="border border-zinc-900 rounded-xl bg-zinc-900/40 overflow-hidden">
                  
                  {/* Accordion Toggle Header */}
                  <button
                    onClick={() => toggleCardAccordion(entrega.id)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-mono font-bold text-zinc-300 hover:text-[#FFD600] transition-colors cursor-pointer bg-zinc-900/80"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-[#FFD600]" />
                      <span>Anexos ({anexos.length})</span>
                      {anexos.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 font-normal">
                          {countNf > 0 && <span className="bg-zinc-800 px-1.5 py-0.5 rounded">{countNf} NF</span>}
                          {countColeta > 0 && <span className="bg-zinc-800 px-1.5 py-0.5 rounded">{countColeta} Coleta</span>}
                          {countEntrega > 0 && <span className="bg-zinc-800 px-1.5 py-0.5 rounded">{countEntrega} Entrega</span>}
                        </div>
                      )}
                    </div>
                    {isAccordionOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                  </button>

                  {/* Accordion Body */}
                  {isAccordionOpen && (
                    <div className="p-3 space-y-3 border-t border-zinc-900 bg-zinc-950/60">
                      
                      {/* Três botões de upload lado a lado */}
                      <div className="grid grid-cols-3 gap-2">
                        
                        {/* 1. NOTA FISCAL */}
                        <label className="relative border border-zinc-800 hover:border-[#FFD600] bg-zinc-900/80 rounded-xl p-2.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-zinc-900 group">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileUpload(entrega.id, 'nf', e)}
                            disabled={uploadingState[`${entrega.id}_nf`]}
                            className="hidden"
                          />
                          {uploadingState[`${entrega.id}_nf`] ? (
                            <RefreshCw className="w-6 h-6 animate-spin text-[#FFD600] my-1" />
                          ) : (
                            <FileText className="w-6 h-6 text-[#FFD600] group-hover:scale-110 transition-transform my-1" />
                          )}
                          <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase leading-tight mt-1">
                            NOTA FISCAL
                          </span>
                        </label>

                        {/* 2. FOTO COLETA */}
                        <label className="relative border border-zinc-800 hover:border-[#FFD600] bg-zinc-900/80 rounded-xl p-2.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-zinc-900 group">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleFileUpload(entrega.id, 'coleta', e)}
                            disabled={uploadingState[`${entrega.id}_coleta`]}
                            className="hidden"
                          />
                          {uploadingState[`${entrega.id}_coleta`] ? (
                            <RefreshCw className="w-6 h-6 animate-spin text-[#FFD600] my-1" />
                          ) : (
                            <Camera className="w-6 h-6 text-[#FFD600] group-hover:scale-110 transition-transform my-1" />
                          )}
                          <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase leading-tight mt-1">
                            FOTO COLETA
                          </span>
                        </label>

                        {/* 3. FOTO ENTREGA */}
                        <label className="relative border border-zinc-800 hover:border-[#FFD600] bg-zinc-900/80 rounded-xl p-2.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-zinc-900 group">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleFileUpload(entrega.id, 'entrega', e)}
                            disabled={uploadingState[`${entrega.id}_entrega`]}
                            className="hidden"
                          />
                          {uploadingState[`${entrega.id}_entrega`] ? (
                            <RefreshCw className="w-6 h-6 animate-spin text-[#FFD600] my-1" />
                          ) : (
                            <Package className="w-6 h-6 text-[#FFD600] group-hover:scale-110 transition-transform my-1" />
                          )}
                          <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase leading-tight mt-1">
                            FOTO ENTREGA
                          </span>
                        </label>

                      </div>

                      {/* Miniaturas dos arquivos já anexados */}
                      {anexos.length === 0 ? (
                        <p className="text-[10px] font-mono text-zinc-600 text-center py-2">
                          Nenhum comprovante anexado ainda.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                          {anexos.map(anexo => {
                            const isPdf = anexo.nomeArquivo.endsWith('.pdf') || anexo.url.includes('application/pdf');

                            return (
                              <div
                                key={anexo.id}
                                className="group relative bg-zinc-900 border border-zinc-800 rounded-lg p-2 flex flex-col justify-between space-y-1 overflow-hidden"
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                                    anexo.tipo === 'nf'
                                      ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                      : anexo.tipo === 'coleta'
                                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                      : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  }`}>
                                    {anexo.tipo}
                                  </span>

                                  <button
                                    onClick={() => handleDeleteAnexo(entrega.id, anexo.id)}
                                    className="text-zinc-500 hover:text-red-400 p-0.5"
                                    title="Remover anexo"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>

                                {/* Thumbnail or Icon */}
                                <div
                                  onClick={() => setPreviewAnexo(anexo)}
                                  className="h-16 w-full rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center cursor-pointer overflow-hidden relative group-hover:border-[#FFD600] transition-colors"
                                >
                                  {isPdf ? (
                                    <div className="flex flex-col items-center justify-center text-zinc-400">
                                      <FileText className="w-6 h-6 text-red-400" />
                                      <span className="text-[8px] font-mono mt-0.5">PDF</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={anexo.url}
                                      alt={anexo.nomeArquivo}
                                      className="w-full h-full object-cover"
                                    />
                                  )}

                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Eye className="w-4 h-4 text-white" />
                                  </div>
                                </div>

                                <p className="text-[9px] font-mono text-zinc-400 truncate" title={anexo.nomeArquivo}>
                                  {anexo.nomeArquivo}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  )}

                </div>

                {/* 4. RODAPÉ DO CARD — DOIS BOTÕES GRANDES LADO A LADO */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900">
                  
                  {/* Botão GERAR SCRIPT */}
                  <button
                    type="button"
                    onClick={() => setScriptModalEntrega(entrega)}
                    className="px-3 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] text-zinc-200 hover:text-[#FFD600] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <FileCode className="w-4 h-4 text-[#FFD600]" />
                    <span>Gerar Script</span>
                  </button>

                  {/* Botão MARCAR COMO PAGO (COM DROPDOWN) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPagoDropdownOpenId(pagoDropdownOpenId === entrega.id ? null : entrega.id)}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-emerald-950 border border-emerald-600 hover:bg-emerald-900 text-emerald-300 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Marcar Pago</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Dropdown Menu */}
                    {pagoDropdownOpenId === entrega.id && (
                      <div className="absolute right-0 bottom-full mb-2 w-56 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-xs font-mono">
                        <button
                          onClick={() => handleSetStatusPago(entrega.id, 'adiantamento')}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-zinc-200 hover:text-emerald-400 flex items-center justify-between cursor-pointer"
                        >
                          <span>Pago Adiantamento</span>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <button
                          onClick={() => handleSetStatusPago(entrega.id, 'saldo')}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-900 text-zinc-200 hover:text-emerald-400 flex items-center justify-between cursor-pointer"
                        >
                          <span>Pago Saldo</span>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <button
                          onClick={() => handleSetStatusPago(entrega.id, 'ambos')}
                          className="w-full text-left px-3 py-2 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 font-bold flex items-center justify-between cursor-pointer border border-emerald-800"
                        >
                          <span>Pago Ambos (100%)</span>
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                        <div className="border-t border-zinc-900 my-1" />
                        <button
                          onClick={() => handleSetStatusPago(entrega.id, 'reset')}
                          className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 flex items-center justify-between cursor-pointer text-[10px]"
                        >
                          <span>Resetar para Pendente</span>
                        </button>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            );
          })}
        </div>

        {/* PAGINÇÃO DO PAINEL DE PAGAMENTOS (20 MOTORISTAS POR VEZ) */}
        {filteredEntregas.length > ITEMS_PER_PAGE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 mt-6 text-xs font-mono">
            <div className="text-zinc-400">
              Exibindo <strong className="text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> a <strong className="text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filteredEntregas.length)}</strong> de <strong className="text-[#FFD600]">{filteredEntregas.length}</strong> motoristas (20 por vez)
            </div>
            
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] disabled:opacity-40 text-zinc-200 font-bold rounded-xl transition-all disabled:cursor-not-allowed cursor-pointer"
              >
                Anterior
              </button>

              <span className="px-3 py-2 bg-zinc-900 text-[#FFD600] font-black rounded-xl border border-zinc-800">
                Pág {currentPage} de {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3.5 py-2 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] disabled:opacity-40 text-zinc-200 font-bold rounded-xl transition-all disabled:cursor-not-allowed cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ======================================================== */}
      {/* MODAL LANÇAR / ESCANEAR RPA (CARREGA INFORMAÇÕES CTA/RPA) */}
      {/* ======================================================== */}
      {rpaModalEntrega && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setRpaModalEntrega(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-6 h-6 text-[#FFD600]" />
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
                    LANÇAR / ESCANEAR RPA (CTA)
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Motorista: <strong className="text-white">{rpaModalEntrega.motorista}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRpaModalEntrega(null)}
                className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">CONTRATO / CTe / CTRC #</label>
                  <input
                    type="text"
                    value={rpaCte}
                    onChange={(e) => setRpaCte(e.target.value)}
                    placeholder="Ex: 991823"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-[#FFD600] outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">FRETE MOTORISTA TOTAL (R$)</label>
                  <input
                    type="text"
                    value={rpaFreteTotal}
                    onChange={(e) => {
                      setRpaFreteTotal(e.target.value);
                      const num = parseFloat(e.target.value.replace(',', '.')) || 0;
                      if (num > 0) {
                        setRpaAdiantamento(String(Math.round(num * 0.7)));
                        setRpaSaldo(String(Math.round(num * 0.3)));
                      }
                    }}
                    placeholder="Ex: 1500.00"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white font-bold focus:border-[#FFD600] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">VALOR ADIANTAMENTO (70%)</label>
                  <input
                    type="text"
                    value={rpaAdiantamento}
                    onChange={(e) => setRpaAdiantamento(e.target.value)}
                    placeholder="Ex: 1050.00"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-[#FFD600] font-bold focus:border-[#FFD600] outline-none"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">VALOR SALDO (30%)</label>
                  <input
                    type="text"
                    value={rpaSaldo}
                    onChange={(e) => setRpaSaldo(e.target.value)}
                    placeholder="Ex: 450.00"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-emerald-400 font-bold focus:border-[#FFD600] outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-900 pt-3 space-y-3">
                <span className="text-[#FFD600] font-bold block uppercase tracking-wider">DADOS PIX DE PAGAMENTO</span>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">FAVORECIDO PIX</label>
                  <input
                    type="text"
                    value={rpaFavorecido}
                    onChange={(e) => setRpaFavorecido(e.target.value)}
                    placeholder="Nome do Favorecido"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-[#FFD600] outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 font-bold block mb-1">CHAVE PIX (CPF/TEL/CHAVE)</label>
                    <input
                      type="text"
                      value={rpaChavePix}
                      onChange={(e) => setRpaChavePix(e.target.value)}
                      placeholder="Chave Pix"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-[#FFD600] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 font-bold block mb-1">BANCO</label>
                    <input
                      type="text"
                      value={rpaBancoPix}
                      onChange={(e) => setRpaBancoPix(e.target.value)}
                      placeholder="Ex: Itaú, Nubank"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white focus:border-[#FFD600] outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => setRpaModalEntrega(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={rpaSaving}
                onClick={handleSaveRpa}
                className="px-5 py-2 bg-[#FFD600] hover:bg-yellow-400 text-[#0a0a0a] font-mono font-bold text-xs uppercase rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {rpaSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Salvar RPA & Atualizar Script</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL SCRIPT DE PAGAMENTO (REAPROVEITA E REFORÇA SCRIPT)  */}
      {/* ======================================================== */}
      {scriptModalEntrega && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setScriptModalEntrega(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl p-5 sm:p-6 space-y-5 shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-6 h-6 text-[#FFD600]" />
                <div>
                  <h2 className="text-lg font-black uppercase text-white tracking-wider">
                    SCRIPTS DE PAGAMENTO (RPA / PIX)
                  </h2>
                  <p className="text-xs font-mono text-zinc-400">
                    Motorista: <strong className="text-white">{scriptModalEntrega.motorista}</strong>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setScriptModalEntrega(null)}
                className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content: 2 Cards formatados lado a lado ou empilhados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* CARD 1: SCRIPT ADIANTAMENTO */}
              {(() => {
                const isRapLoaded = !!scriptModalEntrega.rpaLido || (scriptModalEntrega.anexosPagamento && scriptModalEntrega.anexosPagamento.some(a => a.tipo === 'rap'));
                const valAdiant = scriptModalEntrega.valorAdiantamento !== undefined ? scriptModalEntrega.valorAdiantamento : 0;

                const scriptAdiantamentoTexto = `RODOVAR PAGAMENTOS — SOLICITAÇÃO DE ADIANTAMENTO
--------------------------------------------------
• MOTORISTA: ${scriptModalEntrega.motorista}
• CLIENTE: ${scriptModalEntrega.cliente}
• ROTA: ${scriptModalEntrega.origem} ➔ ${scriptModalEntrega.destino}
• VALOR ADIANTAMENTO: ${valAdiant > 0 || isRapLoaded ? 'R$ ' + valAdiant.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ -- (Aguardando arquivo RAP)'}
--------------------------------------------------
• FAVORECIDO PIX: ${scriptModalEntrega.favorecidoPix || scriptModalEntrega.motorista}
• CHAVE PIX: ${scriptModalEntrega.chavePix || scriptModalEntrega.tel_motorista || 'N/A'}
• BANCO: ${scriptModalEntrega.bancoPix || 'N/A'}
• DATA DE COLETA: ${formatDateBR(scriptModalEntrega.data_coleta)}`;

                return (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-xs font-mono font-black text-[#FFD600] uppercase">
                          SOLICITAÇÃO DE ADIANTAMENTO
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 font-bold">
                          {valAdiant > 0 ? `R$ ${valAdiant.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem RAP'}
                        </span>
                      </div>

                      <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-zinc-900 select-all">
                        {scriptAdiantamentoTexto}
                      </pre>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleCopyScript(scriptAdiantamentoTexto, 'adiantamento')}
                        className="w-full py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#FFD600] text-[#0a0a0a] hover:bg-yellow-400 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(255,214,0,0.2)]"
                      >
                        {copiedScriptType === 'adiantamento' ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>COPIADO!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPIAR SCRIPT</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(scriptAdiantamentoTexto)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>ENVIAR WHATSAPP</span>
                      </a>
                    </div>
                  </div>
                );
              })()}

              {/* CARD 2: SCRIPT SALDO */}
              {(() => {
                const isRapLoaded = !!scriptModalEntrega.rpaLido || (scriptModalEntrega.anexosPagamento && scriptModalEntrega.anexosPagamento.some(a => a.tipo === 'rap'));
                const valSal = scriptModalEntrega.valorSaldo !== undefined ? scriptModalEntrega.valorSaldo : 0;

                const scriptSaldoTexto = `RODOVAR PAGAMENTOS — SOLICITAÇÃO DE SALDO - FRETE FINALIZADO
--------------------------------------------------
• MOTORISTA: ${scriptModalEntrega.motorista}
• CLIENTE: ${scriptModalEntrega.cliente}
• ROTA: ${scriptModalEntrega.origem} ➔ ${scriptModalEntrega.destino}
• VALOR SALDO: ${valSal > 0 || isRapLoaded ? 'R$ ' + valSal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ -- (Aguardando arquivo RAP)'}
--------------------------------------------------
• FAVORECIDO PIX: ${scriptModalEntrega.favorecidoPix || scriptModalEntrega.motorista}
• CHAVE PIX: ${scriptModalEntrega.chavePix || scriptModalEntrega.tel_motorista || 'N/A'}
• BANCO: ${scriptModalEntrega.bancoPix || 'N/A'}
• DATA DE COLETA: ${formatDateBR(scriptModalEntrega.data_coleta)}`;

                return (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-xs font-mono font-black text-[#FFD600] uppercase">
                          SOLICITAÇÃO DE SALDO
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 font-bold">
                          {valSal > 0 ? `R$ ${valSal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sem RAP'}
                        </span>
                      </div>

                      <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-950 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-zinc-900 select-all">
                        {scriptSaldoTexto}
                      </pre>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleCopyScript(scriptSaldoTexto, 'saldo')}
                        className="w-full py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-[#FFD600] text-[#0a0a0a] hover:bg-yellow-400 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(255,214,0,0.2)]"
                      >
                        {copiedScriptType === 'saldo' ? (
                          <>
                            <Check className="w-4 h-4" />
                            <span>COPIADO!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>COPIAR SCRIPT</span>
                          </>
                        )}
                      </button>

                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(scriptSaldoTexto)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>ENVIAR WHATSAPP</span>
                      </a>
                    </div>
                  </div>
                );
              })()}

            </div>

          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL PREVIEW DE ANEXO (AJUSTADO SEM TRAP DE TELA)       */}
      {/* ======================================================== */}
      {previewAnexo && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[110] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setPreviewAnexo(null)}
        >
          <div 
            className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl p-4 sm:p-5 space-y-4 shadow-2xl relative flex flex-col max-h-[90vh] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botão de Fechar Fixo e Destacado */}
            <button
              type="button"
              onClick={() => setPreviewAnexo(null)}
              className="absolute -top-3 -right-3 z-50 p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-2xl transition-all cursor-pointer border-2 border-zinc-900 flex items-center justify-center"
              title="Sair / Fechar Imagem"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 pr-8">
              <div className="flex items-center gap-2">
                <Paperclip className="w-5 h-5 text-[#FFD600]" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase font-mono truncate max-w-xs sm:max-w-md">
                    {previewAnexo.nomeArquivo}
                  </h3>
                  <p className="text-[10px] font-mono text-zinc-400">
                    Tipo: {previewAnexo.tipo.toUpperCase()} • {formatDateTimeBR(previewAnexo.dataUpload)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewAnexo.url}
                  download={previewAnexo.nomeArquivo}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono rounded-lg flex items-center gap-1.5 border border-zinc-800"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-[#FFD600]" />
                  <span className="hidden sm:inline">Baixar</span>
                </a>
              </div>
            </div>

            {/* Container da Imagem ou PDF com limites responsivos */}
            <div className="flex-1 min-h-[220px] max-h-[65vh] flex items-center justify-center overflow-auto bg-black/90 rounded-xl p-2 border border-zinc-900">
              {previewAnexo.nomeArquivo.endsWith('.pdf') || previewAnexo.url.includes('application/pdf') ? (
                <iframe
                  src={previewAnexo.url}
                  title={previewAnexo.nomeArquivo}
                  className="w-full h-[500px] max-h-[60vh] rounded-lg border-none"
                />
              ) : (
                <img
                  src={previewAnexo.url}
                  alt={previewAnexo.nomeArquivo}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
                />
              )}
            </div>

            {/* Ação de Saída Inferior */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
              <span className="text-[10px] font-mono text-zinc-500">
                Clique no botão 'X' ou fora do modal para fechar
              </span>
              <button
                type="button"
                onClick={() => setPreviewAnexo(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-mono font-bold rounded-xl cursor-pointer"
              >
                Sair / Fechar Visualização
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Pagamentos;
