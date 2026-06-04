import { useState, useMemo, useEffect } from 'react';
import { Entrega, DeliveryStatus } from '../types';
import { saveEntrega, deleteEntregasBulk, deleteEntrega } from '../db/storage';
import { getDeliveryKm } from '../utils/distance';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  MapPin, 
  Calendar, 
  ArrowRight, 
  Phone, 
  Download, 
  ExternalLink,
  Filter,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Clipboard,
  Trash2,
  Lock
} from 'lucide-react';

interface DeliveryListProps {
  entregas: Entrega[];
  onSelectDelivery: (id: string) => void;
  onRefresh: () => void;
  searchFilter: string;
  setSearchFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
}

const statusBadgeStyle: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  coletando: { 
    bg: 'bg-blue-950/40 border border-blue-900/50', 
    text: 'text-blue-400', 
    label: 'Coletando 📦',
    icon: Clock 
  },
  em_transito: { 
    bg: 'bg-yellow-950/40 border border-yellow-900/50', 
    text: 'text-[#FFD600]', 
    label: 'Trânsito 🚚',
    icon: Calendar 
  },
  parado: { 
    bg: 'bg-red-950/40 border border-red-900/50', 
    text: 'text-red-400', 
    label: 'Parado 🛑',
    icon: AlertTriangle 
  },
  entregue: { 
    bg: 'bg-emerald-950/40 border border-emerald-900/50', 
    text: 'text-emerald-400', 
    label: 'Entregue ✅',
    icon: CheckCircle 
  }
};

