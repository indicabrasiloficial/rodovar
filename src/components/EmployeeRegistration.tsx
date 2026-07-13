import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserPlus, UserX, Shield, Key, Eye, EyeOff, Save, CheckCircle, Users, 
  Mail, Send, Check, X, Copy, Link, ShieldAlert, Clock, Loader2 
} from 'lucide-react';
import { 
  sendGroupChatMessage, 
  deletePresence, 
  kickUser, 
  registerSystemLog,
  createInvitation,
  getInvitations,
  getCollaboratorsFromFirestore,
  approveCollaboratorProfile,
  rejectCollaboratorProfile,
  updateCollaboratorPasswordByMaster,
  getLegacyEmployeesFromFirestore,
  saveLegacyEmployeesToFirestore
} from '../db/storage';
import { Invitation, Colaborador } from '../types';

export interface Employee {
  id: string;
  name: string;
  username: string;
  role: 'Operador' | 'Diretor Comercial' | 'Gerente' | 'Financeiro' | 'Diretor de Operações' | 'Visitante';
  passwordHash: string; // Stored securely/directly as text for simplicity
  created_at: string;
}

const DEFAULT_PASSWORDS: Record<string, string> = {
  'jairobahia': 'Danone01',
  'genivaldo': 'rodovar2026',
  'alexandre': 'rodovar2026',
  'vitor': 'rodovar2026',
  'ricardo': 'rodovar2026',
  'petronio': 'rodovar2026',
  'petrônio': 'rodovar2026'
};

const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp-jairo',
    name: 'Jairo Bahia',
    username: 'jairobahia',
    role: 'Operador',
    passwordHash: 'Danone01',
    created_at: '2026-01-01'
  },
  {
    id: 'emp-genivaldo',
    name: 'Genivaldo',
    username: 'genivaldo',
    role: 'Gerente',
    passwordHash: 'rodovar2026',
    created_at: '2026-01-01'
  },
  {
    id: 'emp-alexandre',
    name: 'Alexandre',
    username: 'alexandre',
    role: 'Diretor Comercial',
    passwordHash: 'rodovar2026',
    created_at: '2026-01-01'
  },
  {
    id: 'emp-vitor',
    name: 'Vitor',
    username: 'vitor',
    role: 'Diretor de Operações',
    passwordHash: 'rodovar2026',
    created_at: '2026-01-01'
  },
  {
    id: 'emp-ricardo',
    name: 'Ricardo',
    username: 'ricardo',
    role: 'Diretor de Operações',
    passwordHash: 'rodovar2026',
    created_at: '2026-01-01'
  },
  {
    id: 'emp-petronio',
    name: 'Petrônio',
    username: 'petronio',
    role: 'Financeiro',
    passwordHash: 'rodovar2026',
    created_at: '2026-01-01'
  }
];

export function getRegisteredEmployees(): Employee[] {
  const stored = localStorage.getItem('rodovar_registered_employees_v2');
  let list = [...DEFAULT_EMPLOYEES];
  if (stored) {
    try {
      list = JSON.parse(stored);
    } catch {
      list = [...DEFAULT_EMPLOYEES];
    }
  }

  // Guarantee Ricardo is present (Diretor de Operações)
  const hasRicardo = list.some(emp => emp.username === 'ricardo');
  if (!hasRicardo) {
    list.push({
      id: 'emp-ricardo',
      name: 'Ricardo',
      username: 'ricardo',
      role: 'Diretor de Operações',
      passwordHash: 'rodovar2026',
      created_at: '2026-01-01'
    });
    localStorage.setItem('rodovar_registered_employees_v2', JSON.stringify(list));
  }

  // Filter out Priscila and Mateus from custom lists if they were already saved in local storage
  list = list.filter(emp => emp.username !== 'mateus' && emp.username !== 'priscila');

  // Guarantee master user is always filtered out and never listed
  return list.filter(emp => emp.username !== 'master');
}

