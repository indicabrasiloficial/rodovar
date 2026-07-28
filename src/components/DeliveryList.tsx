import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Entrega, DeliveryStatus } from '../types';
import { saveEntrega, deleteEntregasBulk, deleteEntrega, getUniqueVendedores } from '../db/storage';
import { usePaginatedEntregas } from '../hooks/usePaginatedEntregas';
import { getDeliveryKm } from '../utils/distance';
import { formatDateBR, formatRegistrationTime } from '../utils/date';
import { generateTrackerLink } from '../utils/generateTrackerLink';
import AcompanharBadge from './AcompanharBadge';
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
  Lock,
  Truck,
  Printer
} from 'lucide-react';

const cleanVendedorName = (name: string): string => {
  if (!name) return '';
  // Split by slashes, backslashes, or dashes to keep only the first name
  const parts = name.split(/[\/\-\\]/);
  let p = (parts[0] || '').trim().toUpperCase();
  if (p.includes('ELINETE')) return 'ELINETE';
  if (p.includes('RAISA') || p.includes('RAISSA')) return 'RAISA';
  if (p === 'MÔNICA') p = 'MONICA';
  if (['SUELLEN', 'SUELEM', 'SUELE', 'SUELLENE', 'SULLEN', 'SUELEN'].includes(p) || p.includes('SUELLEN') || p.includes('SUELEM')) {
    p = 'ARANDA';
  }
  return p;
};

interface DeliveryListProps {
  entregas: Entrega[];
  onSelectDelivery: (id: string) => void;
  onRefresh: () => void;
  searchFilter: string;
  setSearchFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  onAddDelivery?: () => void;
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
  descarregando: { 
    bg: 'bg-purple-950/40 border border-purple-900/50', 
    text: 'text-purple-400', 
    label: 'Descarregando 🏢',
    icon: Truck 
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

  // Clean number helper
  const cleanNumber = (val: string) => {
    if (!val) return 0;
    let sanitized = val.replace(/R\$/gi, '').trim();
    if (!sanitized) return 0;

    if (sanitized.includes(',')) {
      sanitized = sanitized.replace(/\./g, '').replace(',', '.');
    }
    const num = parseFloat(sanitized);
    return isNaN(num) ? 0 : num;
  };

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
    // Handle short format DD/MM
    const shortMatch = val.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (shortMatch) {
      const d = shortMatch[1].padStart(2, '0');
      const m = shortMatch[2].padStart(2, '0');
      const y = new Date().getFullYear();
      return `${y}-${m}-${d}`;
    }
    return val;
  };

