import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Eye, 
  EyeOff, 
  Plus, 
  Trash2, 
  Save, 
  AlertTriangle, 
  CheckCircle2, 
  Terminal, 
  Send, 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle, 
  Info,
  RefreshCw,
  Lock,
  FileText
} from 'lucide-react';
import { getTelegramConfig, saveTelegramConfig, registerTelegramCommandLog } from '../db/storage';
import { 
  consultarStatusCargaCallable, 
  consultarLocalizacaoCallable, 
  gerarRelatorioResumidoCallable, 
  cadastrarNovaCargaCallable, 
  cadastrarColaboradorCallable 
} from '../db/telegram_functions_callable';
import { TelegramSettings, Entrega, Colaborador } from '../types';

interface TelegramIntegrationProps {
  onClose: () => void;
}

export default function TelegramIntegration({ onClose }: TelegramIntegrationProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Configuration State
  const [settings, setSettings] = useState<TelegramSettings>({
    botToken: '',
    chatIds: [],
    allowedActions: {
      consultarCarga: true,
      consultarLocalizacao: true,
      gerarRelatorio: true,
      cadastrarCarga: false,
      cadastrarColaborador: false,
    },
    exigirConfirmacao: {
      consultarCarga: false,
      consultarLocalizacao: false,
      gerarRelatorio: false,
      cadastrarCarga: true,
      cadastrarColaborador: true,
    }
  });

  // State for adding a new Chat ID
  const [newChatId, setNewChatId] = useState('');
  const [chatIdError, setChatIdError] = useState('');

  // Simulation State (Playground)
  const [simChatId, setSimChatId] = useState('');
  const [simCommand, setSimCommand] = useState('/status');
  const [simArgument, setSimArgument] = useState('RDV654321');
  const [simResult, setSimResult] = useState<{
    success: boolean;
    message: string;
    needsConfirmation?: boolean;
    actionName?: 'consultarCarga' | 'consultarLocalizacao' | 'gerarRelatorio' | 'cadastrarCarga' | 'cadastrarColaborador';
    payload?: any;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);

  // Load config from Firestore / Local Storage on mount
  useEffect(() => {
    async function loadConfig() {
      setLoading(true);
      const data = await getTelegramConfig();
      setSettings(data);
      // Pre-populate simulation chat id with first authorized one or a standard test one
      if (data.chatIds && data.chatIds.length > 0) {
        setSimChatId(data.chatIds[0]);
      } else {
        setSimChatId('84732190'); // standard test ID
      }
      setLoading(false);
    }
    loadConfig();
  }, []);

  // Save config to Firestore
  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await saveTelegramConfig(settings);
      setSaveSuccess(true);
      
      if (window.falarRodovar) {
        window.falarRodovar("Integração do Telegram atualizada com absoluto sucesso.");
      }
      
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar configurações do Telegram:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add Chat ID to allowlist
  const handleAddChatId = () => {
    setChatIdError('');
    const trimmed = newChatId.trim();
    if (!trimmed) {
      setChatIdError('Digite um Chat ID válido.');
      return;
    }
    if (!/^-?\d+$/.test(trimmed)) {
      setChatIdError('O Chat ID do Telegram deve conter apenas números (e opcionalmente sinal de menos para grupos).');
      return;
    }
    if (settings.chatIds.includes(trimmed)) {
      setChatIdError('Este Chat ID já está cadastrado na allowlist.');
      return;
    }

    const updatedChatIds = [...settings.chatIds, trimmed];
    const updatedSettings = { ...settings, chatIds: updatedChatIds };
    setSettings(updatedSettings);
    setNewChatId('');
    
    // Auto save
    saveTelegramConfig(updatedSettings);

    if (window.falarRodovar) {
      window.falarRodovar(`Chat ID ${trimmed} adicionado à lista de autorizados.`);
    }
  };

  // Remove Chat ID from allowlist
  const handleRemoveChatId = (idToRemove: string) => {
    const updatedChatIds = settings.chatIds.filter(id => id !== idToRemove);
    const updatedSettings = { ...settings, chatIds: updatedChatIds };
    setSettings(updatedSettings);
    
    // Auto save
    saveTelegramConfig(updatedSettings);

    if (window.falarRodovar) {
      window.falarRodovar(`Chat ID removido com sucesso.`);
    }
  };

  // Toggle allowed actions
  const handleToggleAction = (actionKey: keyof TelegramSettings['allowedActions']) => {
    const updatedAllowed = { 
      ...settings.allowedActions, 
      [actionKey]: !settings.allowedActions[actionKey] 
    };
    
    // If we disable an action, we might want to preserve its confirmation setting
    const updatedSettings = { 
      ...settings, 
      allowedActions: updatedAllowed 
    };
    setSettings(updatedSettings);
  };

  // Toggle confirmation requirement
  const handleToggleConfirmation = (actionKey: keyof TelegramSettings['exigirConfirmacao']) => {
    const updatedConfirm = { 
      ...settings.exigirConfirmacao, 
      [actionKey]: !settings.exigirConfirmacao[actionKey] 
    };
    const updatedSettings = { 
      ...settings, 
      exigirConfirmacao: updatedConfirm 
    };
    setSettings(updatedSettings);
  };

  // Simulator Engine
  const handleRunSimulation = async () => {
    setSimulating(true);
    setSimResult(null);

    const commandStr = `${simCommand} ${simArgument}`.trim();
    const actionMap: Record<string, 'consultarCarga' | 'consultarLocalizacao' | 'gerarRelatorio' | 'cadastrarCarga' | 'cadastrarColaborador'> = {
      '/status': 'consultarCarga',
      '/localizacao': 'consultarLocalizacao',
      '/relatorio': 'gerarRelatorio',
      '/add_carga': 'cadastrarCarga',
      '/add_colaborador': 'cadastrarColaborador'
    };

    const actionName = actionMap[simCommand];

    try {
      // Step 1: Check Allowlist first
      if (!settings.chatIds.includes(simChatId)) {
        // Log unauthorized attempt
        await registerTelegramCommandLog(
          simChatId, 
          commandStr, 
          `Simulação: ${simCommand}`, 
          'REJEITADO - Chat ID não consta na Allowlist de Administradores.'
        );

        if (window.falarRodovar) {
          window.falarRodovar("Atenção: Comando recebido de um Chat ID não autorizado foi rejeitado com sucesso.");
        }

        setSimResult({
          success: false,
          message: `🔴 COMANDO REJEITADO (Acesso Não Autorizado)\nO Chat ID ${simChatId} não está cadastrado na allowlist de administradores. O comando foi descartado e a tentativa suspeita foi registrada na aba Auditoria.`
        });
        setSimulating(false);
        return;
      }

      // Step 2: Check if action is enabled
      if (!settings.allowedActions[actionName]) {
        await registerTelegramCommandLog(
          simChatId, 
          commandStr, 
          `Simulação: ${simCommand}`, 
          'REJEITADO - Ação desativada nas configurações do Master.'
        );

        if (window.falarRodovar) {
          window.falarRodovar("Comando recusado. Esta ação está desativada no painel de controle.");
        }

        setSimResult({
          success: false,
          message: `⚠️ AÇÃO BLOQUEADA\nA ação correspondente ao comando "${simCommand}" está desativada no catálogo do Telegram. O Master precisa marcar o checkbox para ativá-la.`
        });
        setSimulating(false);
        return;
      }

      // Step 3: Check confirmation flow
      if (settings.exigirConfirmacao[actionName]) {
        await registerTelegramCommandLog(
          simChatId, 
          commandStr, 
          `Simulação: ${simCommand}`, 
          'PENDENTE - Aguardando resposta SIM para confirmar alteração.'
        );

        setSimResult({
          success: false,
          needsConfirmation: true,
          actionName,
          message: `💬 AGUARDANDO CONFIRMAÇÃO\nO Bot interpretou o comando e respondeu no chat: "Confirma a execução de [${simCommand}]? Responda SIM para aplicar."`
        });
        setSimulating(false);
        return;
      }

      // Step 4: Execute read-only actions or direct execution immediately
      await executeAction(actionName, false);

    } catch (error: any) {
      setSimResult({
        success: false,
        message: `❌ Falha ao simular comando: ${error.message}`
      });
    } finally {
      setSimulating(false);
    }
  };

  // Apply Action Execution in playground
  const executeAction = async (
    actionName: 'consultarCarga' | 'consultarLocalizacao' | 'gerarRelatorio' | 'cadastrarCarga' | 'cadastrarColaborador',
    confirmed: boolean
  ) => {
    setSimulating(true);
    const commandStr = `${simCommand} ${simArgument}`.trim();

    try {
      if (actionName === 'consultarCarga') {
        const res = await consultarStatusCargaCallable({ chatId: simChatId, trackingCode: simArgument });
        setSimResult({ success: res.success, message: res.message, payload: res.payload });
        if (window.falarRodovar && res.message) {
          window.falarRodovar(res.message);
        }
      } 
      else if (actionName === 'consultarLocalizacao') {
        const res = await consultarLocalizacaoCallable({ chatId: simChatId, motoristaNome: simArgument });
        setSimResult({ success: res.success, message: res.message, payload: res.payload });
        if (window.falarRodovar && res.message) {
          window.falarRodovar(res.message);
        }
      } 
      else if (actionName === 'gerarRelatorio') {
        const res = await gerarRelatorioResumidoCallable({ chatId: simChatId });
        setSimResult({ success: res.success, message: res.message, payload: res.payload });
        if (window.falarRodovar && res.message) {
          window.falarRodovar("Relatório do sistema gerado de forma consolidada e enviado via Telegram.");
        }
      } 
      else if (actionName === 'cadastrarCarga') {
        // Simulated Payload for new delivery
        const simulatedPayload = {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          data_coleta: new Date().toLocaleDateString('pt-BR'),
          vendedor: 'Canal Telegram',
          cliente: simArgument || 'Cliente TG S/A',
          tel_cliente: '+55 11 98888-7777',
          motorista: 'Carlos Santos',
          tel_motorista: '+55 11 91111-2222',
          origem: 'São Paulo - SP',
          destino: 'Salvador - BA',
          frete_empresa: 4500,
          frete_motorista: 3800,
          prazo: '5 dias',
          status: 'coletando' as const,
          observacoes: 'Cadastrado automaticamente via comando de Agente IA Telegram.',
          trackingCode: 'RDVTG' + Math.floor(Math.random() * 90000 + 10000),
          lat: -12.9777,
          lng: -38.5016,
          canhoto_solicitado: false,
        };

        const res = await cadastrarNovaCargaCallable({ 
          chatId: simChatId, 
          payload: simulatedPayload,
          confirmado: confirmed 
        });

        setSimResult({ success: res.success, message: res.message, payload: res.trackingCode });
        if (window.falarRodovar && res.message) {
          window.falarRodovar(res.message);
        }
      } 
      else if (actionName === 'cadastrarColaborador') {
        // Simulated Payload for new collaborator
        const simulatedPayload = {
          uid: 'uid-tg-' + Math.random().toString(36).substring(2, 8),
          name: simArgument || 'Novo Integrante TG',
          username: (simArgument || 'tg_user').toLowerCase().replace(/\s+/g, '_'),
          email: 'colab_tg@rodovar.com.br',
          role: 'operador' as const,
          detailedRole: 'Operador Logístico Telegram',
          status: 'aprovado' as const,
          forcePasswordChange: true,
          created_at: new Date().toISOString()
        };

        const res = await cadastrarColaboradorCallable({
          chatId: simChatId,
          payload: simulatedPayload,
          confirmado: confirmed
        });

        setSimResult({ success: res.success, message: res.message, payload: res.id });
        if (window.falarRodovar && res.message) {
          window.falarRodovar(res.message);
        }
      }
    } catch (err: any) {
      setSimResult({
        success: false,
        message: `🔴 ERRO DE EXECUÇÃO NA CLOUD FUNCTION:\n${err.message}`
      });
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-400 gap-3">
        <RefreshCw className="animate-spin text-[#FFD600]" size={28} />
        <p className="text-sm font-mono uppercase tracking-widest text-[#FFD600]">Carregando Integração Telegram...</p>
      </div>
    );
  }

  return (
    <div id="telegram-integration-container" className="space-y-6 max-w-6xl mx-auto p-4 md:p-6 bg-[#0a0a0a] text-zinc-100 rounded-2xl border border-zinc-900 shadow-2xl">
      
      {/* Title Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5 mb-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#FFD600]/10 rounded-xl border border-[#FFD600]/20 text-[#FFD600] shrink-0 animate-pulse">
            <Bot size={28} />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tight text-white flex items-center gap-2">
              Integração Telegram (Agente IA)
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-950/40 text-red-400 border border-red-900/30 font-mono">
                Master Control
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Gerencie comandos, configure a allowlist de Chat IDs, controle permissões estritas e simule disparos seguros via Cloud Functions.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-all shrink-0"
        >
          ✕ Voltar ao Painel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Configurations & Permissions (Span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Module 1: Bot Token */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-4">
            <div className="flex items-center gap-2 text-[#FFD600]">
              <Lock size={16} />
              <h2 className="text-xs font-black uppercase tracking-widest font-mono">1. Token do Bot do Telegram</h2>
            </div>
            
            <p className="text-xs text-zinc-400 leading-relaxed">
              Insira abaixo o token fornecido pelo <strong>@BotFather</strong> do Telegram. Esse token serve para a sua função Vercel intermediária ler mensagens e autenticar as chamadas de API.
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={settings.botToken}
                  onChange={(e) => setSettings({ ...settings, botToken: e.target.value })}
                  placeholder="Ex: 1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-750 focus:border-[#FFD600] rounded-xl py-2.5 pl-3 pr-10 text-xs font-mono text-zinc-200 placeholder-zinc-650 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                  title={showToken ? "Ocultar Token" : "Mostrar Token"}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="px-4 py-2.5 bg-[#FFD600] hover:bg-[#ffe23b] text-[#0a0a0a] disabled:bg-zinc-850 disabled:text-zinc-500 font-bold text-xs uppercase font-mono rounded-xl flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(255,214,0,0.1)] shrink-0"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar Token
              </button>
            </div>

            {saveSuccess && (
              <div className="text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 p-2 rounded-lg flex items-center gap-1.5 animate-fade-in">
                <CheckCircle2 size={12} />
                Configurações persistidas com absoluto sucesso no Firebase Firestore!
              </div>
            )}
          </div>

          {/* Module 2: Allowlist de Chat IDs */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-4">
            <div className="flex items-center gap-2 text-[#FFD600]">
              <ShieldCheck size={16} />
              <h2 className="text-xs font-black uppercase tracking-widest font-mono">2. Chat IDs Autorizados (Allowlist)</h2>
            </div>
            
            <p className="text-xs text-zinc-400 leading-relaxed">
              Apenas mensagens vindas dos Chat IDs listados abaixo serão interpretadas. Qualquer requisição com ID desconhecido é imediatamente rejeitada e registrada em auditoria como suspeita.
            </p>

            {/* Input to add */}
            <div className="space-y-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newChatId}
                  onChange={(e) => {
                    setNewChatId(e.target.value);
                    setChatIdError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChatId()}
                  placeholder="Ex: 147839201"
                  className="flex-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-750 focus:border-[#FFD600] rounded-xl py-2.5 px-3 text-xs font-mono text-zinc-200 placeholder-zinc-650 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAddChatId}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-800 rounded-xl text-xs font-bold uppercase font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus size={14} className="text-[#FFD600]" />
                  Autorizar ID
                </button>
              </div>
              {chatIdError && (
                <p className="text-[10px] text-red-400 font-mono">{chatIdError}</p>
              )}
            </div>

            {/* List of Chat IDs */}
            <div className="border border-zinc-900 rounded-xl overflow-hidden">
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-500 border-b border-zinc-900 flex justify-between">
                <span>Chat ID do Telegram</span>
                <span>Ação</span>
              </div>
              {settings.chatIds.length === 0 ? (
                <div className="p-6 text-center text-zinc-600 text-xs flex flex-col items-center justify-center gap-1">
                  <AlertTriangle size={20} className="text-zinc-700" />
                  Nenhum Chat ID autorizado no momento. O bot ignorará todos os usuários!
                </div>
              ) : (
                <div className="divide-y divide-zinc-900 max-h-48 overflow-y-auto">
                  {settings.chatIds.map((id) => (
                    <div key={id} className="px-4 py-2.5 flex items-center justify-between text-xs font-mono hover:bg-zinc-900/20">
                      <span className="text-zinc-200">🟢 {id}</span>
                      <button
                        onClick={() => handleRemoveChatId(id)}
                        className="p-1 hover:bg-red-950/30 text-zinc-500 hover:text-red-400 rounded transition-colors"
                        title="Revogar autorização"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[9px] text-zinc-500 font-mono leading-tight">
              💡 Dica: Para descobrir seu Chat ID, mande a mensagem <code>/my_id</code> para o bot <code>@userinfobot</code> no Telegram.
            </p>
          </div>

          {/* Module 3: Catálogo de Ações Permitidas */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
              <div className="flex items-center gap-2 text-[#FFD600]">
                <ShieldAlert size={16} />
                <h2 className="text-xs font-black uppercase tracking-widest font-mono">3. Ações Permitidas via Telegram</h2>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">Requisito 3</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Marque abaixo as operações autorizadas no sistema através de comandos interpretados pelo Agente IA. Ações críticas (exclusão, backup) estão desabilitadas de forma permanente no núcleo de segurança.
            </p>

            {/* Checkbox Rows */}
            <div className="space-y-3">
              
              {/* Action 1: Consultar Carga */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-900 hover:border-zinc-850 bg-zinc-900/10 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowedActions.consultarCarga}
                      onChange={() => handleToggleAction('consultarCarga')}
                      className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600]"
                    />
                    Consultar status de carga
                  </label>
                  <span className="text-[10px] text-zinc-500 block ml-5.5 mt-0.5">Leitura de dados públicos e andamentos</span>
                </div>
                
                <div className="flex items-center gap-1.5 ml-5.5 sm:ml-0">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Exigir confirmação:</span>
                  <input
                    type="checkbox"
                    disabled={!settings.allowedActions.consultarCarga}
                    checked={settings.exigirConfirmacao.consultarCarga}
                    onChange={() => handleToggleConfirmation('consultarCarga')}
                    className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600] disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Action 2: Consultar Localização */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-900 hover:border-zinc-850 bg-zinc-900/10 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowedActions.consultarLocalizacao}
                      onChange={() => handleToggleAction('consultarLocalizacao')}
                      className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600]"
                    />
                    Consultar localização de motorista
                  </label>
                  <span className="text-[10px] text-zinc-500 block ml-5.5 mt-0.5">Retorna coordenadas geográficas em tempo real</span>
                </div>
                
                <div className="flex items-center gap-1.5 ml-5.5 sm:ml-0">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Exigir confirmação:</span>
                  <input
                    type="checkbox"
                    disabled={!settings.allowedActions.consultarLocalizacao}
                    checked={settings.exigirConfirmacao.consultarLocalizacao}
                    onChange={() => handleToggleConfirmation('consultarLocalizacao')}
                    className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600] disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Action 3: Gerar Relatório Resumido */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-zinc-900 hover:border-zinc-850 bg-zinc-900/10 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowedActions.gerarRelatorio}
                      onChange={() => handleToggleAction('gerarRelatorio')}
                      className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600]"
                    />
                    Gerar relatório resumido
                  </label>
                  <span className="text-[10px] text-zinc-500 block ml-5.5 mt-0.5">Envia sumário operacional das viagens</span>
                </div>
                
                <div className="flex items-center gap-1.5 ml-5.5 sm:ml-0">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase">Exigir confirmação:</span>
                  <input
                    type="checkbox"
                    disabled={!settings.allowedActions.gerarRelatorio}
                    checked={settings.exigirConfirmacao.gerarRelatorio}
                    onChange={() => handleToggleConfirmation('gerarRelatorio')}
                    className="rounded border-zinc-800 text-[#FFD600] focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-[#FFD600] disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Action 4: Cadastrar Carga */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-amber-900/25 hover:border-amber-900/40 bg-amber-950/5 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowedActions.cadastrarCarga}
                      onChange={() => handleToggleAction('cadastrarCarga')}
                      className="rounded border-zinc-800 text-amber-400 focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-amber-400"
                    />
                    Cadastrar nova carga
                  </label>
                  <span className="text-[10px] text-zinc-500 block ml-5.5 mt-0.5">Insere nova carga de coleta para monitoramento</span>
                </div>
                
                <div className="flex items-center gap-1.5 ml-5.5 sm:ml-0">
                  <span className="text-[10px] font-mono text-amber-400/80 uppercase">Exigir confirmação:</span>
                  <input
                    type="checkbox"
                    disabled={!settings.allowedActions.cadastrarCarga}
                    checked={settings.exigirConfirmacao.cadastrarCarga}
                    onChange={() => handleToggleConfirmation('cadastrarCarga')}
                    className="rounded border-zinc-800 text-amber-400 focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-amber-400 disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Action 5: Cadastrar Colaborador */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border border-amber-900/25 hover:border-amber-900/40 bg-amber-950/5 gap-3">
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allowedActions.cadastrarColaborador}
                      onChange={() => handleToggleAction('cadastrarColaborador')}
                      className="rounded border-zinc-800 text-amber-400 focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-amber-400"
                    />
                    Cadastrar colaborador
                  </label>
                  <span className="text-[10px] text-zinc-500 block ml-5.5 mt-0.5">Insere novos operadores no sistema</span>
                </div>
                
                <div className="flex items-center gap-1.5 ml-5.5 sm:ml-0">
                  <span className="text-[10px] font-mono text-amber-400/80 uppercase">Exigir confirmação:</span>
                  <input
                    type="checkbox"
                    disabled={!settings.allowedActions.cadastrarColaborador}
                    checked={settings.exigirConfirmacao.cadastrarColaborador}
                    onChange={() => handleToggleConfirmation('cadastrarColaborador')}
                    className="rounded border-zinc-800 text-amber-400 focus:ring-0 focus:outline-none w-3.5 h-3.5 accent-amber-400 disabled:opacity-30"
                  />
                </div>
              </div>

            </div>

            {/* Permanent Safety Warnings */}
            <div className="bg-red-950/15 border border-red-900/35 p-3 rounded-xl flex items-start gap-2 text-red-400">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] uppercase font-mono font-black tracking-widest text-red-500">NÚCLEO DE CONTROLE CRÍTICO (IMMUTABILITY CORE)</p>
                <p className="text-[10px] text-zinc-400 leading-normal mt-0.5">
                  Por diretivas de governança corporativa da Rodovar, ações como <strong>excluir cargas</strong>, <strong>remover colaboradores</strong>, <strong>restaurar backups</strong> ou <strong>conceder permissão de Master</strong> estão permanentemente bloqueadas no código-fonte e nunca serão expostas ao robô do Telegram, blindando o banco de dados contra vetores maliciosos.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-extrabold text-xs uppercase font-mono rounded-xl flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] shadow-[0_0_15px_rgba(255,214,0,0.15)]"
              >
                <Save size={14} />
                Salvar Configurações Gerais
              </button>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Interactive Command Simulator Playground (Span 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
              <div className="flex items-center gap-2 text-[#FFD600]">
                <Terminal size={16} />
                <h2 className="text-xs font-black uppercase tracking-widest font-mono">Playground de Homologação</h2>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">Teste de Auditoria</span>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Utilize o formulário abaixo para testar o comportamento das funções callable do Telegram. O simulador valida se o ID está autorizado e registra o comando na <strong>Auditoria de Atividades</strong> em tempo real!
            </p>

            <div className="space-y-3.5">
              
              {/* Simulator Chat ID input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black font-mono uppercase text-zinc-400 block">Chat ID do Remetente:</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={simChatId}
                    onChange={(e) => setSimChatId(e.target.value)}
                    placeholder="Ex: 84732190"
                    className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-[#FFD600] rounded-xl py-2 px-3 text-xs font-mono text-zinc-200 focus:outline-none transition-colors"
                  />
                  {settings.chatIds.length > 0 && (
                    <select
                      onChange={(e) => setSimChatId(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 rounded-xl px-2 focus:outline-none focus:border-[#FFD600]"
                    >
                      <option value="">IDs Autorizados...</option>
                      {settings.chatIds.map(id => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="text-[9px] text-zinc-500 font-mono">
                  Dica: Teste com um ID que não esteja na allowlist para verificar a rejeição automática e gravação de alerta.
                </p>
              </div>

              {/* Command and arguments */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black font-mono uppercase text-zinc-400 block">Comando:</label>
                  <select
                    value={simCommand}
                    onChange={(e) => {
                      setSimCommand(e.target.value);
                      // Update appropriate sample argument
                      if (e.target.value === '/status') setSimArgument('RDV654321');
                      else if (e.target.value === '/localizacao') setSimArgument('Carlos Santos');
                      else if (e.target.value === '/relatorio') setSimArgument('');
                      else if (e.target.value === '/add_carga') setSimArgument('Metalúrgica Alpha');
                      else if (e.target.value === '/add_colaborador') setSimArgument('Mateus de Souza');
                    }}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#FFD600] text-xs font-mono text-zinc-300 rounded-xl p-2 focus:outline-none"
                  >
                    <option value="/status">/status (Consultar Carga)</option>
                    <option value="/localizacao">/localizacao (Buscar Motorista)</option>
                    <option value="/relatorio">/relatorio (Relatório Consolidado)</option>
                    <option value="/add_carga">/add_carga (Inserir Carga)</option>
                    <option value="/add_colaborador">/add_colaborador (Novo Colaborador)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black font-mono uppercase text-zinc-400 block">Argumento/Texto:</label>
                  <input
                    type="text"
                    disabled={simCommand === '/relatorio'}
                    value={simArgument}
                    onChange={(e) => setSimArgument(e.target.value)}
                    placeholder="Código ou Nome"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#FFD600] rounded-xl py-2 px-3 text-xs font-mono text-zinc-200 focus:outline-none transition-colors disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Run button */}
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulating}
                className="w-full h-10 flex items-center justify-center bg-zinc-900 hover:bg-zinc-850 text-white border border-zinc-800 hover:border-[#FFD600] rounded-xl gap-2 text-xs font-mono uppercase font-black transition-all cursor-pointer disabled:opacity-45"
              >
                {simulating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#FFD600]" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[#FFD600]" />
                )}
                Disparar Comando via Telegram
              </button>

            </div>

            {/* Display Simulator Output Results */}
            {simResult && (
              <div className="space-y-3.5 animate-fade-in">
                <div className="text-[10px] font-black font-mono uppercase text-zinc-500 tracking-wider">Resposta do Bot / Status do Firebase:</div>
                
                <div className={`p-4 rounded-xl text-xs font-mono leading-relaxed border whitespace-pre-line ${
                  simResult.needsConfirmation ? 'bg-amber-950/20 border-amber-900/40 text-amber-300' :
                  simResult.success ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-400' :
                  'bg-red-950/20 border-red-900/40 text-red-400'
                }`}>
                  {simResult.message}

                  {/* Confirmation SIM buttons when required */}
                  {simResult.needsConfirmation && simResult.actionName && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-amber-900/30">
                      <button
                        onClick={() => {
                          executeAction(simResult.actionName!, true);
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[10px] uppercase font-mono rounded cursor-pointer"
                      >
                        Enviar "SIM" (Simular Confirmação)
                      </button>
                      <button
                        onClick={async () => {
                          await registerTelegramCommandLog(
                            simChatId, 
                            `${simCommand} ${simArgument}`, 
                            `Simulação: ${simCommand}`, 
                            'CANCELADO - Usuário cancelou confirmação de alteração.'
                          );
                          setSimResult({
                            success: false,
                            message: '❌ EXECUÇÃO CANCELADA\nO comando foi rejeitado devido à falta de confirmação SIM.'
                          });
                          if (window.falarRodovar) {
                            window.falarRodovar("Comando cancelado por falta de confirmação.");
                          }
                        }}
                        className="px-3 py-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 text-[10px] uppercase font-mono rounded cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {/* Additional output visualization (Payload returned) */}
                {simResult.success && simResult.payload && (
                  <div className="border border-zinc-900 rounded-xl bg-zinc-900/20 p-3.5 space-y-2">
                    <span className="text-[9px] font-black font-mono text-[#FFD600] uppercase block">DADOS RETORNADOS DA CLOUD FUNCTION:</span>
                    <pre className="text-[10px] font-mono text-zinc-300 overflow-x-auto select-all p-1 bg-black/40 rounded border border-zinc-900 max-h-40">
                      {JSON.stringify(simResult.payload, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Direct feedback that log was stored */}
                <div className="flex items-center gap-1.5 text-[9px] text-zinc-500 font-mono border-t border-zinc-900 pt-3">
                  <FileText size={12} className="text-[#FFD600]" />
                  <span>Log gravado na Auditoria. Origem: <strong>Telegram</strong> • ID: {simChatId}</span>
                </div>
              </div>
            )}

          </div>

          {/* Guidelines Module */}
          <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 space-y-3">
            <div className="flex items-center gap-2 text-zinc-300">
              <Info size={16} className="text-[#FFD600]" />
              <h2 className="text-xs font-black uppercase tracking-wider font-mono">Arquitetura de Segurança</h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              O robô que roda na Vercel se comunica com o Telegram e aciona as Firebase Cloud Functions do Rodovar Monitora via chamadas HTTP seguras autenticadas por Bearer Token e ID de sessão.
            </p>
            <ul className="text-[11px] text-zinc-500 font-mono space-y-1.5 list-disc list-inside">
              <li>Validação de Allowlist em tempo real.</li>
              <li>Impedimento de injeção de parâmetros maliciosos.</li>
              <li>Logs de Auditoria indeléveis no Firestore.</li>
              <li>Sem endpoints expostos sem autenticação.</li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
}
