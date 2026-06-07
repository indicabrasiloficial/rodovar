import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (userData: { username: string; displayName: string; role: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanUser || !cleanPass) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    // Load custom registered employees
    const DEFAULT_EMPLOYEES_LOCAL = [
      { name: 'Jairo Bahia', username: 'jairobahia', role: 'Operador', passwordHash: 'Danone01' },
      { name: 'Genivaldo', username: 'genivaldo', role: 'Gerente', passwordHash: 'rodovar2026' },
      { name: 'Alexandre', username: 'alexandre', role: 'Diretor Comercial', passwordHash: 'rodovar2026' },
      { name: 'Vitor', username: 'vitor', role: 'Diretor de Operações', passwordHash: 'rodovar2026' },
      { name: 'Ricardo', username: 'ricardo', role: 'Diretor de Operações', passwordHash: 'rodovar2026' },
      { name: 'Petrônio', username: 'petronio', role: 'Financeiro', passwordHash: 'rodovar2026' }
    ];

    let currentEmployees = DEFAULT_EMPLOYEES_LOCAL;
    const storedEmployees = localStorage.getItem('rodovar_registered_employees_v2');
    if (storedEmployees) {
      try {
        currentEmployees = JSON.parse(storedEmployees);
        // Ensure Ricardo exists in loaded custom employees as well
        if (!currentEmployees.some((emp: any) => emp.username === 'ricardo')) {
          currentEmployees.push({ name: 'Ricardo', username: 'ricardo', role: 'Diretor de Operações', passwordHash: 'rodovar2026' });
        }
      } catch {
        currentEmployees = DEFAULT_EMPLOYEES_LOCAL;
      }
    }

    // Support handle for 'petrônio' accent variation typing
    const queryUser = cleanUser === 'petrônio' ? 'petronio' : cleanUser;
    
    // Direct Master profile validation
    if (queryUser === 'master') {
      if (cleanPass === 'txhfpb6xcj') {
        const sessionData = {
          username: 'master',
          displayName: 'Administrador Master',
          role: 'Master'
        };
        localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
        onLoginSuccess(sessionData);
        return;
      } else {
        setError('Usuário ou senha incorretos.');
        return;
      }
    }
    
    const matchedEmployee = currentEmployees.find(emp => emp.username === queryUser);

    if (matchedEmployee && matchedEmployee.passwordHash === cleanPass) {
      const sessionData = {
        username: matchedEmployee.username,
        displayName: matchedEmployee.name,
        role: matchedEmployee.role
      };
      
      localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
      onLoginSuccess(sessionData);
    } else {
      setError('Usuário ou senha incorretos.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center justify-center p-6 relative select-none font-sans bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,214,0,0.08),rgba(255,255,255,0))]">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-[#121212] border border-zinc-800 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative"
      >
        {/* Rodovar Branding / Symbol */}
        <div className="flex flex-col items-center mb-8">
          <img 
            src="https://rodovar.com.br/wp-content/uploads/2026/02/logo.png" 
            alt="Rodovar" 
            className="h-16 w-auto object-contain mb-4 transition-transform hover:scale-105" 
            referrerPolicy="no-referrer"
          />
          <div className="text-center">
            <h1 className="text-xl font-black tracking-tight text-[#FFD600] uppercase">
              RodoVar Monitora
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase font-mono tracking-widest mt-1">
              Painel de Rastreamento & Monitoramento
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
              Usuário
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Insira seu usuário"
                className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 focus:outline-none transition-colors"
                id="login-username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
              Senha
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Insira sua senha"
                className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 focus:outline-none transition-colors"
                id="login-password"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-3 bg-red-950/30 border border-red-900/60 rounded-xl text-xs text-red-400 font-medium font-sans text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-xl transition-all active:scale-98 cursor-pointer shadow-[0_4px_20px_rgba(255,214,0,0.15)] flex justify-center items-center gap-2"
            id="login-submit-btn"
          >
            Acessar Sistema
          </button>
        </form>
      </motion.div>

      {/* Decorative clean footer */}
      <div className="absolute bottom-6 text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
        Rodovar Transportadora LTDA © 2026
      </div>
    </div>
  );
}