export function saveRegisteredEmployees(employees: Employee[]) {
  localStorage.setItem('rodovar_registered_employees_v2', JSON.stringify(employees));
  
  // Sync password list for Login.tsx backwards compatibility
  const currentPasswords: Record<string, string> = { ...DEFAULT_PASSWORDS };
  employees.forEach(emp => {
    currentPasswords[emp.username] = emp.passwordHash;
  });
  localStorage.setItem('rodovar_user_passwords_v2', JSON.stringify(currentPasswords));
}

export default function EmployeeRegistration() {
  const [activeTab, setActiveTab] = useState<'convites' | 'direto'>('convites');
  
  // Legacy employees list
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Operador' | 'Diretor Comercial' | 'Gerente' | 'Financeiro' | 'Diretor de Operações' | 'Visitante'>('Operador');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Security integration variables
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [pendingColabs, setPendingColabs] = useState<Colaborador[]>([]);
  const [fireColabs, setFireColabs] = useState<Colaborador[]>([]);
  const [lastGeneratedInvite, setLastGeneratedInvite] = useState<Invitation | null>(null);
  
  // Invitation creation fields
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'operador' | 'leitura'>('operador');
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // Master password change states
  const [passwordChangeTarget, setPasswordChangeTarget] = useState<{ type: 'legacy' | 'firebase'; id: string; name: string; username: string } | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [showNewPasswordVal, setShowNewPasswordVal] = useState(false);

  // Load employees list and current session on mount
  useEffect(() => {
    const initEmployees = async () => {
      try {
        const cloudEmployees = await getLegacyEmployeesFromFirestore();
        if (cloudEmployees && cloudEmployees.length > 0) {
          setEmployees(cloudEmployees);
          saveRegisteredEmployees(cloudEmployees);
        } else {
          // Fallback to local storage
          const list = getRegisteredEmployees();
          setEmployees(list);
          if (list.length > 0) {
            await saveLegacyEmployeesToFirestore(list);
          }
        }
      } catch (err) {
        console.warn("Could not load/sync legacy employees on mount:", err);
        const list = getRegisteredEmployees();
        setEmployees(list);
      }
    };

    initEmployees();

    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        setCurrentUser(JSON.parse(active));
      } catch {}
    }

    loadSecurityData();
  }, []);

  // Fetch security/invitation data from Firebase
  const loadSecurityData = async () => {
    try {
      const allInvites = await getInvitations();
      if (allInvites) setInvites(allInvites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

      const allColabs = await getCollaboratorsFromFirestore();
      if (allColabs) {
        setPendingColabs(allColabs.filter(c => c.status === 'pendente'));
        setFireColabs(allColabs.filter(c => c.status === 'aprovado'));
      }
    } catch (err) {
      console.warn('Error loading security data from Firestore:', err);
    }
  };

  const isUserMaster = currentUser && (currentUser.username === 'master' || currentUser.role === 'Master');

  if (currentUser && !isUserMaster) {
    return (
      <div className="bg-[#121212] border border-red-900/40 rounded-xl p-8 text-center space-y-4 font-sans max-w-xl mx-auto my-12 animate-fade-in shadow-lg">
        <Shield className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Acesso Altamente Restrito</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Apenas o perfil administrativo <strong>SUPORTE</strong> do sistema possui autorização exclusiva para gerenciar, visualizar ou cadastrar colaboradores na Rodovar.
        </p>
      </div>
    );
  }

  // Handle invitation token generation
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastGeneratedInvite(null);
    setIsLoading(true);

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setErrorMsg('Por favor, informe o e-mail do convidado.');
      setIsLoading(false);
      return;
    }

    try {
      const invite = await createInvitation(email, inviteRole);
      if (invite) {
        setSuccessMsg(`Convite gerado com sucesso total para ${email}!`);
        setLastGeneratedInvite(invite);
        setInviteEmail('');
        await loadSecurityData();
        registerSystemLog('Geração de Convite', `Gerou token de convite para ${email} com permissão ${inviteRole}.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao gerar convite no Firestore.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle manual/direct legacy registration
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanName = name.trim();
    const cleanPassword = password.trim();

    if (!cleanName || !cleanPassword) {
      setErrorMsg('Por favor, preencha todos os campos.');
      return;
    }

    if (cleanPassword.length < 4) {
      setErrorMsg('A senha deve ter no mínimo 4 caracteres.');
      return;
    }

    // Generate unique slug username for immediate use
    const baseUsername = cleanName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9]/g, ""); // strip space and special char

    if (!baseUsername) {
      setErrorMsg('Nome inválido para geração de usuário.');
      return;
    }

    // Prevent registering master role or username
    if (baseUsername === 'master') {
      setErrorMsg('O nome de usuário "master" é de uso reservado exclusivo para o perfil mestre do sistema.');
      return;
    }

    // Prevent duplicate username
    const usernameTaken = employees.some(emp => emp.username === baseUsername);
    if (usernameTaken) {
      setErrorMsg(`O usuário gerado "${baseUsername}" já existe no sistema.`);
      return;
    }

    const newEmployee: Employee = {
      id: 'emp-' + Math.random().toString(36).substring(2, 9),
      name: cleanName,
      username: baseUsername,
      role,
      passwordHash: cleanPassword,
      created_at: new Date().toISOString().substring(0, 10)
    };

    const updated = [...employees, newEmployee];
    setEmployees(updated);
    saveRegisteredEmployees(updated);
    saveLegacyEmployeesToFirestore(updated).catch(() => {});

    // Register system log
    registerSystemLog('Cadastro de Colaborador', `Cadastrou o colaborador ${cleanName} (usuário: ${baseUsername}) como ${role}`);

    // Automatically send notification to the operational group chat
    sendGroupChatMessage({
      category: 'operacional',
      text: `👤 *NOVO COLABORADOR CREDENCIADO (LEGADO)*\n• *Nome:* ${cleanName}\n• *Usuário:* ${baseUsername}\n• *Função / Perfil:* ${role}\n• *Cadastrado por:* ${currentUser?.displayName || currentUser?.name || 'Sistema'}`,
      userId: currentUser?.username || 'sistema',
      userName: currentUser?.displayName || currentUser?.name || 'Sistema',
      userRole: currentUser?.role || 'Sistema',
      timestamp: new Date().toISOString()
    }).catch(err => console.error("Error sending register notification to chat:", err));

    setName('');
    setPassword('');
    setSuccessMsg(`Colaborador ${cleanName} cadastrado com sucesso! Usuário de acesso: "${baseUsername}" | Senha geradora: "${cleanPassword}" (Anote-a, pois ela não será exibida na listagem permanente por segurança)`);
    
    // Vocal feedback if speech is active
    if (window.falarRodovar) {
      window.falarRodovar(`Funcionário ${cleanName} cadastrado com sucesso ou integrado com perfil de ${role}.`);
    }

    setTimeout(() => {
      setSuccessMsg(null);
    }, 4500);
  };

  // Handle deletion of legacy user
  const handleDelete = (id: string, empName: string, empUsername: string) => {
    if (empUsername === 'jairobahia' || empUsername === 'genivaldo') {
      setErrorMsg('Os colaboradores mestres da Rodovar não podem ser removidos.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja descredenciar ${empName} do sistema?`)) {
      return;
    }

    const updated = employees.filter(emp => emp.id !== id);
    setEmployees(updated);
    saveRegisteredEmployees(updated);
    saveLegacyEmployeesToFirestore(updated).catch(() => {});
    setSuccessMsg(`Registro de ${empName} removido com sucesso.`);

    // Register system log
    registerSystemLog('Exclusão de Colaborador', `Removeu o colaborador ${empName} (usuário: ${empUsername}) do sistema`);

    // Remove presence and kick deleted user immediately
    deletePresence(empUsername).catch(() => {});
    kickUser(empUsername).catch(() => {});

    // Automatically send notification to the operational group chat
    sendGroupChatMessage({
      category: 'operacional',
      text: `🚫 *COLABORADOR DESCREDENCIADO*\n• *Nome:* ${empName}\n• *Usuário:* ${empUsername}\n• *Removido por:* ${currentUser?.displayName || currentUser?.name || 'Sistema'}`,
      userId: currentUser?.username || 'sistema',
      userName: currentUser?.displayName || currentUser?.name || 'Sistema',
      userRole: currentUser?.role || 'Sistema',
      timestamp: new Date().toISOString()
    }).catch(err => console.error("Error sending deletion notification to chat:", err));

    if (window.falarRodovar) {
      window.falarRodovar(`Colaborador ${empName} descredenciado.`);
    }

    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
  };

  // Handle Master Password Change
  const handleApplyPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordChangeTarget || newPasswordVal.length < 6) return;
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (passwordChangeTarget.type === 'legacy') {
        // Change legacy employee password
        const updatedEmployees = employees.map(emp => {
          if (emp.id === passwordChangeTarget.id) {
            return { ...emp, passwordHash: newPasswordVal };
          }
          return emp;
        });
        saveRegisteredEmployees(updatedEmployees);
        setEmployees(updatedEmployees);
        await saveLegacyEmployeesToFirestore(updatedEmployees);
        setSuccessMsg(`Senha do colaborador legado ${passwordChangeTarget.name} alterada com sucesso.`);
        registerSystemLog('Alteração de Senha', `Administrador Master alterou a senha do colaborador legado ${passwordChangeTarget.username}.`);
      } else {
        // Change Firebase collaborator password
        await updateCollaboratorPasswordByMaster(passwordChangeTarget.id, newPasswordVal);
        setSuccessMsg(`Senha do colaborador Firebase ${passwordChangeTarget.name} alterada com sucesso! No próximo login, ele deverá cadastrar uma nova senha por segurança.`);
        registerSystemLog('Alteração de Senha', `Administrador Master alterou a senha do colaborador Firebase ${passwordChangeTarget.username}.`);
      }
      setPasswordChangeTarget(null);
      setNewPasswordVal('');
      setShowNewPasswordVal(false);
      await loadSecurityData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar a senha.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Approvals / Rejections (Requirement 2)
  const handleApproveCollaborator = async (colab: Colaborador) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      await approveCollaboratorProfile(colab.uid);
      setSuccessMsg(`O colaborador ${colab.name} foi aprovado com sucesso! Ele agora pode realizar login.`);
      registerSystemLog('Aprovação de Cadastro', `Aprovou o cadastro do colaborador ${colab.name} (usuário: ${colab.username}).`);
      
      // Notify chat
      sendGroupChatMessage({
        category: 'operacional',
        text: `✅ *COLABORADOR APROVADO PELO MASTER*\n• *Nome:* ${colab.name}\n• *Usuário:* ${colab.username}\n• *Perfil:* ${colab.detailedRole}\n• Status: *Liberado para Login*`,
        userId: 'master',
        userName: 'Administrador Master',
        userRole: 'Master',
        timestamp: new Date().toISOString()
      }).catch(() => {});

      await loadSecurityData();
    } catch (err: any) {
      setErrorMsg('Erro ao aprovar o colaborador.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectCollaborator = async (colab: Colaborador) => {
    if (!window.confirm(`Tem certeza que deseja recusar e excluir permanentemente o cadastro de ${colab.name}?`)) {
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      await rejectCollaboratorProfile(colab.uid);
      setSuccessMsg(`Cadastro de ${colab.name} foi recusado e apagado.`);
      registerSystemLog('Rejeição de Cadastro', `Rejeitou o cadastro do colaborador ${colab.name} (usuário: ${colab.username}).`);
      await loadSecurityData();
    } catch (err) {
      setErrorMsg('Erro ao rejeitar colaborador.');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy invitation link to clipboard
  const handleCopyInviteLink = (token: string, email: string) => {
    // Generate absolute invite link
    const origin = window.location.origin + window.location.pathname;
    const inviteLink = `${origin}?invite=${token}&email=${encodeURIComponent(email)}`;
    
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedInviteId(token);
      setTimeout(() => setCopiedInviteId(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Visual top banner */}
      <div className="bg-[#121212] border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#FFD600]/10 border border-[#FFD600]/30 rounded-xl text-[#FFD600]">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black font-sans uppercase tracking-tight text-white m-0">Cadastro de Funcionários & Colaboradores</h1>
            <p className="text-xs text-zinc-400 mt-1 m-0">Gerencie níveis de acesso, convide novos colaboradores com segurança real e aprove cadastros pendentes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 uppercase">
          <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
          <span>Controle Master de Segurança</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('convites')}
          className={`px-5 py-3 text-xs font-bold uppercase font-mono tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'convites' 
              ? 'border-[#FFD600] text-[#FFD600]' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          🔐 Convites & Aprovações Reais
        </button>
        <button
          onClick={() => setActiveTab('direto')}
          className={`px-5 py-3 text-xs font-bold uppercase font-mono tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'direto' 
              ? 'border-[#FFD600] text-[#FFD600]' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          📝 Cadastro Legado / Direto
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-400 font-sans text-center">
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="space-y-3">
          <div className="p-4 bg-emerald-950/20 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 font-sans flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>

          {lastGeneratedInvite && (
            <div className="p-5 bg-zinc-900/90 border border-emerald-500/30 rounded-xl space-y-4 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-lg text-[#FFD600] shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#FFD600]">Informativo de Envio</h4>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Para máxima segurança e evitar taxas de servidor ou bloqueios de SPAM por parte dos provedores, o sistema <strong>não dispara e-mails automáticos</strong>. 
                    <br />
                    Para que o colaborador possa se cadastrar, você deve <strong>copiar o link seguro de ativação abaixo</strong> e enviá-lo diretamente para ele (por WhatsApp, E-mail ou Telegram).
                  </p>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[10px]">
                <div className="text-zinc-400 select-all truncate max-w-full text-center sm:text-left">
                  {window.location.origin + window.location.pathname}?invite={lastGeneratedInvite.id}&email={encodeURIComponent(lastGeneratedInvite.email)}
                </div>
                <button
                  onClick={() => handleCopyInviteLink(lastGeneratedInvite.id, lastGeneratedInvite.email)}
                  className="w-full sm:w-auto shrink-0 px-4 py-2 bg-[#FFD600] text-black hover:bg-white rounded font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer text-[10px]"
                >
                  {copiedInviteId === lastGeneratedInvite.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar Link Seguro
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Forms */}
        <div className="lg:col-span-5 space-y-6">
          <AnimatePresence mode="wait">
            {activeTab === 'convites' ? (
              <motion.div
                key="tab-convites"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
                  <Shield className="w-4 h-4 text-[#FFD600]" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Novo Convite de Segurança</h3>
                </div>

                <form onSubmit={handleGenerateInvite} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">E-mail do Colaborador</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><Mail className="w-4 h-4" /></span>
                      <input
                        type="email"
                        placeholder="Ex: colaborador@rodovar.com.br"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-600 rounded-lg pl-10 pr-3 py-3 focus:outline-none transition-colors"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Perfil Hierárquico</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 rounded-lg p-3 focus:outline-none cursor-pointer"
                      disabled={isLoading}
                    >
                      <option value="admin" className="bg-zinc-950 text-white">Administrador (Gerente / Diretor)</option>
                      <option value="operador" className="bg-zinc-950 text-white">Operador (Controle total de cargas)</option>
                      <option value="leitura" className="bg-zinc-950 text-white">Apenas Leitura (Visitante / Diretoria)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-black text-xs uppercase font-mono tracking-wider rounded-lg transition-all active:scale-98 cursor-pointer flex justify-center items-center gap-2 shadow-md disabled:bg-zinc-800 disabled:text-zinc-550"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Gerar e Enviar Convite (48h)
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="tab-direto"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
                  <UserPlus className="w-4 h-4 text-[#FFD600]" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Novo Cadastro Legado / Direto</h3>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Nome do Colaborador</label>
                    <input
                      type="text"
                      placeholder="Ex: Jairo Junior, Genivaldo Sobrinho"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-600 rounded-lg p-3 focus:outline-none transition-colors"
                      id="emp-register-name"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Função / Perfil</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as any)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 rounded-lg p-3 focus:outline-none cursor-pointer"
                      id="emp-register-role"
                    >
                      <option value="Operador" className="bg-zinc-950 text-white">Operador (Controle cargas & Whatsapp)</option>
                      <option value="Gerente" className="bg-zinc-950 text-white">Gerente (Gestão operacional & Alertas)</option>
                      <option value="Diretor Comercial" className="bg-zinc-950 text-white">Diretor Comercial (Negociações & Vendas)</option>
                      <option value="Financeiro" className="bg-zinc-950 text-white">Financeiro (Fretes, Repasses & Margens)</option>
                      <option value="Diretor de Operações" className="bg-zinc-950 text-white">Diretor de Operações (Eficiência & Logística)</option>
                      <option value="Visitante" className="bg-zinc-950 text-white">Visitante (Apenas visualização & Feedback)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Senha de Acesso</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Defina uma senha"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-600 rounded-lg p-3 pr-10 focus:outline-none transition-colors"
                        id="emp-register-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-zinc-500 hover:text-white transition cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-black text-xs uppercase font-mono tracking-wider rounded-lg transition-all active:scale-98 cursor-pointer flex justify-center items-center gap-2 shadow-md"
                    id="emp-register-submit-btn"
                  >
                    <Save className="w-4 h-4 text-black" />
                    Salvar Colaborador Legado
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* List of Pending Approvals (Requirement 2) */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <ShieldAlert className="w-4 h-4 text-[#FFD600]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Aprovações Pendentes ({pendingColabs.length})</h3>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {pendingColabs.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-[11px] uppercase tracking-wider">Nenhuma solicitação pendente no momento.</div>
              ) : (
                pendingColabs.map(colab => (
                  <div key={colab.id} className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-black text-zinc-200 leading-tight">{colab.name}</h4>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1">
                          👤 {colab.username} | ✉️ {colab.email}
                        </p>
                      </div>
                      <span className="text-[9px] bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 rounded px-1.5 py-0.5 font-mono uppercase font-black">
                        {colab.detailedRole}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveCollaborator(colab)}
                        disabled={isLoading}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase font-mono tracking-wider rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition disabled:bg-zinc-800 disabled:text-zinc-650"
                      >
                        <Check className="w-3.5 h-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => handleRejectCollaborator(colab)}
                        disabled={isLoading}
                        className="flex-1 py-2 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 hover:text-white text-[10px] font-bold uppercase font-mono tracking-wider rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition disabled:border-transparent"
                      >
                        <X className="w-3.5 h-3.5" /> Recusar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Lists & Invites history */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Invitation Link Logs */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Link className="w-4 h-4 text-[#FFD600]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Histórico de Convites de Segurança ({invites.length})</h3>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 font-mono">
              {invites.length === 0 ? (
                <div className="p-8 text-center text-zinc-600 font-mono text-[11px] uppercase tracking-wider">Nenhum convite gerado.</div>
              ) : (
                invites.map(inv => {
                  const isExpired = new Date(inv.expiresAt).getTime() < Date.now();
                  return (
                    <div key={inv.id} className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-300">{inv.email}</span>
                          <span className="text-[8px] bg-zinc-900 text-zinc-400 px-1 rounded uppercase">{inv.role}</span>
                        </div>
                        <div className="text-[9px] text-zinc-500 flex items-center gap-2">
                          <span>Token: <strong className="text-zinc-400">{inv.id}</strong></span>
                          <span>•</span>
                          {inv.used ? (
                            <span className="text-emerald-500 font-bold">UTILIZADO</span>
                          ) : isExpired ? (
                            <span className="text-red-500 font-bold">EXPIRADO</span>
                          ) : (
                            <span className="text-yellow-500 font-bold">ATIVO</span>
                          )}
                        </div>
                      </div>

                      {!inv.used && !isExpired && (
                        <button
                          onClick={() => handleCopyInviteLink(inv.id, inv.email)}
                          className="px-2.5 py-1.5 bg-[#FFD600]/10 hover:bg-[#FFD600] text-[#FFD600] hover:text-black border border-[#FFD600]/20 hover:border-transparent rounded font-mono text-[9px] uppercase tracking-wider font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Copiar Link de Cadastro"
                        >
                          {copiedInviteId === inv.id ? (
                            <>
                              <Check className="w-3 h-3" /> Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Link
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Registered Employees Right Side */}
          <div className="bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#FFD600]" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">
                  Colaboradores Credenciados ({employees.length + fireColabs.length})
                </h3>
              </div>
            </div>

            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {/* Approved Real Firebase Collaborators */}
              {fireColabs.map(colab => (
                <div 
                  key={colab.id} 
                  className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex items-center justify-between gap-4 transition hover:border-emerald-900/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 font-black text-xs flex items-center justify-center uppercase shadow-inner">
                      {colab.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-gray-200 leading-none">{colab.name}</h4>
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1.5 py-0.5 font-mono uppercase font-bold tracking-tight">
                          Firebase {colab.detailedRole}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1.5 flex items-center gap-3.5">
                        <span className="flex items-center gap-1">👤 Usuário: <strong className="text-zinc-300 font-bold">{colab.username}</strong></span>
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-zinc-650" /> E-mail: <strong className="text-zinc-300">{colab.email}</strong></span>
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1.5 items-center">
                    <button
                      onClick={() => setPasswordChangeTarget({ type: 'firebase', id: colab.uid, name: colab.name, username: colab.username })}
                      className="p-1.5 bg-yellow-950/20 hover:bg-yellow-900/80 border border-yellow-900/30 hover:border-yellow-600 rounded text-[#FFD600] hover:text-white transition cursor-pointer"
                      title={`Alterar Senha de ${colab.name}`}
                    >
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Deseja descredenciar e remover o colaborador Firebase ${colab.name}?`)) {
                          setIsLoading(true);
                          rejectCollaboratorProfile(colab.uid)
                            .then(() => {
                              setSuccessMsg(`Colaborador ${colab.name} descredenciado com sucesso.`);
                              loadSecurityData();
                            })
                            .catch(() => setErrorMsg('Erro ao descredenciar colaborador.'))
                            .finally(() => setIsLoading(false));
                        }
                      }}
                      disabled={isLoading}
                      className="p-1.5 hover:p-1.5 bg-red-950/20 hover:bg-red-900/80 border border-red-900/30 hover:border-red-600 rounded text-red-400 hover:text-white transition cursor-pointer"
                      title={`Descredenciar ${colab.name}`}
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Legacy Employees */}
              {employees.length === 0 && fireColabs.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 font-mono text-xs">Carregando quadro de colaboradores...</div>
              ) : (
                employees.map(emp => (
                  <div 
                    key={emp.id} 
                    className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 flex items-center justify-between gap-4 transition hover:border-zinc-850"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 text-[#FFD600] font-black text-xs flex items-center justify-center uppercase shadow-inner">
                        {emp.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-200 leading-none">{emp.name}</h4>
                          <span className="text-[9px] bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 rounded px-1.5 py-0.5 font-mono uppercase font-bold tracking-tight">
                            {emp.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1.5 flex items-center gap-3.5">
                          <span className="flex items-center gap-1">👤 Usuário: <strong className="text-zinc-300 font-bold">{emp.username}</strong></span>
                          <span className="flex items-center gap-1" title="Senhas de acesso não são exibidas após o cadastro inicial."><Key className="w-3 h-3 text-zinc-650" /> Senha: <strong className="text-zinc-550 font-mono select-none">••••••••</strong></span>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-1.5 items-center">
                      <button
                        onClick={() => setPasswordChangeTarget({ type: 'legacy', id: emp.id, name: emp.name, username: emp.username })}
                        className="p-1.5 bg-yellow-950/20 hover:bg-yellow-900/80 border border-yellow-900/30 hover:border-yellow-600 rounded text-[#FFD600] hover:text-white transition cursor-pointer"
                        title={`Alterar Senha de ${emp.name}`}
                      >
                        <Key className="w-3.5 h-3.5" />
                      </button>

                      {emp.username !== 'jairobahia' && emp.username !== 'genivaldo' ? (
                        <button
                          onClick={() => handleDelete(emp.id, emp.name, emp.username)}
                          className="p-1.5 hover:p-1.5 bg-red-950/20 hover:bg-red-900/80 border border-red-900/30 hover:border-red-600 rounded text-red-400 hover:text-white transition cursor-pointer"
                          title={`Descredenciar ${emp.name}`}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[9px] font-mono font-bold text-emerald-500 uppercase block tracking-wider bg-emerald-900/10 px-2 py-1 rounded" title="Conta master do sistema">Sistema</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-zinc-900/40 p-3 rounded-lg border border-dashed border-zinc-800 text-[11px] text-zinc-500 leading-relaxed font-sans">
              📌 <strong>Informativo de Segurança:</strong> Os convites temporários vinculam a completação do cadastro ao e-mail exato especificado e bloqueiam logins até que você aprove manualmente acima.
            </div>
          </div>
        </div>

      </div>

      {/* Password Change Modal */}
      <AnimatePresence>
        {passwordChangeTarget && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#121212] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#FFD600]" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">
                    Alterar Senha de Acesso
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setPasswordChangeTarget(null);
                    setNewPasswordVal('');
                    setShowNewPasswordVal(false);
                  }}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-zinc-400">
                Alterando a senha do colaborador <strong className="text-white">{passwordChangeTarget.name}</strong> (usuário: <span className="font-mono text-[#FFD600]">{passwordChangeTarget.username}</span>).
              </div>

              <form onSubmit={handleApplyPasswordChange} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input 
                      type={showNewPasswordVal ? 'text' : 'password'}
                      value={newPasswordVal}
                      onChange={(e) => setNewPasswordVal(e.target.value)}
                      placeholder="Mínimo de 6 caracteres"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#FFD600] transition pr-10 font-mono text-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPasswordVal(!showNewPasswordVal)}
                      className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300"
                    >
                      {showNewPasswordVal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordChangeTarget(null);
                      setNewPasswordVal('');
                      setShowNewPasswordVal(false);
                    }}
                    className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase font-mono rounded-xl transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || newPasswordVal.length < 6}
                    className="flex-1 py-3 bg-[#FFD600] hover:bg-[#ffe23b] text-black text-xs font-black uppercase font-mono rounded-xl transition cursor-pointer disabled:bg-zinc-800 disabled:text-zinc-650 flex items-center justify-center gap-1.5 shadow-[0_4px_15px_rgba(255,214,0,0.15)]"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