  const parseStatusValue = (input: string): DeliveryStatus => {
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

  // Detect if the pasted text uses key-value structure
  let containsKeyValue = false;
  let kvCount = 0;
  const testKeys = ['CLIENTE', 'MOTORISTA', 'ORIGEM', 'DESTINO', 'FRETE'];
  for (const line of lines) {
    if (testKeys.some(k => line.toUpperCase().includes(k + ':') || line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes(k + ':'))) {
      kvCount++;
    }
  }
  if (kvCount >= 2) {
    containsKeyValue = true;
  }

  const results = [];

  if (containsKeyValue) {
    const parseKeyValueLine = (line: string) => {
      const cleanLine = line.trim();
      const lowerLine = cleanLine.toLowerCase();
      
      // 1. TEL CLIENTE
      let match = cleanLine.match(/(?:TEL\s+CLIENTE|TELEFONE\s+CLIENTE|CONTATO\s+CLIENTE|TEL\s+CLI)[:\s]+(.*)/i);
      if (match) return { key: 'tel_cliente', val: match[1].trim() };
      
      // 2. CLIENTE (Ensure we don't accidentally match TEL CLIENTE line)
      if (!lowerLine.includes('tel') && !lowerLine.includes('telefone') && !lowerLine.includes('contato')) {
        match = cleanLine.match(/(?:CLIENTE)[:\s]+(.*)/i);
        if (match) return { key: 'cliente', val: match[1].trim() };
      }
      
      // 3. TEL MOTORISTA
      match = cleanLine.match(/(?:TEL\s+MOTORISTA|TELEFONE\s+MOTORISTA|CONTATO\s+MOTORISTA|TEL\s+MOT)[:\s]+(.*)/i);
      if (match) return { key: 'tel_motorista', val: match[1].trim() };
      
      // 4. MOTORISTA (Ensure we don't accidentally match TEL MOTORISTA line)
      if (!lowerLine.includes('tel') && !lowerLine.includes('telefone') && !lowerLine.includes('contato')) {
        match = cleanLine.match(/(?:MOTORISTA|CONDUTOR)[:\s]+(.*)/i);
        if (match) return { key: 'motorista', val: match[1].trim() };
      }
      
      // 5. DATA CARREGAMENTO
      match = cleanLine.match(/(?:DATA\s+CARREGAMENTO|DATA\s+COLETA|DATA)[:\s]+(.*)/i);
      if (match) return { key: 'data_coleta', val: match[1].trim() };
      
      // 6. COMERCIAL / ATENDENTE
      match = cleanLine.match(/(?:COMERCIAL|VENDEDOR|ATENDENTE)[:\s]+(.*)/i);
      if (match) return { key: 'vendedor', val: match[1].trim() };
      
      // 7. ORIGEM
      match = cleanLine.match(/(?:ORIGEM)[:\s]+(.*)/i);
      if (match) return { key: 'origem', val: match[1].trim() };
      
      // 8. DESTINO
      match = cleanLine.match(/(?:DESTINO)[:\s]+(.*)/i);
      if (match) return { key: 'destino', val: match[1].trim() };
      
      // 9. FRETE EMPRESA
      match = cleanLine.match(/(?:FRETE\s+EMP(?:RESA)?|FATURAMENTO)[:\s]+(.*)/i);
      if (match) return { key: 'frete_empresa', val: match[1].trim() };
      
      // 10. FRETE MOTORISTA
      match = cleanLine.match(/(?:FRETE\s+MOT(?:ORISTA)?|CUSTO\s+MOT(?:ORISTA)?)[:\s]+(.*)/i);
      if (match) return { key: 'frete_motorista', val: match[1].trim() };
      
      // 11. FAVORECIDO
      match = cleanLine.match(/(?:FAVORECIDO)[:\s]+(.*)/i);
      if (match) return { key: 'favorecido', val: match[1].trim() };
      
      // 12. CHAVE PIX
      match = cleanLine.match(/(?:CHAVE\s+PIX|PIX)[:\s]+(.*)/i);
      if (match) return { key: 'chave_pix', val: match[1].trim() };
      
      // 13. BANCO
      match = cleanLine.match(/(?:BANCO)[:\s]+(.*)/i);
      if (match) return { key: 'banco', val: match[1].trim() };
      
      // 14. OBS
      match = cleanLine.match(/(?:OBS|OBSERVACOES)[:\s]+(.*)/i);
      if (match) return { key: 'observacoes', val: match[1].trim() };
      
      return null;
    };

    const block: Record<string, string> = {};
    let unparsedLines: string[] = [];

    for (const line of lines) {
      const parsed = parseKeyValueLine(line);
      if (parsed) {
        block[parsed.key] = parsed.val;
      } else {
        const trimmed = line.trim();
        if (trimmed) {
          unparsedLines.push(trimmed);
        }
      }
    }

    const val_data_coleta = block.data_coleta || '';
    const val_vendedor = block.vendedor || '';
    const val_cliente = block.cliente || '';
    const val_tel_cliente = block.tel_cliente || '';
    const val_motorista = block.motorista || '';
    const val_tel_motorista = block.tel_motorista || '';
    const val_origem = block.origem || '';
    const val_destino = block.destino || '';
    const val_frete_empresa = cleanNumber(block.frete_empresa || '0');
    const val_frete_motorista = cleanNumber(block.frete_motorista || '0');
    const val_status = parseStatusValue(block.status || 'coletando');
    const val_prazo = block.prazo || '';

    let mergedObs = block.observacoes || '';
    const extraDetails = [];
    if (block.favorecido) extraDetails.push(`Favorecido: ${block.favorecido}`);
    if (block.chave_pix) extraDetails.push(`PIX: ${block.chave_pix}`);
    if (block.banco) extraDetails.push(`Banco: ${block.banco}`);
    if (extraDetails.length > 0) {
      if (mergedObs) {
        mergedObs += '\n' + extraDetails.join(' | ');
      } else {
        mergedObs = extraDetails.join(' | ');
      }
    }

    if (unparsedLines.length > 0) {
      const unparsedStr = unparsedLines.join('\n');
      if (mergedObs) {
        mergedObs += '\n-- Informações Adicionais --\n' + unparsedStr;
      } else {
        mergedObs = unparsedStr;
      }
    }

    results.push({
      data_coleta: parseDateToISO(val_data_coleta),
      vendedor: cleanVendedorName(val_vendedor),
      cliente: val_cliente,
      tel_cliente: val_tel_cliente.replace(/\D/g, ''),
      motorista: val_motorista,
      tel_motorista: val_tel_motorista.replace(/\D/g, ''),
      origem: val_origem,
      destino: val_destino,
      frete_empresa: val_frete_empresa,
      frete_motorista: val_frete_motorista,
      status: val_status,
      prazo: parseDateToISO(val_prazo),
      observacoes: mergedObs,
      valor_carga: 0,
      data: val_data_coleta || new Date().toLocaleDateString('pt-BR').substring(0, 5),
      obs: mergedObs
    });
  } else {
    // Check if first line contains header keywords to skip them
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    const keywords = ['data', 'vendedor', 'atendente', 'cliente', 'motorista', 'origem', 'destino', 'frete', 'status', 'prazo', 'obs'];
    const matchedKeywords = keywords.filter(kw => firstLine.includes(kw));
    
    let columnIndexes: Record<string, number> = {};
    if (matchedKeywords.length >= 3) {
      startIndex = 1;
      let headers = lines[0].split('\t');
      if (headers.length < 5) headers = lines[0].split(';');
      if (headers.length < 5) headers = lines[0].split(',');
      headers = headers.map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

      headers.forEach((header, index) => {
        if (header.includes('data') || header.includes('coleta') || header === 'dt' || header === 'dt.coleta' || header === 'dt_coleta') {
          columnIndexes['data_coleta'] = index;
        } else if (header.includes('vendedor') || header.includes('atendente') || header.includes('vend') || header.includes('aten') || header === 'comercial') {
          columnIndexes['vendedor'] = index;
        } else if (header.includes('cliente') || header.includes('cli') || header === 'destinatario') {
          columnIndexes['cliente'] = index;
        } else if (header.includes('tel cliente') || header.includes('tel_cliente') || header.includes('contato cliente') || header.includes('tel cli') || header.includes('celular cliente') || header === 'contato_cli') {
          columnIndexes['tel_cliente'] = index;
        } else if (header.includes('motorista') || header.includes('mot') || header === 'condutor') {
          columnIndexes['motorista'] = index;
        } else if (header.includes('tel motorista') || header.includes('tel_motorista') || header.includes('contato motorista') || header.includes('tel mot') || header.includes('celular motorista') || header === 'contato_mot') {
          columnIndexes['tel_motorista'] = index;
        } else if (header.includes('origem') || header.includes('orig') || header === 'de') {
          columnIndexes['origem'] = index;
        } else if (header.includes('destino') || header.includes('dest') || header === 'para') {
          columnIndexes['destino'] = index;
        } else if (header.includes('valor da carga') || header.includes('valor carga') || header.includes('vlr carga') || header.includes('val carga') || header.includes('mercadoria') || header.includes('carga')) {
          columnIndexes['valor_carga'] = index;
        } else if (header.includes('frete empresa') || header.includes('frete emp') || header.includes('faturamento') || header.includes('frete_emp')) {
          columnIndexes['frete_empresa'] = index;
        } else if (header.includes('frete motorista') || header.includes('frete mot') || header.includes('custo motorista') || header.includes('frete_mot')) {
          columnIndexes['frete_motorista'] = index;
        } else if (header.includes('status') || header.includes('situacao') || header.includes('estado') || header === 'etapa') {
          columnIndexes['status'] = index;
        } else if (header.includes('prazo') || header.includes('previsao') || header.includes('entrega') || header === 'vencimento') {
          columnIndexes['prazo'] = index;
        } else if (header.includes('observacoes') || header.includes('obs') || header === 'observacao' || header === 'detalhes') {
          columnIndexes['observacoes'] = index;
        }
      });
    }

    const dataLines = lines.slice(startIndex);
    if (dataLines.length > 0) {
      let maxTabs = 0;
      dataLines.forEach(l => {
        const tabsCount = (l.match(/\t/g) || []).length;
        if (tabsCount > maxTabs) maxTabs = tabsCount;
      });

      const isHorizontalExcel = maxTabs >= 4;

      if (isHorizontalExcel) {
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
            let val_data_coleta = '';
            let val_vendedor = '';
            let val_cliente = '';
            let val_tel_cliente = '';
            let val_motorista = '';
            let val_tel_motorista = '';
            let val_origem = '';
            let val_destino = '';
            let val_valor_carga = 0;
            let val_frete_empresa = 0;
            let val_frete_motorista = 0;
            let val_status = 'coletando' as DeliveryStatus;
            let val_prazo = '';
            let val_observacoes = '';

            if (Object.keys(columnIndexes).length >= 3) {
              const getString = (key: string) => {
                const idx = columnIndexes[key];
                return idx !== undefined && idx < parts.length ? parts[idx] : '';
              };
              
              val_data_coleta = getString('data_coleta');
              val_vendedor = getString('vendedor');
              val_cliente = getString('cliente');
              val_tel_cliente = getString('tel_cliente');
              val_motorista = getString('motorista');
              val_tel_motorista = getString('tel_motorista');
              val_origem = getString('origem');
              val_destino = getString('destino');
              val_valor_carga = cleanNumber(getString('valor_carga'));
              val_frete_empresa = cleanNumber(getString('frete_empresa'));
              val_frete_motorista = cleanNumber(getString('frete_motorista'));
              val_status = parseStatusValue(getString('status'));
              val_prazo = getString('prazo');
              val_observacoes = getString('observacoes');
            } else {
              if (parts.length >= 14) {
                val_data_coleta = parts[0] || '';
                val_vendedor = parts[1] || '';
                val_cliente = parts[2] || '';
                val_tel_cliente = parts[3] || '';
                val_motorista = parts[4] || '';
                val_tel_motorista = parts[5] || '';
                val_origem = parts[6] || '';
                val_destino = parts[7] || '';
                val_valor_carga = cleanNumber(parts[8]);
                val_frete_empresa = cleanNumber(parts[9]);
                val_frete_motorista = cleanNumber(parts[10]);
                val_status = parseStatusValue(parts[11]);
                val_prazo = parts[12] || '';
                val_observacoes = parts[13] || '';
              } else {
                val_data_coleta = parts[0] || '';
                val_vendedor = parts[1] || '';
                val_cliente = parts[2] || '';
                val_tel_cliente = parts[3] || '';
                val_motorista = parts[4] || '';
                val_tel_motorista = parts[5] || '';
                val_origem = parts[6] || '';
                val_destino = parts[7] || '';
                val_frete_empresa = cleanNumber(parts[8] || '0');
                val_frete_motorista = cleanNumber(parts[9] || '0');
                val_status = parseStatusValue(parts[10] || '');
                val_prazo = parts[11] || '';
                val_observacoes = parts[12] || '';
                val_valor_carga = 0;
              }
            }

            results.push({
              data_coleta: parseDateToISO(val_data_coleta),
              vendedor: cleanVendedorName(val_vendedor),
              cliente: val_cliente,
              tel_cliente: val_tel_cliente.replace(/\D/g, ''),
              motorista: val_motorista,
              tel_motorista: val_tel_motorista.replace(/\D/g, ''),
              origem: val_origem,
              destino: val_destino,
              frete_empresa: val_frete_empresa,
              frete_motorista: val_frete_motorista,
              status: val_status,
              prazo: parseDateToISO(val_prazo),
              observacoes: val_observacoes,
              valor_carga: val_valor_carga,
              data: val_data_coleta,
              obs: val_observacoes
            });
          }
        }
      } else {
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
            vendedor: cleanVendedorName(vendedorCol),
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
            valor_carga: 0,
            data: dataCol,
            obs: obsCol
          });

          i += consumed;
        }
      }
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  return results
    .filter(row => (row.origem && row.origem.trim() !== '') || (row.destino && row.destino.trim() !== ''))
    .map(row => {
      let finalPrazo = row.prazo;
      if (row.data_coleta && row.data_coleta > todayStr) {
        finalPrazo = row.data_coleta;
      }
      return {
        ...row,
        prazo: finalPrazo
      };
    });
}

