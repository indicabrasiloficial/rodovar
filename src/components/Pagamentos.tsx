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
  Send,
  EyeOff,
  Zap,
  BarChart3,
  PieChart,
  Download,
  Printer,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { Entrega, AnexoPagamento } from '../types';
import { getEntregas, updatePagamentoEntrega, updateEntregaField, fetchEntregasFromServer, parseSafeNumber } from '../db/storage';
import { processAndCompressFile } from '../utils/imageCompressor';
import { formatDateBR, formatDateTimeBR } from '../utils/date';

interface PagamentosProps {
  currentUser?: {
    uid?: string;
    username?: string;
    name?: string;
    role?: string;
  } | null;
}

type FilterPill = 'TODOS' | 'PENDENTE_ADIANTAMENTO' | 'PENDENTE_SALDO' | 'PAGO_TOTAL' | 'ATRASADOS';

const extractFromObservacoes = (obs: string) => {
  if (!obs) return { favorecido: '', pix: '', banco: '' };
  
  let favorecido = '';
  let pix = '';
  let banco = '';

  // 1. Match Favorecido
  const favMatch = obs.match(/favorecido:\s*([^|\n\r\-🚨]+)/i);
  if (favMatch) {
    favorecido = favMatch[1].trim();
  } else {
    // If no "Favorecido:" keyword, try to extract whatever name is before "PIX" or "|"
    // Example: "VICTOR ALUGUEL DE MÁQUINAS | PIX: 57798047000160"
    const prePixMatch = obs.match(/^([^|\n\r\-🚨]+?)\s*\|\s*(?:pix|chave)/i);
    if (prePixMatch) {
      favorecido = prePixMatch[1].trim();
    }
  }

  // 2. Match PIX / Chave
  const pixMatch = obs.match(/(?:pix|chave(?:\s+pix)?):\s*([^|\n\r\-🚨\s]+)/i);
  if (pixMatch) {
    pix = pixMatch[1].trim();
  }

  // 3. Match Banco
  const bancoMatch = obs.match(/banco:\s*([^|\n\r\-🚨]+)/i);
  if (bancoMatch) {
    banco = bancoMatch[1].trim();
  }

  return { favorecido, pix, banco };
};

