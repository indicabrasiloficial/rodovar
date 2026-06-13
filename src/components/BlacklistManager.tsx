import React, { useState, useEffect } from 'react';
import { 
  getBlacklist, 
  saveToBlacklist, 
  removeFromBlacklist, 
  subscribeToBlacklistRealtime
} from '../db/storage';
import { BlacklistMotorista } from '../types';
import { 
  UserX, 
  Trash2, 
  Plus, 
  Search, 
  AlertTriangle, 
  ShieldAlert, 
  Calendar, 
  Phone, 
  FileText, 
  X,
  UserCheck,
  Building,
  User
} from 'lucide-react';

interface BlacklistManagerProps {
  currentUser: {
    username: string;
    nome: string;
    role: string;
  } | null;
}

export default function BlacklistManager({ currentUser }: BlacklistManagerProps) {
  const [blacklist, setBlacklist] = useState<BlacklistMotorista[]>([]);
  const [search, setSearch] = useState('');
  
  // Form State
  const [nome, setNome] = useState('');
  const [cpfOrCnpj, setCpfOrCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [observacao, setObservacao] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [confirmingDriver, setConfirmingDriver] = useState<BlacklistMotorista | null>(null);

  // Sync with Firestore Real-time listeners
  useEffect(() => {
    setBlacklist(getBlacklist());
    const unsubscribeM = subscribeToBlacklistRealtime(() => {
      setBlacklist(getBlacklist());
    });

    return () => {
      unsubscribeM();
    };
  }, []);

  // Format CPF or CNPJ (Dynamic)
  const formatCpfCnpj = (value: string) => {
    const rawVal = value.replace(/\D/g, '');
    let formatted = rawVal;
    
    // CPF Format (11 digits): 000.000.000-00
    if (rawVal.length <= 11) {
      if (rawVal.length > 3) {
        formatted = `${rawVal.slice(0, 3)}.${rawVal.slice(3)}`;
      }
      if (rawVal.length > 6) {
        formatted = `${formatted.slice(0, 7)}.${rawVal.slice(6)}`;
      }
      if (rawVal.length > 9) {
        formatted = `${formatted.slice(0, 11)}-${rawVal.slice(9, 11)}`;
      }
      return formatted.slice(0, 14);
    } 
    // CNPJ Format (14 digits): 00.000.000/0000-00
    else {
      if (rawVal.length > 2) {
        formatted = `${rawVal.slice(0, 2)}.${rawVal.slice(2)}`;
      }
      if (rawVal.length > 5) {
        formatted = `${formatted.slice(0, 6)}.${rawVal.slice(5)}`;
      }
      if (rawVal.length > 8) {
        formatted = `${formatted.slice(0, 10)}/${rawVal.slice(8)}`;
      }
      if (rawVal.length > 12) {
        formatted = `${formatted.slice(0, 15)}-${rawVal.slice(12, 14)}`;
      }
      return formatted.slice(0, 18);
    }
  };

  // Format Phone ((00) 00000-0000)
  const formatPhone = (value: string) => {
    const rawVal = value.replace(/\D/g, '');
    let formatted = rawVal;
    if (rawVal.length > 0) {
      formatted = `(${rawVal}`;
    }
    if (rawVal.length > 2) {
      formatted = `(${rawVal.slice(0, 2)}) ${rawVal.slice(2)}`;
    }
    if (rawVal.length > 7) {
      formatted = `(${rawVal.slice(0, 2)}) ${rawVal.slice(2, 7)}-${rawVal.slice(7, 11)}`;
    }
    return formatted.slice(0, 15);
  };

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpfOrCnpj(formatCpfCnpj(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTelefone(formatPhone(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!nome.trim()) {
      setErrorMsg('O nome do motorista é obrigatório.');
      return;
    }

    // CPF/CNPJ is completely optional! If filled, validate lengths
    const cleanDoc = cpfOrCnpj.replace(/\D/g, '');
    if (cleanDoc) {
      if (cleanDoc.length !== 11) {
        setErrorMsg('Por favor, informe um CPF válido (11 dígitos) ou deixe o campo em branco.');
        return;
      }
    }

    const cleanPhone = telefone.replace(/\D/g, '');
    if (cleanPhone) {
      if (cleanPhone.length < 10) {
        setErrorMsg('Por favor, informe um telefone válido com DDD ou deixe o campo em branco.');
        return;
      }
    }

    if (!observacao.trim()) {
      setErrorMsg('Informe o motivo ou ocorrência da restrição no campo de observação.');
      return;
    }

    const operatorName = currentUser?.nome || currentUser?.username || 'Operador Rodovar';

    try {
      // Enforce uniqueness only if optional field is informed
      if (cleanDoc) {
        const duplicateCPF = blacklist.find(b => b.cpf && b.cpf.replace(/\D/g, '') === cleanDoc);
        if (duplicateCPF) {
          setErrorMsg(`Este CPF já está listado na Lista Negra de Motoristas (Cadastrado como: ${duplicateCPF.nome}).`);
          return;
        }
      }

      if (cleanPhone) {
        const duplicatePhone = blacklist.find(b => b.telefone && b.telefone.replace(/\D/g, '') === cleanPhone);
        if (duplicatePhone) {
          setErrorMsg(`Este telefone já está listado na Lista Negra de Motoristas (Cadastrado como: ${duplicatePhone.nome}).`);
          return;
        }
      }

      saveToBlacklist({
        nome: nome.trim(),
        cpf: cpfOrCnpj.trim(),
        telefone: telefone.trim(),
        observacao: observacao.trim(),
        created_at: new Date().toISOString(),
        usuarioNome: operatorName
      });

      setSuccessMsg('Motorista bloqueado e adicionado à Lista Negra com sucesso!');

      // Voice alert feedback
      if (window.falarRodovar) {
        window.falarRodovar('Motorista adicionado ao controle de segurança.');
      }

      // Clear Form state
      setNome('');
      setCpfOrCnpj('');
      setTelefone('');
      setObservacao('');
      setIsAdding(false);

      // Auto clear feedback message
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg('Erro ao salvar registro de segurança: ' + err.message);
    }
  };

  const handleRemoveMotorista = (driver: BlacklistMotorista) => {
    setConfirmingDriver(driver);
  };

  // Searching and Filtering lists
  const filteredListDrivers = blacklist.filter(item => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const itemCpf = item.cpf || '';
    const itemPhone = item.telefone || '';
    return (
      item.nome.toLowerCase().includes(q) ||
      itemCpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      itemPhone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      item.observacao.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5" id="blacklist-root">
      
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-red-950/40 bg-[#0e0a0a] shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-950/50 rounded-lg text-red-500 border border-red-900/30">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tighter text-[#FFD600] m-0">
              AUDITORIA & SEGURANÇA: LISTA NEGRA
            </h2>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5 uppercase">
              Gerencie cadastros sob restrição do sistema Rodovar
            </p>
          </div>
        </div>
        
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setErrorMsg('');
          }}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase font-sans flex items-center gap-1.5 cursor-pointer transition-all ${
            isAdding 
              ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' 
              : 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
          }`}
          id="btn-toggle-add-blacklist"
        >
          {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {isAdding ? 'Cancelar Cadastro' : 'Bloquear Motorista'}
        </button>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3.5 bg-red-950/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-mono flex items-start gap-2.5 shadow-sm animate-shake">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-green-950/30 border border-green-500/30 text-green-400 rounded-lg text-xs font-mono flex items-start gap-2.5 shadow-sm">
          <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Form Section */}
      {isAdding && (
        <div className="p-4 rounded-xl border border-zinc-800 bg-[#0c0c0e] shadow-lg animate-fadeIn">
          <h3 className="text-xs font-extrabold uppercase font-sans tracking-wider text-red-500 mb-3.5 flex items-center gap-1.5">
            <UserX className="w-4 h-4" /> Registrar Restrição para Motorista
          </h3>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">
                Nome Completo do Motorista *
              </label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: João Silva de Oliveira"
                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-650 focus:border-red-600 focus:outline-none transition-colors"
                id="blacklist-input-nome"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">
                CPF do Motorista (Opcional)
              </label>
              <input
                type="text"
                value={cpfOrCnpj}
                onChange={handleCpfCnpjChange}
                placeholder="000.000.000-00"
                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-650 focus:border-red-600 focus:outline-none transition-colors font-mono"
                id="blacklist-input-cpf"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">
                Telefone / WhatsApp (Opcional)
              </label>
              <input
                type="text"
                value={telefone}
                onChange={handlePhoneChange}
                placeholder="(00) 00000-0000"
                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-650 focus:border-red-600 focus:outline-none transition-colors font-mono"
                id="blacklist-input-telefone"
              />
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block font-bold">
                Motivo do Bloqueio / Depoimento / Ocorrência detalhada *
              </label>
              <textarea
                required
                rows={3}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Descreva detalhadamente a infração, sinistro comercial, inadimplência crítica, cancelamento indevido ou anomalias."
                className="w-full bg-[#121214] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-650 focus:border-red-600 focus:outline-none transition-colors"
                id="blacklist-input-observacao"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-3.5 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-bold uppercase rounded-lg hover:bg-zinc-850 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase rounded-lg shadow-md cursor-pointer flex items-center gap-1.5"
                id="blacklist-btn-submit"
              >
                <ShieldAlert className="w-4 h-4" />
                Confirmar Bloqueio Permanente
              </button>
            </div>

          </form>
        </div>
      )}

      {/* List Search and Data Grid */}
      <div className="p-4 rounded-xl border border-zinc-850 bg-[#0a0a0c] space-y-4">
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder={`Pesquisar registro bloqueado por Nome, CPF/CNPJ ou Telefone...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#101012] border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-550 focus:border-[#FFD600] focus:outline-none transition-colors"
            id="blacklist-search-input"
          />
        </div>

        {/* Counter */}
        <div className="flex justify-between items-center text-[10px] uppercase font-mono text-zinc-400 border-b border-zinc-900 pb-2">
          <span>{filteredListDrivers.length} de {blacklist.length} motorista(s) listado(s)</span>
          <span className="text-red-400 font-bold hidden sm:inline">Aviso: Cadastro no sistema é bloqueado se houver CPF coincidente</span>
        </div>

        {/* Main Grid Card layout */}
        {filteredListDrivers.length === 0 ? (
          <div className="p-10 text-center font-mono border border-dashed border-zinc-850 rounded-lg text-zinc-600 text-xs">
            {search ? '⚠️ Nenhum motorista corresponde à busca realizada.' : '✅ Nenhum motorista na Lista Negra no momento.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredListDrivers.map((driver) => (
              <div 
                key={driver.id}
                className="p-4 rounded-lg bg-zinc-900/35 border border-red-950/30 hover:border-red-900/40 transition-all flex flex-col md:flex-row justify-between items-start gap-4 relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600"></div>

                <div className="space-y-2.5 pl-2 max-w-3xl flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-extrabold text-white sm:text-base leading-none">
                      {driver.nome}
                    </h4>
                    {driver.cpf && (
                      <span className="text-[9px] font-mono font-bold bg-red-950/60 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full uppercase shrink-0">
                        CPF: {driver.cpf}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-zinc-400">
                    {driver.telefone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                        Contato/Zap: <strong className="text-gray-300 font-mono">{driver.telefone}</strong>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-550 shrink-0" />
                      Data Ocorrência: <strong className="text-gray-300 font-mono">{new Date(driver.created_at).toLocaleString('pt-BR')}</strong>
                    </span>
                    {driver.usuarioNome && (
                      <span className="flex items-center gap-1.5 sm:col-span-2 text-[11px] text-zinc-500 font-mono">
                        👤 Cadastrado por: <strong className="text-zinc-400 font-sans">{driver.usuarioNome}</strong>
                      </span>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-[#0e0a0a] border border-red-950/20 text-red-300/90 text-[11px] leading-relaxed flex gap-2">
                    <FileText className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] uppercase font-bold text-red-400 font-mono block mb-1">MOTIVO DO BLOQUEIO:</span>
                      <p className="whitespace-pre-line text-zinc-350 font-sans">{driver.observacao}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveMotorista(driver)}
                  className="px-3.5 py-1.5 self-end md:self-center bg-zinc-950 hover:bg-green-600 hover:text-white border border-zinc-800 text-zinc-400 font-extrabold uppercase font-mono text-[10px] rounded-lg transition-all flex items-center gap-1 cursor-pointer hover:shadow-md shrink-0"
                  id={`btn-remove-blacklist-${driver.id}`}
                >
                  <UserCheck className="w-3.5 h-3.5 text-green-500" />
                  Liberar Condutor
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Confirmation Modal for Liberating Motorista */}
      {confirmingDriver && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-sm animate-fadeIn" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-md p-6 rounded-2xl border border-zinc-800 bg-[#0e0e11] shadow-2xl space-y-4 font-sans text-left">
            <div className="flex items-center gap-3 text-red-500 border-b border-zinc-900 pb-3">
              <div className="p-2 bg-emerald-950/40 rounded-lg text-emerald-400 border border-emerald-900/30">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-white tracking-tight">
                  Liberar Condutor Credenciado
                </h3>
                <p className="text-[10px] font-mono text-zinc-400">
                  Validação de segurança Rodovar Auditoria
                </p>
              </div>
            </div>
            
            <div className="text-xs text-zinc-300 space-y-3">
              <p className="leading-relaxed">
                Você deseja remover o motorista <strong className="text-[#FFD600]">{confirmingDriver.nome}</strong> {confirmingDriver.cpf && `(CPF: ${confirmingDriver.cpf})`} da Lista Negra de segurança?
              </p>
              
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-900/40 font-mono text-[10.5px] text-zinc-400 leading-relaxed">
                <strong className="text-red-400 uppercase text-[9px] block mb-1">Motivo do Bloqueio:</strong>
                <p className="whitespace-pre-line bg-zinc-900/20 p-1.5 rounded border border-zinc-900/30 text-zinc-350">{confirmingDriver.observacao}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingDriver(null)}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-855 border border-zinc-800 text-zinc-400 text-xs font-bold uppercase rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    removeFromBlacklist(confirmingDriver.id);
                    setSuccessMsg(`Motorista "${confirmingDriver.nome}" removido do cadastro de restrições de viagem.`);
                    setConfirmingDriver(null);
                    if (window.falarRodovar) {
                      window.falarRodovar(`Motorista ${confirmingDriver.nome} liberado.`);
                    }
                    setTimeout(() => setSuccessMsg(''), 4000);
                  } catch (err: any) {
                    setErrorMsg('Erro ao remover motorista: ' + err.message);
                    setConfirmingDriver(null);
                  }
                }}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded-lg shadow-md cursor-pointer flex items-center gap-1.5"
                id="confirm-liberar-motorista"
              >
                <UserCheck className="w-4 h-4" />
                Confirmar Liberação
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