// High-fidelity shimmer skeleton loading component for mobile viewport card decks
function MobileSkeletonCard() {
  return (
    <div className="p-4 space-y-3 bg-[#121212]/50 border border-zinc-900 rounded-xl animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-zinc-800 rounded w-2/3" />
        <div className="h-5 bg-zinc-800 rounded-full w-16" />
      </div>
      <div className="space-y-2 h-20 bg-zinc-950/40 border border-zinc-900/60 p-3 rounded-lg flex flex-col justify-between">
        <div className="h-3 bg-zinc-700/60 rounded w-1/2" />
        <div className="h-3 bg-zinc-700/60 rounded w-3/4" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-6 bg-zinc-800 rounded w-24" />
        <div className="h-6 bg-zinc-850 rounded w-20" />
      </div>
    </div>
  );
}

// High-fidelity shimmer skeleton loading component for desktop table grid structures
function DesktopSkeletonRow() {
  return (
    <tr className="border-b border-zinc-900 animate-pulse bg-zinc-950/20">
      <td className="py-4 px-4 w-10 text-center">
        <div className="h-4 bg-zinc-800 rounded w-4 mx-auto" />
      </td>
      <td className="py-4 px-4">
        <div className="space-y-1.5">
          <div className="h-4 bg-zinc-850 rounded w-40" />
          <div className="h-3 bg-zinc-800 rounded w-20" />
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="space-y-1.5">
          <div className="h-3 bg-zinc-800 rounded w-28" />
          <div className="h-3 bg-zinc-800 rounded w-20" />
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="h-4 bg-zinc-800 rounded w-32" />
      </td>
      <td className="py-4 px-4">
        <div className="h-4 bg-zinc-800 rounded w-28" />
      </td>
      <td className="py-4 px-4">
        <div className="space-y-1.5">
          <div className="h-3.5 bg-zinc-850 rounded w-24" />
          <div className="h-3 bg-zinc-800 rounded w-16" />
        </div>
      </td>
      <td className="py-4 px-4 text-center">
        <div className="h-5 bg-zinc-800 rounded-full w-16 mx-auto" />
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center justify-center gap-1.5">
          <div className="h-6 bg-zinc-800 rounded w-10" />
          <div className="h-6 bg-zinc-800 rounded w-10" />
          <div className="h-6 bg-zinc-800 rounded w-10" />
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="h-4 bg-zinc-805 rounded w-4 ml-auto" />
      </td>
    </tr>
  );
}

