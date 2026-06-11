import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Entrega, DeliveryStatus } from '../types';
import { 
  getUniqueVendedores, 
  getUniqueClientes, 
  getUniqueMotoristas, 
  saveEntrega,
  getEntregaById,
  setEditLock,
  clearEditLock,
  getBlacklist,
  subscribeToBlacklistRealtime,
  getEntregas
} from '../db/storage';
import { geocodeCity } from '../db/geocoder';
import { 
  ArrowLeft, 
  Save, 
  Calculator, 
  Compass, 
  User, 
  Briefcase, 
  Phone, 
  Navigation, 
  Check, 
  Database,
  HelpCircle,
  Loader2,
  Lock,
  AlertTriangle,
  Coins,
  ShieldAlert,
  TrendingUp,
  AlertCircle,
  Clipboard
} from 'lucide-react';

interface DeliveryFormProps {
  entregaId?: string; // If present, edit mode
  onBack: () => void;
  onSaved: (savedId: string) => void;
  onImportClick?: () => void;
}

interface FormInputs {
  data_coleta: string;
  vendedor: string;
  cliente: string;
  tel_cliente: string;
  motorista: string;
  tel_motorista: string;
  cpf_motorista: string;
  origem: string;
  destino: string;
  frete_empresa: number;
  frete_motorista: number;
  valor_carga: number;
  prazo: string;
  status: DeliveryStatus;
  observacoes: string;
  link_localizacao: string;
  canhoto_solicitado: boolean;
}