export const Pagamentos: React.FC<PagamentosProps> = ({ currentUser }) => {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFilterPill, setSelectedFilterPill] = useState<FilterPill>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Real-time tick for 24h cronômetro
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Voice AI Alert Function (Sintetizador de Voz)
  const speakPetronioVoiceAlert = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Petrônio, tem pagamento atrasado de motorista.");
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Helper for 24h Chronometer in Pendente de Saldo
  const getSaldoTimerInfo = (entrega: Entrega, currentNow: number) => {
    const isAdiantamentoPago = entrega.statusPagamentoAdiantamento === 'pago';
    const isSaldoPago = entrega.statusPagamentoSaldo === 'pago';
    const isEntregue = (entrega.status || '').toLowerCase() === 'entregue';

    // A contagem de 24h e o status de pendente de saldo só funcionam quando o motorista está com status de 'entregue'
    if (!isAdiantamentoPago || isSaldoPago || !isEntregue) {
      return { isPendingSaldo: false, hours: 0, minutes: 0, totalMinutes: 0, isOver24h: false, formatted: '' };
    }

    let startMs: number;
    if (entrega.dataPagoAdiantamentoTimestamp) {
      startMs = entrega.dataPagoAdiantamentoTimestamp;
    } else if (entrega.updated_at) {
      startMs = new Date(entrega.updated_at).getTime();
    } else if (entrega.created_at) {
      startMs = new Date(entrega.created_at).getTime();
    } else if (entrega.data_coleta) {
      startMs = new Date(entrega.data_coleta).getTime();
    } else {
      startMs = currentNow - (4 * 60 * 60 * 1000); // Default fallback 4h
    }

    const diffMs = Math.max(0, currentNow - startMs);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const isOver24h = hours >= 24;

    const formatted = `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return { isPendingSaldo: true, hours, minutes, totalMinutes, isOver24h, formatted };
  };
  
  // Date selector defaulting to today in YYYY-MM-DD
  const todayIso = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // Master toggle: Hide/Show values (Default: hidden as requested)
  const [hideValues, setHideValues] = useState<boolean>(true);

  // View mode tab: 'cards' vs 'estatisticas' vs 'solicitacoes'
  const [viewTab, setViewTab] = useState<'cards' | 'estatisticas' | 'solicitacoes'>('cards');

  // Daily payment request date filter in Sao Paulo timezone
  const getTodayBr = () => {
    try {
      return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };
  const [solicitacoesDate, setSolicitacoesDate] = useState<string>(getTodayBr());
  const [showAllDatesSolicitacoes, setShowAllDatesSolicitacoes] = useState<boolean>(false);
  const [subFilterSolicitacao, setSubFilterSolicitacao] = useState<'todos' | 'adiantamento' | 'saldo' | 'pendentes' | 'pagos'>('todos');
  const [searchSolicitacao, setSearchSolicitacao] = useState<string>('');

  // Helper to retrieve valor da carga safely across multiple potential property names
  const getValorCarga = (e: Entrega | any): number => {
    if (!e) return 0;
    const raw = e.valor_carga ?? e.valor_mercadoria ?? e.valorCarga ?? e.valorTotalCarga ?? e.valor_total ?? e.vlr_carga ?? e.val_valor_carga;
    return parseSafeNumber(raw);
  };

  const handleToggleSolicitadoAdiantamento = async (entregaId: string, currentVal: boolean) => {
    try {
      const newVal = !currentVal;
      await updatePagamentoEntrega(entregaId, {
        solicitadoPagamentoAdiantamento: newVal,
        solicitadoPagamentoAdiantamentoData: newVal ? new Date().toISOString() : undefined
      });
      setEntregas(prev => prev.map(e => e.id === entregaId ? {
        ...e,
        solicitadoPagamentoAdiantamento: newVal,
        solicitadoPagamentoAdiantamentoData: newVal ? new Date().toISOString() : undefined
      } : e));
    } catch (err) {
      console.error('Erro ao alternar solicitação de adiantamento:', err);
    }
  };

  const handleToggleSolicitadoSaldo = async (entregaId: string, currentVal: boolean) => {
    try {
      const newVal = !currentVal;
      await updatePagamentoEntrega(entregaId, {
        solicitadoPagamentoSaldo: newVal,
        solicitadoPagamento: newVal,
        solicitadoPagamentoData: newVal ? new Date().toISOString() : undefined
      });
      setEntregas(prev => prev.map(e => e.id === entregaId ? {
        ...e,
        solicitadoPagamentoSaldo: newVal,
        solicitadoPagamento: newVal,
        solicitadoPagamentoData: newVal ? new Date().toISOString() : undefined
      } : e));
    } catch (err) {
      console.error('Erro ao alternar solicitação de saldo:', err);
    }
  };

  const handleToggleSolicitadoPagamento = handleToggleSolicitadoSaldo;

  // Timeframe filter for statistics ('semanal' | 'mensal' | 'anual' | 'todos')
  const [statsTimeframe, setStatsTimeframe] = useState<'semanal' | 'mensal' | 'anual' | 'todos'>('semanal');

  // Copied Pix state for feedback
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);

  // Expanded cards accordion state
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Registry of driver PIX and Favorecido details built from all deliveries
  const driverRegistry = useMemo(() => {
    const registryByName: Record<string, { chavePix: string; favorecidoPix: string; bancoPix: string; cpf_motorista?: string }> = {};
    const registryByCpf: Record<string, { chavePix: string; favorecidoPix: string; bancoPix: string; motorista?: string }> = {};

    // Sort list so that the most recently updated or complete records are processed last
    const sorted = [...entregas].sort((a, b) => {
      const dateA = a.updated_at || a.data_coleta || '';
      const dateB = b.updated_at || b.data_coleta || '';
      return dateA.localeCompare(dateB);
    });

    for (const e of sorted) {
      const nameKey = (e.motorista || '').toLowerCase().trim();
      const cpfKey = (e.cpf_motorista || '').replace(/\D/g, '');

      // Parse from e.observacoes first!
      const fromObs = extractFromObservacoes(e.observacoes || (e as any).obs || '');

      const info = {
        chavePix: fromObs.pix || e.chavePix || '',
        favorecidoPix: fromObs.favorecido || e.favorecidoPix || '',
        bancoPix: fromObs.banco || e.bancoPix || ''
      };

      if (info.chavePix || info.favorecidoPix || info.bancoPix) {
        if (nameKey) {
          registryByName[nameKey] = {
            ...info,
            cpf_motorista: e.cpf_motorista
          };
        }
        if (cpfKey) {
          registryByCpf[cpfKey] = {
            ...info,
            motorista: e.motorista
          };
        }
      }
    }

    return { registryByName, registryByCpf };
  }, [entregas]);

  // Helper to resolve PIX details for any delivery using the registry
  const resolveDriverPixInfo = (e: Entrega) => {
    const nameKey = (e.motorista || '').toLowerCase().trim();
    const cpfKey = (e.cpf_motorista || '').replace(/\D/g, '');

    // 1. Extract from e.observacoes first (highest priority, for all!)
    const fromObs = extractFromObservacoes(e.observacoes || (e as any).obs || '');

    let resolvedChave = fromObs.pix || e.chavePix || '';
    let resolvedFavorecido = fromObs.favorecido || e.favorecidoPix || '';
    let resolvedBanco = fromObs.banco || e.bancoPix || '';

    // 2. Lookup by CPF in registry if still empty
    if (!resolvedChave || !resolvedFavorecido || !resolvedBanco) {
      if (cpfKey && driverRegistry.registryByCpf[cpfKey]) {
        const reg = driverRegistry.registryByCpf[cpfKey];
        if (!resolvedChave) resolvedChave = reg.chavePix;
        if (!resolvedFavorecido) resolvedFavorecido = reg.favorecidoPix;
        if (!resolvedBanco) resolvedBanco = reg.bancoPix;
      }
    }

    // 3. Lookup by Name in registry if still empty
    if (!resolvedChave || !resolvedFavorecido || !resolvedBanco) {
      if (nameKey && driverRegistry.registryByName[nameKey]) {
        const reg = driverRegistry.registryByName[nameKey];
        if (!resolvedChave) resolvedChave = reg.chavePix;
        if (!resolvedFavorecido) resolvedFavorecido = reg.favorecidoPix;
        if (!resolvedBanco) resolvedBanco = reg.bancoPix;
      }
    }

    // 4. Fallback to motorista name if favorecido is still empty
    if (!resolvedFavorecido) {
      resolvedFavorecido = e.motorista || '';
    }

    return {
      chavePix: resolvedChave,
      favorecidoPix: resolvedFavorecido,
      bancoPix: resolvedBanco
    };
  };

  const handleCopyPix = (pixKey: string, driverId: string) => {
    if (!pixKey) return;
    navigator.clipboard.writeText(pixKey);
    setCopiedPixId(driverId);
    setTimeout(() => setCopiedPixId(null), 2500);
  };

  const formatCurrencyVal = (val: number | undefined | null) => {
    if (val === undefined || val === null) return 'R$ --';
    if (hideValues) return 'R$ ••••••';
    return `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Export all payment data to CSV/Excel
  const handleExportExcel = () => {
    const headers = [
      "Motorista", "CPF Motorista", "Chave PIX", "Favorecido", "Banco",
      "Cliente", "CTRC/Contrato", "Origem", "Destino", "Data Coleta",
      "Frete Motorista", "Adiantamento (R$)", "Status Adiantamento",
      "Saldo (R$)", "Status Saldo", "Valor Carga", "Prazo"
    ];

    const rows = entregas.map(e => {
      const pixInfo = resolveDriverPixInfo(e);
      return [
        `"${e.motorista || ''}"`,
        `"${e.cpf_motorista || ''}"`,
        `"${pixInfo.chavePix || e.tel_motorista || ''}"`,
        `"${pixInfo.favorecidoPix || e.motorista || ''}"`,
        `"${pixInfo.bancoPix || ''}"`,
        `"${e.cliente || ''}"`,
        `"${e.cte || e.contratoNum || ''}"`,
        `"${e.origem || ''}"`,
        `"${e.destino || ''}"`,
        `"${e.data_coleta || ''}"`,
        `"${(e.frete_motorista || 0).toFixed(2)}"`,
        `"${(e.valorAdiantamento ?? Math.round((e.frete_motorista || 0) * 0.7)).toFixed(2)}"`,
        `"${e.statusPagamentoAdiantamento === 'pago' ? 'Pago' : 'Pendente'}"`,
        `"${(e.valorSaldo ?? Math.round((e.frete_motorista || 0) * 0.3)).toFixed(2)}"`,
        `"${e.statusPagamentoSaldo === 'pago' ? 'Pago' : 'Pendente'}"`,
        `"${(e.valor_carga || 0).toFixed(2)}"`,
        `"${e.prazo || ''}"`
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pagamentos_rodovar_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Modal Impressão de Recibo Profissional (RPA)
  const [printReceiptModalOpen, setPrintReceiptModalOpen] = useState<boolean>(false);
  const [printReceiptEntrega, setPrintReceiptEntrega] = useState<Entrega | null>(null);
  const [receiptType, setReceiptType] = useState<'integral' | 'adiantamento' | 'saldo'>('integral');
  const [companyCnpj] = useState<string>('49.908.710/0001-03');
  const [companyName] = useState<string>('Rodovar Transportes e Logística');
  const [companyAddress] = useState<string>('Travessa Acalanto, 531 Jardim das Margaridas, Salvador – BA');
  const [companyPhone] = useState<string>('(71) 9 9920-2476');

  // Fechar modal no ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && printReceiptModalOpen) {
        setPrintReceiptModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [printReceiptModalOpen]);

  // Helper para gerar número de recibo RDO + 3 números
  const getReceiptNumber = (id: string) => {
    if (!id) return 'RDO101';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i);
      hash |= 0;
    }
    const num = Math.abs(hash % 900) + 100; // 3 dígitos (100 a 999)
    return `RDO${num}`;
  };

  // Helper para resolver número do CTe (inclusive lendo anexos de CTE + numeração)
  const resolveCteNumber = (e: Entrega) => {
    if (e.cte && e.cte !== 'S/N' && e.cte.trim() !== '') return e.cte;
    if (e.contratoNum && e.contratoNum !== 'S/N' && e.contratoNum.trim() !== '') return e.contratoNum;

    const anexos = e.anexosPagamento || (e as any).anexos || [];
    for (const anexo of anexos) {
      const nome = anexo.nomeArquivo || anexo.nome || '';
      const match = nome.match(/(?:cte|ct-e|ctrc)[-_\s]*(\d+)/i) || nome.match(/(\d{3,9})/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return 'S/N';
  };

  const handleDownloadReceipt = () => {
    if (!printReceiptEntrega) return;
    const element = document.getElementById('recibo-impressao-container');
    if (!element) return;

    const receiptNum = getReceiptNumber(printReceiptEntrega.id);
    const driverName = (printReceiptEntrega.motorista || 'Motorista').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Recibo_RPA_${receiptNum}_${driverName}.html`;

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo RPA ${receiptNum} - Rodovar Transportes e Logística</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page { size: A4 portrait; margin: 6mm; }
    body { background-color: #f4f4f5; padding: 16px; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 100vh; }
    @media print {
      body { background-color: white; padding: 0; display: block; }
      .no-print { display: none !important; }
      #recibo-impressao-container { border: 2px solid #000 !important; box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
    }
  </style>
</head>
<body>
  <div class="no-print mb-4 flex gap-3">
    <button onclick="window.print()" style="background:#000;color:#ffd600;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;border:none;font-family:monospace;font-size:13px;display:flex;align-items:center;gap:8px;">
      🖨️ IMPRIMIR / SALVAR COMO PDF (1 PÁGINA)
    </button>
  </div>
  <div style="width:100%;max-width:760px;">
    ${element.outerHTML}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!printReceiptEntrega && entregas.length > 0) {
      setPrintReceiptEntrega(entregas[0]);
    }
    setPrintReceiptModalOpen(true);
  };

  const openReceiptModalForEntrega = (entrega: Entrega) => {
    setPrintReceiptEntrega(entrega);
    setPrintReceiptModalOpen(true);
  };

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
    const pixInfo = resolveDriverPixInfo(entrega);
    setRpaCte(entrega.cte || entrega.contratoNum || '');
    setRpaFavorecido(pixInfo.favorecidoPix || entrega.motorista || '');
    setRpaChavePix(pixInfo.chavePix || entrega.tel_motorista || '');
    setRpaBancoPix(pixInfo.bancoPix || '');
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
        bancoPix: rpaBancoPix,
        rpaLido: true
      });

      setRpaModalEntrega(null);
    } catch (err) {
      console.error('Erro ao salvar dados do RPA:', err);
      alert('Erro ao salvar dados do RPA. Tente novamente.');
    } finally {
      setRpaSaving(false);
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
      setEntregas([...data]);
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

      const isAdiantamentoPago = entrega.statusPagamentoAdiantamento === 'pago';
      const isSaldoPago = entrega.statusPagamentoSaldo === 'pago';
      const timerInfo = getSaldoTimerInfo(entrega, nowMs);

      // Pill Filter Match
      if (selectedFilterPill === 'PENDENTE_ADIANTAMENTO') {
        return !isAdiantamentoPago;
      }
      if (selectedFilterPill === 'PENDENTE_SALDO') {
        const isEntregue = (entrega.status || '').toLowerCase() === 'entregue';
        return isAdiantamentoPago && !isSaldoPago && isEntregue;
      }
      if (selectedFilterPill === 'PAGO_TOTAL') {
        return isAdiantamentoPago && isSaldoPago;
      }
      if (selectedFilterPill === 'ATRASADOS') {
        return (timerInfo.isPendingSaldo && timerInfo.isOver24h) || getPaymentCalculatedStatus(entrega) === 'ATRASADO';
      }

      return true; // TODOS
    });
  }, [entregas, selectedDate, searchTerm, selectedFilterPill, todayIso, nowMs]);

  // Pagination calculations (20 motoristas por vez para otimizar cota)
  const totalPages = Math.max(1, Math.ceil(filteredEntregas.length / ITEMS_PER_PAGE));
  const paginatedEntregas = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEntregas.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntregas, currentPage]);

  // Dynamic Pill Counters
  const counters = useMemo(() => {
    let todos = 0;
    let pendenteAdiantamento = 0;
    let pendenteSaldo = 0;
    let pagoTotal = 0;
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
      const isAdiantamentoPago = entrega.statusPagamentoAdiantamento === 'pago';
      const isSaldoPago = entrega.statusPagamentoSaldo === 'pago';
      const timerInfo = getSaldoTimerInfo(entrega, nowMs);

      if (!isAdiantamentoPago) {
        pendenteAdiantamento++;
      } else if (!isSaldoPago) {
        const isEntregue = (entrega.status || '').toLowerCase() === 'entregue';
        if (isEntregue) {
          pendenteSaldo++;
        }
      }

      if (isAdiantamentoPago && isSaldoPago) {
        pagoTotal++;
      }

      if ((timerInfo.isPendingSaldo && timerInfo.isOver24h) || getPaymentCalculatedStatus(entrega) === 'ATRASADO') {
        atrasados++;
      }
    });

    return { todos, pendenteAdiantamento, pendenteSaldo, pagoTotal, atrasados };
  }, [entregas, selectedDate, searchTerm, todayIso, nowMs]);

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
        dataPagoAdiantamento: dataHojeBR,
        dataPagoAdiantamentoTimestamp: Date.now()
      };
    } else if (opcao === 'saldo') {
      payload = {
        statusPagamentoSaldo: 'pago',
        dataPagoSaldo: dataHojeBR,
        dataPagoSaldoTimestamp: Date.now()
      };
    } else if (opcao === 'ambos') {
      payload = {
        statusPagamentoAdiantamento: 'pago',
        statusPagamentoSaldo: 'pago',
        dataPagoAdiantamento: dataHojeBR,
        dataPagoSaldo: dataHojeBR,
        dataPagoAdiantamentoTimestamp: Date.now(),
        dataPagoSaldoTimestamp: Date.now()
      };
    } else if (opcao === 'reset') {
      payload = {
        statusPagamentoAdiantamento: 'pendente',
        statusPagamentoSaldo: 'pendente',
        dataPagoAdiantamento: null,
        dataPagoSaldo: null,
        dataPagoAdiantamentoTimestamp: null,
        dataPagoSaldoTimestamp: null
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

  // Financial statistics calculation engine
  const statsData = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentYear = now.getFullYear();
    const currentMonthStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const filterByTimeframe = (e: Entrega, tf: 'semanal' | 'mensal' | 'anual' | 'todos') => {
      const d = e.data_coleta || e.created_at?.slice(0, 10) || todayStr;
      if (tf === 'semanal') return d >= sevenDaysAgoStr && d <= todayStr;
      if (tf === 'mensal') return d.startsWith(currentMonthStr);
      if (tf === 'anual') return d.startsWith(String(currentYear));
      return true;
    };

    const calculateTotals = (tf: 'semanal' | 'mensal' | 'anual' | 'todos') => {
      const list = entregas.filter(e => filterByTimeframe(e, tf));
      let totalFrete = 0;
      let totalAd = 0;
      let totalAdPago = 0;
      let totalAdPendente = 0;
      let totalSal = 0;
      let totalSalPago = 0;
      let totalSalPendente = 0;

      list.forEach(e => {
        const frete = Number(e.frete_motorista) || 0;
        totalFrete += frete;

        const ad = e.valorAdiantamento !== undefined ? Number(e.valorAdiantamento) : Math.round(frete * 0.7);
        const sal = e.valorSaldo !== undefined ? Number(e.valorSaldo) : Math.round(frete * 0.3);

        totalAd += ad;
        if (e.statusPagamentoAdiantamento === 'pago') {
          totalAdPago += ad;
        } else {
          totalAdPendente += ad;
        }

        totalSal += sal;
        if (e.statusPagamentoSaldo === 'pago') {
          totalSalPago += sal;
        } else {
          totalSalPendente += sal;
        }
      });

      return {
        count: list.length,
        list,
        totalFrete,
        totalAd,
        totalAdPago,
        totalAdPendente,
        totalSal,
        totalSalPago,
        totalSalPendente,
        totalPago: totalAdPago + totalSalPago,
        totalPendente: totalAdPendente + totalSalPendente
      };
    };

    return {
      semanal: calculateTotals('semanal'),
      mensal: calculateTotals('mensal'),
      anual: calculateTotals('anual'),
      todos: calculateTotals('todos'),
      active: calculateTotals(statsTimeframe)
    };
  }, [entregas, statsTimeframe]);

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

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* View Mode Tabs */}
            <div className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setViewTab('cards')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewTab === 'cards'
                    ? 'bg-[#FFD600] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>

              <button
                type="button"
                onClick={() => setViewTab('estatisticas')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewTab === 'estatisticas'
                    ? 'bg-[#FFD600] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Estatísticas</span>
              </button>

              <button
                type="button"
                onClick={() => setViewTab('solicitacoes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewTab === 'solicitacoes'
                    ? 'bg-[#FFD600] text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Solicitação de Pagamento</span>
              </button>
            </div>

            {/* Toggle Hide/Show Values */}
            <button
              type="button"
              onClick={() => setHideValues(!hideValues)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                hideValues
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-zinc-700'
              }`}
              title={hideValues ? "Clique para Mostrar Valores" : "Clique para Ocultar Valores"}
            >
              {hideValues ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4 text-emerald-400" />}
              <span className="hidden md:inline">{hideValues ? 'Valores Ocultos' : 'Valores Visíveis'}</span>
            </button>

            {/* Quota Protection & Manual Sync */}
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await fetchEntregasFromServer(true);
                setEntregas([...getEntregas()]);
                setLoading(false);
              }}
              title="Proteção de Cota Ativa: Atualizar dados diretamente do Firebase"
              className="p-2 bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold shadow-md"
            >
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="hidden xl:inline">Sincronizar Cota</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="p-2 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold shadow-md"
              title="Exportar para Excel (CSV)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden xl:inline">Excel</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 300);
              }}
              className="p-2 bg-zinc-900/80 border border-zinc-800 hover:border-[#FFD600] text-zinc-400 hover:text-[#FFD600] rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono"
              title="Atualizar dados"
            >
              <RefreshCw className="w-4 h-4" />
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

            {/* PENDENTE DE ADIANTAMENTO */}
            <button
              onClick={() => setSelectedFilterPill('PENDENTE_ADIANTAMENTO')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'PENDENTE_ADIANTAMENTO'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-900/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>PENDENTE ADIANTAMENTO</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'PENDENTE_ADIANTAMENTO' ? 'bg-zinc-950 text-amber-400' : 'bg-zinc-800 text-amber-400'
              }`}>
                {counters.pendenteAdiantamento}
              </span>
            </button>

            {/* PENDENTE DE SALDO */}
            <button
              onClick={() => setSelectedFilterPill('PENDENTE_SALDO')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'PENDENTE_SALDO'
                  ? 'bg-purple-600 text-white border-purple-400 font-extrabold shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-purple-300 hover:border-purple-900/50'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-purple-300" />
              <span>PENDENTE DE SALDO</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'PENDENTE_SALDO' ? 'bg-zinc-950 text-purple-300' : 'bg-zinc-800 text-purple-300'
              }`}>
                {counters.pendenteSaldo}
              </span>
            </button>

            {/* PAGO TOTAL */}
            <button
              onClick={() => setSelectedFilterPill('PAGO_TOTAL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'PAGO_TOTAL'
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-900/50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PAGO TOTAL</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'PAGO_TOTAL' ? 'bg-zinc-950 text-emerald-400' : 'bg-zinc-800 text-emerald-400'
              }`}>
                {counters.pagoTotal}
              </span>
            </button>

            {/* ATRASADOS (>24H) */}
            <button
              onClick={() => {
                setSelectedFilterPill('ATRASADOS');
                if (counters.atrasados > 0) {
                  speakPetronioVoiceAlert();
                }
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-2 border ${
                selectedFilterPill === 'ATRASADOS'
                  ? 'bg-red-600 text-white border-red-500 font-extrabold shadow-[0_0_15px_rgba(220,38,38,0.3)] animate-pulse'
                  : counters.atrasados > 0
                  ? 'bg-red-950/40 border-red-800/80 text-red-400 hover:bg-red-900/50'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>ATRASADOS (&gt;24H)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                selectedFilterPill === 'ATRASADOS' ? 'bg-zinc-950 text-red-400' : 'bg-zinc-800 text-red-400'
              }`}>
                {counters.atrasados}
              </span>
            </button>

            {/* BOTÃO ALERTA DE VOZ IA */}
            {counters.atrasados > 0 && (
              <button
                type="button"
                onClick={speakPetronioVoiceAlert}
                className="px-3 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-mono font-black text-xs uppercase rounded-xl shadow-[0_0_12px_rgba(239,68,68,0.4)] flex items-center gap-1.5 cursor-pointer animate-pulse"
                title="Ouvir Alerta de Voz IA: Petrônio, tem pagamento atrasado de motorista."
              >
                <span>🔊 ALERTA IA</span>
              </button>
            )}

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
      {/* SELEÇÃO DE ABA: CARDS OU ESTATÍSTICAS FINANCEIRAS        */}
      {/* ======================================================== */}
      {viewTab === 'estatisticas' ? (
        <div className="space-y-6 animate-fade-in">
          {/* Sub-Header with Timeframe Selectors and Live Firestore Sync Badge */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
              <div>
                <h2 className="text-lg font-black font-sans uppercase tracking-wider text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-[#FFD600]" />
                  Estatísticas Financeiras de Pagamentos
                </h2>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Análise semanal, mensal e anual de adiantamentos e saldos
                </p>
              </div>

              {/* Live Firestore status indicator */}
              <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/50 px-3 py-1.5 rounded-xl self-start md:self-auto">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                <span className="text-[11px] font-mono font-bold text-emerald-300">
                  Firestore Sincronizado
                </span>
              </div>
            </div>

            {/* Timeframe Selector Pills & Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 bg-zinc-900/90 p-1.5 rounded-xl border border-zinc-800">
                {(['semanal', 'mensal', 'anual', 'todos'] as const).map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setStatsTimeframe(tf)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-mono font-black uppercase transition-all cursor-pointer ${
                      statsTimeframe === tf
                        ? 'bg-[#FFD600] text-black shadow-lg scale-[1.02]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {tf === 'semanal' && 'Semanal (7 dias)'}
                    {tf === 'mensal' && 'Mensal (Mês Atual)'}
                    {tf === 'anual' && 'Anual (Ano Atual)'}
                    {tf === 'todos' && 'Todo Período'}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Exportar Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-mono font-bold uppercase flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4 text-[#FFD600]" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. VOLUME TOTAL */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Volume de Cargas</span>
                <Truck className="w-4 h-4 text-[#FFD600]" />
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {statsData.active.count} <span className="text-xs text-zinc-500 font-normal">viagens</span>
              </p>
              <p className="text-xs font-mono font-bold text-[#FFD600]">
                Frete Total: {formatCurrencyVal(statsData.active.totalFrete)}
              </p>
            </div>

            {/* 2. ADIANTAMENTOS */}
            <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-5 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Adiantamento Total</span>
                <DollarSign className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xl font-black text-white font-mono">
                {formatCurrencyVal(statsData.active.totalAd)}
              </p>
              <div className="flex items-center justify-between text-[10px] font-mono border-t border-zinc-900 pt-1.5">
                <span className="text-emerald-400 font-bold">Pago: {formatCurrencyVal(statsData.active.totalAdPago)}</span>
                <span className="text-amber-400 font-bold">Pend: {formatCurrencyVal(statsData.active.totalAdPendente)}</span>
              </div>
            </div>

            {/* 3. SALDOS */}
            <div className="bg-zinc-950 border border-blue-500/30 rounded-2xl p-5 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Saldo Total</span>
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-black text-white font-mono">
                {formatCurrencyVal(statsData.active.totalSal)}
              </p>
              <div className="flex items-center justify-between text-[10px] font-mono border-t border-zinc-900 pt-1.5">
                <span className="text-emerald-400 font-bold">Pago: {formatCurrencyVal(statsData.active.totalSalPago)}</span>
                <span className="text-blue-400 font-bold">Pend: {formatCurrencyVal(statsData.active.totalSalPendente)}</span>
              </div>
            </div>

            {/* 4. TOTAL REPASSADO PAGO */}
            <div className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-5 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-emerald-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Total Repassado Pago</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {formatCurrencyVal(statsData.active.totalPago)}
              </p>
              <div className="text-[10px] font-mono text-zinc-400 border-t border-zinc-900 pt-1.5">
                Pendente Total: <span className="text-amber-400 font-bold">{formatCurrencyVal(statsData.active.totalPendente)}</span>
              </div>
            </div>

          </div>

          {/* Table Details */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-2xl space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#FFD600]" />
                <span>Detalhamento dos Lançamentos ({statsData.active.count} registros)</span>
              </h3>
              <span className="text-[10px] font-mono text-zinc-500">
                Valores {hideValues ? 'Ocultos por Privacidade' : 'Visíveis'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 uppercase text-[10px]">
                    <th className="p-3">Motorista / CPF</th>
                    <th className="p-3">Chave PIX</th>
                    <th className="p-3">Coleta</th>
                    <th className="p-3 text-right">Frete Total</th>
                    <th className="p-3 text-right">Adiantamento</th>
                    <th className="p-3 text-center">Status Adiant.</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3 text-center">Status Saldo</th>
                    <th className="p-3">Contrato/CTRC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 text-zinc-300">
                  {statsData.active.list.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-500 italic">
                        Nenhum registro de pagamento encontrado para o período {statsTimeframe}.
                      </td>
                    </tr>
                  ) : (
                    statsData.active.list.map(e => {
                      const frete = Number(e.frete_motorista) || 0;
                      const ad = e.valorAdiantamento !== undefined ? Number(e.valorAdiantamento) : Math.round(frete * 0.7);
                      const sal = e.valorSaldo !== undefined ? Number(e.valorSaldo) : Math.round(frete * 0.3);
                      const isAdPago = e.statusPagamentoAdiantamento === 'pago';
                      const isSalPago = e.statusPagamentoSaldo === 'pago';
                      const pixInfo = resolveDriverPixInfo(e);

                      return (
                        <tr key={e.id} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="p-3 font-sans font-bold text-white">
                            <div>{e.motorista || 'Sem nome'}</div>
                            <div className="text-[10px] text-zinc-500 font-mono font-normal">{e.cpf_motorista || 'Sem CPF'}</div>
                          </td>
                          <td className="p-3 font-mono text-zinc-300">
                            <div className="truncate max-w-[140px]">{pixInfo.chavePix || e.tel_motorista || 'N/A'}</div>
                            <div className="text-[9px] text-zinc-500 truncate">{pixInfo.favorecidoPix || ''}</div>
                          </td>
                          <td className="p-3 text-zinc-400">{formatDateBR(e.data_coleta)}</td>
                          <td className="p-3 text-right font-bold text-white">{formatCurrencyVal(frete)}</td>
                          <td className="p-3 text-right font-bold text-amber-400">{formatCurrencyVal(ad)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isAdPago ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}>
                              {isAdPago ? 'PAGO' : 'PENDENTE'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold text-blue-400">{formatCurrencyVal(sal)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isSalPago ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-400 border border-blue-800'
                            }`}>
                              {isSalPago ? 'PAGO' : 'PENDENTE'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-zinc-400 text-[11px]">{e.cte || e.contratoNum || 'N/A'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : viewTab === 'solicitacoes' ? (
        /* ======================================================== */
        /* ABA DE SOLICITAÇÃO DE PAGAMENTO (ADIANTAMENTO E SALDO)  */
        /* ======================================================== */
        <div className="space-y-6 animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-2xl space-y-5">
            {/* Cabeçalho da Aba e Controles de Data */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
              <div>
                <h2 className="text-lg font-black font-sans uppercase tracking-wider text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#FFD600]" />
                  Controle de Solicitação de Pagamento (Adiantamento & Saldo)
                </h2>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Acompanhe e confirme individualmente as solicitações de Adiantamento (70%) e Saldo (30%) dos motoristas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Botão Ver Todos vs Filtrar Data */}
                <button
                  type="button"
                  onClick={() => setShowAllDatesSolicitacoes(!showAllDatesSolicitacoes)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${
                    showAllDatesSolicitacoes
                      ? 'bg-[#FFD600] text-black border-[#FFD600]'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{showAllDatesSolicitacoes ? 'Exibindo Todos Fretes' : 'Filtrar Por Data'}</span>
                </button>

                {!showAllDatesSolicitacoes && (
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2">
                    <Calendar className="w-4 h-4 text-[#FFD600] shrink-0" />
                    <span className="text-xs font-mono text-zinc-400">Data:</span>
                    <input
                      type="date"
                      value={solicitacoesDate}
                      onChange={(e) => setSolicitacoesDate(e.target.value)}
                      className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setSolicitacoesDate(getTodayBr())}
                      className="text-[10px] font-mono text-[#FFD600] hover:underline ml-1"
                      title="Voltar para o dia atual"
                    >
                      Hoje
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Renderização dos Dados da Tabela e KPIs */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[#FFD600]" />
                <p className="text-xs font-mono text-zinc-400">Carregando solicitações de pagamento...</p>
              </div>
            ) : (() => {
              // 1. Filtrar entregas válidas (não canceladas)
              const baseEncerradas = entregas.filter(e => {
                if (e.status === 'cancelado') return false;
                if (showAllDatesSolicitacoes) return true;

                const completionDate = e.data_entrega || 
                                       e.data_coleta || 
                                       (e.updated_at ? e.updated_at.slice(0, 10) : '') || 
                                       '';
                return completionDate === solicitacoesDate;
              });

              // Métricas calculadas
              let totalEncerrados = baseEncerradas.length;
              let totalFreteMotoristas = 0;

              let countSolicitadosAdiant = 0;
              let valorSolicitadosAdiant = 0;

              let countSolicitadosSaldo = 0;
              let valorSolicitadosSaldo = 0;

              let countPendentesGeral = 0;

              let countPagosCompleto = 0;

              baseEncerradas.forEach(e => {
                const freteMot = parseSafeNumber(e.frete_motorista);
                const valAd = e.valorAdiantamento !== undefined && e.valorAdiantamento !== null
                  ? parseSafeNumber(e.valorAdiantamento)
                  : Math.round(freteMot * 0.7);
                const valSal = e.valorSaldo !== undefined && e.valorSaldo !== null
                  ? parseSafeNumber(e.valorSaldo)
                  : Math.round(freteMot * 0.3);

                totalFreteMotoristas += (valAd + valSal);

                const isAdiantSolicitado = !!e.solicitadoPagamentoAdiantamento;
                const isSaldoSolicitado = !!(e.solicitadoPagamentoSaldo ?? e.solicitadoPagamento);
                const isAdiantPago = e.statusPagamentoAdiantamento === 'pago';
                const isSaldoPago = e.statusPagamentoSaldo === 'pago';

                if (isAdiantPago && isSaldoPago) {
                  countPagosCompleto += 1;
                }

                if (isAdiantSolicitado) {
                  countSolicitadosAdiant += 1;
                  valorSolicitadosAdiant += valAd;
                }

                if (isSaldoSolicitado) {
                  countSolicitadosSaldo += 1;
                  valorSolicitadosSaldo += valSal;
                }

                if (!isAdiantSolicitado && !isSaldoSolicitado) {
                  countPendentesGeral += 1;
                }
              });

              // 2. Aplicar filtro secundário e busca por texto
              const listFiltered = baseEncerradas.filter(e => {
                const isAdiantSolicitado = !!e.solicitadoPagamentoAdiantamento;
                const isSaldoSolicitado = !!(e.solicitadoPagamentoSaldo ?? e.solicitadoPagamento);
                const isAdiantPago = e.statusPagamentoAdiantamento === 'pago';
                const isSaldoPago = e.statusPagamentoSaldo === 'pago';

                if (subFilterSolicitacao === 'adiantamento' && !isAdiantSolicitado) return false;
                if (subFilterSolicitacao === 'saldo' && !isSaldoSolicitado) return false;
                if (subFilterSolicitacao === 'pendentes' && (isAdiantSolicitado || isSaldoSolicitado)) return false;
                if (subFilterSolicitacao === 'pagos' && !(isAdiantPago && isSaldoPago)) return false;

                if (searchSolicitacao.trim()) {
                  const q = searchSolicitacao.toLowerCase().trim();
                  const driverMatch = (e.motorista || '').toLowerCase().includes(q);
                  const clientMatch = (e.cliente || '').toLowerCase().includes(q);
                  const cpfMatch = (e.cpf_motorista || '').toLowerCase().includes(q);
                  const ctrcMatch = (e.cte || e.contratoNum || '').toLowerCase().includes(q);
                  const pixMatch = (e.chavePix || '').toLowerCase().includes(q);
                  if (!driverMatch && !clientMatch && !cpfMatch && !ctrcMatch && !pixMatch) {
                    return false;
                  }
                }

                return true;
              });

              return (
                <div className="space-y-5">
                  {/* Cards de Métricas / KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono">
                        <span>TOTAL DE FRETES</span>
                        <Truck className="w-4 h-4 text-[#FFD600]" />
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-extrabold text-white font-mono">{totalEncerrados}</span>
                        <span className="text-xs text-zinc-400 font-mono ml-2">({formatCurrencyVal(totalFreteMotoristas)})</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 border border-amber-900/40 rounded-xl p-3.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-amber-400 text-[11px] font-mono font-bold">
                        <span>SOLICITADO ADIANT. (70%)</span>
                        <UserCheck className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-extrabold text-amber-400 font-mono">{countSolicitadosAdiant}</span>
                        <span className="text-xs text-amber-500/80 font-mono ml-2">({formatCurrencyVal(valorSolicitadosAdiant)})</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 border border-emerald-900/40 rounded-xl p-3.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-emerald-400 text-[11px] font-mono font-bold">
                        <span>SOLICITADO SALDO (30%)</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-extrabold text-emerald-400 font-mono">{countSolicitadosSaldo}</span>
                        <span className="text-xs text-emerald-500/80 font-mono ml-2">({formatCurrencyVal(valorSolicitadosSaldo)})</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 border border-blue-900/40 rounded-xl p-3.5 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-blue-400 text-[11px] font-mono">
                        <span>PAGOS 100% (FINANCEIRO)</span>
                        <DollarSign className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-extrabold text-blue-400 font-mono">{countPagosCompleto}</span>
                        <span className="text-xs text-blue-500/80 font-mono ml-2">concluídos</span>
                      </div>
                    </div>
                  </div>

                  {/* Barra de Filtros Rápidos e Busca */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/50 p-2.5 rounded-xl border border-zinc-900">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSubFilterSolicitacao('todos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          subFilterSolicitacao === 'todos'
                            ? 'bg-[#FFD600] text-black shadow-sm'
                            : 'text-zinc-400 hover:text-white bg-zinc-900'
                        }`}
                      >
                        Todos ({totalEncerrados})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubFilterSolicitacao('adiantamento')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          subFilterSolicitacao === 'adiantamento'
                            ? 'bg-amber-500 text-black shadow-sm'
                            : 'text-amber-400 hover:text-amber-300 bg-zinc-900'
                        }`}
                      >
                        ⚡ Solicitado Adiantamento ({countSolicitadosAdiant})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubFilterSolicitacao('saldo')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          subFilterSolicitacao === 'saldo'
                            ? 'bg-emerald-500 text-black shadow-sm'
                            : 'text-emerald-400 hover:text-emerald-300 bg-zinc-900'
                        }`}
                      >
                        ✅ Solicitado Saldo ({countSolicitadosSaldo})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubFilterSolicitacao('pendentes')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          subFilterSolicitacao === 'pendentes'
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'text-red-400 hover:text-red-300 bg-zinc-900'
                        }`}
                      >
                        ❌ Não Solicitados ({countPendentesGeral})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubFilterSolicitacao('pagos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          subFilterSolicitacao === 'pagos'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-blue-400 hover:text-blue-300 bg-zinc-900'
                        }`}
                      >
                        💰 Já Pagos ({countPagosCompleto})
                      </button>
                    </div>

                    <div className="relative flex-1 sm:max-w-xs">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar motorista, cliente, PIX..."
                        value={searchSolicitacao}
                        onChange={(e) => setSearchSolicitacao(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#FFD600]"
                      />
                    </div>
                  </div>

                  {/* Tabela de Solicitações */}
                  {listFiltered.length === 0 ? (
                    <div className="py-12 text-center space-y-3 bg-zinc-900/40 rounded-xl border border-zinc-900/60">
                      <UserCheck className="w-12 h-12 text-zinc-700 mx-auto" />
                      <h3 className="text-base font-bold text-zinc-300">Nenhum registro localizado com os filtros aplicados</h3>
                      <p className="text-xs text-zinc-500 font-mono">
                        Tente alterar a data ({formatDateBR(solicitacoesDate)}) ou limpar o termo de busca.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[11px] tracking-wider">
                            <th className="p-3">Motorista & Dados PIX</th>
                            <th className="p-3">Cliente / CTRC</th>
                            <th className="p-3 text-right text-amber-400">Adiantamento (70%)</th>
                            <th className="p-3 text-center min-w-[190px]">Solicitou Adiantamento?</th>
                            <th className="p-3 text-right text-blue-400">Saldo A Pagar (30%)</th>
                            <th className="p-3 text-center min-w-[190px]">Solicitou Saldo?</th>
                            <th className="p-3 text-center">Status Financeiro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900 font-sans text-xs">
                          {listFiltered.map(e => {
                            const isAdiantSolicitado = !!e.solicitadoPagamentoAdiantamento;
                            const isSaldoSolicitado = !!(e.solicitadoPagamentoSaldo ?? e.solicitadoPagamento);
                            const isAdiantPago = e.statusPagamentoAdiantamento === 'pago';
                            const isSaldoPago = e.statusPagamentoSaldo === 'pago';

                            const freteMot = parseSafeNumber(e.frete_motorista);
                            const valAd = e.valorAdiantamento !== undefined && e.valorAdiantamento !== null
                              ? parseSafeNumber(e.valorAdiantamento)
                              : Math.round(freteMot * 0.7);
                            const valSal = e.valorSaldo !== undefined && e.valorSaldo !== null
                              ? parseSafeNumber(e.valorSaldo)
                              : Math.round(freteMot * 0.3);

                            // Lookup PIX details safely from resolveDriverPixInfo helper
                            const pixInfo = resolveDriverPixInfo(e);
                            const pixKey = pixInfo.chavePix;
                            const pixFav = pixInfo.favorecidoPix;

                            return (
                              <tr key={e.id} className="hover:bg-zinc-900/40 transition-colors">
                                {/* Motorista e Dados PIX */}
                                <td className="p-3 text-white font-bold">
                                  <div className="flex items-center gap-1.5">
                                    <span>{e.motorista || 'NÃO INFORMADO'}</span>
                                    {pixKey && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopyPix(pixKey, e.id)}
                                        className="text-zinc-500 hover:text-[#FFD600] transition-colors p-1"
                                        title={`Copiar PIX: ${pixKey}`}
                                      >
                                        {copiedPixId === e.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 font-mono font-normal mt-0.5">
                                    CPF: {e.cpf_motorista || 'S/N'}
                                    {pixKey && <span className="ml-2 text-zinc-400">| PIX: {pixKey} {pixFav ? `(${pixFav})` : ''}</span>}
                                  </div>
                                </td>

                                {/* Cliente e CTRC */}
                                <td className="p-3 text-zinc-300 uppercase">
                                  <div className="font-bold">{e.cliente || 'NÃO INFORMADO'}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">
                                    CTRC: {e.cte || e.contratoNum || 'S/N'}
                                  </div>
                                </td>

                                {/* Adiantamento (70%) */}
                                <td className="p-3 text-right font-mono text-amber-400 font-bold">
                                  {formatCurrencyVal(valAd)}
                                </td>

                                {/* Confirmação 1: Solicitou Adiantamento? */}
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSolicitadoAdiantamento(e.id, isAdiantSolicitado)}
                                    className={`w-full px-3 py-1.5 rounded-xl text-[11px] font-mono font-black uppercase tracking-wide transition-all duration-200 cursor-pointer border flex items-center justify-center gap-1.5 shadow-md ${
                                      isAdiantSolicitado
                                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-500 border-zinc-800'
                                    }`}
                                  >
                                    {isAdiantSolicitado ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                                        <span>ADIANT. SOLICITADO (SIM)</span>
                                      </>
                                    ) : (
                                      <>
                                        <X className="w-3.5 h-3.5 text-zinc-500" />
                                        <span>NÃO SOLICITADO</span>
                                      </>
                                    )}
                                  </button>
                                </td>

                                {/* Saldo a Pagar (30%) */}
                                <td className="p-3 text-right font-mono text-blue-400 font-extrabold text-sm">
                                  {formatCurrencyVal(valSal)}
                                </td>

                                {/* Confirmação 2: Solicitou Saldo? */}
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSolicitadoSaldo(e.id, isSaldoSolicitado)}
                                    className={`w-full px-3 py-1.5 rounded-xl text-[11px] font-mono font-black uppercase tracking-wide transition-all duration-200 cursor-pointer border flex items-center justify-center gap-1.5 shadow-md ${
                                      isSaldoSolicitado
                                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                        : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-500 border-zinc-800'
                                    }`}
                                  >
                                    {isSaldoSolicitado ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>SALDO SOLICITADO (SIM)</span>
                                      </>
                                    ) : (
                                      <>
                                        <X className="w-3.5 h-3.5 text-zinc-500" />
                                        <span>NÃO SOLICITADO</span>
                                      </>
                                    )}
                                  </button>
                                </td>

                                {/* Status Financeiro */}
                                <td className="p-3 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                                      isAdiantPago
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                        : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                                    }`}>
                                      {isAdiantPago ? 'ADIANT: PAGO' : 'ADIANT: PENDENTE'}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                                      isSaldoPago
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                        : 'bg-blue-950/80 text-blue-400 border border-blue-800'
                                    }`}>
                                      {isSaldoPago ? 'SALDO: PAGO' : 'SALDO: PENDENTE'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* GRID DE CARDS (3 COLUNAS DESKTOP, 1 COLUNA MOBILE)       */
        /* 20 MOTORISTAS POR VEZ PARA PROTEGER COTA FIRESTORE       */
        /* ======================================================== */
        loading ? (
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
              const pixInfo = resolveDriverPixInfo(entrega);
              const timerInfo = getSaldoTimerInfo(entrega, nowMs);

              // Check if CTA / RPA has been loaded
              const hasRpa = !!entrega.cte || (Number(entrega.frete_motorista) > 0 && !!pixInfo.favorecidoPix);

              // Values calculation: Prioritize manually entered or read values, fallback to 70%/30% estimation of total freight
              const totalMot = Number(entrega.frete_motorista) || 0;
              const valAdiantamento = (entrega.valorAdiantamento !== undefined && entrega.valorAdiantamento !== null)
                ? entrega.valorAdiantamento
                : (totalMot > 0 ? Math.round(totalMot * 0.7) : 0);
              const valSaldo = (entrega.valorSaldo !== undefined && entrega.valorSaldo !== null)
                ? entrega.valorSaldo
                : (totalMot > 0 ? Math.round(totalMot * 0.3) : 0);

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
                    timerInfo.isOver24h
                      ? 'border-red-600/90 shadow-[0_0_25px_rgba(239,68,68,0.4)] ring-2 ring-red-600/60 bg-red-950/10'
                      : !hasRpa
                      ? 'border-amber-900/80 shadow-[0_0_15px_rgba(245,158,11,0.12)]'
                      : 'border-zinc-900'
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
                        ) : timerInfo.isOver24h || overallStatus === 'ATRASADO' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-red-950/90 text-red-400 border border-red-700/80 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 animate-spin text-red-400" />
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

                    {/* BLOCO TEMPORIZADOR 24H E STATUS DE ADIANTAMENTO/SALDO */}
                    {timerInfo.isPendingSaldo ? (
                      <div className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between gap-2 shadow-lg transition-all ${
                        timerInfo.isOver24h
                          ? 'bg-red-950/90 border-red-500 text-red-200 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)] ring-2 ring-red-500/50'
                          : 'bg-purple-950/40 border-purple-500/60 text-purple-200'
                      }`}>
                        <div className="flex items-center gap-2 font-black">
                          {timerInfo.isOver24h ? (
                            <AlertTriangle className="w-5 h-5 text-red-400 animate-spin shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-purple-400 shrink-0" />
                          )}
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                              {timerInfo.isOver24h ? '🚨 SALDO ATRASADO (>24H)' : '⏱️ PENDENTE DE SALDO'}
                            </span>
                            <span className={`text-sm font-black tracking-tight ${timerInfo.isOver24h ? 'text-red-400' : 'text-purple-300'}`}>
                              {timerInfo.formatted} {timerInfo.isOver24h && '• ALERTA CRÍTICO'}
                            </span>
                          </div>
                        </div>
                        {timerInfo.isOver24h && (
                          <button
                            type="button"
                            onClick={speakPetronioVoiceAlert}
                            className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer shrink-0 shadow-md"
                            title="Ouvir Alerta de Voz IA: Petrônio, tem pagamento atrasado de motorista."
                          >
                            <span>🔊 VOZ IA</span>
                          </button>
                        )}
                      </div>
                    ) : !isAdiantamentoPago ? (
                      <div className="bg-amber-950/30 border border-amber-600/40 rounded-xl p-2.5 text-center flex items-center justify-between px-3">
                        <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-300">
                          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>PENDENTE DE ADIANTAMENTO</span>
                        </div>
                        <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold">
                          AGUARDANDO 70%
                        </span>
                      </div>
                    ) : (
                      <div className="bg-emerald-950/30 border border-emerald-600/40 rounded-xl p-2.5 text-center flex items-center justify-between px-3">
                        <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>PAGAMENTOS CONCLUÍDOS</span>
                        </div>
                        <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold">
                          100% PAGO
                        </span>
                      </div>
                    )}

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

                    {/* CHAVE PIX EM DESTAQUE DO MOTORISTA */}
                    <div className="bg-gradient-to-r from-[#1c190a] via-zinc-900 to-zinc-900 border border-[#FFD600]/40 rounded-xl p-3 shadow-lg relative overflow-hidden">
                      <div className="flex items-center justify-between gap-2 border-b border-[#FFD600]/20 pb-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#FFD600]">
                          <Zap className="w-4 h-4 fill-[#FFD600]" />
                          <span>CHAVE PIX DO MOTORISTA</span>
                        </div>
                        {pixInfo.bancoPix && (
                          <span className="text-[10px] font-mono font-semibold text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
                            {pixInfo.bancoPix}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-mono font-black text-white truncate tracking-wide selection:bg-[#FFD600] selection:text-black">
                            {pixInfo.chavePix || entrega.tel_motorista || entrega.cpf_motorista || 'Não informada (Lançar RPA)'}
                          </p>
                          <p className="text-[10px] font-sans text-zinc-400 truncate mt-0.5">
                            Favorecido: <strong className="text-zinc-200">{pixInfo.favorecidoPix || entrega.motorista || 'N/A'}</strong>
                          </p>
                        </div>

                        {(pixInfo.chavePix || entrega.tel_motorista || entrega.cpf_motorista) && (
                          <button
                            type="button"
                            onClick={() => handleCopyPix(pixInfo.chavePix || entrega.tel_motorista || entrega.cpf_motorista || '', entrega.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-md ${
                              copiedPixId === entrega.id
                                ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                                : 'bg-[#FFD600] hover:bg-yellow-300 text-black active:scale-95'
                            }`}
                            title="Copiar Chave PIX do Motorista"
                          >
                            {copiedPixId === entrega.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>COPIADO!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>COPIAR PIX</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                {/* 2. CORPO DO CARD — 2 MINI-BLOCOS LADO A LADO */}
                <div className="grid grid-cols-2 gap-2.5">
                  
                  {/* Bloco ADIANTAMENTO */}
                  <div 
                    onClick={() => openRpaModal(entrega)}
                    title="Clique para ajustar ou lançar valores de RPA manualmente"
                    className={`border rounded-xl p-3 flex flex-col justify-between space-y-2 cursor-pointer hover:border-[#FFD600] hover:bg-zinc-900 active:scale-[0.98] transition-all group ${
                    isAdiantamentoPago 
                      ? 'bg-emerald-950/20 border-emerald-900/50' 
                      : isAdiantamentoAtrasado 
                      ? 'bg-red-950/20 border-red-900/50' 
                      : 'bg-zinc-900/80 border-zinc-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#FFD600] flex items-center justify-center shrink-0 group-hover:bg-[#FFD600]/10">
                          <DollarSign className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider truncate">
                          ADIANTAMENTO
                        </span>
                      </div>
                      
                      {entrega.rpaLido ? (
                        <span className="text-[8px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 uppercase tracking-wider whitespace-nowrap shrink-0 scale-90 origin-right">
                          Confirmado
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-amber-500 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50 uppercase tracking-wider whitespace-nowrap shrink-0 scale-90 origin-right">
                          Estimado
                        </span>
                      )}
                    </div>

                    <div>
                      {valAdiantamento !== null ? (
                        <p className="text-base font-black text-white font-mono group-hover:text-[#FFD600] transition-colors">
                          {formatCurrencyVal(valAdiantamento)}
                        </p>
                      ) : (
                        <p className="text-xs font-black text-amber-400 font-mono italic animate-pulse">
                          R$ 0,00
                        </p>
                      )}
                      
                      {/* Individual Status */}
                      <div className="mt-1 space-y-0.5">
                        {isAdiantamentoPago ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                            <Check className="w-3 h-3" />
                            <span>Pago {entrega.dataPagoAdiantamento ? `(${entrega.dataPagoAdiantamento})` : ''}</span>
                          </span>
                        ) : isAdiantamentoAtrasado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-red-400">
                            <AlertTriangle className="w-3 h-3 animate-pulse" />
                            <span>Atrasado ({formatDateBR(prazoAdiantamentoIso)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400">
                            <Clock className="w-3 h-3" />
                            <span>Prazo: {formatDateBR(prazoAdiantamentoIso)}</span>
                          </span>
                        )}

                        {entrega.solicitadoPagamentoAdiantamento && (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/80">
                              <UserCheck className="w-3 h-3 text-amber-400" />
                              <span>Solicitado 70%</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bloco SALDO */}
                  <div 
                    onClick={() => openRpaModal(entrega)}
                    title="Clique para ajustar ou lançar valores de RPA manualmente"
                    className={`border rounded-xl p-3 flex flex-col justify-between space-y-2 cursor-pointer hover:border-[#FFD600] hover:bg-zinc-900 active:scale-[0.98] transition-all group ${
                    isSaldoPago 
                      ? 'bg-emerald-950/20 border-emerald-900/50' 
                      : isSaldoAtrasado 
                      ? 'bg-red-950/20 border-red-900/50' 
                      : 'bg-zinc-900/80 border-zinc-800'
                  }`}>
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#FFD600] flex items-center justify-center shrink-0 group-hover:bg-[#FFD600]/10">
                          <DollarSign className="w-4 h-4 stroke-[2.5]" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider truncate">
                          SALDO
                        </span>
                      </div>

                      {entrega.rpaLido ? (
                        <span className="text-[8px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 uppercase tracking-wider whitespace-nowrap shrink-0 scale-90 origin-right">
                          Confirmado
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-amber-500 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/50 uppercase tracking-wider whitespace-nowrap shrink-0 scale-90 origin-right">
                          Estimado
                        </span>
                      )}
                    </div>

                    <div>
                      {valSaldo !== null ? (
                        <p className="text-base font-black text-white font-mono group-hover:text-[#FFD600] transition-colors">
                          {formatCurrencyVal(valSaldo)}
                        </p>
                      ) : (
                        <p className="text-xs font-black text-amber-400 font-mono italic animate-pulse">
                          R$ 0,00
                        </p>
                      )}

                      {/* Individual Status */}
                      <div className="mt-1 space-y-0.5">
                        {isSaldoPago ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400">
                            <Check className="w-3 h-3" />
                            <span>Pago {entrega.dataPagoSaldo ? `(${entrega.dataPagoSaldo})` : ''}</span>
                          </span>
                        ) : isSaldoAtrasado ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-red-400">
                            <AlertTriangle className="w-3 h-3 animate-pulse" />
                            <span>Atrasado ({formatDateBR(prazoSaldoIso)})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400">
                            <Clock className="w-3 h-3" />
                            <span>Prazo: {formatDateBR(prazoSaldoIso)}</span>
                          </span>
                        )}

                        {(entrega.solicitadoPagamentoSaldo ?? entrega.solicitadoPagamento) && (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                              <UserCheck className="w-3 h-3 text-emerald-400" />
                              <span>Solicitado Saldo</span>
                            </span>
                          </div>
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

                {/* RODAPÉ DO CARD — TRES BOTÕES LADO A LADO */}
                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-zinc-900">
                  
                  {/* Botão GERAR SCRIPT */}
                  <button
                    type="button"
                    onClick={() => setScriptModalEntrega(entrega)}
                    className="px-2 py-2.5 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] text-zinc-200 hover:text-[#FFD600] transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Gerar script de pagamento WhatsApp"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[#FFD600]" />
                    <span>Script</span>
                  </button>

                  {/* Botão IMPRIMIR RECIBO (RPA) */}
                  <button
                    type="button"
                    onClick={() => openReceiptModalForEntrega(entrega)}
                    className="px-2 py-2.5 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-800 hover:border-cyan-400 text-zinc-200 hover:text-cyan-300 transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Imprimir recibo oficial de pagamento RPA"
                  >
                    <Printer className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Recibo</span>
                  </button>

                  {/* Botão MARCAR COMO PAGO (COM DROPDOWN) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPagoDropdownOpenId(pagoDropdownOpenId === entrega.id ? null : entrega.id)}
                      className="w-full px-2 py-2.5 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-950 border border-emerald-600 hover:bg-emerald-900 text-emerald-300 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pago</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Dropdown Menu */}
                    {pagoDropdownOpenId === entrega.id && (
                      <div className="absolute right-0 bottom-full mb-2 w-56 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 space-y-1 text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => handleSetStatusPago(entrega.id, 'adiantamento')}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                            isAdiantamentoPago 
                              ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/60 font-bold' 
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-[#FFD600]'
                          }`}
                        >
                          <span>Pago Adiantamento</span>
                          {isAdiantamentoPago ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-zinc-700" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatusPago(entrega.id, 'saldo')}
                          className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                            isSaldoPago 
                              ? 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-950/60 font-bold' 
                              : 'text-zinc-300 hover:bg-zinc-900 hover:text-[#FFD600]'
                          }`}
                        >
                          <span>Pago Saldo</span>
                          {isSaldoPago ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-zinc-700" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetStatusPago(entrega.id, 'ambos')}
                          className={`w-full text-left px-3 py-2 rounded-lg font-bold flex items-center justify-between cursor-pointer border transition-colors ${
                            isAdiantamentoPago && isSaldoPago
                              ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900/60' 
                              : 'bg-zinc-900/50 border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-emerald-400'
                          }`}
                        >
                          <span>Pago Ambos (100%)</span>
                          {isAdiantamentoPago && isSaldoPago ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-zinc-700" />
                          )}
                        </button>
                        <div className="border-t border-zinc-900 my-1" />
                        <button
                          type="button"
                          onClick={() => handleSetStatusPago(entrega.id, 'reset')}
                          className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-red-950/30 text-zinc-500 hover:text-red-400 flex items-center justify-between cursor-pointer text-[10px]"
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
      ))}

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
                const totalMot = Number(scriptModalEntrega.frete_motorista) || 0;
                const valAdiant = (scriptModalEntrega.valorAdiantamento !== undefined && scriptModalEntrega.valorAdiantamento !== null)
                  ? scriptModalEntrega.valorAdiantamento
                  : (totalMot > 0 ? Math.round(totalMot * 0.7) : 0);
                const pixInfo = resolveDriverPixInfo(scriptModalEntrega);

                const scriptAdiantamentoTexto = `RODOVAR PAGAMENTOS — SOLICITAÇÃO DE ADIANTAMENTO
--------------------------------------------------
• MOTORISTA: ${scriptModalEntrega.motorista}
• CLIENTE: ${scriptModalEntrega.cliente}
• ROTA: ${scriptModalEntrega.origem} ➔ ${scriptModalEntrega.destino}
• VALOR ADIANTAMENTO: ${valAdiant > 0 ? 'R$ ' + valAdiant.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ 0,00'}
--------------------------------------------------
• FAVORECIDO PIX: ${pixInfo.favorecidoPix || scriptModalEntrega.motorista}
• CHAVE PIX: ${pixInfo.chavePix || scriptModalEntrega.tel_motorista || 'N/A'}
• BANCO: ${pixInfo.bancoPix || 'N/A'}
• DATA DE COLETA: ${formatDateBR(scriptModalEntrega.data_coleta)}`;

                return (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-xs font-mono font-black text-[#FFD600] uppercase">
                          SOLICITAÇÃO DE ADIANTAMENTO
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 font-bold">
                          {valAdiant > 0 ? `R$ ${valAdiant.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
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
                const totalMot = Number(scriptModalEntrega.frete_motorista) || 0;
                const valSal = (scriptModalEntrega.valorSaldo !== undefined && scriptModalEntrega.valorSaldo !== null)
                  ? scriptModalEntrega.valorSaldo
                  : (totalMot > 0 ? Math.round(totalMot * 0.3) : 0);
                const pixInfo = resolveDriverPixInfo(scriptModalEntrega);

                const scriptSaldoTexto = `RODOVAR PAGAMENTOS — SOLICITAÇÃO DE SALDO - FRETE FINALIZADO
--------------------------------------------------
• MOTORISTA: ${scriptModalEntrega.motorista}
• CLIENTE: ${scriptModalEntrega.cliente}
• ROTA: ${scriptModalEntrega.origem} ➔ ${scriptModalEntrega.destino}
• VALOR SALDO: ${valSal > 0 ? 'R$ ' + valSal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'R$ 0,00'}
--------------------------------------------------
• FAVORECIDO PIX: ${pixInfo.favorecidoPix || scriptModalEntrega.motorista}
• CHAVE PIX: ${pixInfo.chavePix || scriptModalEntrega.tel_motorista || 'N/A'}
• BANCO: ${pixInfo.bancoPix || 'N/A'}
• DATA DE COLETA: ${formatDateBR(scriptModalEntrega.data_coleta)}`;

                return (
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-xs font-mono font-black text-[#FFD600] uppercase">
                          SOLICITAÇÃO DE SALDO
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 font-bold">
                          {valSal > 0 ? `R$ ${valSal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
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

      {/* ======================================================== */}
      {/* MODAL IMPRESSÃO DE RECIBO PROFISSIONAL (RPA / FRETE)    */}
      {/* ======================================================== */}
      {printReceiptModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintReceiptModalOpen(false);
          }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[120] flex items-center justify-center p-2 sm:p-6 overflow-y-auto no-print"
        >
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn my-auto">
            {/* HEADER DO MODAL */}
            <div className="p-4 sm:p-5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded-xl">
                  <Printer className="w-6 h-6 text-[#FFD600]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-mono font-black text-white uppercase tracking-tight flex items-center gap-2">
                    EMISSÃO DE RECIBO PROFISSIONAL (RPA)
                  </h3>
                  <p className="text-xs font-mono text-zinc-400">
                    Gerador oficial de Recibo de Pagamento de Frete a Motorista com CNPJ RODOVAR
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPrintReceiptModalOpen(false)}
                  className="px-3 py-1.5 bg-red-950/80 border border-red-700/80 hover:bg-red-900 text-red-200 text-xs font-mono font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-4 h-4 text-red-400" />
                  <span>FECHAR</span>
                </button>
              </div>
            </div>

            {/* PAINEL DE CONTROLE / SELEÇÃO */}
            <div className="p-4 bg-zinc-900/80 border-b border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-3 no-print font-mono text-xs">
              {/* SELETOR DE FRETE / MOTORISTA */}
              <div>
                <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">
                  Selecione o Motorista / Carga:
                </label>
                <select
                  value={printReceiptEntrega?.id || ''}
                  onChange={(e) => {
                    const selected = entregas.find(ent => ent.id === e.target.value);
                    if (selected) setPrintReceiptEntrega(selected);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white rounded-lg p-2 focus:border-[#FFD600] outline-none truncate"
                >
                  {entregas.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.motorista} • CTe: {resolveCteNumber(ent)} ({ent.origem} ➔ {ent.destino})
                    </option>
                  ))}
                </select>
              </div>

              {/* TIPO DE RECIBO */}
              <div>
                <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">
                  Modalidade do Recibo:
                </label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setReceiptType('integral')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                      receiptType === 'integral'
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400 font-extrabold shadow-md'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    100% Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptType('adiantamento')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                      receiptType === 'adiantamento'
                        ? 'bg-amber-500 text-zinc-950 border-amber-400 font-extrabold shadow-md'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    70% Adiant.
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptType('saldo')}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                      receiptType === 'saldo'
                        ? 'bg-purple-600 text-white border-purple-400 font-extrabold shadow-md'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    30% Saldo
                  </button>
                </div>
              </div>

              {/* BOTÕES IMPRIMIR, DOWNLOAD E FECHAR */}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#FFD600] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(255,214,0,0.3)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4 text-black" />
                  <span>IMPRIMIR</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <Download className="w-4 h-4 text-black" />
                  <span>BAIXAR RECIBO</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintReceiptModalOpen(false)}
                  className="py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-zinc-700 transition-all cursor-pointer"
                >
                  SAIR
                </button>
              </div>
            </div>

            {/* ÁREA DE RECIBO FORMATADA PARA IMPRESSÃO E PREVIEW */}
            <div className="p-4 sm:p-8 overflow-y-auto bg-zinc-900/60 flex-1">
              {printReceiptEntrega ? (
                <div
                  id="recibo-impressao-container"
                  className="bg-white text-black p-4 sm:p-6 rounded-xl shadow-2xl border-4 border-double border-zinc-900 max-w-3xl mx-auto font-sans leading-relaxed text-left text-xs sm:text-sm"
                >
                  {/* CABEÇALHO DA EMPRESA COM CNPJ */}
                  <div className="border-b-2 border-zinc-900 pb-2 mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-black text-[#FFD600] font-black text-base flex items-center justify-center rounded font-mono">
                          R
                        </div>
                        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-zinc-900 font-mono">
                          {companyName}
                        </h1>
                      </div>
                      <p className="text-[11px] font-mono font-bold text-zinc-800 mt-0.5">
                        CNPJ: <span className="text-black font-extrabold">{companyCnpj}</span>
                      </p>
                      <p className="text-[10px] font-mono text-zinc-600">
                        {companyAddress}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-600 font-semibold mt-0.5">
                        Tel: {companyPhone}
                      </p>
                    </div>

                    <div className="text-left sm:text-right font-mono bg-zinc-100 p-2 rounded-lg border border-zinc-300 w-full sm:w-auto">
                      <span className="block text-[10px] uppercase font-bold text-zinc-500">
                        NÚMERO DO RECIBO
                      </span>
                      <span className="text-base font-black text-black">
                        {getReceiptNumber(printReceiptEntrega.id)}
                      </span>
                      <span className="block text-[9px] text-zinc-600 font-semibold mt-0.5">
                        EMISSÃO: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* TÍTULO DO RECIBO */}
                  <div className="bg-zinc-900 text-white text-center py-1.5 px-3 font-mono font-black uppercase text-xs sm:text-sm tracking-wider rounded mb-3 shadow-sm">
                    RECIBO DE PAGAMENTO DE FRETE A MOTORISTA (RPA)
                    <span className="block text-[10px] font-bold text-amber-300 tracking-normal mt-0.5">
                      {receiptType === 'integral'
                        ? 'QUITAÇÃO INTEGRAL (100% DO FRETE)'
                        : receiptType === 'adiantamento'
                        ? 'PARCELA 01/02 - ADIANTAMENTO DE FRETE (70%)'
                        : 'PARCELA 02/02 - QUITAÇÃO DE SALDO DE FRETE (30%)'}
                    </span>
                  </div>

                  {/* SEÇÃO 1: DADOS DO MOTORISTA E VEÍCULO */}
                  <div className="mb-3 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50 font-mono text-xs">
                    <h2 className="font-black text-zinc-900 uppercase text-[11px] border-b border-zinc-300 pb-1 mb-1.5 flex items-center justify-between">
                      <span>1. IDENTIFICAÇÃO DO MOTORISTA E CONTRATO DE CARGA</span>
                      <span className="text-[9px] text-zinc-500 font-normal">DOCUMENTO OFICIAL</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4">
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">MOTORISTA CONTRATADO:</span>
                        <span className="font-bold text-black text-xs uppercase">{printReceiptEntrega.motorista}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">CPF / CNPJ MOTORISTA:</span>
                        <span className="font-bold text-black">{printReceiptEntrega.cpfMotorista || 'CADASTRADO NO CONTRATO'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">VEÍCULO / PLACA:</span>
                        <span className="font-bold text-black">{printReceiptEntrega.placaVeiculo || 'VEÍCULO RODOVIÁRIO DE CARGA'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">Nº CTE / CONTRATO / NFE:</span>
                        <span className="font-black text-blue-900">{resolveCteNumber(printReceiptEntrega)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">CLIENTE EMBARCADOR:</span>
                        <span className="font-bold text-black">{printReceiptEntrega.cliente}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block font-bold">ROTA DE TRANSPORTE:</span>
                        <span className="font-bold text-black">{printReceiptEntrega.origem} ➔ {printReceiptEntrega.destino}</span>
                      </div>
                    </div>
                  </div>

                  {/* SEÇÃO 2: DEMONSTRATIVO FINANCEIRO DO FRETE */}
                  <div className="mb-3 border border-zinc-300 rounded-lg overflow-hidden font-mono text-xs">
                    <div className="bg-zinc-200 p-1.5 font-black text-zinc-900 uppercase text-[10px] border-b border-zinc-300">
                      2. DEMONSTRATIVO FINANCEIRO DO FRETE
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-100 text-[9px] text-zinc-600 uppercase border-b border-zinc-300">
                          <th className="p-1.5 border-r border-zinc-300">DESCRIÇÃO DA PARCELA</th>
                          <th className="p-1.5 border-r border-zinc-300 text-center">% PERC.</th>
                          <th className="p-1.5 border-r border-zinc-300 text-center">DATA PAGO</th>
                          <th className="p-1.5 border-r border-zinc-300 text-center">STATUS</th>
                          <th className="p-1.5 text-right">VALOR (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 text-[11px]">
                        <tr>
                          <td className="p-1.5 border-r border-zinc-300 font-bold">FRETE BRUTO CONTRATADO</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">100%</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">-</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center font-bold">ACORDADO</td>
                          <td className="p-1.5 text-right font-bold text-black">
                            R$ {(Number(printReceiptEntrega.frete_motorista) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className={receiptType === 'adiantamento' ? 'bg-amber-50 font-bold' : ''}>
                          <td className="p-1.5 border-r border-zinc-300">ADIANTAMENTO DE FRETE (PARCELA 01)</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">70%</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">
                            {printReceiptEntrega.dataPagoAdiantamento || new Date().toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-1.5 border-r border-zinc-300 text-center font-bold text-emerald-800">
                            {printReceiptEntrega.statusPagamentoAdiantamento === 'pago' ? '✓ PAGO' : 'PENDENTE'}
                          </td>
                          <td className="p-1.5 text-right font-black text-zinc-900">
                            R$ {((printReceiptEntrega.valorAdiantamento !== undefined && printReceiptEntrega.valorAdiantamento !== null)
                              ? Number(printReceiptEntrega.valorAdiantamento)
                              : (Number(printReceiptEntrega.frete_motorista) || 0) * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className={receiptType === 'saldo' ? 'bg-purple-50 font-bold' : ''}>
                          <td className="p-1.5 border-r border-zinc-300">SALDO FINAL DE FRETE (PARCELA 02)</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">30%</td>
                          <td className="p-1.5 border-r border-zinc-300 text-center">
                            {printReceiptEntrega.dataPagoSaldo || new Date().toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-1.5 border-r border-zinc-300 text-center font-bold text-purple-900">
                            {printReceiptEntrega.statusPagamentoSaldo === 'pago' ? '✓ PAGO' : 'PENDENTE'}
                          </td>
                          <td className="p-1.5 text-right font-black text-zinc-900">
                            R$ {((printReceiptEntrega.valorSaldo !== undefined && printReceiptEntrega.valorSaldo !== null)
                              ? Number(printReceiptEntrega.valorSaldo)
                              : (Number(printReceiptEntrega.frete_motorista) || 0) * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="bg-zinc-900 text-white font-black text-xs">
                          <td colSpan={4} className="p-2 text-right uppercase tracking-wider">
                            VALOR TOTAL DESTE RECIBO ({receiptType.toUpperCase()}):
                          </td>
                          <td className="p-2 text-right text-amber-300">
                            R$ {(receiptType === 'integral'
                              ? (Number(printReceiptEntrega.frete_motorista) || 0)
                              : receiptType === 'adiantamento'
                              ? ((printReceiptEntrega.valorAdiantamento !== undefined && printReceiptEntrega.valorAdiantamento !== null)
                                  ? Number(printReceiptEntrega.valorAdiantamento)
                                  : (Number(printReceiptEntrega.frete_motorista) || 0) * 0.7)
                              : ((printReceiptEntrega.valorSaldo !== undefined && printReceiptEntrega.valorSaldo !== null)
                                  ? Number(printReceiptEntrega.valorSaldo)
                                  : (Number(printReceiptEntrega.frete_motorista) || 0) * 0.3)
                            ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* SEÇÃO 3: FORMA DE PAGAMENTO & CHAVE PIX */}
                  {(() => {
                    const pixInfo = resolveDriverPixInfo(printReceiptEntrega);
                    return (
                      <div className="mb-3 border border-zinc-300 rounded-lg p-2.5 bg-zinc-50 font-mono text-xs">
                        <h2 className="font-black text-zinc-900 uppercase text-[10px] border-b border-zinc-300 pb-1 mb-1.5">
                          3. DADOS DO PAGAMENTO BANCÁRIO (TRANSFERÊNCIA PIX)
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="text-zinc-500 text-[10px] block font-bold">FAVORECIDO PIX:</span>
                            <span className="font-bold text-black text-[11px]">{pixInfo.favorecidoPix || printReceiptEntrega.motorista}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 text-[10px] block font-bold">CHAVE PIX CADASTRADA:</span>
                            <span className="font-bold text-black text-[11px]">{pixInfo.chavePix || 'S/N'}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 text-[10px] block font-bold">BANCO DE DESTINO:</span>
                            <span className="font-bold text-black text-[11px]">{pixInfo.bancoPix || 'S/N'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* SEÇÃO 4: TERMO LEGAL DE RECEBIMENTO E QUITAÇÃO */}
                  <div className="mb-4 p-2.5 border border-zinc-400 rounded-lg bg-zinc-50 font-mono text-[11px] leading-relaxed text-zinc-900 text-justify">
                    <p className="font-bold mb-0.5">TERMO DE DECLARAÇÃO E QUITAÇÃO DE FRETE:</p>
                    <p>
                      Recebi(emos) da empresa <strong className="uppercase">{companyName}</strong> (CNPJ: {companyCnpj}) a quantia líquida descrita neste recibo, referente aos serviços de transporte rodoviário de cargas contratados sob o CTE/Contrato nº <strong>{resolveCteNumber(printReceiptEntrega)}</strong> na rota <strong>{printReceiptEntrega.origem} ➔ {printReceiptEntrega.destino}</strong>. Por ser expressão da verdade, dou(demos) à pagadora integral e irrevogável quitação da importância discriminada, nada mais tendo a pleitear.
                    </p>
                  </div>

                  {/* DATA E ASSINATURAS */}
                  <div className="pt-2 border-t-2 border-zinc-900 font-mono text-xs">
                    <p className="text-right font-bold text-zinc-900 mb-4 uppercase text-[11px]">
                      SALVADOR / BA, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.
                    </p>

                    <div className="grid grid-cols-2 gap-4 text-center mt-3">
                      <div>
                        <div className="border-b-2 border-zinc-900 mb-1 mx-auto w-4/5"></div>
                        <span className="font-black text-black block uppercase text-[11px]">{companyName}</span>
                        <span className="text-[10px] text-zinc-600 font-bold block">DEPARTAMENTO FINANCEIRO / EMISSOR</span>
                        <span className="text-[9px] text-zinc-500 block">CNPJ: {companyCnpj}</span>
                      </div>

                      <div>
                        <div className="border-b-2 border-zinc-900 mb-1 mx-auto w-4/5"></div>
                        <span className="font-black text-black block uppercase text-[11px]">{printReceiptEntrega.motorista}</span>
                        <span className="text-[10px] text-zinc-600 font-bold block">MOTORISTA BENEFICIÁRIO</span>
                        <span className="text-[9px] text-zinc-500 block">CPF: {printReceiptEntrega.cpfMotorista || 'ASSINATURA DO MOTORISTA'}</span>
                      </div>
                    </div>
                  </div>

                  {/* RODAPÉ DO RECIBO / CÓDIGO DE AUTENTICIDADE */}
                  <div className="mt-4 pt-2 border-t border-zinc-300 flex justify-between items-center text-[9px] font-mono text-zinc-500">
                    <span>SISTEMA RODOVAR MONITORA — MÓDULO DE GESTÃO FINANCEIRA DE PAGAMENTOS</span>
                    <span>AUTENTICAÇÃO DIGITAL: {getReceiptNumber(printReceiptEntrega.id)}-{new Date().getFullYear()}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-500 font-mono">
                  Nenhum frete selecionado para impressão de recibo.
                </div>
              )}
            </div>

            {/* RODAPÉ DO MODAL COM BOTÕES DE AÇÃO E FECHAR */}
            <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 no-print font-mono text-xs">
              <span className="text-zinc-500 text-[11px] font-mono hidden sm:inline">
                SISTEMA RODOVAR MONITORA • RECIBO DIGITAL RPA
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  className="px-4 py-2 bg-cyan-950 border border-cyan-700/80 hover:bg-cyan-900 text-cyan-300 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>BAIXAR RECIBO</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-300 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>IMPRIMIR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintReceiptModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 text-zinc-400" />
                  <span>FECHAR</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Pagamentos;