// Modern, high-performance HTML print delivery document router
function printDeliveries(entregas: Entrega[], options: { showFinance: boolean; showObs: boolean; showSignature: boolean }) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita pop-ups para imprimir as rotas.');
    return;
  }

  const dateStr = new Date().toLocaleString('pt-BR');
  
  // Calculate statistics
  const totalCargas = entregas.length;
  const totalKm = entregas.reduce((acc, curr) => {
    const kmVal = curr.km !== undefined && curr.km > 0 
      ? Number(curr.km) 
      : 0;
    return acc + kmVal;
  }, 0);
  
  const totalFreteEmp = entregas.reduce((acc, curr) => acc + (Number(curr.frete_empresa) || 0), 0);
  const totalFreteMot = entregas.reduce((acc, curr) => acc + (Number(curr.frete_motorista) || 0), 0);
  const saldoLiquido = totalFreteEmp - totalFreteMot;

  let cardsHtml = '';
  entregas.forEach((e, idx) => {
    const statusText = e.status === 'entregue' ? 'Entregue ✅' : 
                       e.status === 'em_transito' ? 'Previsão de Entrega' : 
                       e.status === 'parado' ? 'Parado 🛑' : 'Coletando 📦';
    
    cardsHtml += `
      <div class="route-card">
        <div class="card-header">
          <span class="route-number">ROTA #${String(idx + 1).padStart(2, '0')}</span>
          <span class="route-status ${e.status}">${statusText}</span>
        </div>
        
        <div class="card-grid">
          <div class="grid-col">
            <p><strong>Origem:</strong> ${e.origem || 'Não informada'}</p>
            <p><strong>Destino:</strong> ${e.destino || 'Não informado'}</p>
            <p><strong>Carga / KM:</strong> ${e.km ? e.km.toLocaleString('pt-BR') : '0'} km</p>
            <p><strong>Atendente:</strong> ${e.vendedor || 'Sem Registro'}</p>
          </div>
          <div class="grid-col">
            <p><strong>Cliente:</strong> ${e.cliente || 'Sem cadastro'} ${e.tel_cliente ? `(${e.tel_cliente})` : ''}</p>
            <p><strong>Motorista:</strong> ${e.motorista || 'Sem cadastro'} ${e.tel_motorista ? `(${e.tel_motorista})` : ''}</p>
            <p><strong>Data de Coleta:</strong> ${e.data_coleta ? new Date(e.data_coleta + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</p>
            ${e.prazo ? `<p><strong>Prazo de Entrega:</strong> ${new Date(e.prazo + 'T00:00:00').toLocaleDateString('pt-BR')}</p>` : ''}
          </div>
        </div>

        ${options.showFinance ? `
        <div class="finance-strip">
          <div class="fin-item"><strong>Frete Empresa:</strong> R$ ${Number(e.frete_empresa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="fin-item"><strong>Frete Motorista:</strong> R$ ${Number(e.frete_motorista || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="fin-item saldo"><strong>Saldo Líquido:</strong> R$ ${Number((e.frete_empresa || 0) - (e.frete_motorista || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        ` : ''}

        ${options.showObs && e.observacoes ? `
        <div class="obs-box">
          <strong>Observações:</strong>
          <pre>${e.observacoes}</pre>
        </div>
        ` : ''}

        ${options.showSignature ? `
        <div class="signature-row">
          <div class="sig-col">
            <div class="sig-line"></div>
            <p>Assinatura do Motorista</p>
          </div>
          <div class="sig-col">
            <div class="sig-line"></div>
            <p>Assinatura do Recebedor / Cliente</p>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Roteiro de Entregas - Rodovar Monitora</title>
      <style>
        body {
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
          color: #111;
          background-color: #fff;
          margin: 0;
          padding: 30px;
          line-height: 1.5;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
        
        .print-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #ddd;
          padding-bottom: 12px;
          margin-bottom: 25px;
        }
        .logo-area h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0;
          color: #000;
          letter-spacing: -0.5px;
        }
        .logo-area span {
          font-size: 11px;
          text-transform: uppercase;
          color: #666;
          letter-spacing: 1.5px;
          font-weight: 600;
        }
        .meta-area {
          text-align: right;
          font-size: 11px;
          color: #555;
        }

        /* Stats Bar */
        .stats-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .stat-card-title {
          font-size: 10px;
          text-transform: uppercase;
          color: #6c757d;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .stat-card-val {
          font-size: 16px;
          font-weight: bold;
          color: #111;
        }

        /* Route Card */
        .route-card {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 25px;
          page-break-inside: avoid;
          background: #ffffff;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e9ecef;
          padding-bottom: 10px;
          margin-bottom: 15px;
        }
        .route-number {
          font-size: 15px;
          font-weight: bold;
          font-family: monospace;
          background: #000;
          color: #fff;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .route-status {
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 20px;
          border: 1px solid transparent;
        }
        .route-status.coletando { background: #e8f4fd; color: #1d88e5; border-color: #b3e5fc; }
        .route-status.em_transito { background: #fff8e1; color: #f57f17; border-color: #ffe082; }
        .route-status.parado { background: #ffebee; color: #c62828; border-color: #ffcdd2; }
        .route-status.entregue { background: #e8f5e9; color: #2e7d32; border-color: #c8e6c9; }

        .card-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 15px;
        }
        .grid-col p {
          margin: 6px 0;
          font-size: 13px;
        }

        /* Finance Strip */
        .finance-strip {
          display: flex;
          justify-content: space-between;
          background: #f8f9fa;
          border: 1px dashed #ced4da;
          padding: 10px 15px;
          border-radius: 6px;
          margin-bottom: 15px;
          font-size: 12.5px;
        }
        .fin-item.saldo {
          color: #2e7d32;
          font-weight: bold;
        }

        /* Observations */
        .obs-box {
          background: #fbfbfb;
          border-left: 3px solid #6c757d;
          padding: 10px 15px;
          margin-bottom: 15px;
          border-radius: 0 4px 4px 0;
        }
        .obs-box strong {
          display: block;
          font-size: 11px;
          color: #495057;
          margin-bottom: 4px;
        }
        .obs-box pre {
          margin: 0;
          font-size: 12px;
          color: #333;
          white-space: pre-wrap;
          font-family: inherit;
        }

        /* Signature */
        .signature-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-top: 25px;
          padding-top: 15px;
          border-top: 1px dashed #dee2e6;
        }
        .sig-col {
          text-align: center;
        }
        .sig-line {
          height: 1px;
          background: #495057;
          width: 80%;
          margin: 30px auto 5px auto;
        }
        .sig-col p {
          font-size: 11px;
          color: #495057;
          margin: 0;
        }

        /* Action Buttons */
        .no-print-toolbar {
          background: #111;
          color: #fff;
          padding: 12px 25px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 9999;
          margin: -30px -30px 30px -30px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        }
        .toolbar-title {
          font-size: 13px;
          font-weight: bold;
          font-family: sans-serif;
        }
        .toolbar-actions {
          display: flex;
          gap: 10px;
        }
        .btn {
          padding: 6px 14px;
          font-size: 12px;
          font-weight: bold;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-family: sans-serif;
          transition: transform 0.1s;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: #ffd600; color: #000; }
        .btn-secondary { background: #333; color: #ccc; border: 1px solid #444; }
      </style>
    </head>
    <body>
      <div class="no-print-toolbar no-print">
        <span class="toolbar-title">📝 PREVISUALIZAÇÃO DE IMPRESSÃO (CONTROLE DE ROTAS RODOVAR)</span>
        <div class="toolbar-actions">
          <button class="btn btn-secondary" onclick="window.close()">Fechar Guia</button>
          <button class="btn btn-primary" onclick="window.print()">Imprimir Roteiro</button>
        </div>
      </div>

      <div class="print-header">
        <div class="logo-area">
          <h1>RODOVAR MONITORA</h1>
          <span>Logística & Transporte de Cargas</span>
        </div>
        <div class="meta-area">
          <p style="margin:0 0 4px 0"><strong>Emitido em:</strong> ${dateStr}</p>
          <p style="margin:0"><strong>Operador:</strong> Sistema Rodovar</p>
        </div>
      </div>

      <div class="stats-bar">
        <div>
          <div class="stat-card-title">Total de Rotas</div>
          <div class="stat-card-val">${totalCargas}</div>
        </div>
        <div>
          <div class="stat-card-title">Distância Total</div>
          <div class="stat-card-val">${totalKm.toLocaleString('pt-BR')} km</div>
        </div>
        <div>
          <div class="stat-card-title">Saldo Líquido</div>
          <div class="stat-card-val">${options.showFinance ? `R$ ${saldoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}</div>
        </div>
        <div>
          <div class="stat-card-title font-bold text-[#ffd600]">Status</div>
          <div class="stat-card-val" style="font-size:12px; color:#555; font-weight:normal; margin-top:3px;">Pronto p/ Emissão</div>
        </div>
      </div>

      <div class="routes-container">
        ${cardsHtml}
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 450);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

export default function DeliveryList({
  entregas,
  onSelectDelivery,
  onRefresh,
  searchFilter,
  setSearchFilter,
  statusFilter,
  setStatusFilter,
  onAddDelivery
}: DeliveryListProps) {
  const getActiveUserFullName = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.displayName) {
          return parsed.displayName;
        }
      } catch {
        // Ignored
      }
    }
    return 'Jairo Bahia';
  };

  const getActiveUserRole = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && parsed.role) {
          return parsed.role;
        }
      } catch {}
    }
    return '';
  };

  const getActiveUserId = (): string => {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        const parsed = JSON.parse(active);
        if (parsed && (parsed.uid || parsed.username || parsed.id)) {
          return String(parsed.uid || parsed.username || parsed.id);
        }
      } catch {}
    }
    const name = getActiveUserFullName();
    return name.toLowerCase().replace(/\s+/g, '_');
  };

  const currentOperadorNome = getActiveUserFullName();
  const currentOperadorId = getActiveUserId();
  
  const [origemFilter, setOrigemFilter] = useState('');
  const [destinoFilter, setDestinoFilter] = useState('');
  const [dataColetaFilter, setDataColetaFilter] = useState('');
  const [clienteFilter, setClienteFilter] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [isComercialOpen, setIsComercialOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Phone clipboard copy helper with visual indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPhone = (e: React.MouseEvent, phone: string, idKey: string) => {
    e.stopPropagation();
    if (!phone) return;
    // Strip non-numeric/spurious formatting if desired, or keep as plain text. Let's write the display format.
    navigator.clipboard.writeText(phone);
    setCopiedId(idKey);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  // Dynamically populate vendedor names from our central DB sync cache
  const vendedoresList = useMemo(() => {
    return getUniqueVendedores().filter(Boolean).sort();
  }, [entregas]);

  // Handle click outside event to automatically collapse dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsComercialOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // (Scrolling & Virtualization hooks removed for steady, tremor-free native layout scrolling)

  // Initialize the pagination, search, and real-time slice synchronizer hook
  const {
    loadedEntregas,
    loading,
    loadingMore,
    hasMore,
    totalCount,
    loadedCount,
    setFilters,
    loadMore,
    indexWarning
  } = usePaginatedEntregas({
    status: statusFilter,
    origem: origemFilter,
    destino: destinoFilter,
    dataColeta: dataColetaFilter,
    cliente: clienteFilter,
    search: searchFilter,
    vendedor: vendedorFilter
  });

  // Debouncing filters to prevent excess Firebase reads during active keystrokes
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({
        status: statusFilter,
        origem: origemFilter,
        destino: destinoFilter,
        dataColeta: dataColetaFilter,
        cliente: clienteFilter,
        search: searchFilter,
        vendedor: vendedorFilter
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [statusFilter, origemFilter, destinoFilter, dataColetaFilter, clienteFilter, searchFilter, vendedorFilter]);

  // Handle auto infinite scrolling when nearing bottom of page
  useEffect(() => {
    const handleInfiniteScroll = () => {
      if (!hasMore || loadingMore || loading) return;
      
      // Calculate remaining scroll height
      const threshold = 350; // trigger distance in pixels from bottom
      const scrolledToBottom = 
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - threshold;
      
      if (scrolledToBottom) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleInfiniteScroll);
    return () => window.removeEventListener('scroll', handleInfiniteScroll);
  }, [hasMore, loadingMore, loading, loadMore]);

  // (Virtualization slicing calculations removed for tremor-free rendering)

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
      
      if (window.falarRodovar) {
        window.falarRodovar(`${importedCount} novas cargas importadas com sucesso absoluto para monitoramento.`);
      }

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
    { value: 'descarregando', label: 'Descarregando' },
    { value: 'entregue', label: 'Entregue' }
  ];

  const handleClearFilters = () => {
    setSearchFilter('');
    setOrigemFilter('');
    setDestinoFilter('');
    setDataColetaFilter('');
    setClienteFilter('');
    setStatusFilter('all');
    setVendedorFilter('');
  };

  // Filter Logic grounded on high performance secure cursor paginated lists
  const filteredEntregas = loadedEntregas;

  // States for Print Routes Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSelectedIds, setPrintSelectedIds] = useState<string[]>([]);
  const [printShowFinance, setPrintShowFinance] = useState(true);
  const [printShowObs, setPrintShowObs] = useState(true);
  const [printShowSignature, setPrintShowSignature] = useState(true);
  const [printSearchQuery, setPrintSearchQuery] = useState('');

  const handleOpenPrintModal = () => {
    if (selectedIds.length > 0) {
      setPrintSelectedIds([...selectedIds]);
    } else {
      setPrintSelectedIds(filteredEntregas.map(e => e.id));
    }
    setPrintSearchQuery('');
    setIsPrintModalOpen(true);
  };

  const handleTogglePrintItem = (id: string) => {
    setPrintSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleAllPrintItems = (currentListIds: string[]) => {
    const allSelected = currentListIds.every(id => printSelectedIds.includes(id));
    if (allSelected) {
      setPrintSelectedIds(prev => prev.filter(id => !currentListIds.includes(id)));
    } else {
      setPrintSelectedIds(prev => Array.from(new Set([...prev, ...currentListIds])));
    }
  };

  const printFilteredEntregas = useMemo(() => {
    return filteredEntregas.filter(e => {
      if (!printSearchQuery.trim()) return true;
      const q = printSearchQuery.toLowerCase().trim();
      return (
        (e.motorista || '').toLowerCase().includes(q) ||
        (e.vendedor || '').toLowerCase().includes(q) ||
        (e.cliente || '').toLowerCase().includes(q) ||
        (e.origem || '').toLowerCase().includes(q) ||
        (e.destino || '').toLowerCase().includes(q) ||
        (e.id || '').toLowerCase().includes(q)
      );
    });
  }, [filteredEntregas, printSearchQuery]);

  const handleExecutePrint = () => {
    const deliveriesToPrint = filteredEntregas.filter(e => printSelectedIds.includes(e.id));
    if (deliveriesToPrint.length === 0) {
      alert('Selecione pelo menos uma rota para imprimir.');
      return;
    }
    printDeliveries(deliveriesToPrint, {
      showFinance: printShowFinance,
      showObs: printShowObs,
      showSignature: printShowSignature
    });
  };

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
    window.open(url, 'whatsapp');
  };

  const getWhatsappDriverMsg = (entrega: Entrega) => {
    const trackingLink = generateTrackerLink({
      cargoId: entrega.id,
      driver: entrega.motorista,
      route: `${entrega.origem} -> ${entrega.destino}`,
      client: entrega.cliente || 'Central'
    });

    return `Olá, ${entrega.motorista}! Sou o ${getActiveUserFullName()} da Rodovar.

Por favor, acesse o link abaixo e clique em "ATIVAR RASTREAMENTO AO VIVO" para habilitar o rastreamento GPS em tempo real de sua viagem com destino a ${entrega.destino}:

Link do Rastreio: ${trackingLink}

Tenha uma ótima e segura viagem!`;
  };

  const getWhatsappClientMsg = (entrega: Entrega) => {
    return `Olá! Sou o ${getActiveUserFullName()} da Rodovar Transportadora. Sua carga para ${entrega.destino} está a caminho. O motorista ${entrega.motorista} está em deslocamento com previsão para ${entrega.prazo}. Qualquer dúvida estou por aqui!`;
  };

  const handleDirectRequestClientLoc = (ev: React.MouseEvent, e: Entrega) => {
    ev.stopPropagation();
    const cleanPhone = (e.tel_cliente || '').replace(/\D/g, '');
    const clientName = e.cliente || 'Parceiro';
    let msg = '';
    if (e.status === 'coletando') {
      msg = `Olá ${clientName}! Sou o ${getActiveUserFullName()} da Rodovar. Nosso motorista ${e.motorista} já está iniciando a coleta da sua mercadoria com destino a ${e.destino}. Por favor, envie-nos o link exato da sua localização de entrega no Google de forma a garantir que o motorista faça a entrega com máxima precisão e rapidez. Muito obrigado!`;
    } else {
      msg = `Olá ${clientName}! Sou o ${getActiveUserFullName()} da Rodovar. Tudo bem? Poderia nos agilizar o envio do link do Google Maps da sua localização de entrega para a rota com destino a ${e.destino}? Assim já cadastramos no roteirizador do motorista. Agradecemos pela parceria!`;
    }
    const url = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, 'whatsapp');
  };

  const renderLocationReminderBadge = (e: Entrega) => {
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top action toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold font-sans tracking-tight flex items-center gap-2">
            🚚 PAINEL DE CARGAS 
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-gray-400">
              Total Geral: <strong className="text-emerald-450 font-bold">{totalCount}</strong>
            </span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-gray-400">
              Carregadas: <strong className="text-[#FFD600] font-bold">{loadedCount}</strong>
            </span>
            {hasMore ? (
              <span className="text-[9px] text-[#FFD600] opacity-80 animate-pulse font-semibold ml-1">
                (Role a página para mais cargas se necessário)
              </span>
            ) : totalCount > 0 && (
              <span className="text-[9.5px] text-zinc-650 ml-1">
                (Todas as cargas carregadas)
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          {onAddDelivery && getActiveUserRole() !== 'Visitante' && (
            <button
              onClick={onAddDelivery}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black uppercase text-xs font-mono font-black tracking-wider rounded-lg transition-all cursor-pointer"
              id="list-add-delivery-btn"
            >
              <Truck className="w-3.5 h-3.5 text-black shrink-0" />
              Cadastrar Carga
            </button>
          )}

          <button
            onClick={handleExportToCSV}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] uppercase text-xs font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer text-gray-300"
            id="list-export-excel"
          >
            <Download className="w-3.5 h-3.5 text-[#FFD600]" />
            Exportar Excel
          </button>

          <button
            onClick={handleOpenPrintModal}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-[#FFD600] uppercase text-xs font-mono font-bold tracking-wider rounded-lg transition-all cursor-pointer text-gray-300"
            id="list-print-routes"
          >
            <Printer className="w-3.5 h-3.5 text-[#FFD600]" />
            Imprimir Rotas
          </button>
        </div>
      </div>

      {/* Tabs and Comercial Team filter combined */}
      <div className="border-b border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-1 md:pb-0">
        <div className="flex overflow-x-auto whitespace-nowrap scrollbar-thin">
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

        {/* Dropdown for Equipe Comercial */}
        <div className="flex items-center gap-2 self-end md:self-center pr-2" ref={dropdownRef}>
          <div className="relative inline-block text-left">
            <button
              type="button"
              onClick={() => setIsComercialOpen(!isComercialOpen)}
              className={`inline-flex justify-center items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-mono font-bold tracking-wider border uppercase transition-all cursor-pointer h-9 ${
                vendedorFilter 
                ? 'bg-zinc-900 text-[#FFD600] border-[#FFD600] shadow-[0_0_10px_rgba(255,214,0,0.1)]'
                : 'bg-zinc-900/40 text-gray-400 border-zinc-800/80 hover:text-white hover:border-zinc-700/80'
              }`}
              id="comercial-team-dropdown-btn"
            >
              <span>💼 Equipe de Atendentes{vendedorFilter ? `: ${vendedorFilter}` : ''}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${isComercialOpen ? 'rotate-180 text-[#FFD600]' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isComercialOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl shadow-2xl bg-zinc-950 border border-zinc-800/90 focus:outline-none z-[1050] overflow-hidden">
                <div className="p-1 max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                  <button
                    onClick={() => {
                      setVendedorFilter('');
                      setIsComercialOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-left w-full px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900 border-b border-zinc-900/40 rounded-lg hover:text-[#FFD600] transition-colors"
                  >
                    <span>👥</span>
                    <span className="font-sans font-semibold">Mostrar Todos os Atendentes</span>
                  </button>
                  <div className="my-1"></div>
                  {vendedoresList.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-zinc-500 font-mono italic text-center">
                      Nenhum atendente registrado no sistema de cargas.
                    </div>
                  ) : (
                    vendedoresList.map((vend) => (
                      <button
                        key={vend}
                        onClick={() => {
                          setVendedorFilter(vend);
                          setIsComercialOpen(false);
                        }}
                        className={`flex items-center justify-between text-left w-full px-3 py-1.5 my-0.5 text-xs font-mono truncate rounded-lg hover:bg-zinc-900 transition-colors ${
                          vendedorFilter === vend 
                          ? 'text-[#FFD600] font-extrabold bg-[#FFD600]/5' 
                          : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2">👤 {vend}</span>
                        {vendedorFilter === vend && <span className="text-[#FFD600] text-[10px] font-bold">●</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Structured Filters board */}
      <div className="bg-[#121212] border border-zinc-950 p-4 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#FFD600]" />
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-gray-300">Filtros Avançados</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Text search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por motorista, atendente, etc..."
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

          {/* Cliente Filter */}
          <div className="relative">
            <Truck className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Cliente (Ex: Valec)"
              value={clienteFilter}
              onChange={(e) => setClienteFilter(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-mono"
              id="filter-cliente"
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

        {(searchFilter || origemFilter || destinoFilter || dataColetaFilter || clienteFilter || statusFilter !== 'all' || vendedorFilter) && (
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
                onClick={handleOpenPrintModal}
                className="px-3 py-1.5 border border-[#FFD600]/80 hover:border-[#FFD600] bg-zinc-900/60 hover:bg-zinc-900 text-[#FFD600] rounded-lg text-[10px] font-mono font-bold uppercase cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-[#FFD600]/5"
              >
                <Printer className="w-3.5 h-3.5 text-[#FFD600]" />
                Imprimir ({selectedIds.length})
              </button>
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

      {/* Index Build status warning board */}
      {indexWarning && (
        <div className="p-3.5 bg-yellow-950/20 border border-yellow-900/40 rounded-xl text-yellow-450 text-xs font-mono flex items-center gap-3 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span>
            <strong>Aviso de Indexação:</strong> O Firebase está gerando os índices de busca (origem, destino, cliente, motorista). Cargas mais antigas podem demorar alguns segundos a mais para carregar durante esse processo automático.
          </span>
        </div>
      )}

      {/* Main Table List */}
      <div className="bg-[#121212] border border-zinc-800 rounded-xl overflow-hidden">
        {loading && filteredEntregas.length === 0 ? (
          <div>
            {/* Shimmer skeleton screen for mobile */}
            <div className="block lg:hidden space-y-3 p-4 bg-zinc-950/30">
              {Array.from({ length: 6 }).map((_, i) => (
                <MobileSkeletonCard key={i} />
              ))}
            </div>

            {/* Shimmer skeleton rows for desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1260px] text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-950/80 border-b border-zinc-800 text-gray-400 font-mono uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4 w-10 text-center"></th>
                    <th className="py-3 px-4 min-w-[200px]">Rota / Vendedor</th>
                    <th className="py-3 px-4 min-w-[130px]">Coleta / Prazo</th>
                    <th className="py-3 px-4 min-w-[190px]">Cliente</th>
                    <th className="py-3 px-4 min-w-[160px]">Motorista</th>
                    <th className="py-3 px-4 min-w-[120px]">Valores / Fretes</th>
                    <th className="py-3 px-4 text-center min-w-[100px]">Status</th>
                    <th className="py-3 px-4 text-center min-w-[300px]">Contatos Rápidos (WhatsApp)</th>
                    <th className="py-3 px-4 text-right min-w-[60px]">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 font-sans">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <DesktopSkeletonRow key={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : filteredEntregas.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-medium space-y-2">
            <div className="text-3xl">📭</div>
            <p className="text-sm">Nenhuma carga encontrada com os filtros selecionados.</p>
            <p className="text-xs text-gray-600 font-mono">Experimente ajustar sua pesquisa ou use a busca por voz.</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards List View */}
            <div className="block lg:hidden">
              {/* Mobile Select-all Top Bar */}
              <div className="p-3.5 px-4 bg-zinc-950/50 border-b border-zinc-900/60 flex items-center justify-between text-[11px] font-mono text-gray-400">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={filteredEntregas.length > 0 && filteredEntregas.every(e => selectedIds.includes(e.id))}
                    onChange={handleToggleAll}
                    className="rounded border-zinc-800 bg-zinc-900 text-[#FFD600] focus:ring-[#FFD600] focus:ring-offset-0 cursor-pointer w-4 h-4"
                    id="bulk-select-all-checkbox-mobile"
                  />
                  <span className="font-bold">SELECIONAR TODAS ({filteredEntregas.length})</span>
                </label>
                {selectedIds.length > 0 && (
                  <button 
                    onClick={() => setSelectedIds([])}
                    className="text-red-400 hover:text-red-300 font-bold uppercase tracking-wider text-[10px] cursor-pointer"
                  >
                    Desmarcar ({selectedIds.length})
                  </button>
                )}
              </div>

              <div className="divide-y divide-zinc-900 bg-zinc-950/30 relative">
                {loadedEntregas.map(e => {
                  const badge = statusBadgeStyle[e.status] || { bg: 'bg-zinc-900', text: 'text-gray-400', label: e.status, icon: Clock };
                  const BadgeIcon = badge.icon;

                  return (
                    <div 
                      key={e.id} 
                      className="p-4 space-y-3 hover:bg-zinc-900/10 transition-colors animate-fade-in"
                    >
                    {/* Header Row: Checkbox, Route, Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="pt-0.5" onClick={(ev) => ev.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={selectedIds.includes(e.id)}
                            onChange={() => handleToggleRow(e.id)}
                            className="rounded border-zinc-800 bg-zinc-900 text-[#FFD600] focus:ring-[#FFD600] focus:ring-offset-0 cursor-pointer w-4 h-4"
                            id={`row-select-checkbox-mobile-${e.id}`}
                          />
                        </div>
                        <div className="space-y-0.5" onClick={() => onSelectDelivery(e.id)}>
                          <div className="flex items-center gap-1.5 flex-wrap font-bold text-gray-100">
                            <span>{e.origem}</span>
                            <ArrowRight className="w-3 h-3 text-zinc-500" />
                            <span className="text-[#FFD600]">{e.destino}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 font-mono m-0">
                            Aten: {cleanVendedorName(e.vendedor) || 'Sem registro'} • <span className="text-[#FFD600] font-semibold">{getDeliveryKm(e).toLocaleString('pt-BR')} km</span>
                            {e.created_at && (
                              <>
                                <span className="text-zinc-650"> •</span> Hora Cad: <span className="text-zinc-300 font-bold">{formatRegistrationTime(e.created_at)}</span>
                              </>
                            )}
                          </p>
                          {renderLocationReminderBadge(e)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold ${badge.bg} ${badge.text}`} onClick={() => onSelectDelivery(e.id)}>
                          <BadgeIcon className="w-2.5 h-2.5" />
                          {badge.label}
                        </span>

                        {/* Inserir <AcompanharBadge /> aqui, logo após o badge de status */}
                        <AcompanharBadge
                          freteId={e.id}
                          operadorId={currentOperadorId}
                          operadorNome={currentOperadorNome}
                          acompanhando={e.acompanhando}
                          compact
                        />
                      </div>
                    </div>

                    {/* Middle Row: Key Info Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-950/40 border border-zinc-900/60 p-3 rounded-lg" onClick={() => onSelectDelivery(e.id)}>
                      <div onClick={(ev) => ev.stopPropagation()} className="cursor-default">
                        <span className="text-gray-500 font-mono block text-[9px] uppercase tracking-wider font-bold">Cliente</span>
                        <span className="font-semibold text-gray-300 block truncate max-w-full mb-1">{e.cliente}</span>
                        <div 
                          onClick={(ev) => handleCopyPhone(ev, e.tel_cliente || '', `${e.id}-cli-phone`)}
                          className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all duration-200 cursor-pointer ${
                            copiedId === `${e.id}-cli-phone`
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                              : 'bg-zinc-900/65 border-zinc-800 hover:border-zinc-700 text-gray-400 hover:text-white'
                          }`}
                          title="Clique para copiar"
                        >
                          {copiedId === `${e.id}-cli-phone` ? (
                            <>
                              <CheckCircle className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                              <span className="font-bold text-[9px]">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <span>{e.tel_cliente || 'Sem Número'}</span>
                              {e.tel_cliente && <Clipboard className="w-2.5 h-2.5 text-zinc-500" />}
                            </>
                          )}
                        </div>
                      </div>
                      <div onClick={(ev) => ev.stopPropagation()} className="cursor-default">
                        <span className="text-gray-500 font-mono block text-[9px] uppercase tracking-wider font-bold">Motorista</span>
                        <span className="font-semibold text-gray-300 block truncate max-w-full mb-1">{e.motorista}</span>
                        <div 
                          onClick={(ev) => handleCopyPhone(ev, e.tel_motorista || '', `${e.id}-mot-phone`)}
                          className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all duration-200 cursor-pointer ${
                            copiedId === `${e.id}-mot-phone`
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                              : 'bg-zinc-900/65 border-zinc-800 hover:border-zinc-700 text-gray-400 hover:text-white'
                          }`}
                          title="Clique para copiar"
                        >
                          {copiedId === `${e.id}-mot-phone` ? (
                            <>
                              <CheckCircle className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                              <span className="font-bold text-[9px]">Copiado!</span>
                            </>
                          ) : (
                            <>
                              <span>{e.tel_motorista || 'Sem Número'}</span>
                              {e.tel_motorista && <Clipboard className="w-2.5 h-2.5 text-zinc-500" />}
                            </>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 font-mono block text-[9px] uppercase tracking-wider">Coleta</span>
                        <span className="font-mono text-gray-300 block mt-1 font-bold text-[11px]">{formatDateBR(e.data_coleta)}</span>
                      </div>
                      <div>
                        <span className="text-[#FFD600] font-mono block text-[10px] uppercase tracking-wider font-black">Prazo Limite</span>
                        <div className="mt-1 inline-flex items-center gap-1.5 bg-[#FFD600]/20 border-2 border-[#FFD600] rounded-lg px-2.5 py-1 text-[#FFD600] font-mono text-[13px] font-black shadow-[0_0_10px_rgba(255,214,0,0.15)]">
                          <span>{formatDateBR(e.prazo)}</span>
                        </div>
                      </div>
                      <div className="col-span-2 border-t border-zinc-900/40 pt-2 grid grid-cols-2 gap-2 text-[10px] font-sans">
                        <div>
                          <span className="text-emerald-500/80 font-mono block text-[8px] uppercase tracking-wider font-bold truncate">Frete Emp.</span>
                          <span className="font-mono text-emerald-400 block font-extrabold text-[11px] mt-0.5 truncate">
                            {e.frete_empresa ? `R$ ${Number(e.frete_empresa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                          </span>
                        </div>
                        <div>
                          <span className="text-orange-500/80 font-mono block text-[8px] uppercase tracking-wider font-bold truncate">Frete Mot.</span>
                          <span className="font-mono text-orange-400 block font-extrabold text-[11px] mt-0.5 truncate">
                            {e.frete_motorista ? `R$ ${Number(e.frete_motorista).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Row: Rapid Actions contacts and Select details */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap items-center gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                        {/* Pin link */}
                        {e.link_localizacao ? (
                          <a 
                            href={e.link_localizacao} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-1 px-2 rounded bg-zinc-850 hover:bg-[#FFD600]/10 border border-zinc-800 hover:border-[#FFD600] text-[#FFD600] flex items-center gap-1 text-[10px] font-mono font-bold transition-colors"
                            title="Ver Link de Localização do Motorista"
                            id={`list-action-loc-mobile-${e.id}`}
                          >
                            <MapPin className="w-3 h-3" />
                            Loc
                          </a>
                        ) : (
                          <button
                            disabled
                            className="p-1 px-2 rounded bg-zinc-900 border border-zinc-800 text-gray-600 flex items-center gap-0.5 text-[10px] font-mono cursor-not-allowed opacity-40 focus:outline-none"
                            id={`list-action-loc-none-mobile-${e.id}`}
                          >
                            <MapPin className="w-3 h-3" />
                            Sem Loc
                          </button>
                        )}

                        {/* WhatsApp Motorista */}
                        <button
                          onClick={() => openWhatsApp(e.tel_motorista, getWhatsappDriverMsg(e))}
                          className="p-1 px-2 rounded bg-emerald-950/40 hover:bg-emerald-600 hover:text-black border border-emerald-800 text-emerald-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                          id={`list-action-wa-motorista-mobile-${e.id}`}
                          title="Falar com o Motorista no WhatsApp"
                        >
                          <Phone className="w-2.5 h-2.5" />
                          <span>Motorista</span>
                        </button>

                        {/* WhatsApp Cliente */}
                        <button
                          onClick={() => openWhatsApp(e.tel_cliente, getWhatsappClientMsg(e))}
                          className="p-1 px-2 rounded bg-amber-950/40 hover:bg-amber-655 hover:text-black border border-amber-800 text-amber-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                          id={`list-action-wa-cliente-mobile-${e.id}`}
                        >
                          <Phone className="w-2.5 h-2.5" />
                          Cli
                        </button>

                        {/* Individual Delete Button */}
                        <button
                          onClick={() => setIndividualDeleteTarget(e)}
                          className="p-1 px-2 rounded bg-red-950/40 hover:bg-red-600 hover:text-white border border-red-900/60 text-red-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                          id={`list-action-delete-mobile-${e.id}`}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          Excluir
                        </button>
                      </div>

                      {/* Detail View Arrow */}
                      <button 
                        onClick={() => onSelectDelivery(e.id)}
                        className="p-1 px-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded transition cursor-pointer flex items-center gap-1 text-[11px]"
                        id={`list-action-view-mobile-${e.id}`}
                      >
                        Ver Detalhes
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                );
              })}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[1260px] text-left border-collapse text-xs">
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
                    <th className="py-3 px-4 min-w-[200px]">Rota / Vendedor</th>
                    <th className="py-3 px-4 min-w-[130px]">Coleta / Prazo</th>
                    <th className="py-3 px-4 min-w-[190px]">Cliente</th>
                    <th className="py-3 px-4 min-w-[160px]">Motorista</th>
                    <th className="py-3 px-4 min-w-[120px]">Valores / Fretes</th>
                    <th className="py-3 px-4 text-center min-w-[100px]">Status</th>
                    <th className="py-3 px-4 text-center min-w-[300px]">Contatos Rápidos (WhatsApp)</th>
                    <th className="py-3 px-4 text-right min-w-[60px]">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 font-sans relative">
                  {loadedEntregas.map(e => {
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
                            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1.5 flex-wrap">
                              <span>Aten: {cleanVendedorName(e.vendedor) || 'Sem registro'}</span>
                              <span className="text-zinc-650">•</span>
                              <span className="text-[#FFD600] font-semibold">{getDeliveryKm(e).toLocaleString('pt-BR')} km</span>
                              {e.created_at && (
                                <>
                                  <span className="text-zinc-650">•</span>
                                  <span>Hora Cad: <span className="text-zinc-300 font-bold">{formatRegistrationTime(e.created_at)}</span></span>
                                </>
                              )}
                            </div>
                            {renderLocationReminderBadge(e)}
                          </div>
                        </td>

                        {/* Dates */}
                        <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                          <div className="flex flex-col gap-1.5">
                            <div className="text-zinc-300 font-mono text-[11px] font-bold">Coleta: {formatDateBR(e.data_coleta)}</div>
                            <div className="inline-flex items-center gap-1.5 bg-[#FFD600]/20 border-2 border-[#FFD600] text-[#FFD600] font-mono text-xs font-black px-2.5 py-1 rounded-lg w-fit shadow-[0_0_8px_rgba(255,214,0,0.15)]" title="Prazo Limite de Entrega">
                              <span className="text-[9px] uppercase font-black opacity-90">Prazo:</span>
                              <span className="text-[12px]">{formatDateBR(e.prazo)}</span>
                            </div>
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-200">{e.cliente}</span>
                            <div className="mt-1" onClick={(ev) => ev.stopPropagation()}>
                              <div 
                                onClick={(ev) => handleCopyPhone(ev, e.tel_cliente || '', `${e.id}-dt-cli`)}
                                className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all duration-200 cursor-pointer ${
                                  copiedId === `${e.id}-dt-cli`
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-855'
                                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-gray-400 hover:text-white'
                                }`}
                                title="Clique para copiar telefone do cliente"
                              >
                                {copiedId === `${e.id}-dt-cli` ? (
                                  <>
                                    <CheckCircle className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                                    <span className="font-bold text-[9px]">Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{e.tel_cliente || 'Sem Número'}</span>
                                    {e.tel_cliente && <Clipboard className="w-2.5 h-2.5 text-zinc-500" />}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Driver */}
                        <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-200">{e.motorista}</span>
                            <div className="mt-1" onClick={(ev) => ev.stopPropagation()}>
                              <div 
                                onClick={(ev) => handleCopyPhone(ev, e.tel_motorista || '', `${e.id}-dt-mot`)}
                                className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-all duration-200 cursor-pointer ${
                                  copiedId === `${e.id}-dt-mot`
                                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-855'
                                    : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-gray-400 hover:text-white'
                                }`}
                                title="Clique para copiar telefone do motorista"
                              >
                                {copiedId === `${e.id}-dt-mot` ? (
                                  <>
                                    <CheckCircle className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                                    <span className="font-bold text-[9px]">Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <span>{e.tel_motorista || 'Sem Número'}</span>
                                    {e.tel_motorista && <Clipboard className="w-2.5 h-2.5 text-zinc-500" />}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Valores / Fretes */}
                        <td className="py-3.5 px-4" onClick={() => onSelectDelivery(e.id)}>
                          <div className="flex flex-col gap-0.5 whitespace-nowrap">
                            <div className="text-emerald-400 font-mono font-extrabold text-[11px]">
                              Emp: {e.frete_empresa ? `R$ ${Number(e.frete_empresa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                            </div>
                            <div className="text-orange-400 font-mono font-bold text-[10px]">
                              Mot: {e.frete_motorista ? `R$ ${Number(e.frete_motorista).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                            </div>
                          </div>
                        </td>

                        {/* status Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.text}`} onClick={() => onSelectDelivery(e.id)}>
                              <BadgeIcon className="w-3 h-3" />
                              {badge.label}
                            </span>

                            {/* Inserir <AcompanharBadge /> aqui, logo após o badge de status */}
                            <AcompanharBadge
                              freteId={e.id}
                              operadorId={currentOperadorId}
                              operadorNome={currentOperadorNome}
                              acompanhando={e.acompanhando}
                            />
                          </div>
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
                              className="p-1 px-1.5 rounded bg-emerald-950/40 hover:bg-emerald-600 hover:text-black border border-emerald-800 text-emerald-400 flex items-center gap-1 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                              title="Falar com o Motorista no WhatsApp"
                              id={`list-action-wa-motorista-${e.id}`}
                            >
                              <Phone className="w-2.5 h-2.5" />
                              <span>Motorista</span>
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
          </>
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

      {/* Selection & Optimization Print Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-fade-in">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
            
            {/* Header */}
            <div className="border-b border-zinc-800 p-5 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#FFD600]" />
                <div>
                  <h3 className="text-sm font-bold font-sans uppercase tracking-wider text-white">Impressor de Rotas Profissional</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Selecione as rotas e customize opções antes de gerar a listagem impressa moderna</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPrintModalOpen(false)}
                className="text-gray-405 hover:text-white transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider font-mono border border-zinc-800 px-2.5 py-1 rounded bg-zinc-900"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Content body split into Options panel (left) and Routes checklist (right) */}
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-zinc-800 flex-1 overflow-hidden">
              
              {/* Left/Sidebar: Configuration Controls */}
              <div className="w-full lg:w-80 p-5 space-y-5 overflow-y-auto bg-zinc-900/25 shrink-0">
                <h4 className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold pb-2 border-b border-zinc-800/60">Opções de Impressão</h4>
                
                <div className="space-y-4">
                  {/* Option 1: Financial values */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={printShowFinance}
                      onChange={(e) => setPrintShowFinance(e.target.checked)}
                      className="mt-1 rounded bg-zinc-950 border-zinc-800 text-[#FFD650] focus:ring-0 cursor-pointer focus:ring-offset-0 focus:outline-none"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-200 group-hover:text-[#FFD600] transition-colors">Exibir Valores Financeiros</span>
                      <p className="text-[10px] text-gray-500 mt-0.5">Inclui Frete Empresa, Frete Motorista e cálculo do Saldo Líquido.</p>
                    </div>
                  </label>

                  {/* Option 2: Observations */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={printShowObs}
                      onChange={(e) => setPrintShowObs(e.target.checked)}
                      className="mt-1 rounded bg-zinc-950 border-zinc-800 text-[#FFD650] focus:ring-0 cursor-pointer focus:ring-offset-0 focus:outline-none"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-200 group-hover:text-[#FFD600] transition-colors">Exibir Observações</span>
                      <p className="text-[10px] text-gray-500 mt-0.5">Mostra notas, endereços detalhados ou informações de apoio.</p>
                    </div>
                  </label>

                  {/* Option 3: Driver Signature Field */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input 
                      type="checkbox"
                      checked={printShowSignature}
                      onChange={(e) => setPrintShowSignature(e.target.checked)}
                      className="mt-1 rounded bg-zinc-950 border-zinc-800 text-[#FFD650] focus:ring-0 cursor-pointer focus:ring-offset-0 focus:outline-none"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-200 group-hover:text-[#FFD600] transition-colors">Campos de Assinatura</span>
                      <p className="text-[10px] text-gray-500 mt-0.5">Adiciona recibo de despacho com linhas para motorista e recebedor.</p>
                    </div>
                  </label>
                </div>

                {/* Print Stats summary */}
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 space-y-3 font-mono">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">Resumo do Lote</span>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Selecionadas:</span>
                    <span className="text-white font-bold">{printSelectedIds.length} de {filteredEntregas.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Distância Total:</span>
                    <span className="text-white font-bold">
                      {filteredEntregas
                        .filter(e => printSelectedIds.includes(e.id))
                        .reduce((sum, e) => sum + (e.km || 0), 0)
                        .toLocaleString('pt-BR')} km
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Routes checklist and search */}
              <div className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar rotas na lista por motorista, vendedor, cliente, cidades..."
                      value={printSearchQuery}
                      onChange={(e) => setPrintSearchQuery(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white rounded-lg pl-9 pr-3 py-2 focus:border-[#FFD600] focus:ring-0 focus:outline-none placeholder-gray-500 font-sans"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleAllPrintItems(printFilteredEntregas.map(e => e.id))}
                      className="px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-gray-300 hover:text-white rounded-lg text-xs font-mono font-bold cursor-pointer transition-colors"
                    >
                      {printFilteredEntregas.every(e => printSelectedIds.includes(e.id)) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </button>
                  </div>
                </div>

                {/* Checklist Container */}
                <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950 divide-y divide-zinc-900 scrollbar-thin">
                  {printFilteredEntregas.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-500 font-mono">
                      Nenhuma carga encontrada para imprimir com os critérios atuais.
                    </div>
                  ) : (
                    printFilteredEntregas.map((e) => {
                      const isChecked = printSelectedIds.includes(e.id);
                      return (
                        <div 
                          key={e.id}
                          onClick={() => handleTogglePrintItem(e.id)}
                          className={`p-3.5 flex items-center gap-4 hover:bg-zinc-900/40 cursor-pointer transition-colors ${
                            isChecked ? 'bg-[#FFD600]/5' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Handled by parent div onClick
                            className="rounded bg-zinc-900 border-zinc-800 text-[#FFD600] focus:ring-0 cursor-pointer pointer-events-none"
                          />
                          
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2 items-center text-xs font-sans">
                            <div className="space-y-0.5">
                              <span className="font-mono text-[10px] text-[#FFD600] font-bold block">ID: {e.id.slice(0, 8)}...</span>
                              <span className="text-[10px] text-gray-400 font-mono">{e.data_coleta ? new Date(e.data_coleta + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'}</span>
                            </div>
                            
                            <div className="truncate">
                              <span className="text-[10px] text-gray-500 block uppercase font-mono tracking-tight font-bold">Atendente / Cliente</span>
                              <span className="text-white font-bold">{cleanVendedorName(e.vendedor) || 'Sem Atendente'}</span>
                              <span className="text-gray-400 block truncate">{e.cliente || 'Sem Cliente'}</span>
                            </div>

                            <div className="truncate">
                              <span className="text-[10px] text-gray-500 block uppercase font-mono tracking-tight font-bold">Carga / Rota</span>
                              <span className="text-gray-200 block truncate font-mono text-[11px]">{e.origem} ➔ {e.destino}</span>
                              <span className="text-gray-400 block">{e.km ? `${e.km.toLocaleString('pt-BR')} km` : '0 km'}</span>
                            </div>

                            <div className="truncate">
                              <span className="text-[10px] text-gray-500 block uppercase font-mono tracking-tight font-bold">Motorista & Status</span>
                              <span className="text-white font-bold block truncate">{e.motorista || 'Sem motorista'}</span>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase font-mono font-bold mt-0.5 ${
                                e.status === 'entregue' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' :
                                e.status === 'em_transito' ? 'bg-yellow-950/40 text-[#FFD600] border border-yellow-900/50' :
                                e.status === 'parado' ? 'bg-red-950/40 text-red-400 border border-red-900/50' :
                                'bg-blue-950/40 text-blue-400 border border-blue-900/50'
                              }`}>
                                {e.status === 'entregue' ? 'Entregue ✅' :
                                 e.status === 'em_transito' ? 'Trânsito 🚚' :
                                 e.status === 'parado' ? 'Parado 🛑' :
                                 'Coletando 📦'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Actions footer */}
            <div className="border-t border-zinc-800 p-5 bg-zinc-950 flex items-center justify-end gap-3 font-sans">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 border border-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-900/50 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecutePrint}
                disabled={printSelectedIds.length === 0}
                className={`px-5 py-2 rounded-lg text-xs font-extrabold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 ${
                  printSelectedIds.length > 0 
                  ? 'bg-[#FFD600] text-black hover:bg-[#ffe23b] shadow-lg shadow-[#FFD600]/20' 
                  : 'bg-zinc-850 text-zinc-600 cursor-not-allowed border border-zinc-800'
                }`}
              >
                <Printer className="w-4 h-4 shrink-0" />
                Imprimir Roteiro Selecionado ({printSelectedIds.length})
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