export default function DeliveryForm({ entregaId, onBack, onSaved, onImportClick }: DeliveryFormProps) {
  const isEditMode = !!entregaId;
  const [isStatusBlocked, setIsStatusBlocked] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [activeUser, setActiveUser] = useState({ username: 'sistema', displayName: 'Sistema', role: 'Operador Rodovar' });
  const [isLockedByAnother, setIsLockedByAnother] = useState(false);
  const [lockedUserInfo, setLockedUserInfo] = useState<{ nome: string; usuario: string; timestamp: string } | null>(null);
  const [forceEdit, setForceEdit] = useState(false);

  useEffect(() => {
    const userStored = localStorage.getItem('rodovar_active_login_v2');
    let userObj = { username: 'sistema', displayName: 'Sistema', role: 'Operador Rodovar' };
    if (userStored) {
      try {
        userObj = JSON.parse(userStored);
        setActiveUser(userObj);
      } catch {
        // Ignore
      }
    }

    if (isEditMode && entregaId && !forceEdit) {
      const delivery = getEntregaById(entregaId);
      if (delivery && delivery.editando_por) {
        const diffMs = new Date().getTime() - new Date(delivery.editando_por.timestamp).getTime();
        const MINUTES_5 = 5 * 60 * 1000;
        if (delivery.editando_por.usuario !== userObj.username && diffMs < MINUTES_5) {
          setIsLockedByAnother(true);
          setLockedUserInfo(delivery.editando_por);
          return;
        }
      }
      setEditLock(entregaId, userObj.displayName, userObj.username);
    }
  }, [isEditMode, entregaId, forceEdit]);

  useEffect(() => {
    return () => {
      if (isEditMode && entregaId && activeUser.username) {
        const delivery = getEntregaById(entregaId);
        if (delivery?.editando_por?.usuario === activeUser.username) {
          clearEditLock(entregaId);
        }
      }
    };
  }, [isEditMode, entregaId, activeUser.username]);

  const handleForceEdit = () => {
    if (entregaId && activeUser.username) {
      setEditLock(entregaId, activeUser.displayName, activeUser.username);
      setIsLockedByAnother(false);
      setForceEdit(true);
      if (window.falarRodovar) {
        window.falarRodovar('Você assumiu o controle de edição deste cadastro.');
      }
    }
  };
  
  // Autocomplete lists from database storage
  const vendedoresList = useMemo(() => getUniqueVendedores(), []);
  const clientesList = useMemo(() => getUniqueClientes(), []);
  const motoristasList = useMemo(() => getUniqueMotoristas(), []);

  // UI control states for predictive auto-complete dropdowns
  const [showVendedorSuggestions, setShowVendedorSuggestions] = useState(false);
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);
  const [showMotoristaSuggestions, setShowMotoristaSuggestions] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormInputs>({
    defaultValues: {
      data_coleta: new Date().toISOString().split('T')[0],
      vendedor: '',
      cliente: '',
      tel_cliente: '',
      motorista: '',
      tel_motorista: '',
      cpf_motorista: '',
      origem: '',
      destino: '',
      frete_empresa: 0,
      frete_motorista: 0,
      valor_carga: 0,
      prazo: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      status: 'coletando',
      observacoes: '',
      link_localizacao: '',
      canhoto_solicitado: false
    }
  });

  const [blacklist, setBlacklist] = useState<any[]>([]);
  useEffect(() => {
    setBlacklist(getBlacklist());
    const unsub = subscribeToBlacklistRealtime(() => {
      setBlacklist(getBlacklist());
    });
    return unsub;
  }, []);

  const watchVendedor = watch('vendedor') || '';
  const watchCliente = watch('cliente') || '';
  const watchMotorista = watch('motorista') || '';
  const watchValorCarga = watch('valor_carga') || 0;
  const watchCpf = watch('cpf_motorista') || '';
  const watchTel = watch('tel_motorista') || '';

  const matchedBlockedDriver = useMemo(() => {
    const cleanWatchCpf = watchCpf.replace(/\D/g, '').trim();
    const cleanWatchTel = watchTel.replace(/\D/g, '').trim();
    
    if (!cleanWatchCpf && !cleanWatchTel) return null;
    
    return blacklist.find(b => {
      const bCpf = b.cpf ? b.cpf.replace(/\D/g, '').trim() : '';
      const bTel = b.telefone ? b.telefone.replace(/\D/g, '').trim() : '';
      
      const cpfMatch = cleanWatchCpf && bCpf && bCpf === cleanWatchCpf;
      const telMatch = cleanWatchTel && bTel && bTel === cleanWatchTel;
      
      return cpfMatch || telMatch;
    });
  }, [watchCpf, watchTel, blacklist]);

  // Helpers for CPF styling
  const formatCPF = (value: string) => {
    const rawVal = value.replace(/\D/g, '');
    let formatted = rawVal;
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
  };

  const getRiskCategoryDetailsByVal = (val: number) => {
    if (val >= 1000000) {
      return {
        label: 'Risco Máximo Diamante 💎 - Escolta e Blindagem Requerida',
        color: 'text-rose-400 border-rose-500/30 bg-rose-950/20',
        icon: <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />,
        desc: 'Cargas acima de R$ 1 Milhão necessitam de escolta armada nível 3 e monitoramento satelital minuto a minuto.',
        alertStatus: true
      };
    } else if (val >= 500000) {
      return {
        label: 'Risco Crítico Ouro 🥇 - Monitoramento Nível III',
        color: 'text-amber-400 border-amber-500/30 bg-amber-950/20',
        icon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
        desc: 'Cargas entre R$ 500 Mil e R$ 1 Milhão requerem iscas de carga ativas e monitoramento de paradas não programadas.',
        alertStatus: true
      };
    } else if (val >= 100000) {
      return {
        label: 'Alto Risco Prata 🥈 - Monitoramento Nível II',
        color: 'text-indigo-400 border-indigo-500/30 bg-indigo-950/20',
        icon: <AlertTriangle className="w-4 h-4 text-indigo-400 animate-fade-in" />,
        desc: 'Cargas de R$ 100 Mil a R$ 500 Mil exigem controle de rota rigoroso e cerca eletrônica de destino ativada.',
        alertStatus: true
      };
    } else if (val >= 50000) {
      return {
        label: 'Médio Risco Bronze 🥉 - Monitoramento Nível I',
        color: 'text-[#FFD600] border-[#FFD600]/30 bg-[#FFD600]/5',
        icon: <AlertCircle className="w-4 h-4 text-[#FFD600]" />,
        desc: 'Cargas de R$ 50 Mil a R$ 100 Mil de risco moderado. Monitoramento por check-points e telefone.',
        alertStatus: true
      };
    } else {
      return {
        label: 'Risco Padrão Comum - Operação Normal',
        color: 'text-gray-400 border-zinc-800 bg-zinc-900/30',
        icon: <Check className="w-4 h-4 text-emerald-400" />,
        desc: 'Cargas de baixo valor. Operação padrão sem exigência de gerenciamento de risco especial.',
        alertStatus: false
      };
    }
  };

  // Load existing records for edit mode
  useEffect(() => {
    if (isEditMode && entregaId) {
      const data = getEntregaById(entregaId);
      if (data) {
        setIsStatusBlocked(false);
        reset({
          data_coleta: data.data_coleta,
          vendedor: data.vendedor,
          cliente: data.cliente,
          tel_cliente: data.tel_cliente,
          motorista: data.motorista,
          tel_motorista: data.tel_motorista,
          cpf_motorista: data.cpf_motorista || '',
          origem: data.origem,
          destino: data.destino,
          frete_empresa: data.frete_empresa,
          frete_motorista: data.frete_motorista,
          valor_carga: data.valor_carga || 0,
          prazo: data.prazo,
          status: data.status,
          observacoes: data.observacoes,
          link_localizacao: data.link_localizacao || '',
          canhoto_solicitado: data.canhoto_solicitado
        });
      }
    }
  }, [isEditMode, entregaId, reset]);

  // Handle Autocomplete fills
  const selectVendedor = (value: string) => {
    setValue('vendedor', value);
    setShowVendedorSuggestions(false);
  };

  const selectCliente = (nome: string, tel: string) => {
    setValue('cliente', nome);
    setValue('tel_cliente', tel);
    setShowClienteSuggestions(false);
  };

  const selectMotorista = (nome: string, tel: string) => {
    setValue('motorista', nome);
    setValue('tel_motorista', tel);
    const pastDelivery = getEntregas().find(e => e.motorista === nome && e.cpf_motorista);
    if (pastDelivery && pastDelivery.cpf_motorista) {
      setValue('cpf_motorista', pastDelivery.cpf_motorista);
    }
    setShowMotoristaSuggestions(false);
  };

  // Main Form Submit handler
  const onSubmit = async (data: FormInputs) => {
    if (matchedBlockedDriver) {
      if (window.falarRodovar) {
        window.falarRodovar("Cadastro recusado! Este operador de caminhão foi listado no sistema de segurança.");
      }
      return;
    }

    setIsGeocoding(true);
    let coords = { lat: -23.5505, lng: -46.6333 }; // Default SPM SP

    try {
      if (data.destino) {
        // Run OpenStreetMap geocoding query dynamically on destination
        coords = await geocodeCity(data.destino);
      }
    } catch (e) {
      console.warn('Geocoding error:', e);
    }

    // Preserve existing coords in edit mode unless destination has changed
    if (isEditMode && entregaId) {
      const existing = getEntregaById(entregaId);
      if (existing && existing.destino.toLowerCase().trim() === data.destino.toLowerCase().trim()) {
        coords.lat = existing.lat;
        coords.lng = existing.lng;
      }
    }

    // No status block restriction

    const payload: Partial<Entrega> = {
      ...data,
      frete_empresa: Number(data.frete_empresa || 0),
      frete_motorista: Number(data.frete_motorista || 0),
      valor_carga: Number(data.valor_carga || 0),
      lat: coords.lat,
      lng: coords.lng,
      updated_at: new Date().toISOString()
    };

    if (isEditMode) {
      payload.id = entregaId;
    }

    const saved = saveEntrega(payload);
    setIsGeocoding(false);

    if (window.falarRodovar) {
      if (isEditMode) {
        window.falarRodovar(`Carga para ${payload.destino} atualizada com sucesso!`);
      } else {
        window.falarRodovar(`Nova carga cadastrada com destino a ${payload.destino || 'destino informado'}.`);
      }
    }

    onSaved(saved.id);
  };

  if (isLockedByAnother && lockedUserInfo) {
    return (
      <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-2xl max-w-md mx-auto text-center space-y-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] mt-12 animate-fade-in" id="edit-lockout-container">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-[#FFD600] rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,214,0,0.1)]">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-mono uppercase tracking-widest text-[#FFD600] font-bold">
            🔒 Cadastro Bloqueado
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans max-w-sm mx-auto">
            Para evitar conflitos de dados e salvamento duplicado, este cadastro de carga está temporariamente bloqueado para edição.
          </p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-left space-y-3 font-mono text-xs text-zinc-300">
          <div className="flex justify-between border-b border-zinc-800/50 pb-2">
            <span className="text-zinc-500 font-bold uppercase text-[9px]">OPERADOR ATUAL:</span>
            <span className="font-bold text-[#FFD600] text-[11px] uppercase">{lockedUserInfo.nome}</span>
          </div>
          <div className="flex justify-between border-b border-zinc-800/50 pb-2">
            <span className="text-zinc-500 font-bold uppercase text-[9px]">SESSÃO USER:</span>
            <span className="text-zinc-400">@{lockedUserInfo.usuario}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 font-bold uppercase text-[9px]">INICIADA EM:</span>
            <span className="text-zinc-400">
              {new Date(lockedUserInfo.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={onBack}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-gray-300 border border-zinc-800 hover:border-zinc-700 font-mono text-xs font-bold py-2.5 rounded-lg transition-all uppercase tracking-wider cursor-pointer"
          >
            Voltar para o Monitoramento
          </button>
          
          <button
            onClick={handleForceEdit}
            className="w-full bg-[#FFD600] hover:bg-[#ffe23b] text-zinc-950 font-mono text-xs font-black py-2.5 rounded-lg transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.1)] active:scale-[0.99]"
          >
            <AlertTriangle className="w-4 h-4 text-black shrink-0" />
            Forçar Liberação e Edição
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition font-mono cursor-pointer"
            id="form-back-btn"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <div className="h-4 w-px bg-zinc-800"></div>
          <h2 className="text-lg font-bold font-sans tracking-tight">
            {isEditMode ? '📝 EDITAR CARGA MONITORADA' : '🚚 REGISTRAR NOVA CARGA RODOVAR'}
          </h2>
        </div>

        {!isEditMode && onImportClick && (
          <button
            type="button"
            onClick={onImportClick}
            className="flex items-center self-start sm:self-auto bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#FFD600] rounded-full px-4 py-1.5 gap-1.5 transition-all text-[10px] font-mono uppercase text-zinc-350 font-bold cursor-pointer"
            id="form-header-import-btn"
          >
            <Clipboard className="w-3.5 h-3.5 text-[#FFD600]" />
            <span>Importar Planilha (Ctrl+C/V)</span>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Structure Core Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main Module Panel Inputs */}
          <div className="lg:col-span-8 bg-[#121212] border border-zinc-800 rounded-xl p-6 space-y-6 shadow-sm">
            
            {/* Secao 1: Rota e datas */}
            <div>
              <h3 className="text-xs uppercase tracking-wider font-mono text-[#FFD600] mb-4 font-bold border-b border-zinc-950 pb-2">
                1. Informações de Rota, Coleta e Prazos
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Origem */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium">Cidade de Origem (Cidade-UF)</label>
                  <input
                    type="text"
                    placeholder="Ex: Camaçari-BA"
                    {...register('origem', { required: 'Origem é obrigatória' })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white uppercase focus:outline-none placeholder-gray-700"
                    id="form-input-origem"
                  />
                  {errors.origem && <p className="text-[10px] text-red-400 font-mono">{errors.origem.message}</p>}
                </div>

                {/* Destino */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1">
                    Cidade de Destino (Cidade-UF) 
                    <span className="text-[10px] text-zinc-500 font-mono">(Usa Mapa)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: São Luís-MA"
                    {...register('destino', { required: 'Destino é obrigatório' })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white uppercase focus:outline-none placeholder-gray-700"
                    id="form-input-destino"
                  />
                  {errors.destino && <p className="text-[10px] text-red-400 font-mono">{errors.destino.message}</p>}
                </div>

                {/* Data de Coleta */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium font-sans">Data de Coleta</label>
                  <input
                    type="date"
                    {...register('data_coleta', { required: 'Data de coleta é obrigatória' })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono"
                    id="form-input-datacoleta"
                  />
                  {errors.data_coleta && <p className="text-[10px] text-red-400 font-mono">{errors.data_coleta.message}</p>}
                </div>

                {/* Prazo de Entrega */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium font-sans text-[#FFD600]">Prazo Máximo de Entrega</label>
                  <input
                    type="date"
                    {...register('prazo', { required: 'Prazo é obrigatório' })}
                    className="w-full bg-zinc-950 border-2 border-[#FFD600]/40 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-[#FFD600] focus:outline-none font-mono"
                    id="form-input-prazo"
                  />
                  {errors.prazo && <p className="text-[10px] text-red-00 font-mono">{errors.prazo.message}</p>}
                </div>
              </div>
            </div>

            {/* Secao 2: Parceiros Envolvidos */}
            <div className="pt-2">
              <h3 className="text-xs uppercase tracking-wider font-mono text-[#FFD600] mb-4 font-bold border-b border-zinc-950 pb-2 flex items-center gap-2">
                👤 2. Agentes da Viagem (Motorista e Contratantes)
              </h3>
              
              {/* Box de detalhe do Motorista - com CPF e barreira de segurança de Lista Negra */}
              <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl space-y-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider font-black text-[#FFD600]">
                    Identificação do Motorista
                  </span>
                  {matchedBlockedDriver && (
                    <span className="text-[10px] uppercase font-mono font-bold text-red-500 animate-pulse">
                      🛑 BLOQUEIO ATIVO
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Motorista input */}
                  <div className="space-y-1.5 relative">
                    <label className="text-xs text-gray-400 font-medium flex items-center justify-between">
                      Nome do Motorista
                      <span className="text-[8px] text-zinc-550 font-mono">Autocomplete</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva"
                      {...register('motorista', { required: 'Nome do motorista é obrigatório' })}
                      onFocus={() => setShowMotoristaSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowMotoristaSuggestions(false), 200)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none placeholder-gray-700 font-sans"
                      id="form-input-motorista"
                    />
                    {errors.motorista && <p className="text-[10px] text-red-400 font-mono">{errors.motorista.message}</p>}
                    
                    {showMotoristaSuggestions && motoristasList.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-[#18181b] border border-zinc-800 rounded-lg max-h-36 overflow-y-auto shadow-2xl z-50 font-sans text-xs">
                        {motoristasList
                          .filter(m => m.nome.toLowerCase().includes(watchMotorista.toLowerCase()))
                          .map((m, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onMouseDown={() => selectMotorista(m.nome, m.tel)}
                              className="w-full text-left p-2 hover:bg-zinc-850 hover:text-[#FFD600] border-b border-zinc-900 transition-colors text-gray-300 flex justify-between font-mono text-[11px]"
                            >
                              <span>👤 {m.nome}</span>
                              <span className="text-gray-500">+{m.tel}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>

                  {/* CPF do Motorista */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">CPF do Motorista (Cadastro e Chave)</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      {...register('cpf_motorista', { 
                        required: 'CPF do motorista é requerido para faturamento de seguros',
                        onChange: (e) => {
                          setValue('cpf_motorista', formatCPF(e.target.value));
                        }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                      id="form-input-cpfmotorista"
                    />
                    {errors.cpf_motorista && <p className="text-[10px] text-red-400 font-mono">{errors.cpf_motorista.message}</p>}
                  </div>

                  {/* Telefone do Motorista */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">WhatsApp Motorista (DDD + Números)</label>
                    <input
                      type="text"
                      placeholder="99991223344"
                      {...register('tel_motorista', { 
                        required: 'Telefone do motorista é obrigatório',
                        pattern: { value: /^[0-9]+$/, message: 'Digite apenas números sem caracteres especiais' }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                      id="form-input-telmotorista"
                    />
                    {errors.tel_motorista && <p className="text-[10px] text-red-400 font-mono">{errors.tel_motorista.message}</p>}
                  </div>

                </div>

                {/* VISUAL BLACKLIST DETECTED PANEL !!! Model especial bonito pra Rodovar */}
                {matchedBlockedDriver && (
                  <div className="p-4 bg-red-950/40 border-2 border-red-600/70 rounded-xl space-y-3.5 text-red-100 animate-fadeIn shadow-[0_0_20px_rgba(220,38,38,0.15)]">
                    <div className="flex items-center gap-2 text-red-400 font-sans font-black tracking-widest text-xs border-b border-red-900/60 pb-2">
                      <ShieldAlert className="w-5 h-5 animate-pulse" />
                      <span>🚨 CENTRAL DE SEGURANÇA: MOTORISTA BLOQUEADO DETECTADO!</span>
                    </div>
                    
                    <div className="text-xs space-y-3">
                      <p className="font-sans leading-relaxed text-zinc-300">
                        O motorista identificado por coincidência de <strong className="text-[#FFD600]">CPF</strong> ou <strong className="text-[#FFD600]">WhatsApp</strong> está inserido na <strong className="text-red-400">LISTA NEGRA</strong> oficial da empresa. O faturamento e escalonamento deste processo foram bloqueados e nenhuma carga poderá ser salva para este operador.
                      </p>
                      
                      <div className="bg-[#0b0707] rounded-lg p-3.5 border border-red-950/70 font-mono text-[11px] space-y-2 text-zinc-300 shadow-inner">
                        <div className="flex flex-col sm:flex-row justify-between border-b border-red-950/30 pb-1.5 gap-1">
                          <span>👤 NOME DO BLOQUEADO:</span>
                          <strong className="text-white uppercase font-sans">{matchedBlockedDriver.nome}</strong>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between border-b border-red-950/30 pb-1.5 gap-1">
                          <span>💳 DOCUMENTO CPF:</span>
                          <strong className="text-red-400">{matchedBlockedDriver.cpf}</strong>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between border-b border-red-950/30 pb-1.5 gap-1">
                          <span>📱 ZAP DE CONTATO:</span>
                          <span className="text-gray-300 font-bold">{matchedBlockedDriver.telefone}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between border-b border-red-950/30 pb-1.5 gap-1">
                          <span>📅 DATA DA OCORRÊNCIA:</span>
                          <span className="text-zinc-400">{new Date(matchedBlockedDriver.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                        {matchedBlockedDriver.usuarioNome && (
                          <div className="flex flex-col sm:flex-row justify-between border-b border-red-950/30 pb-1.5 gap-1">
                            <span>👤 AUDITOR DO REGISTRO:</span>
                            <span className="text-zinc-400 font-sans font-bold">{matchedBlockedDriver.usuarioNome}</span>
                          </div>
                        )}
                        <div className="pt-1.5">
                          <span className="text-red-400 font-bold block uppercase text-[9px] mb-1">MOTIVOS E OBSERVAÇÕES REPORTADAS:</span>
                          <p className="font-sans text-zinc-300 text-xs bg-red-950/15 p-2 rounded-md border border-red-950/40 whitespace-pre-line leading-relaxed">
                            {matchedBlockedDriver.observacao}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Box de Clientes e Vendededores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Cliente comitente input with autocomplete options */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs text-gray-400 font-medium flex items-center justify-between">
                    Razão Social / Nome do Cliente
                    <span className="text-[9px] text-[#FFD600] font-mono font-medium">Histórico disponível</span>
                  </label>
                  <input
                    type="text"
                    placeholder="JV Alimentos"
                    {...register('cliente', { required: 'Cliente é obrigatório' })}
                    onFocus={() => setShowClienteSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 200)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none placeholder-gray-700 font-sans"
                    id="form-input-cliente"
                  />
                  {errors.cliente && <p className="text-[10px] text-red-400 font-mono">{errors.cliente.message}</p>}

                  {showClienteSuggestions && clientesList.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#18181b] border border-zinc-800 rounded-lg max-h-36 overflow-y-auto shadow-2xl z-50 font-sans text-xs">
                      {clientesList
                        .filter(c => c.nome.toLowerCase().includes(watchCliente.toLowerCase()))
                        .map((c, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onMouseDown={() => selectCliente(c.nome, c.tel)}
                            className="w-full text-left p-2 hover:bg-zinc-850 hover:text-[#FFD600] border-b border-zinc-900 transition-colors text-gray-300 flex justify-between font-mono text-[11px]"
                          >
                            <span>🏢 {c.nome}</span>
                            <span className="text-gray-500">+{c.tel}</span>
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Telefone Cliente */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium">DDD + WhatsApp Cliente (Numérico)</label>
                  <input
                    type="text"
                    placeholder="98981223344"
                    {...register('tel_cliente', { 
                      required: 'Telefone do cliente é obrigatório',
                      pattern: { value: /^[0-9]+$/, message: 'Apenas números sem espaços ou parênteses' }
                    })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                    id="form-input-telcliente"
                  />
                  {errors.tel_cliente && <p className="text-[10px] text-red-400 font-mono">{errors.tel_cliente.message}</p>}
                </div>

                {/* Vendedor input suggestions autocomplete */}
                <div className="space-y-1.5 relative sm:col-span-2">
                  <label className="text-xs text-gray-400 font-medium">Vendedor Externo Rodovar</label>
                  <input
                    type="text"
                    placeholder="Carlos Souza"
                    {...register('vendedor', { required: 'Vendedor é obrigatório' })}
                    onFocus={() => setShowVendedorSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVendedorSuggestions(false), 200)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none placeholder-gray-700 font-sans"
                    id="form-input-vendedor"
                  />
                  {errors.vendedor && <p className="text-[10px] text-red-00 font-mono">{errors.vendedor.message}</p>}

                  {showVendedorSuggestions && vendedoresList.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#18181b] border border-zinc-800 rounded-lg max-h-30 overflow-y-auto shadow-2xl z-50 font-sans text-xs">
                      {vendedoresList
                        .filter(v => v.toLowerCase().includes(watchVendedor.toLowerCase()))
                        .map((v, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onMouseDown={() => selectVendedor(v)}
                            className="w-full text-left p-2.5 hover:bg-zinc-850 hover:text-[#FFD600] border-b border-zinc-900 transition-colors text-gray-300 font-mono text-[11px]"
                          >
                            💼 {v}
                          </button>
                        ))
                      }
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Secao 3: Valores, Custos e Gerenciamento de Risco */}
            <div className="pt-2">
              <h3 className="text-xs uppercase tracking-wider font-mono text-[#FFD600] mb-4 font-bold border-b border-zinc-950 pb-2 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-[#FFD600]" />
                3. Valores, Riscos e Custos do Frete (R$)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Valor Comercial da Carga */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs text-gray-400 font-medium flex items-center justify-between">
                    <span className="flex items-center gap-1">Valor Comercial da Carga (R$) <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-zinc-500 font-mono">Gerenciamento de Risco Automatizado</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 font-mono text-xs">
                      R$
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...register('valor_carga', { 
                        required: 'Valor da carga é obrigatório',
                        valueAsNumber: true,
                        min: { value: 0, message: 'O valor da carga deve ser positivo' }
                      })}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 pl-9 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                      id="form-input-valor-carga"
                    />
                  </div>
                  {errors.valor_carga && <p className="text-[10px] text-red-400 font-mono">{errors.valor_carga.message}</p>}
                  
                  {/* Real-time Risk Category feedback panel */}
                  <div className={`mt-2.5 border rounded-xl p-3.5 text-xs flex gap-3 items-start transition-all duration-300 ${getRiskCategoryDetailsByVal(watchValorCarga).color}`}>
                    <div className="mt-0.5 shrink-0">
                      {getRiskCategoryDetailsByVal(watchValorCarga).icon}
                    </div>
                    <div className="space-y-1">
                      <div className="font-bold flex items-center gap-1.5 font-sans text-white">
                        {getRiskCategoryDetailsByVal(watchValorCarga).label}
                        {getRiskCategoryDetailsByVal(watchValorCarga).alertStatus && (
                          <span className="bg-red-600 text-white font-mono uppercase text-[8px] px-1.5 py-0.5 rounded animate-pulse font-black leading-none">
                            ALTO VALOR
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                        {getRiskCategoryDetailsByVal(watchValorCarga).desc}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Frete Empresa */}
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs text-gray-400 font-medium font-sans">Valor do Frete Empresa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register('frete_empresa', { 
                      valueAsNumber: true,
                      min: { value: 0, message: 'O valor do frete deve ser positivo' }
                    })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                    id="form-input-frete-empresa"
                  />
                  {errors.frete_empresa && <p className="text-[10px] text-red-400 font-mono">{errors.frete_empresa.message}</p>}
                </div>

                {/* Frete Motorista */}
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="text-xs text-gray-400 font-medium font-sans">Valor do Frete Motorista (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register('frete_motorista', { 
                      valueAsNumber: true,
                      min: { value: 0, message: 'O valor do frete do motorista deve ser positivo' }
                    })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                    id="form-input-frete-motorista"
                  />
                  {errors.frete_motorista && <p className="text-[10px] text-red-400 font-mono">{errors.frete_motorista.message}</p>}
                </div>
              </div>
            </div>

            {/* Secao 4: Observações gerais */}
            <div className="pt-2">
              <h3 className="text-xs uppercase tracking-wider font-mono text-gray-500 mb-3 font-bold border-b border-zinc-900 pb-2">
                4. Observações Operacionais da Carga
              </h3>
              
              <div className="space-y-1.5">
                <textarea
                  placeholder="Instruções especiais da transportadora, detalhes térmicos, motorista de apoio..."
                  rows={4}
                  {...register('observacoes')}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none placeholder-gray-800 font-sans"
                  id="form-input-observacoes"
                />
              </div>
            </div>

          </div>

          {/* Right Column: Values computations, general state indicators & Location inputs */}
          <div className="lg:col-span-4 space-y-6">

            {/* General Status Select option block */}
            <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#FFD600] border-b border-zinc-950 pb-2 block">
                Situação e Comprovante de Liberação
              </span>

              <div className="space-y-4">
                {/* Status selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium flex items-center gap-1">
                    Status de Monitoramento Operacional
                  </label>
                  <select
                    {...register('status')}
                    disabled={false}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] focus:ring-0 focus:outline-none rounded-lg p-2.5 text-xs text-white cursor-pointer"
                    id="form-input-status"
                  >
                    <option value="coletando">Coletando 📦</option>
                    <option value="em_transito">Trânsito 🚚</option>
                    <option value="parado">Parado 🛑</option>
                    <option value="entregue">Entregue ✅</option>
                  </select>
                </div>

                {/* Canhoto check */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="canhoto_solicitado"
                    {...register('canhoto_solicitado')}
                    className="w-4 h-4 rounded text-[#FFD600] bg-zinc-900 border-zinc-800 focus:ring-[#FFD600] focus:ring-offset-black accent-yellow-400 cursor-pointer"
                  />
                  <label htmlFor="canhoto_solicitado" className="text-xs text-gray-300 font-medium select-none cursor-pointer">
                    Canhoto já solicitado ou recebido?
                  </label>
                </div>
              </div>
            </div>

            {/* Live Location fields */}
            <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-gray-400 border-b border-zinc-900 pb-2 block">
                Link de Localização WhatsApp
              </span>

              <div className="space-y-1.5">
                <input
                  type="url"
                  placeholder="Link gerado pelo WhatsApp do motorista"
                  {...register('link_localizacao')}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-800"
                  id="form-input-link"
                />
                <p className="text-[10px] text-gray-600 font-sans leading-relaxed">
                  Pode ser colado ou atualizado no formulário do motorista mais tarde.
                </p>
              </div>
            </div>

          </div>

        </div>

        {/* Form control action buttons bar */}
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-5 py-2 hover:bg-zinc-800 text-gray-400 hover:text-white transition rounded-xl text-xs sm:font-semibold font-mono border border-transparent hover:border-zinc-800 cursor-pointer text-center"
            id="form-cancel-btn"
          >
            Cancelar e Descartar
          </button>
          
          <button
            type="submit"
            disabled={isGeocoding || !!matchedBlockedDriver}
            className={`w-full sm:w-auto px-6 py-2.5 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              matchedBlockedDriver 
                ? 'bg-[#180a0a] border border-red-500/20 text-red-400 cursor-not-allowed opacity-60' 
                : 'bg-[#FFD600] hover:bg-[#ffe23b] text-black cursor-pointer'
            }`}
            id="form-submit-btn"
          >
            {isGeocoding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                Deteccionando CEP...
              </>
            ) : matchedBlockedDriver ? (
              <>
                <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                GRAVAÇÃO BLOQUEADA (LISTA NEGRA)
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-black" />
                Gravar Carga Monitorada
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
