import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, User, Eye, EyeOff, Mail, Key, ShieldCheck, Clock, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { 
  registerSystemLog, 
  validateInvitation, 
  useInvitationToken, 
  registerCollaboratorProfile, 
  getCollaboratorProfileByEmail, 
  getCollaboratorProfileByUsername, 
  checkFailedLoginAttempts, 
  registerFailedLoginAttempt, 
  resetFailedLoginAttempts, 
  updateCollaboratorPasswordChangeFlag,
  updateCollaboratorPasswordChangeDone,
  getLegacyEmployeesFromFirestore,
  saveLegacyEmployeesToFirestore
} from '../db/storage';
import { auth, db } from '../db/firebase';
import { collection, doc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { Colaborador } from '../types';

interface LoginProps {
  onLoginSuccess: (userData: { username: string; displayName: string; role: string }) => void;
  onBackToTracking?: () => void;
}

export default function Login({ onLoginSuccess, onBackToTracking }: LoginProps) {
  // Views: 'login' | 'register' | 'force_password'
  const [view, setView] = useState<'login' | 'register' | 'force_password'>('login');
  
  // Login fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Invitation Registration fields
  const [regToken, setRegToken] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  // Force Password Change fields
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forceUser, setForceUser] = useState<{ uid: string; username: string; email: string; name: string; role: string } | null>(null);

  // Check query or hash for invitation link on mount
  useEffect(() => {
    const handleUrlToken = () => {
      const queryParams = new URLSearchParams(window.location.search);
      let token = queryParams.get('token') || queryParams.get('invite');
      let email = queryParams.get('email');

      // Check hash parameters if query parameters are empty
      if (!token && window.location.hash) {
        const hashParts = window.location.hash.split('?');
        if (hashParts.length > 1) {
          const hashParams = new URLSearchParams(hashParts[1]);
          token = hashParams.get('token') || hashParams.get('invite');
          email = hashParams.get('email');
        }
      }

      if (token) {
        setRegToken(token);
        if (email) setRegEmail(email);
        setView('register');
        registerSystemLog('Acesso de Convite', `Acessou tela de completação de cadastro com token de convite.`);
      }
    };

    handleUrlToken();
    window.addEventListener('hashchange', handleUrlToken);
    return () => window.removeEventListener('hashchange', handleUrlToken);
  }, []);

  // Handle standard/Firebase Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanUser || !cleanPass) {
      setError('Por favor, preencha todos os campos.');
      setLoading(false);
      return;
    }

    try {
      // 1. Check failed attempts cooldown first
      const lockCheck = await checkFailedLoginAttempts(cleanUser);
      if (lockCheck.lockedUntil > Date.now()) {
        const minutesLeft = Math.ceil((lockCheck.lockedUntil - Date.now()) / (60 * 1000));
        setError(`Conta bloqueada por excesso de tentativas. Aguarde mais ${minutesLeft} minuto(s).`);
        setLoading(false);
        return;
      }

      // Direct Master profile validation
      if (cleanUser === 'master') {
        if (cleanPass === 'txhfpb6xcj') {
          const sessionData = {
            username: 'master',
            displayName: 'Administrador Master',
            role: 'Master'
          };
          await resetFailedLoginAttempts('master');
          localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
          registerSystemLog('Login', `Administrador Master realizou login no sistema.`);
          onLoginSuccess(sessionData);
          setLoading(false);
          return;
        } else {
          await registerFailedLoginAttempt('master');
          registerSystemLog('Tentativa de Login Inválida', `Tentativa de login falhou para perfil Master.`);
          setError('Usuário ou senha incorretos.');
          setLoading(false);
          return;
        }
      }

      // 2. Load Firestore Profile if exists
      let profile = await getCollaboratorProfileByUsername(cleanUser);
      if (!profile && cleanUser.includes('@')) {
        profile = await getCollaboratorProfileByEmail(cleanUser);
      }

      if (profile) {
        // Check approval status first
        if (profile.status === 'pendente') {
          setError('Sua conta está aguardando aprovação do Suporte.');
          setLoading(false);
          return;
        }

        // Custom Master password override check
        if (profile.passwordOverride && profile.passwordOverride === cleanPass) {
          await resetFailedLoginAttempts(cleanUser);

          if (profile.forcePasswordChange) {
            setForceUser({
              uid: profile.uid,
              username: profile.username,
              email: profile.email,
              name: profile.name,
              role: profile.detailedRole
            });
            setView('force_password');
            setLoading(false);
            return;
          }

          const sessionData = {
            username: profile.username,
            displayName: profile.name,
            role: profile.detailedRole
          };

          localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
          registerSystemLog('Login', `Colaborador ${sessionData.displayName} (${sessionData.role}) logou com senha alterada pelo Master.`);
          onLoginSuccess(sessionData);
          setLoading(false);
          return;
        }

        // Authenticate with Real Firebase Auth
        try {
          const userCredential = await signInWithEmailAndPassword(auth, profile.email, cleanPass);
          const user = userCredential.user;

          // Successful Firebase Auth Login! Reset attempts.
          await resetFailedLoginAttempts(cleanUser);

          // Check if password change is forced
          if (profile.forcePasswordChange) {
            setForceUser({
              uid: user.uid,
              username: profile.username,
              email: profile.email,
              name: profile.name,
              role: profile.detailedRole
            });
            setView('force_password');
            setLoading(false);
            return;
          }

          const sessionData = {
            username: profile.username,
            displayName: profile.name,
            role: profile.detailedRole
          };

          localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
          registerSystemLog('Login', `Colaborador ${sessionData.displayName} (${sessionData.role}) realizou login real no Firebase.`);
          onLoginSuccess(sessionData);
        } catch (authError: any) {
          // Increment failed attempts
          await registerFailedLoginAttempt(cleanUser);
          registerSystemLog('Tentativa de Login Inválida', `Tentativa de login falhou para colaborador ${cleanUser}.`);
          setError('Usuário ou senha incorretos.');
        }
        setLoading(false);
        return;
      }

      // 3. Fallback to Local Employees database (for backwards compatibility/legacy logins)
      const DEFAULT_EMPLOYEES_LOCAL = [
        { name: 'Jairo Bahia', username: 'jairobahia', role: 'Operador', passwordHash: 'Danone01' },
        { name: 'Genivaldo', username: 'genivaldo', role: 'Gerente', passwordHash: 'rodovar2026' },
        { name: 'Alexandre', username: 'alexandre', role: 'Diretor Comercial', passwordHash: 'rodovar2026' },
        { name: 'Vitor', username: 'vitor', role: 'Diretor de Operações', passwordHash: 'rodovar2026' },
        { name: 'Ricardo', username: 'ricardo', role: 'Diretor de Operações', passwordHash: 'rodovar2026' },
        { name: 'Petrônio', username: 'petronio', role: 'Financeiro', passwordHash: 'rodovar2026' }
      ];

      // Sync legacy employees from Firestore before checking to enable cross-device login
      try {
        const cloudEmployees = await getLegacyEmployeesFromFirestore();
        if (cloudEmployees && cloudEmployees.length > 0) {
          localStorage.setItem('rodovar_registered_employees_v2', JSON.stringify(cloudEmployees));
          
          const currentPasswords: Record<string, string> = {};
          cloudEmployees.forEach((emp: any) => {
            currentPasswords[emp.username] = emp.passwordHash;
          });
          localStorage.setItem('rodovar_user_passwords_v2', JSON.stringify(currentPasswords));
        }
      } catch (err) {
        console.warn("Could not sync cloud legacy employees before login:", err);
      }

      let currentEmployees = DEFAULT_EMPLOYEES_LOCAL;
      const storedEmployees = localStorage.getItem('rodovar_registered_employees_v2');
      if (storedEmployees) {
        try {
          currentEmployees = JSON.parse(storedEmployees);
        } catch {}
      }

      const queryUser = cleanUser === 'petrônio' ? 'petronio' : cleanUser;
      const matchedEmployee = currentEmployees.find(emp => emp.username === queryUser);

      let expectedPassword = matchedEmployee?.passwordHash;
      const storedUserPasswords = localStorage.getItem('rodovar_user_passwords_v2');
      if (storedUserPasswords) {
        try {
          const parsedPasswords = JSON.parse(storedUserPasswords);
          if (parsedPasswords[queryUser]) {
            expectedPassword = parsedPasswords[queryUser];
          }
        } catch {}
      }

      if (matchedEmployee && expectedPassword === cleanPass) {
        const sessionData = {
          username: matchedEmployee.username,
          displayName: matchedEmployee.name,
          role: matchedEmployee.role
        };
        
        await resetFailedLoginAttempts(cleanUser);
        localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
        registerSystemLog('Login Legacy', `Colaborador ${sessionData.displayName} (${sessionData.role}) logado via legado.`);
        onLoginSuccess(sessionData);
      } else {
        await registerFailedLoginAttempt(cleanUser);
        registerSystemLog('Tentativa de Login Inválida', `Tentativa de login falhou para legado ${cleanUser}.`);
        setError('Usuário ou senha incorretos.');
      }
    } catch (err: any) {
      setError('Ocorreu um erro no servidor de autenticação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Handle invitation complete registration
  const handleRegisterWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRegSuccess(null);
    setLoading(true);

    const cleanToken = regToken.trim();
    const cleanEmail = regEmail.trim().toLowerCase();
    const cleanName = regFullName.trim();
    const cleanUser = regUsername.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPass = regPassword.trim();

    if (!cleanToken || !cleanEmail || !cleanName || !cleanUser || !cleanPass) {
      setError('Por favor, preencha todos os campos.');
      setLoading(false);
      return;
    }

    if (cleanPass.length < 6) {
      setError('A senha de cadastro deve conter no mínimo 6 caracteres.');
      setLoading(false);
      return;
    }

    if (cleanUser === 'master' || cleanUser === 'sistema') {
      setError('Nome de usuário reservado indisponível.');
      setLoading(false);
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('As senhas digitadas não coincidem.');
      setLoading(false);
      return;
    }

    try {
      // 1. Validate Invitation token and email
      const validation = await validateInvitation(cleanToken, cleanEmail);
      if (!validation.valid) {
        setError(validation.error || 'Convite inválido.');
        setLoading(false);
        return;
      }

      // 2. Prevent duplicate username in Firestore
      const duplicateUser = await getCollaboratorProfileByUsername(cleanUser);
      if (duplicateUser) {
        setError(`O usuário "${cleanUser}" já está cadastrado no sistema.`);
        setLoading(false);
        return;
      }

      // 3. Create real Firebase auth email/password account
      let user: { uid: string } | null = null;
      let registeredViaAuthFallback = false;

      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
        user = userCredential.user;
      } catch (authErr: any) {
        console.warn("Firebase Auth error during registration, attempting Firestore-only registration:", authErr);
        const code = authErr.code || '';
        if (code === 'auth/operation-not-allowed' || 
            code === 'auth/admin-restricted-operation' || 
            code === 'auth/configuration-not-found' || 
            authErr.message?.includes('operation-not-allowed') ||
            authErr.message?.includes('not-allowed')) {
          registeredViaAuthFallback = true;
          // Generate custom unique ID in colaboradores
          const customId = doc(collection(db, 'colaboradores')).id;
          user = { uid: customId };
        } else {
          throw authErr;
        }
      }

      // 4. Save custom profiles in Firestore "colaboradores"
      const role = validation.role || 'leitura';
      const detailedRole = role === 'admin' ? 'Gerente' : role === 'operador' ? 'Operador' : 'Visitante';

      const profile: Colaborador = {
        id: user.uid,
        uid: user.uid,
        name: cleanName,
        username: cleanUser,
        email: cleanEmail,
        role,
        detailedRole,
        status: 'pendente', // Requires manually Master approval (Requirement 2)
        forcePasswordChange: registeredViaAuthFallback ? false : true, // Force password change on first login if registered via standard auth
        created_at: new Date().toISOString()
      };

      if (registeredViaAuthFallback) {
        profile.passwordOverride = cleanPass;
      }

      await registerCollaboratorProfile(profile);

      // 5. Mark token as used
      await useInvitationToken(cleanToken);

      // 6. Sign out newly registered user immediately until approved
      if (auth.currentUser) {
        await auth.signOut();
      }

      registerSystemLog('Auto Cadastro Colaborador', `Colaborador ${cleanName} (usuário: ${cleanUser}) se auto-cadastrou via convite.`);
      setRegSuccess(`Cadastro realizado com sucesso total! Sua conta de perfil "${detailedRole}" foi enviada para aprovação pendente do Suporte.`);
      
      // Reset form fields
      setRegToken('');
      setRegEmail('');
      setRegFullName('');
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (err: any) {
      console.error("Erro ao registrar colaborador com convite:", err);
      const errMsg = err.message || '';
      const errCode = err.code || '';
      
      if (errCode === 'auth/email-already-in-use' || errMsg.includes('email-already-in-use')) {
        setError(
          `⚠️ O e-mail "${cleanEmail}" já está cadastrado no Firebase do sistema.\n\n` +
          `Como este e-mail já possui uma conta ativa, você não pode registrar uma nova conta usando o mesmo endereço.\n\n` +
          `💡 O que fazer?\n` +
          `1. Caso você esteja apenas testando o fluxo, peça ao Suporte para gerar um convite para outro e-mail seu (ex: um e-mail alternativo ou de testes).\n` +
          `2. Se você precisa reutilizar este e-mail, o Suporte precisará primeiro excluir o cadastro antigo deste e-mail na aba 'Cadastro > Colaboradores Credenciados' clicando na lixeira vermelha.`
        );
      } else if (errCode === 'auth/weak-password' || errMsg.includes('weak-password')) {
        setError('⚠️ A senha definida é muito fraca. Ela deve conter pelo menos 6 caracteres.');
      } else if (errCode === 'auth/invalid-email' || errMsg.includes('invalid-email')) {
        setError('⚠️ O formato do e-mail inserido é inválido.');
      } else {
        setError(`⚠️ Falha no Firebase: ${err.message || 'Erro inesperado ao registrar conta.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Forced Password Change (Requirement 6)
  const handleForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!newPassword || !newPasswordConfirm) {
      setError('Por favor, preencha todos os campos.');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('A nova senha deve possuir pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setError('As senhas não coincidem.');
      setLoading(false);
      return;
    }

    try {
      if (forceUser) {
        if (auth.currentUser) {
          try {
            // Update user password in Firebase auth
            await updatePassword(auth.currentUser, newPassword);
          } catch (authErr) {
            console.warn('Could not update Firebase Auth password directly, falling back to Firestore override:', authErr);
          }
        }

        // Always update/sync the password change done state in Firestore
        await updateCollaboratorPasswordChangeDone(forceUser.uid, newPassword);

        // Auto authenticate session
        const sessionData = {
          username: forceUser.username,
          displayName: forceUser.name,
          role: forceUser.role
        };

        localStorage.setItem('rodovar_active_login_v2', JSON.stringify(sessionData));
        registerSystemLog('Troca de Senha Obrigatória', `Colaborador ${forceUser.name} realizou a troca obrigatória de primeiro acesso com sucesso.`);
        
        onLoginSuccess(sessionData);
      } else {
        setError('Nenhum usuário ativo para trocar a senha.');
      }
    } catch (err: any) {
      setError('Erro ao trocar de senha. Caso o login tenha expirado, tente fazer o login de novo.');
    } finally {
      setLoading(false);
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

        <AnimatePresence mode="wait">
          {/* LOGIN VIEW */}
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              className="space-y-5"
            >
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
                    Usuário ou E-mail
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Insira seu usuário ou email"
                      className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 focus:outline-none transition-colors"
                      id="login-username"
                      disabled={loading}
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
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Insira sua senha"
                      className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-600 rounded-xl pl-10 pr-12 py-3 focus:outline-none transition-colors"
                      id="login-password"
                      autoComplete="current-password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-[#FFD600] transition-colors cursor-pointer"
                      id="login-password-toggle"
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-950/30 border border-red-900/60 rounded-xl text-xs text-red-400 font-medium font-sans text-center">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#FFD600] hover:bg-[#ffe23b] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-xl transition-all active:scale-98 cursor-pointer shadow-[0_4px_20px_rgba(255,214,0,0.15)] flex justify-center items-center gap-2"
                  id="login-submit-btn"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Acessar Sistema'}
                </button>
              </form>

              <div className="pt-3 border-t border-zinc-900 text-center">
                <button
                  type="button"
                  onClick={() => setView('register')}
                  className="text-[11px] text-[#FFD600] hover:underline font-mono uppercase tracking-wide cursor-pointer bg-transparent border-none outline-none"
                >
                  📥 Tem um Convite? Completar Cadastro
                </button>
              </div>
            </motion.div>
          )}

          {/* INVITATION COMPLETE REGISTRATION VIEW */}
          {view === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
                <button 
                  onClick={() => { setView('login'); setError(null); setRegSuccess(null); }}
                  className="p-1 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
                >
                  <ArrowLeft size={16} />
                </button>
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider font-sans">Completar Cadastro</h3>
              </div>

              {regSuccess ? (
                <div className="space-y-4 text-center py-4">
                  <div className="w-12 h-12 bg-emerald-950/40 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 animate-bounce">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-emerald-400 font-medium leading-relaxed font-sans px-2">
                    {regSuccess}
                  </p>
                  <button
                    onClick={() => { setView('login'); setRegSuccess(null); setError(null); }}
                    className="mt-2 px-5 py-2 bg-[#FFD600] text-black text-xs font-black font-mono uppercase tracking-wider rounded-lg hover:bg-[#ffe23b] transition cursor-pointer"
                  >
                    Voltar ao Login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegisterWithInvite} className="space-y-3.5">
                  <div className="grid grid-cols-1 gap-3">
                    {/* Token de Convite */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">Token de Convite</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><Key size={14} /></span>
                        <input
                          type="text"
                          value={regToken}
                          onChange={(e) => setRegToken(e.target.value)}
                          placeholder="tok-xxxxxxxx..."
                          className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none transition-colors"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* E-mail cadastrado */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">E-mail Autorizado</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><Mail size={14} /></span>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="email@exemplo.com"
                          className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none transition-colors"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* Nome Completo */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">Nome Completo</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500"><User size={14} /></span>
                        <input
                          type="text"
                          value={regFullName}
                          onChange={(e) => setRegFullName(e.target.value)}
                          placeholder="Nome e Sobrenome"
                          className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none transition-colors"
                          required
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* Username slug */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">Usuário (Slug sem espaços)</label>
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                        placeholder="ex: vitorgomes"
                        className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg px-3 py-2.5 focus:outline-none transition-colors font-mono"
                        required
                        disabled={loading}
                      />
                    </div>

                    {/* Senha */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">Definir Senha (Mínimo 6 dígitos)</label>
                      <div className="relative">
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Defina uma senha forte"
                          className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg px-3 pr-10 py-2.5 focus:outline-none transition-colors"
                          required
                          disabled={loading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-white cursor-pointer"
                          disabled={loading}
                        >
                          {showRegPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirmar Senha */}
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-mono tracking-wider text-zinc-400 font-bold">Confirmar Senha</label>
                      <input
                        type={showRegPassword ? 'text' : 'password'}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Repita a senha definida"
                        className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-xs text-zinc-200 placeholder-zinc-700 rounded-lg px-3 py-2.5 focus:outline-none transition-colors"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-lg text-[11px] text-red-400 font-sans text-left whitespace-pre-line leading-relaxed">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[#FFD600] hover:bg-[#ffe23b] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-lg transition-all active:scale-98 cursor-pointer flex justify-center items-center gap-2 shadow-md mt-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Cadastro'}
                  </button>
                </form>
              )}
            </motion.div>
          )}

          {/* FORCED PASSWORD CHANGE VIEW (Requirement 6) */}
          {view === 'force_password' && (
            <motion.div
              key="force_password"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="text-center py-2 space-y-2 border-b border-zinc-900 pb-4">
                <ShieldCheck className="w-10 h-10 text-[#FFD600] mx-auto animate-pulse" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">Atualização Obrigatória</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed max-w-sm mx-auto font-sans">
                  Olá, <strong className="text-zinc-200">{forceUser?.name}</strong>! Como este é o seu <strong>primeiro acesso</strong>, por motivos estritos de segurança, você deve atualizar sua senha de acesso.
                </p>
              </div>

              <form onSubmit={handleForcePasswordChange} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Nova Senha (Mínimo 6 dígitos)</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Defina sua nova senha"
                      className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-700 rounded-xl px-4 pr-12 py-3 focus:outline-none transition-colors"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-white cursor-pointer"
                      disabled={loading}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Confirmar Nova Senha</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-[#18181b] border border-zinc-800 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-700 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-950/20 border border-red-900/50 rounded-xl text-xs text-red-400 font-sans text-center">
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#FFD600] hover:bg-[#ffe23b] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-xl transition-all active:scale-98 cursor-pointer flex justify-center items-center gap-2 shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Atualizar e Acessar'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {onBackToTracking && view === 'login' && (
          <div className="mt-5 text-center" id="back-to-truck-tracking-link-wrap">
            <button
              type="button"
              onClick={onBackToTracking}
              className="text-xs text-zinc-500 hover:text-[#FFD600] uppercase font-mono tracking-wider transition-colors cursor-pointer bg-transparent border-0 outline-none"
              id="back-to-tracking-card-btn"
            >
              ← Voltar para Consulta de Frete
            </button>
          </div>
        )}
      </motion.div>

      {/* Decorative clean footer */}
      <div className="absolute bottom-6 text-[9px] text-zinc-600 font-mono uppercase tracking-widest">
        Rodovar Transportadora LTDA © 2026
      </div>
    </div>
  );
}