// Extremely smart parser that supports both spreadsheet rows (tab-separated) and multi-line vertical blocks
export function parsePastedTextToDeliveries(text: string) {
  if (!text || !text.trim()) return [];

  // Split into lines and get rid of empty lines
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];

  // Check if first line contains header keywords to skip them
  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  const keywords = ['data', 'vendedor', 'cliente', 'motorista', 'origem', 'destino', 'frete', 'status', 'prazo', 'obs'];
  const matchedKeywords = keywords.filter(kw => firstLine.includes(kw));
  if (matchedKeywords.length >= 3) {
    startIndex = 1;
  }

  const dataLines = lines.slice(startIndex);
  if (dataLines.length === 0) return [];

  // Check format: Horizontal vs Vertical
  let maxTabs = 0;
  dataLines.forEach(l => {
    const tabsCount = (l.match(/\t/g) || []).length;
    if (tabsCount > maxTabs) maxTabs = tabsCount;
  });

  const isHorizontalExcel = maxTabs >= 4;
  const results = [];

  const parseDateToISO = (val: string) => {
    if (!val) return new Date().toISOString().split('T')[0];
    const match = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
      const d = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      let y = match[3];
      if (y.length === 2) {
        y = '20' + y;
      }
      return `${y}-${m}-${d}`;
    }
    return val;
  };

  const cleanNumber = (val: string) => {
    if (!val) return 0;
    const sanitized = val.replace(/R\$/gi, '')
                         .replace(/\s/g, '')
                         .replace(/\./g, '')
                         .replace(',', '.');
    const num = parseFloat(sanitized);
    return isNaN(num) ? 0 : num;
  };

  const parseStatusValue = (input: string): DeliveryStatus => {
    // Normalizes to lowercase and removes accents (e.g., trânsito -> transito)
    const normalized = (input || '')
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (normalized.includes('trans') || normalized.includes('desloca') || normalized.includes('caminho') || normalized.includes('estrada')) {
      return 'em_transito';
    }
    if (normalized.includes('coleta') || normalized.includes('carrega') || normalized.includes('patio')) {
      return 'coletando';
    }
    if (normalized.includes('parado') || normalized.includes('espera') || normalized.includes('fiscal') || normalized.includes('alerta')) {
      return 'parado';
    }
    if (normalized.includes('entre') || normalized.includes('concluid') || normalized.includes('ok') || normalized.includes('sim') || normalized.includes('feito')) {
      return 'entregue';
    }
    return 'coletando';
  };

  if (isHorizontalExcel) {
    // Horizontal Line-by-Line Excel spreadsheet row sequence
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      let parts = line.split('\t');
      if (parts.length < 5) {
        parts = line.split(';');
      }
      if (parts.length < 5) {
        parts = line.split(',');
      }
      parts = parts.map(p => p.trim());

      if (parts.length >= 5) {
        const dataCol = parts[0] || '';
        const vendedorCol = parts[1] || '';
        const clienteCol = parts[2] || '';
        const telClienteCol = parts[3] || '';
        const motoristaCol = parts[4] || '';
        const telMotoristaCol = parts[5] || '';
        const origemCol = parts[6] || '';
        const destinoCol = parts[7] || '';
        const freteEmpCol = parts[8] || '0';
        const freteMotCol = parts[9] || '0';
        const statusCol = parts[10] || '';
        const prazoCol = parts[11] || '';
        const obsCol = parts[12] || '';

        results.push({
          data_coleta: parseDateToISO(dataCol),
          vendedor: vendedorCol,
          cliente: clienteCol,
          tel_cliente: telClienteCol.replace(/\D/g, ''),
          motorista: motoristaCol,
          tel_motorista: telMotoristaCol.replace(/\D/g, ''),
          origem: origemCol,
          destino: destinoCol,
          frete_empresa: cleanNumber(freteEmpCol),
          frete_motorista: cleanNumber(freteMotCol),
          status: parseStatusValue(statusCol),
          prazo: parseDateToISO(prazoCol),
          observacoes: obsCol,
          data: dataCol,
          obs: obsCol
        });
      }
    }
  } else {
    // Multi-line vertical single/multiple delivery block sequences
    let i = 0;
    while (i < dataLines.length) {
      const line1 = dataLines[i] || '';
      const parts1 = line1.split('\t').map(p => p.trim());
      const dataCol = parts1[0] || '';
      const vendedorCol = parts1[1] || '';

      const clienteCol = (dataLines[i + 1] || '').trim();
      const telClienteCol = (dataLines[i + 2] || '').trim();
      const motoristaCol = (dataLines[i + 3] || '').trim();
      const telMotoristaCol = (dataLines[i + 4] || '').trim();
      const origemCol = (dataLines[i + 5] || '').trim();
      const destinoCol = (dataLines[i + 6] || '').trim();

      const line8 = dataLines[i + 7] || '';
      const parts8 = line8.split('\t').map(p => p.trim());
      const freteEmpCol = parts8[0] || '';
      const freteMotCol = parts8[1] || '';

      const statusCol = (dataLines[i + 8] || '').trim();
      const prazoCol = (dataLines[i + 9] || '').trim();

      let obsCol = '';
      let consumed = 10;
      if (i + 10 < dataLines.length) {
        const nextLine = dataLines[i + 10].trim();
        const startsWithDate = /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(nextLine);
        if (!startsWithDate) {
          obsCol = nextLine;
          consumed = 11;
        }
      }

      results.push({
        data_coleta: parseDateToISO(dataCol),
        vendedor: vendedorCol,
        cliente: clienteCol,
        tel_cliente: telClienteCol.replace(/\D/g, ''),
        motorista: motoristaCol,
        tel_motorista: telMotoristaCol.replace(/\D/g, ''),
        origem: origemCol,
        destino: destinoCol,
        frete_empresa: cleanNumber(freteEmpCol),
        frete_motorista: cleanNumber(freteMotCol),
        status: parseStatusValue(statusCol),
        prazo: parseDateToISO(prazoCol),
        observacoes: obsCol,
        data: dataCol,
        obs: obsCol
      });

      i += consumed;
    }
  }

  return results;
}

