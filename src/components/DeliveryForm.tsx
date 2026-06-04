import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Entrega, DeliveryStatus } from '../types';
import { 
  getUniqueVendedores, 
  getUniqueClientes, 
  getUniqueMotoristas, 
  saveEntrega,
  getEntregaById
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
  Loader2
} from 'lucide-react';

interface DeliveryFormProps {
  entregaId?: string; // If present, edit mode
  onBack: () => void;
  onSaved: (savedId: string) => void;
}

interface FormInputs {
  data_coleta: string;
  vendedor: string;
  cliente: string;
  tel_cliente: string;
  motorista: string;
  tel_motorista: string;
  origem: string;
  destino: string;
  frete_empresa: number;
  frete_motorista: number;
  prazo: string;
  status: DeliveryStatus;
  observacoes: string;
  link_localizacao: string;
  canhoto_solicitado: boolean;
}

export default function DeliveryForm({ entregaId, onBack, onSaved }: DeliveryFormProps) {
  const isEditMode = !!entregaId;
  const [isStatusBlocked, setIsStatusBlocked] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  
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
      origem: '',
      destino: '',
      frete_empresa: 0,
      frete_motorista: 0,
      prazo: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      status: 'coletando',
      observacoes: '',
      link_localizacao: '',
      canhoto_solicitado: false
    }
  });

  const watchVendedor = watch('vendedor') || '';
  const watchCliente = watch('cliente') || '';
  const watchMotorista = watch('motorista') || '';

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
          origem: data.origem,
          destino: data.destino,
          frete_empresa: data.frete_empresa,
          frete_motorista: data.frete_motorista,
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
    setShowMotoristaSuggestions(false);
  };

  // Main Form Submit handler
  const onSubmit = async (data: FormInputs) => {
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
      lat: coords.lat,
      lng: coords.lng,
      updated_at: new Date().toISOString()
    };

    if (isEditMode) {
      payload.id = entregaId;
    }

    const saved = saveEntrega(payload);
    setIsGeocoding(false);
    onSaved(saved.id);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
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
              <h3 className="text-xs uppercase tracking-wider font-mono text-[#FFD600] mb-4 font-bold border-b border-zinc-950 pb-2">
                2. Pessoal Envolvido (Motorista, Cliente e Comitente)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Motorista input with dropdown autocomplete suggestions */}
                <div className="space-y-1.5 relative">
                  <label className="text-xs text-gray-400 font-medium flex items-center justify-between">
                    Nome Completo do Motorista
                    <span className="text-[9px] text-[#FFD600] font-mono">Autocomplete ligado</span>
                  </label>
                  <input
                    type="text"
                    placeholder="João Silva"
                    {...register('motorista', { required: 'Motorista é obrigatório' })}
                    onFocus={() => setShowMotoristaSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowMotoristaSuggestions(false), 200)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none placeholder-gray-700 font-sans"
                    id="form-input-motorista"
                  />
                  {errors.motorista && <p className="text-[10px] text-red-400 font-mono">{errors.motorista.message}</p>}
                  
                  {/* Predictive panel options */}
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

                {/* Telefone Motorista */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 font-medium">DDD + WhatsApp Motorista (Numérico)</label>
                  <input
                    type="text"
                    placeholder="99991223344"
                    {...register('tel_motorista', { 
                      required: 'Telefone do motorista é obrigatório',
                      pattern: { value: /^[0-9]+$/, message: 'Apenas números sem espaços ou parênteses' }
                    })}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] rounded-lg p-2.5 text-xs text-white focus:outline-none font-mono placeholder-gray-700"
                    id="form-input-telmotorista"
                  />
                  {errors.tel_motorista && <p className="text-[10px] text-red-400 font-mono">{errors.tel_motorista.message}</p>}
                </div>

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

            {/* Secao 3: Observações gerais */}
            <div className="pt-2">
              <h3 className="text-xs uppercase tracking-wider font-mono text-gray-500 mb-3 font-bold border-b border-zinc-900 pb-2">
                3. Observações Operacionais da Carga
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
            disabled={isGeocoding}
            className="w-full sm:w-auto px-6 py-2.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            id="form-submit-btn"
          >
            {isGeocoding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                Deteccionando CEP...
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
