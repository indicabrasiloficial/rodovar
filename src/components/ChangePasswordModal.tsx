import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, EyeOff, ShieldCheck } from 'lucide-react';

interface ChangePasswordModalProps {
  username: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ChangePasswordModal({ username, onClose, onSuccess }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanUser = username.toLowerCase();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A nova senha e a confirmação não conferem.');
      return;
    }

    // Load passwords list
    const defaults: Record<string, string> = {
      'jairobahia': 'Danone01',
      'genivaldo': 'rodovar2026',
      'alexandre': 'rodovar2026',
      'vitor': 'rodovar2026',
      'petronio': 'rodovar2026',
      'petrônio': 'rodovar2026'
    };
    
    let currentPasswords = defaults;
    const stored = localStorage.getItem('rodovar_user_passwords_v2');
    if (stored) {
      try {
        currentPasswords = { ...defaults, ...JSON.parse(stored) };
      } catch {
        currentPasswords = defaults;
      }
    }

    const correctPass = currentPasswords[cleanUser];

    if (currentPassword !== correctPass) {
      setError('A senha atual inserida está incorreta.');
      return;
    }

    // Save updated password
    currentPasswords[cleanUser as keyof typeof currentPasswords] = newPassword;
    localStorage.setItem('rodovar_user_passwords_v2', JSON.stringify(currentPasswords));

    setSuccessMsg('Senha alterada com sucesso total!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    setTimeout(() => {
      onSuccess();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[3000] p-4 animate-fade-in font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#121212] border border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
      >
        <div className="bg-zinc-950 border-b border-zinc-900 p-5 flex items-center gap-2.5 text-[#FFD600]">
          <Lock className="w-5 h-5 text-[#FFD600]" />
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">Alterar Senha do operador</h3>
            <p className="text-[9px] font-mono text-zinc-500 uppercase mt-0.5">Operador ativo: {username}</p>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="p-6 space-y-4">
          
          {/* Current Password - input password only, no show/hide toggle */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
              Senha Atual
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                <EyeOff className="w-4 h-4 text-zinc-600" />
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Insira a senha atual"
                className="w-full bg-[#18181b] border border-zinc-850 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-700 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none transition-colors"
                id="change-current-password"
                autoComplete="current-password"
              />
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
              Nova Senha
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                <EyeOff className="w-4 h-4 text-zinc-600" />
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Insira a nova senha"
                className="w-full bg-[#18181b] border border-zinc-850 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-700 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none transition-colors"
                id="change-new-password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                <EyeOff className="w-4 h-4 text-zinc-600" />
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Cofirme a nova senha"
                className="w-full bg-[#18181b] border border-zinc-850 focus:border-[#FFD600] text-sm text-zinc-200 placeholder-zinc-700 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none transition-colors"
                id="change-confirm-password"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 bg-red-950/30 border border-red-900/40 rounded-xl text-xs text-red-400 font-medium text-center"
            >
              {error}
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl text-xs text-emerald-400 font-semibold text-center flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {successMsg}
            </motion.div>
          )}

          <div className="flex gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-zinc-800 hover:bg-zinc-900 text-gray-400 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-extrabold text-xs uppercase font-mono tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Confirmar
            </button>
          </div>

        </form>
      </motion.div>
    </div>
  );
}