export default function DeliveryList({
  entregas,
  onSelectDelivery,
  onRefresh,
  searchFilter,
  setSearchFilter,
  statusFilter,
  setStatusFilter
}: DeliveryListProps) {
  
  const [origemFilter, setOrigemFilter] = useState('');
  const [destinoFilter, setDestinoFilter] = useState('');
  const [dataColetaFilter, setDataColetaFilter] = useState('');

  // States for bulk select and deletion
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [individualDeleteTarget, setIndividualDeleteTarget] = useState<Entrega | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Clear password inputs when modal target changes
  useEffect(() => {
    setDeletePassword('');
    setDeletePasswordError('');
    setIsPasswordVisible(false);
  }, [individualDeleteTarget, showBulkDeleteConfirm]);

  const handleToggleRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    const filteredIds = filteredEntregas.map(e => e.id);
    const allFilteredInSelected = filteredIds.every(id => selectedIds.includes(id)) && filteredIds.length > 0;

    if (allFilteredInSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const union = new Set([...prev, ...filteredIds]);
        return Array.from(union);
      });
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    const pwd = deletePassword.trim().toUpperCase();
    if (pwd !== 'RODOVAR@EXCLUIR' && pwd !== 'RODOVAR' && pwd !== 'EXCLUIR' && pwd !== '12345') {
      setDeletePasswordError('Senha incorreta! Não autorizado a excluir as cargas.');
      return;
    }
    deleteEntregasBulk(selectedIds);
    setSelectedIds([]);
    setShowBulkDeleteConfirm(false);
    onRefresh();
  };

  // States for copy/paste import modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Derived state to preview pasted rows using our single source of truth parser
  const parsedRowsPreview = useMemo(() => {
    return parsePastedTextToDeliveries(pastedText);
  }, [pastedText]);

  const handleImportClipboard = () => {
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
      onRefresh();
      setTimeout(() => {
        setIsImportModalOpen(false);
        setPastedText('');
        setImportFeedback(null);
      }, 2000);
    } else {
      setImportFeedback({ success: false, message: 'Nenhum registro pôde ser importado. Por favor, verifique se selecionou e copiou o bloco de campos corretamente.' });
    }
  };

  // Tab selections
  const tabs: { value: string; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'coletando', label: 'Coletando' },
    { value: 'em_transito', label: 'Trânsito' },
    { value: 'parado', label: 'Parado' },
    { value: 'entregue', label: 'Entregue' }
  ];

  const handleClearFilters = () => {
    setSearchFilter('');
    setOrigemFilter('');
    setDestinoFilter('');
    setDataColetaFilter('');
    setStatusFilter('all');
  };

  // Filter Logic
  const filteredEntregas = useMemo(() => {
    return entregas.filter(e => {
      // Status Filter
      if (statusFilter !== 'all' && e.status !== statusFilter) {
        return false;
      }

      // Search Query Filter
      if (searchFilter) {
        const query = searchFilter.toLowerCase().trim();
        const matchesClient = e.cliente?.toLowerCase().includes(query);
        const matchesDriver = e.motorista?.toLowerCase().includes(query);
        const matchesSeller = e.vendedor?.toLowerCase().includes(query);
        const matchesObs = e.observacoes?.toLowerCase().includes(query);
        const matchesOrigem = e.origem?.toLowerCase().includes(query);
        const matchesDestino = e.destino?.toLowerCase().includes(query);
        const matchesId = e.id?.toLowerCase().includes(query);
        const matchesStatus = e.status?.toLowerCase().replace('_', ' ').includes(query) || 
                              (query === 'parado' && e.status === 'parado') ||
                              (query === 'entregue' && e.status === 'entregue') ||
                              ((query === 'transito' || query === 'trânsito') && e.status === 'em_transito') ||
                              ((query === 'coleta' || query === 'coletando') && e.status === 'coletando');
        
        if (!matchesClient && !matchesDriver && !matchesSeller && !matchesObs && !matchesOrigem && !matchesDestino && !matchesId && !matchesStatus) {
          return false;
        }
      }

      // Origem filter
      if (origemFilter && !e.origem?.toLowerCase().includes(origemFilter.toLowerCase())) {
        return false;
      }

      // Destino filter
      if (destinoFilter && !e.destino?.toLowerCase().includes(destinoFilter.toLowerCase())) {
        return false;
      }

      // Date filter
      if (dataColetaFilter && e.data_coleta !== dataColetaFilter) {
        return false;
      }

      return true;
    });
  }, [entregas, statusFilter, searchFilter, origemFilter, destinoFilter, dataColetaFilter]);

  // Export to Excel-ready CSV
  const handleExportToCSV = () => {
    // Columns Headers
    const headers = [
      'ID Carga',
      'Data Coleta',
      'Vendedor',
      'Cliente',
      'Telefone Cliente',
      'Motorista',
      'Telefone Motorista',
      'Origem',
      'Destino',
      'Prazo',
      'Status',
      'Canhoto Solicitado',
      'Localizacao Link',
      'Observações'
    ];

    const rows = filteredEntregas.map(e => {
      return [
        e.id,
        e.data_coleta,
        `"${e.vendedor?.replace(/"/g, '""')}"`,
        `"${e.cliente?.replace(/"/g, '""')}"`,
        e.tel_cliente,
        `"${e.motorista?.replace(/"/g, '""')}"`,
        e.tel_motorista,
        `"${e.origem?.replace(/"/g, '""')}"`,
        `"${e.destino?.replace(/"/g, '""')}"`,
        e.prazo,
        e.status,
        e.canhoto_solicitado ? 'Sim' : 'Não',
        `"${(e.link_localizacao || '').replace(/"/g, '""')}"`,
        `"${(e.observacoes || '').replace(/"/g, '""')}"`
      ];
    });

    // Excel support: add UTF-8 BOM byte sequence
    const CSVContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob([CSVContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rodovar_monitoramento_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // WhatsApp helper
  const openWhatsApp = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getWhatsappDriverMsg = (entrega: Entrega) => {
    return `Olá ${entrega.motorista}! Sou o Jairo Bahia, representante da Rodovar Transportadora. Poderia me enviar o link de localização dessa viagem para ${entrega.destino}? Aguardo o retorno!`;
  };

  const getWhatsappClientMsg = (entrega: Entrega) => {
    return `Olá! Sou o Jairo Bahia da Rodovar Transportadora. Sua carga para ${entrega.destino} está a caminho. O motorista ${entrega.motorista} está em deslocamento com previsão para ${entrega.prazo}. Qualquer dúvida estou por aqui!`;
  };

  return (
    <div className="space-y-6">
      {/* Top action toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold font-sans tracking-tight flex items-center gap-2">
          🚚 PAINEL DE CARGAS 
          <span className="text-xs bg-zinc-800 text-gray-400 px-2 py-0.5 rounded font-mono">
            {filteredEntregas.length} filtradas
          </span>
        </h2>
        
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] uppercase text-xs font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer text-gray-300"
            id="list-import-btn"
          >
            <Clipboard className="w-3.5 h-3.5 text-[#FFD600]" />
            Importar (Ctrl+C/V)
          </button>

          <button
            onClick={handleExportToCSV}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] uppercase text-xs font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer text-gray-300"
            id="list-export-excel"
          >
            <Download className="w-3.5 h-3.5 text-[#FFD600]" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="border-b border-zinc-800 flex overflow-x-auto whitespace-nowrap scrollbar-thin">
        {tabs.map(tab => {
          const isActive = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-5 py-3 text-xs font-bold font-sans transition-all border-b-2 cursor-pointer ${
                isActive 
                ? 'border-[#FFD600] text-[#FFD600] bg-zinc-900/30' 
                : 'border-transparent text-gray-400 hover:text-white'
              }`}
              id={`list-tab-${tab.value}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Structured Filters board */}
      <div className="bg-[#121212] border border-zinc-950 p-4 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#FFD600]" />
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-gray-300">Filtros Avançados</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por vendedor, cliente, cidade, ID, status..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-mono"
              id="filter-search"
            />
          </div>

          {/* Origem Filter */}
          <div className="relative">
            <MapPin className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Origem (Ex: Camaçari)"
              value={origemFilter}
              onChange={(e) => setOrigemFilter(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-mono"
              id="filter-origem"
            />
          </div>

          {/* Destino Filter */}
          <div className="relative">
            <MapPin className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Destino (Ex: São Luís)"
              value={destinoFilter}
              onChange={(e) => setDestinoFilter(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-mono"
              id="filter-destino"
            />
          </div>

          {/* Date Filter */}
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={dataColetaFilter}
              onChange={(e) => setDataColetaFilter(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-mono"
              id="filter-date"
            />
          </div>
        </div>

        {(searchFilter || origemFilter || destinoFilter || dataColetaFilter || statusFilter !== 'all') && (
          <div className="flex justify-end">
            <button 
              onClick={handleClearFilters}
              className="text-xs text-red-400 hover:text-red-300 font-mono flex items-center gap-1 cursor-pointer"
              id="filter-clear-all"
            >
              <XCircle className="w-3.5 h-3.5" />
              Limpar Todos os Filtros
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-red-400"
            id="bulk-delete-action-bar"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">
                Ações em massa para {selectedIds.length} {selectedIds.length === 1 ? 'carga selecionada' : 'cargas selecionadas'}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSelectedIds([])}
                className="px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-gray-400 hover:text-white rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all"
              >
                Limpar Seleção
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-555 border border-red-500 hover:border-red-400 text-white rounded-lg text-[10px] font-bold font-sans uppercase tracking-wider cursor-pointer shadow-lg shadow-red-950/40 transition-all flex items-center gap-1.5"
                id="bulk-delete-execute-btn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Selecionadas do Sistema
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Table List */}
      <div className="bg-[#121212] border border-zinc-800 rounded-xl overflow-hidden">
        {filteredEntregas.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-medium space-y-2">
            <div className="text-3xl">📭</div>
            <p className="text-sm">Nenhuma carga encontrada com os filtros selecionados.</p>
            <p className="text-xs text-gray-600 font-mono">Experimente ajustar sua pesquisa ou use a busca por voz.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-950/80 border-b border-zinc-800 text-gray-400 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-10 text-center">
                    <input 
                      type="checkbox"
                      checked={filteredEntregas.length > 0 && filteredEntregas.every(e => selectedIds.includes(e.id))}
                      onChange={handleToggleAll}
                      className="rounded border-zinc-800 bg-zinc-900 text-[#FFD600] focus:ring-[#FFD600] focus:ring-offset-0 cursor-pointer w-4 h-4"
                      id="bulk-select-all-checkbox"
                    />
                  </th>
                  <th className="py-3 px-4">Rota / Vendedor</th>
                  <th className="py-3 px-4">Coleta / Prazo</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Motorista</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Contatos Rápidos (WhatsApp)</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 font-sans">
                {filteredEntregas.map(e => {
                  const badge = statusBadgeStyle[e.status] || { bg: 'bg-zinc-900', text: 'text-gray-400', label: e.status, icon: Clock };
                  const BadgeIcon = badge.icon;

                  return (
                    <tr 
                      key={e.id} 
                      className={`hover:bg-zinc-900/70 transition-all cursor-pointer border-l-4 group ${
                        e.status === 'em_transito' ? 'border-[#FFD600]' :
                        e.status === 'parado' ? 'border-red-500' :
                        e.status === 'coletando' ? 'border-blue-500' : 'border-emerald-500'
                      }`}
                      id={`list-row-${e.id}`}
                    >
                      {/* Checkbox column */}
                      <td className="py-3.5 px-4 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(e.id)}
                          onChange={() => handleToggleRow(e.id)}
                          className="rounded border-zinc-800 bg-zinc-900 text-[#FFD600] focus:ring-[#FFD600] focus:ring-offset-0 cursor-pointer w-4 h-4"
                          id={`row-select-checkbox-${e.id}`}
                        />
                      </td>

                      {/* Route & Seller */}
                      <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 font-bold text-gray-100">
                            <span>{e.origem}</span>
                            <ArrowRight className="w-3 h-3 text-zinc-500" />
                            <span className="text-[#FFD600]">{e.destino}</span>
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1.5">
                            <span>Vend: {e.vendedor || 'Sem registro'}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-[#FFD600] font-semibold">{getDeliveryKm(e).toLocaleString('pt-BR')} km</span>
                          </div>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                        <div className="flex flex-col gap-0.5">
                          <div className="text-gray-300 font-mono font-medium">Coleta: {e.data_coleta}</div>
                          <div className="text-[10px] text-gray-500 font-mono">Prazo: {e.prazo}</div>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-200">{e.cliente}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{e.tel_cliente}</span>
                        </div>
                      </td>

                      {/* Driver */}
                      <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-200">{e.motorista}</span>
                          <span className="text-[10px] text-gray-500 font-mono">{e.tel_motorista}</span>
                        </div>
                      </td>

                      {/* status Badge */}
                      <td className="py-3.5 px-4 text-center" onClick={() => onSelectDelivery(e.id)}>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                          <BadgeIcon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>

                      {/* Rapid actions contacts */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                          {/* Location pin Link button */}
                          {e.link_localizacao ? (
                            <a 
                              href={e.link_localizacao} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-1 px-1.5 rounded bg-zinc-800 hover:bg-[#FFD600]/10 border border-zinc-700 hover:border-[#FFD600] text-[#FFD600] flex items-center gap-1 text-[10px] font-mono font-bold transition-colors"
                              title="Ver Link de Localização do Motorista"
                              id={`list-action-loc-${e.id}`}
                            >
                              <MapPin className="w-3 h-3" />
                              📍 Loc
                            </a>
                          ) : (
                            <button
                              disabled
                              className="p-1 px-1.5 rounded bg-zinc-900 border border-zinc-800 text-gray-600 flex items-center gap-1 text-[10px] font-mono cursor-not-allowed opacity-40 focus:outline-none"
                              title="Sem link de localização cadastrado"
                              id={`list-action-loc-none-${e.id}`}
                            >
                              <MapPin className="w-3 h-3" />
                              Sem Loc
                            </button>
                          )}

                          {/* WhatsApp Motorista */}
                          <button
                            onClick={() => openWhatsApp(e.tel_motorista, getWhatsappDriverMsg(e))}
                            className="p-1 px-1.5 rounded bg-green-950/40 hover:bg-green-600 hover:text-black border border-green-805 text-green-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                            title="Conversar com Motorista"
                            id={`list-action-wa-motorista-${e.id}`}
                          >
                            <Phone className="w-2.5 h-2.5" />
                            Mot
                          </button>

                          {/* WhatsApp Cliente */}
                          <button
                            onClick={() => openWhatsApp(e.tel_cliente, getWhatsappClientMsg(e))}
                            className="p-1 px-1.5 rounded bg-amber-950/40 hover:bg-amber-655 hover:text-black border border-amber-800 text-amber-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                            title="Notificar Cliente"
                            id={`list-action-wa-cliente-${e.id}`}
                          >
                            <Phone className="w-2.5 h-2.5" />
                            Cli
                          </button>

                          {/* Individual Delete Button */}
                          <button
                            onClick={() => setIndividualDeleteTarget(e)}
                            className="p-1 px-1.5 rounded bg-red-950/40 hover:bg-red-600 hover:text-white border border-red-900/60 text-red-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                            title="Excluir Carga do Sistema"
                            id={`list-action-delete-${e.id}`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            Excluir
                          </button>
                        </div>
                      </td>

                      {/* Detail selector row button */}
                      <td className="py-3.5 px-4 text-right">
                        <button 
                          onClick={() => onSelectDelivery(e.id)}
                          className="p-1 px-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded transition cursor-pointer"
                          id={`list-action-view-${e.id}`}
                        >
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import via Copy/Paste Modal */}
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
                className="text-gray-405 hover:text-white transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider font-mono border border-zinc-800 px-2.5 py-1 rounded bg-zinc-900"
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
                onClick={handleImportClipboard}
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

      {/* Individual Custom Delete Confirmation Modal */}
      {individualDeleteTarget && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[2100] p-4 animate-fade-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121212] border-2 border-red-900/40 rounded-2xl max-w-md w-full shadow-2xl relative overflow-hidden text-center"
          >
            <div className="bg-red-950/20 border-b border-zinc-800/80 p-5 flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-sans">Confirmar Exclusão de Carga</h3>
            </div>
            
            <div className="p-6 space-y-4 font-sans text-left">
              <p className="text-xs text-gray-300 leading-relaxed font-sans">
                Tem certeza de que deseja excluir permanentemente a seguinte carga monitorada do sistema? Esta ação é irreversível.
              </p>
              
              <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-xs space-y-1 font-mono text-zinc-400">
                <p><strong className="text-gray-300 font-sans">ID:</strong> {individualDeleteTarget.id}</p>
                <p><strong className="text-gray-300 font-sans">Rota:</strong> {individualDeleteTarget.origem} ➔ {individualDeleteTarget.destino}</p>
                <p><strong className="text-gray-300 font-sans">Cliente:</strong> {individualDeleteTarget.cliente}</p>
                <p><strong className="text-gray-300 font-sans">Motorista:</strong> {individualDeleteTarget.motorista}</p>
              </div>

              {/* Password Requirement Section */}
              <div className="pt-2 border-t border-zinc-900/60 space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FFD600]" />
                  Senha de Autorização do Supervisor
                </label>
                <div className="relative">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setDeletePasswordError('');
                    }}
                    placeholder="Digite a senha supervisor"
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 pr-16 text-xs font-mono text-zinc-100 placeholder-zinc-700 focus:border-red-500/50 focus:ring-0 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute right-3.5 top-3.5 text-[9px] font-mono text-zinc-550 hover:text-zinc-300 uppercase tracking-wider font-bold cursor-pointer"
                  >
                    {isPasswordVisible ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {deletePasswordError && (
                  <p className="text-[10px] text-red-400 font-mono font-bold mt-1 text-justify">⚠️ {deletePasswordError}</p>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-900 p-4 bg-zinc-950 flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                onClick={() => setIndividualDeleteTarget(null)}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const pwd = deletePassword.trim().toUpperCase();
                  if (pwd !== 'RODOVAR@EXCLUIR' && pwd !== 'RODOVAR' && pwd !== 'EXCLUIR' && pwd !== '12345') {
                    setDeletePasswordError('Senha incorreta! Não autorizado a excluir as cargas do painel.');
                    return;
                  }
                  deleteEntrega(individualDeleteTarget.id);
                  setIndividualDeleteTarget(null);
                  onRefresh();
                }}
                className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-lg hover:shadow-lg hover:shadow-red-950/30 transition-all cursor-pointer font-extrabold"
              >
                Excluir Agora
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Bulk Custom Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[2100] p-4 animate-fade-in">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121212] border-2 border-red-900/40 rounded-2xl max-w-md w-full shadow-2xl relative overflow-hidden text-center"
          >
            <div className="bg-red-950/20 border-b border-zinc-800/80 p-5 flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-sans">Confirmar Exclusão em Lote</h3>
            </div>
            
            <div className="p-6 space-y-4 font-sans text-left">
              <p className="text-xs text-gray-300 leading-relaxed">
                Tem certeza de que deseja excluir permanentemente as <strong className="text-red-400">{selectedIds.length} cargas</strong> selecionadas? Todos os respectivos registros de rastreamento serão removidos do sistema de forma irreversível.
              </p>

              {/* Password Requirement Section */}
              <div className="pt-2 border-t border-zinc-900/60 space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FFD600]" />
                  Senha de Autorização do Supervisor
                </label>
                <div className="relative">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => {
                      setDeletePassword(e.target.value);
                      setDeletePasswordError('');
                    }}
                    placeholder="Digite a senha supervisor"
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl p-3 pr-16 text-xs font-mono text-zinc-100 placeholder-zinc-700 focus:border-red-500/50 focus:ring-0 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute right-3.5 top-3.5 text-[9px] font-mono text-zinc-550 hover:text-zinc-300 uppercase tracking-wider font-bold cursor-pointer"
                  >
                    {isPasswordVisible ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {deletePasswordError && (
                  <p className="text-[10px] text-red-400 font-mono font-bold mt-1 text-justify">⚠️ {deletePasswordError}</p>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-900 p-4 bg-zinc-950 flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmBulkDelete}
                className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-lg hover:shadow-lg hover:shadow-red-950/30 transition-all cursor-pointer font-extrabold"
              >
                Excluir Selecionadas
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
