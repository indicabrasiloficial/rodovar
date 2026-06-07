import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, UserX, Shield, Key, Eye, EyeOff, Save, CheckCircle, Users } from 'lucide-react';

export interface Employee {
  id: string;
  name: string;
  username: string;
  role: 'Operador' | 'Diretor Comercial' | 'Gerente' | 'Financeiro' | 'Diretor de Operações';
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Operador' | 'Diretor Comercial' | 'Gerente' | 'Financeiro' | 'Diretor de Operações'>('Operador');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Load employees list and current session on mount
  useEffect(() => {
    const list = getRegisteredEmployees();
    setEmployees(list);

    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      try {
        setCurrentUser(JSON.parse(active));
      } catch {
        // Ignored
      }
    }
  }, []);

  const isUserMaster = currentUser && (currentUser.username === 'master' || currentUser.role === 'Master');

  if (currentUser && !isUserMaster) {
    return (
      <div className="bg-[#121212] border border-red-900/40 rounded-xl p-8 text-center space-y-4 font-sans max-w-xl mx-auto my-12 animate-fade-in shadow-lg">
        <Shield className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Acesso Altamente Restrito</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Apenas o perfil administrativo <strong>MASTER</strong> do sistema possui autorização exclusiva para gerenciar, visualizar ou cadastrar colaboradores na Rodovar.
        </p>
      </div>
    );
  }

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
    setSuccessMsg(`Registro de ${empName} removido com sucesso.`);

    if (window.falarRodovar) {
      window.falarRodovar(`Colaborador ${empName} descredenciado.`);
    }

    setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
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
            <p className="text-xs text-zinc-400 mt-1 m-0">Crie novos colaboradores e defina níveis hierárquicos de acesso exclusivos para o sistema Rodovar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 uppercase">
          <Shield className="w-3.5 h-3.5 text-[#FFD600]" />
          <span>Base Credenciada</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Registration Form Left Side */}
        <div className="lg:col-span-5 bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm h-fit">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
            <UserPlus className="w-4 h-4 text-[#FFD600]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Novo Cadastro</h3>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Nome Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Nome do Colaborador</label>
              <input
                type="text"
                placeholder="Ex: Jairo Junior, Genivaldo Sobrinho"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-650 rounded-lg p-3 focus:outline-none transition-colors"
                id="emp-register-name"
              />
            </div>

            {/* Função Dropdown */}
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
              </select>
            </div>

            {/* Senha Field */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Senha de Acesso</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Defina uma senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-650 rounded-lg p-3 pr-10 focus:outline-none transition-colors"
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

            {/* Messages box */}
            {errorMsg && (
              <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-lg text-xs text-red-400 font-sans text-center">
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg text-xs text-emerald-400 font-sans text-center flex flex-col gap-1 items-center">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold">{successMsg}</span>
              </div>
            )}

            {/* Save Button */}
            <button
              type="submit"
              className="w-full py-3 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-black text-xs uppercase font-mono tracking-wider rounded-lg transition-all active:scale-98 cursor-pointer flex justify-center items-center gap-2 shadow-md"
              id="emp-register-submit-btn"
            >
              <Save className="w-4 h-4 text-black" />
              Salvar Colaborador
            </button>
          </form>
        </div>

        {/* List of Registered Employees Right Side */}
        <div className="lg:col-span-7 bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#FFD600]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Colaboradores Credenciados ({employees.length})</h3>
            </div>
          </div>

          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {employees.length === 0 ? (
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
                        <span className="flex items-center gap-1" title="Para sua segurança, as senhas de acesso não são exibidas após o cadastro inicial."><Key className="w-3 h-3 text-zinc-650" /> Senha: <strong className="text-zinc-550 font-mono select-none">••••••••</strong></span>
                      </p>
                    </div>
                  </div>

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
              ))
            )}
          </div>

          <div className="bg-zinc-900/40 p-3 rounded-lg border border-dashed border-zinc-800 text-[11px] text-zinc-500 leading-relaxed font-sans">
            📌 <strong>Aviso de Hierarquia:</strong> O sistema gera de forma automática um <strong>usuário</strong> sem acentos ou espaços para simplificar o login na tela inicial. Todas as senhas cadastradas acima podem ser usadas imediatamente para testar o painel exclusivo.
          </div>
        </div>

      </div>
    </div>
  );
}
