import React, { useState, useEffect } from 'react';
import { dbAdapter } from '../db/databaseAdapter';
import { 
  Database, 
  Download, 
  Upload, 
  Server, 
  RefreshCw, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle,
  Code
} from 'lucide-react';

interface SystemMigrationProps {
  onClose?: () => void;
}

export default function SystemMigration({ onClose }: SystemMigrationProps) {
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState(false);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    try {
      const status = await dbAdapter.getConnectionStatus();
      setConnectionStatus(status);
    } catch {
      setConnectionStatus('offline');
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await dbAdapter.exportarDados();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rodovar_database_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Erro ao exportar banco de dados: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const processImport = async (jsonString: string) => {
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(false);
    try {
      const parsed = JSON.parse(jsonString);
      
      // Strict schema verification
      if (!parsed || parsed.schema_version !== '3.2-PRO') {
        throw new Error('Formato de backup inválido ou versão incompatível (esperada versão: "3.2-PRO").');
      }

      await dbAdapter.importarDados(parsed);
      setImportSuccess(true);
      
      if (window.falarRodovar) {
        window.falarRodovar("Banco de dados completo importado com sucesso absoluto.");
      }
    } catch (err: any) {
      setImportError(err.message || 'Erro desconhecido ao ler o arquivo JSON.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        processImport(event.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          processImport(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-6" id="system-migration-root">
      {/* Top Header Card */}
      <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FFD600]/5 rounded-full filter blur-3xl translate-x-20 -translate-y-20 pointer-events-none"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-[#FFD600]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#FFD600]">Mecanismo de Adaptador de Dados</span>
            </div>
            <h1 className="text-xl font-bold font-sans tracking-tight text-white">Configuração do Sistema & Migração</h1>
            <p className="text-xs text-zinc-400">
              Gerencie a portabilidade do RODOVAR MONITORA através do padrão Adapter/Repository, permitindo migrações rápidas e livres de rewrite lock-in.
            </p>
          </div>
          <button 
            type="button"
            onClick={checkConnection}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 rounded-lg text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${connectionStatus === 'checking' ? 'animate-spin' : ''}`} />
            Sincronizar Conexão
          </button>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 border-t border-zinc-900 pt-6">
          <div className="bg-zinc-900/45 border border-zinc-850 rounded-xl p-3.5">
            <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase block tracking-wider">Driver Ativo</span>
            <div className="text-sm font-black text-white mt-1 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#FFD600]" />
              {dbAdapter.providerName}
            </div>
          </div>
          <div className="bg-zinc-900/45 border border-zinc-850 rounded-xl p-3.5">
            <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase block tracking-wider">Status do Link</span>
            <div className="text-sm font-black mt-1 flex items-center gap-2">
              {connectionStatus === 'online' && (
                <>
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-emerald-400">ONLINE</span>
                </>
              )}
              {connectionStatus === 'offline' && (
                <>
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span>
                  <span className="text-rose-400">OFFLINE</span>
                </>
              )}
              {connectionStatus === 'checking' && (
                <>
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-bounce"></span>
                  <span className="text-amber-400">VERIFICANDO...</span>
                </>
              )}
            </div>
          </div>
          <div className="bg-zinc-900/45 border border-zinc-850 rounded-xl p-3.5">
            <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase block tracking-wider">Tipo de Esquema</span>
            <div className="text-sm font-black text-zinc-300 mt-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Documental / Relacional
            </div>
          </div>
        </div>
      </div>

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Backup / Export / Import operations */}
        <div className="space-y-6">
          {/* Export Box */}
          <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Download className="w-4 h-4 text-[#FFD600]" />
                Exportar Banco de Dados Completo
              </h2>
              <p className="text-xs text-zinc-400">
                Gere um arquivo estruturado com as coleções de entregas, colaboradores, cadastros, histórico de logs e regras do Telegram.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FFD600] hover:bg-[#FFD600]/90 text-zinc-950 rounded-xl text-xs font-bold font-sans tracking-wide uppercase transition-colors cursor-pointer"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Gerando Estrutura de Exportação...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Baixar JSON de Exportação Completo
                </>
              )}
            </button>
          </div>

          {/* Import Box */}
          <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#FFD600]" />
                Importar Banco de Dados Completo
              </h2>
              <p className="text-xs text-zinc-400">
                Selecione ou solte um arquivo JSON compatível com a assinatura do sistema (versão de esquema: 3.2-PRO) para restauração em lote.
              </p>
            </div>

            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors relative ${
                dragActive ? 'border-[#FFD600] bg-[#FFD600]/5' : 'border-zinc-800 bg-zinc-900/20'
              }`}
            >
              <input 
                type="file" 
                id="migration-file-input" 
                accept=".json"
                onChange={handleFileChange}
                className="hidden" 
              />
              <label 
                htmlFor="migration-file-input" 
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <Upload className="w-5 h-5 text-zinc-400" />
                </div>
                <span className="text-xs font-bold text-white font-sans">
                  Arraste o arquivo JSON ou clique para selecionar
                </span>
                <span className="text-[10px] text-zinc-500 font-mono uppercase">
                  Limites: Máx. 16MB • Tipo: JSON
                </span>
              </label>
            </div>

            {/* Success message banner */}
            {importSuccess && (
              <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/60 rounded-xl text-emerald-400 flex items-start gap-2.5">
                <CheckCircle className="w-4.5 h-4.5 shrink-0 text-emerald-400 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-bold block uppercase text-[10px] tracking-wider text-emerald-400">Sincronização Bem-Sucedida!</strong>
                  Os dados foram importados, validados e propagados em tempo real na nuvem do driver ativo.
                </div>
              </div>
            )}

            {/* Error message banner */}
            {importError && (
              <div className="p-3.5 bg-rose-950/20 border border-rose-900/60 rounded-xl text-rose-400 flex items-start gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-rose-400 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="font-bold block uppercase text-[10px] tracking-wider text-rose-400">Falha de Validação do Schema</strong>
                  {importError}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions / Migration Steps */}
        <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-5 space-y-4">
          <div className="space-y-1 border-b border-zinc-900 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <HelpCircle className="w-4.5 h-4.5 text-[#FFD600]" />
              Manual de Portabilidade & Troca de Banco
            </h2>
            <p className="text-xs text-zinc-400">
              Instruções estruturadas para realizar a troca do servidor ativo no futuro em menos de 10 minutos.
            </p>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[360px] pr-2 scrollbar-thin">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono font-bold text-[#FFD600] shrink-0">
                  1
                </div>
                <div className="w-0.5 flex-1 bg-zinc-900 mt-1"></div>
              </div>
              <div className="space-y-1 pb-4">
                <h3 className="text-xs font-bold text-white font-sans uppercase tracking-tight">Exportar Dados Atuais</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Utilize o botão "Baixar JSON de Exportação Completo" à esquerda para transferir toda a estrutura relacional/documental armazenada.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono font-bold text-[#FFD600] shrink-0">
                  2
                </div>
                <div className="w-0.5 flex-1 bg-zinc-900 mt-1"></div>
              </div>
              <div className="space-y-1 pb-4">
                <h3 className="text-xs font-bold text-white font-sans uppercase tracking-tight">Criar Novo Driver / Adapter</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Crie um arquivo na pasta <code className="text-zinc-300 font-mono text-[10px] bg-zinc-900 px-1 py-0.5 rounded">src/db/novoAdapter.ts</code> implementando a interface genérica <code className="text-zinc-300 font-mono text-[10px] bg-zinc-900 px-1 py-0.5 rounded">DatabaseAdapter</code> definida no sistema.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono font-bold text-[#FFD600] shrink-0">
                  3
                </div>
                <div className="w-0.5 flex-1 bg-zinc-900 mt-1"></div>
              </div>
              <div className="space-y-1 pb-4">
                <h3 className="text-xs font-bold text-white font-sans uppercase tracking-tight">Alterar o Endpoint Central</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No arquivo <code className="text-zinc-300 font-mono text-[10px] bg-zinc-900 px-1 py-0.5 rounded">src/db/databaseAdapter.ts</code>, mude a exportação para o novo adaptador criado:
                </p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 mt-1">
                  <pre className="text-[9px] font-mono text-[#FFD600] leading-tight">
                    {`import { novoAdapter } from './novoAdapter';\nexport const dbAdapter = novoAdapter;`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono font-bold text-[#FFD600] shrink-0">
                  4
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-white font-sans uppercase tracking-tight">Restaurar no Novo Servidor</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Faça login no sistema usando o novo banco de dados vazio, entre na aba "MIGRAÇÃO" e importe o arquivo JSON baixado no Passo 1.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
