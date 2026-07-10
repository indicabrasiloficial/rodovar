import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Search, 
  Trash2, 
  Calendar, 
  User, 
  AlertTriangle, 
  RefreshCw,
  Filter,
  Bot
} from 'lucide-react';
import { subscribeToSystemLogs, clearSystemLogs, SystemLog } from '../db/storage';

interface ActivityLogsProps {
  currentUser: {
    username: string;
    displayName: string;
    role: string;
  } | null;
}

export default function ActivityLogs({ currentUser }: ActivityLogsProps) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToSystemLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleClearLogs = async () => {
    if (currentUser?.role !== 'Master') {
      alert("Apenas o perfil Administrador do Suporte possui permissão para limpar o histórico de atividades.");
      return;
    }

    if (!window.confirm("⚠️ ATENÇÃO: Esta ação é irreversível! Deseja realmente apagar todo o histórico de auditoria de atividades do sistema?")) {
      return;
    }

    setLoading(true);
    await clearSystemLogs();
    setLoading(false);
  };

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'Login':
      case 'Entrada no Sistema':
        return 'bg-blue-900/40 text-blue-300 border-blue-500/30';
      case 'Logout':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700/50';
      case 'Cadastro de Carga':
        return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30';
      case 'Alteração de Carga':
        return 'bg-amber-900/40 text-amber-300 border-amber-500/30';
      case 'Exclusão de Carga':
        return 'bg-red-900/40 text-red-300 border-red-500/30';
      case 'Cadastro de Colaborador':
        return 'bg-purple-900/40 text-purple-300 border-purple-500/30';
      case 'Exclusão de Colaborador':
        return 'bg-rose-900/40 text-rose-300 border-rose-500/30';
      case 'Backup Exportado':
        return 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30';
      case 'Backup Restaurado':
        return 'bg-cyan-900/40 text-cyan-300 border-cyan-500/30';
      case 'Limpeza de Logs':
        return 'bg-orange-900/40 text-orange-300 border-orange-500/30';
      case 'Comando Telegram':
        return 'bg-[#FFD600]/15 text-[#FFD600] border-[#FFD600]/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.userDisplayName.toLowerCase().includes(search.toLowerCase()) ||
      log.username.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase());

    if (filterAction === 'all') return matchesSearch;
    if (filterAction === 'login') return matchesSearch && (log.action === 'Login' || log.action === 'Entrada no Sistema' || log.action === 'Logout');
    if (filterAction === 'cargas') return matchesSearch && log.action.includes('Carga');
    if (filterAction === 'colaboradores') return matchesSearch && log.action.includes('Colaborador');
    if (filterAction === 'backups') return matchesSearch && log.action.includes('Backup');
    if (filterAction === 'telegram') return matchesSearch && (log.action === 'Comando Telegram' || log.userRole === 'Telegram');
    
    return matchesSearch;
  });

  return (
    <div id="activity-logs-container" className="flex flex-col h-full bg-zinc-950 text-zinc-100 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/10 rounded-xl border border-indigo-500/20 text-indigo-400">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Auditoria de Atividades
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                Master Only
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Registro em tempo real de todas as ações dos colaboradores, alterações de cargas, backups e logins.
            </p>
          </div>
        </div>

        {currentUser?.role === 'Master' && (
          <button
            id="clear-logs-btn"
            onClick={handleClearLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-950/40 text-red-400 hover:bg-red-900/30 border border-red-500/30 hover:border-red-500/50 rounded-xl text-sm font-medium transition-all"
          >
            <Trash2 size={16} />
            Limpar Histórico
          </button>
        )}
      </div>

      {/* Filters and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-7 relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
            <Search size={18} />
          </span>
          <input
            id="logs-search-input"
            type="text"
            placeholder="Pesquisar por colaborador, ação ou detalhes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
        </div>

        <div className="md:col-span-5 flex items-center gap-3">
          <span className="text-zinc-400 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap">
            <Filter size={14} />
            Filtrar:
          </span>
          <select
            id="logs-action-filter"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          >
            <option value="all">Todas as Ações</option>
            <option value="login">Somente Logins</option>
            <option value="cargas">Cadastro e Alteração de Cargas</option>
            <option value="colaboradores">Gestão de Colaboradores</option>
            <option value="backups">Exportação e Importação de Backups</option>
            <option value="telegram">Comandos do Telegram</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-3">
            <RefreshCw className="animate-spin text-indigo-400" size={28} />
            <p className="text-sm">Carregando logs de auditoria...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-500">
            <AlertTriangle size={36} className="text-zinc-600 mb-3" />
            <p className="font-semibold text-zinc-400 text-sm">Nenhum registro de atividade encontrado</p>
            <p className="text-xs text-zinc-500 max-w-md mt-1.5">
              Experimente alterar os filtros de pesquisa ou aguarde novas atividades serem desencadeadas por outros colaboradores do sistema.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table id="activity-logs-table" className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 z-10">
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-400 tracking-wider w-48">Timestamp</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-400 tracking-wider w-60">Colaborador</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-400 tracking-wider w-56">Ação</th>
                  <th className="px-6 py-4 text-xs font-semibold text-zinc-400 tracking-wider">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    className="hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                      <Calendar size={12} className="text-zinc-500" />
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700/50 text-xs font-medium">
                          {log.userRole === 'Telegram' ? (
                            <Bot className="w-3.5 h-3.5 text-[#FFD600]" />
                          ) : (
                            log.userDisplayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{log.userDisplayName}</p>
                          <p className="text-[10px] text-zinc-500 font-mono tracking-wider">
                            @{log.username} • {log.userRole}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium border rounded-full ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-300 break-words max-w-xl">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bg-zinc-900/40 px-6 py-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-medium">
          <span>Mostrando {filteredLogs.length} de {logs.length} registros</span>
          <span className="font-mono">Realtime Enabled</span>
        </div>
      </div>
    </div>
  );
}
