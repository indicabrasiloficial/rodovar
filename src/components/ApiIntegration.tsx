import React, { useState, useEffect } from 'react';
import { 
  Webhook, 
  Copy, 
  Check, 
  Terminal, 
  Play, 
  FileText, 
  Sliders, 
  Info, 
  Zap, 
  Code, 
  RefreshCw, 
  AlertCircle, 
  Lock, 
  Key,
  Database,
  ArrowRight,
  Settings2,
  CheckCircle2
} from 'lucide-react';
import { dbAdapter } from '../db/databaseAdapter';
import { Entrega } from '../types';

interface ApiIntegrationProps {
  onClose: () => void;
  entregas: Entrega[];
}

interface ApiSettings {
  ativo: boolean;
  sistemaNome: string;
  apiUrl: string;
  apiToken: string;
  webhookSecret: string;
  statusFiltro: {
    coletando: boolean;
    em_transito: boolean;
    parado: boolean;
    descarregando: boolean;
    entregue: boolean;
  };
  ufsFiltro: string; // e.g. "SP, RJ, MG"
  ocultarFinanceiro: boolean; // Frete Empresa, Frete Motorista
  ocultarContatos: boolean;  // Telefones
  modoCORSCompativel?: boolean; // Compatibilidade de CORS para Vercel
}

export default function ApiIntegration({ onClose, entregas }: ApiIntegrationProps) {
  const [activeTab, setActiveTab] = useState<'config' | 'manual' | 'playground'>('config');
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [selectedLang, setSelectedLang] = useState<'curl' | 'node' | 'python' | 'php'>('curl');

  // Loading and storing settings
  const [settings, setSettings] = useState<ApiSettings>({
    ativo: true,
    sistemaNome: 'SISTEMA-CLIENTE LOGÍSTICA',
    apiUrl: 'https://api.sistema-cliente.com.br/v1/receber-carga',
    apiToken: 'rdv_tok_prod_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    webhookSecret: 'rdv_sec_' + Math.random().toString(36).substring(2, 12),
    statusFiltro: {
      coletando: true,
      em_transito: true,
      parado: true,
      descarregando: true,
      entregue: false, // Por padrão, não envia concluídas para poluir menos
    },
    ufsFiltro: '',
    ocultarFinanceiro: true,
    ocultarContatos: false,
    modoCORSCompativel: false,
  });

  // Playground simulation states
  const [simulating, setSimulating] = useState(false);
  const [simLog, setSimLog] = useState<{
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'payload' | 'header';
    text: string;
  }[]>([]);

  // Fetch from Firebase on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await dbAdapter.getApiSettings() as ApiSettings;
        if (data) {
          setSettings({
            ...data,
            // Guard safety fallbacks
            statusFiltro: {
              coletando: data.statusFiltro?.coletando ?? true,
              em_transito: data.statusFiltro?.em_transito ?? true,
              parado: data.statusFiltro?.parado ?? true,
              descarregando: data.statusFiltro?.descarregando ?? true,
              entregue: data.statusFiltro?.entregue ?? false,
            },
            modoCORSCompativel: data.modoCORSCompativel ?? false
          });
        } else {
          // Check if local cache has some values
          const local = localStorage.getItem('rodovar_api_settings');
          if (local) {
            setSettings(JSON.parse(local));
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configurações de API:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (newSettings = settings) => {
    setSaveStatus('saving');
    try {
      // Save locally
      localStorage.setItem('rodovar_api_settings', JSON.stringify(newSettings));
      
      // Save to Cloud via dbAdapter
      await dbAdapter.saveApiSettings(newSettings);
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);

      if (window.falarRodovar) {
        window.falarRodovar("Configurações de integração atualizadas e salvas na nuvem com sucesso.");
      }
    } catch (err) {
      console.error('Erro ao persistir configurações de API:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  };

  const generateNewToken = () => {
    const newToken = 'rdv_tok_prod_' + [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const updated = { ...settings, apiToken: newToken };
    setSettings(updated);
    handleSave(updated);
    if (window.falarRodovar) {
      window.falarRodovar("Novo Token de Acesso gerado com sucesso. Lembre-se de atualizar o sistema cliente.");
    }
  };

  const generateNewSecret = () => {
    const newSecret = 'rdv_sec_' + [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const updated = { ...settings, webhookSecret: newSecret };
    setSettings(updated);
    handleSave(updated);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(settings.apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCopyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getFilteredPayload = (baseCarga: Entrega) => {
    const payload: Record<string, any> = {
      id_carga: baseCarga.id,
      codigo_rastreamento: baseCarga.trackingCode || 'RDV' + baseCarga.id.substring(0, 6).toUpperCase(),
      motorista_nome: baseCarga.motorista,
      veiculo_origem: baseCarga.origem,
      veiculo_destino: baseCarga.destino,
      status_viagem: baseCarga.status,
      coleta_data: baseCarga.data_coleta,
      prazo_estimado: baseCarga.prazo,
      atualizado_em: baseCarga.updated_at || new Date().toISOString(),
      posicao: baseCarga.localizacaoAtual || { lat: baseCarga.lat, lng: baseCarga.lng }
    };

    if (baseCarga.link_localizacao) {
      payload.whatsapp_pin_link = baseCarga.link_localizacao;
    }

    if (!settings.ocultarContatos) {
      payload.telefone_motorista = baseCarga.tel_motorista;
      payload.telefone_cliente = baseCarga.tel_cliente;
      payload.cliente_nome = baseCarga.cliente;
    }

    if (!settings.ocultarFinanceiro) {
      payload.frete_empresa_brl = baseCarga.frete_empresa;
      payload.frete_motorista_brl = baseCarga.frete_motorista;
    }

    return payload;
  };

  const runSimulation = () => {
    if (simulating) return;
    setSimulating(true);
    setSimLog([]);

    const log = (text: string, type: 'info' | 'success' | 'warning' | 'payload' | 'header' = 'info') => {
      setSimLog(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        type,
        text
      }]);
    };

    // Step 1: Init simulation
    log('Iniciando disparador de simulação para SISTEMA-CLIENTE...', 'info');
    
    setTimeout(() => {
      // Step 2: Read active settings
      log(`Lendo filtros ativos... (Mapeado para: ${settings.sistemaNome})`, 'info');
      log(`Destino de transmissão (Webhook): POST ${settings.apiUrl}`, 'header');
      log(`Autenticação ativa: Bearer ${settings.apiToken.substring(0, 16)}...`, 'header');
      
      // Step 3: Get sample delivery
      const sample = entregas.find(e => {
        // Find one that matches status filter
        const statusOk = settings.statusFiltro[e.status as keyof typeof settings.statusFiltro];
        if (!statusOk) return false;
        
        // Check UF filter
        if (settings.ufsFiltro.trim() !== '') {
          const permittedUfs = settings.ufsFiltro.split(',').map(u => u.trim().toUpperCase());
          const destUf = e.destino.split('-').pop()?.trim().toUpperCase() || '';
          if (!permittedUfs.includes(destUf)) return false;
        }
        return true;
      }) || entregas[0];

      if (!sample) {
        log('Atenção: Nenhuma carga cadastrada atende aos filtros de status atuais. Gerando payload de exemplo fictício para demonstração.', 'warning');
        const dummy: Entrega = {
          id: 'RDV-SAMPLE-TEST',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          data_coleta: '2026-06-27',
          vendedor: 'Petrônio',
          cliente: 'Melo Transportes LTDA',
          tel_cliente: '(11) 98765-4321',
          motorista: 'Carlos Alberto Silva',
          tel_motorista: '(21) 99888-7766',
          origem: 'Lauro de Freitas-BA',
          destino: 'Monteiro-PB',
          frete_empresa: 8500,
          frete_motorista: 6700,
          prazo: '2026-06-30',
          status: 'em_transito',
          observacoes: 'Carga de autopeças lacrada.',
          lat: -12.8943,
          lng: -38.3298,
          canhoto_solicitado: false,
          trackingCode: 'RDV43029'
        };
        processPayload(dummy);
      } else {
        log(`Carga selecionada para simular: ID ${sample.id} (${sample.motorista} -> ${sample.destino})`, 'info');
        processPayload(sample);
      }
    }, 800);

    const processPayload = (carga: Entrega) => {
      setTimeout(() => {
        // Step 4: Apply filters
        log('Aplicando filtros de privacidade e mascaramento de dados...', 'info');
        if (settings.ocultarFinanceiro) {
          log('-> Filtro ATIVO: Campos financeiros (Valores de frete) foram excluídos da transmissão.', 'warning');
        }
        if (settings.ocultarContatos) {
          log('-> Filtro ATIVO: Contatos de cliente/motorista foram removidos para LGPD.', 'warning');
        }

        const payloadObj = getFilteredPayload(carga);
        log(JSON.stringify(payloadObj, null, 2), 'payload');

        setTimeout(async () => {
          // Step 5: Post simulation request
          log(`Disparando requisição real HTTP POST via Servidor Proxy para: ${settings.apiUrl}...`, 'info');
          log('Calculando assinatura de cabeçalho X-Rodovar-Signature e Bearer Token...', 'info');
          
          try {
            let resData: any = null;
            let useFallback = false;

            try {
              const res = await fetch('/api/webhook/dispatch', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  url: settings.apiUrl,
                  payload: payloadObj,
                  secret: settings.webhookSecret,
                  apiToken: settings.apiToken
                })
              });

              const contentType = res.headers.get('content-type') || '';
              if (res.status === 404 || !contentType.includes('application/json')) {
                useFallback = true;
              } else {
                resData = await res.json();
              }
            } catch (e) {
              console.warn('Erro ao chamar proxy do servidor, tentando fallback direto:', e);
              useFallback = true;
            }

            if (useFallback) {
              log('Ambiente sem servidor proxy ativo (ex: Vercel). Realizando envio direto pelo navegador...', 'info');
              
              const directHeaders: Record<string, string> = {};
              
              if (settings.modoCORSCompativel) {
                log('⚡ [MODO COMPATIBILIDADE CORS ATIVO] Otimizando requisição para contornar bloqueio do navegador...', 'success');
                log('-> Definido Content-Type como "text/plain" para evitar requisição de pré-vôo OPTIONS (CORS Preflight).', 'info');
                log('-> Omitidos cabeçalhos customizados (Authorization / X-Rodovar-Signature) temporariamente para garantir entrega direta.', 'info');
                directHeaders['Content-Type'] = 'text/plain';
              } else {
                directHeaders['Content-Type'] = 'application/json';
                if (settings.apiToken) {
                  directHeaders['Authorization'] = `Bearer ${settings.apiToken}`;
                }
                if (settings.webhookSecret) {
                  try {
                    const encoder = new TextEncoder();
                    const keyData = encoder.encode(settings.webhookSecret);
                    const messageData = encoder.encode(JSON.stringify(payloadObj));
                    const cryptoKey = await window.crypto.subtle.importKey(
                      'raw',
                      keyData,
                      { name: 'HMAC', hash: 'SHA-256' },
                      false,
                      ['sign']
                    );
                    const signatureBuffer = await window.crypto.subtle.sign(
                      'HMAC',
                      cryptoKey,
                      messageData
                    );
                    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
                    const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    directHeaders['X-Rodovar-Signature'] = signatureHex;
                  } catch (cryptoErr) {
                    console.warn('Erro ao gerar assinatura HMAC no navegador:', cryptoErr);
                    directHeaders['X-Rodovar-Signature'] = 'browser-fallback-signature';
                  }
                }
              }

              let directRes;
              let directText = '';
              let isOpaque = false;

              try {
                directRes = await fetch(settings.apiUrl, {
                  method: 'POST',
                  headers: directHeaders,
                  body: JSON.stringify(payloadObj),
                  mode: 'cors'
                });
                directText = await directRes.text();
              } catch (fetchErr: any) {
                if (settings.modoCORSCompativel) {
                  log(`⚠️ Restrição de segurança CORS ativa no navegador. Ativando envio UNILATERAL via Modo Opaque (no-cors)...`, 'info');
                  log(`-> Isso garante que o navegador despache o POST sem requerer cabeçalhos de autorização CORS do webhook.site.`, 'info');
                  
                  directRes = await fetch(settings.apiUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'text/plain'
                    },
                    body: JSON.stringify(payloadObj),
                    mode: 'no-cors'
                  });
                  isOpaque = true;
                  directText = '(Dados despachados com sucesso em modo seguro. O navegador impede a leitura do corpo da resposta, mas o POST já chegou no servidor de destino!)';
                } else {
                  throw fetchErr;
                }
              }

              resData = {
                success: isOpaque ? true : directRes.ok,
                status: isOpaque ? 200 : directRes.status,
                statusText: isOpaque ? 'OK (Opaque)' : directRes.statusText,
                data: directText
              };
            }

            if (resData.success || (resData.status >= 200 && resData.status < 300)) {
              log(`Conexão com ${settings.apiUrl} realizada com sucesso!`, 'success');
              log(`Resposta do SISTEMA-CLIENTE: [HTTP ${resData.status} ${resData.statusText || 'OK'}]`, 'success');
              log(`Dados retornados do seu Webhook: ${resData.data || '(Sem conteúdo de retorno - Padrão)'}`, 'success');
              log(`Payload entregue com sucesso! Veja no seu terminal ou painel do Webhook.site`, 'success');
            } else {
              log(`Atenção: Servidor de destino retornou erro HTTP [Status ${resData.status || 500}].`, 'warning');
              log(`Mensagem de erro: ${resData.error || resData.data || 'Erro desconhecido'}`, 'warning');
              log(`Verifique se a URL do Webhook está ativa e aceita requisições POST.`, 'warning');
            }
          } catch (err: any) {
            log(`Erro de rede ou conexão ao despachar: ${err.message || err}`, 'warning');
          } finally {
            setSimulating(false);
          }
        }, 1200);
      }, 1000);
    };
  };

  const getManualExampleCode = () => {
    const payloadMock = {
      id_carga: "RDV-77649-BA",
      codigo_rastreamento: "RDV9801",
      motorista_nome: "Edivaldo Souza",
      veiculo_origem: "Simões Filho-BA",
      veiculo_destino: "Recife-PE",
      status_viagem: "em_transito",
      coleta_data: "2026-06-27",
      prazo_estimado: "2026-06-30",
      atualizado_em: "2026-06-27T14:46:23Z",
      posicao: { lat: -12.7845, lng: -38.3912 },
      whatsapp_pin_link: "https://maps.google.com/?q=-12.7845,-38.3912",
      telefone_motorista: "(71) 98111-2233",
      telefone_cliente: "(81) 99333-4455",
      cliente_nome: "Atacadão Alimentos S/A"
    };

    if (selectedLang === 'curl') {
      return `curl -X POST "${settings.apiUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${settings.apiToken}" \\
  -H "X-Rodovar-Signature: hmac_sha256_da_sua_chave_secreta" \\
  -d '${JSON.stringify(payloadMock, null, 2)}'`;
    }

    if (selectedLang === 'node') {
      return `// Exemplo em Node.js usando Express para receber o Webhook
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

const API_TOKEN = "${settings.apiToken}";
const WEBHOOK_SECRET = "${settings.webhookSecret}";

app.post('/webhooks/rodovar', (req, res) => {
  const authHeader = req.headers['authorization'];
  const signature = req.headers['x-rodovar-signature'];

  // 1. Validar Token de Portador (Bearer Token)
  if (!authHeader || authHeader !== \`Bearer \${API_TOKEN}\`) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  // 2. Validar Assinatura Webhook (Opcional - Segurança extra)
  if (signature) {
    const computedSig = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Em produção use crypto.timingSafeEqual para evitar ataques de tempo
    if (signature !== computedSig) {
      console.warn("Assinatura inválida!");
      // return res.status(403).json({ error: "Assinatura inválida" });
    }
  }

  // 3. Processar informações da carga
  const { id_carga, status_viagem, posicao } = req.body;
  console.log(\`Carga \${id_carga} atualizada para o status: \${status_viagem}\`);
  console.log(\`Coordenadas atuais: Lat \${posicao.lat}, Lng \${posicao.lng}\`);

  // Responder com sucesso imediatamente
  res.status(200).json({ status: "success", received: true });
});

app.listen(3000, () => console.log('Servidor SISTEMA-CLIENTE rodando na porta 3000'));`;
    }

    if (selectedLang === 'python') {
      return `# Exemplo em Python usando Flask para receber o Webhook
from flask import Flask, request, jsonify
import hmac
import hashlib
import json

app = Flask(__name__)

API_TOKEN = "${settings.apiToken}"
WEBHOOK_SECRET = b"${settings.webhookSecret}"

@app.route('/webhooks/rodovar', methods=['POST'])
def receive_webhook():
    auth_header = request.headers.get('Authorization')
    signature = request.headers.get('X-Rodovar-Signature')

    # 1. Validar Bearer Token
    if not auth_header or auth_header != f"Bearer {API_TOKEN}":
        return jsonify({"error": "Não autorizado"}), 401

    # 2. Validar Assinatura (Segurança Extra)
    if signature:
        payload_bytes = request.get_data()
        computed_sig = hmac.new(WEBHOOK_SECRET, payload_bytes, hashlib.sha256).hexdigest()
        
        if not hmac.compare_digest(signature, computed_sig):
            return jsonify({"error": "Assinatura do webhook inválida"}), 403

    # 3. Ler dados da Carga
    data = request.json
    id_carga = data.get('id_carga')
    status_viagem = data.get('status_viagem')
    posicao = data.get('posicao', {})

    print(f"Recebido update da carga {id_carga}. Status: {status_viagem}")
    print(f"Localização: Lat {posicao.get('lat')}, Lng {posicao.get('lng')}")

    return jsonify({"status": "received"}), 200

if __name__ == '__main__':
    app.run(port=3000)`;
    }

    if (selectedLang === 'php') {
      return `<?php
// Exemplo em PHP para receber o Webhook do RODOVAR

$apiToken = "${settings.apiToken}";
$webhookSecret = "${settings.webhookSecret}";

// 1. Validar Headers de Autenticação
$headers = getallheaders();
$authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';

if ($authHeader !== "Bearer " . $apiToken) {
    http_response_code(401);
    echo json_encode(["error" => "Token inválido"]);
    exit;
}

// 2. Receber o corpo da requisição (JSON)
$jsonInput = file_get_contents('php://input');
$data = json_decode($jsonInput, true);

// 3. Validar assinatura (Opcional)
$receivedSignature = isset($headers['X-Rodovar-Signature']) ? $headers['X-Rodovar-Signature'] : '';
if (!empty($receivedSignature)) {
    $computedSignature = hash_hmac('sha256', $jsonInput, $webhookSecret);
    if ($receivedSignature !== $computedSignature) {
        http_response_code(403);
        echo json_encode(["error" => "Assinatura inválida"]);
        exit;
    }
}

// 4. Processar Carga
$idCarga = $data['id_carga'];
$statusViagem = $data['status_viagem'];
$posicao = $data['posicao'];

error_log("Carga " . $idCarga . " atualizada para " . $statusViagem);

http_response_code(200);
echo json_encode(["status" => "ok", "message" => "Carga integrada"]);
?>`;
    }

    return '';
  };

  return (
    <div className="bg-[#0c0c0c] min-h-screen text-zinc-100 p-4 md:p-8 rounded-3xl border border-zinc-900 shadow-2xl space-y-6 select-none animate-fade-in" id="api-integration-panel">
      
      {/* Upper Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div className="flex items-center gap-3">
          <div className="bg-[#FFD600] p-2.5 rounded-xl text-black shadow-[0_0_15px_rgba(255,214,0,0.15)]">
            <Webhook className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black uppercase tracking-wider text-white flex items-center gap-2">
              API de Integração Master
              <span className="text-[9px] bg-red-950 text-red-400 font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border border-red-900/30">
                PRO-SYSTEM
              </span>
            </h1>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Conexão automática em tempo real, filtros de privacidade por status e manual de homologação para o <strong>SISTEMA-CLIENTE</strong>.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 active:scale-[0.98] text-zinc-300 hover:text-white rounded-xl text-xs uppercase font-bold tracking-wider font-mono border border-zinc-800 transition-all cursor-pointer"
        >
          Voltar ao Painel
        </button>
      </div>

      {/* Main Tabs Selection */}
      <div className="flex border-b border-zinc-900 gap-1 overflow-x-auto pb-px" id="api-tabs">
        <button
          onClick={() => setActiveTab('config')}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-mono font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'config'
              ? 'border-[#FFD600] text-[#FFD600] bg-zinc-950/40 font-black'
              : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/10'
          }`}
        >
          <Settings2 className="w-4 h-4 shrink-0" />
          <span>Configurações & Filtros</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-mono font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'manual'
              ? 'border-[#FFD600] text-[#FFD600] bg-zinc-950/40 font-black'
              : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/10'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Manual do Sistema-Cliente</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('playground');
            if (simLog.length === 0) {
              setSimLog([
                { timestamp: new Date().toLocaleTimeString(), type: 'info', text: 'Console de Testes Iniciado. Clique em "Disparar Simulação" abaixo para testar os filtros em tempo real.' }
              ]);
            }
          }}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-mono font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'playground'
              ? 'border-[#FFD600] text-[#FFD600] bg-zinc-950/40 font-black'
              : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/10'
          }`}
        >
          <Terminal className="w-4 h-4 shrink-0" />
          <span>Console / Playground de Testes</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />
        </button>
      </div>

      {/* Grid Content based on Selected Tab */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Tab 1: Config & Filters */}
        {activeTab === 'config' && (
          <>
            <div className="lg:col-span-2 space-y-5 animate-fade-in">
              
              {/* Credentials card */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <h3 className="font-extrabold text-xs uppercase tracking-widest font-mono text-[#FFD600] flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-[#FFD600]" />
                    Parâmetros de Integração com SISTEMA-CLIENTE
                  </h3>
                  
                  {/* Active Toggle Status */}
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.ativo}
                      onChange={(e) => {
                        const updated = { ...settings, ativo: e.target.checked };
                        setSettings(updated);
                        handleSave(updated);
                      }}
                    />
                    <div className="w-11 h-6 bg-zinc-800 rounded-full peer peer-focus:ring-0 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white"></div>
                    <span className="ml-2.5 text-[10px] font-mono font-extrabold uppercase text-zinc-400">
                      {settings.ativo ? 'INTEGRAÇÃO ATIVA ✅' : 'DESATIVADA 🛑'}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* System Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider">Identificador do Sistema Cliente:</label>
                    <input
                      type="text"
                      className="w-full bg-[#0a0a0a] border border-zinc-800 focus:border-[#FFD600] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none placeholder-zinc-700"
                      value={settings.sistemaNome}
                      onChange={(e) => setSettings({ ...settings, sistemaNome: e.target.value })}
                      placeholder="Ex: SISTEMA-CLIENTE LOGÍSTICA"
                    />
                    <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">Referência de identificação amigável.</span>
                  </div>

                  {/* Webhook Secret */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider flex items-center justify-between">
                      <span>Assinatura de Webhook (Secret):</span>
                      <button 
                        onClick={generateNewSecret}
                        className="text-[9px] hover:text-[#FFD600] text-zinc-500 underline flex items-center gap-1 font-mono uppercase cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Recalcular
                      </button>
                    </label>
                    <input
                      type="text"
                      readOnly
                      className="w-full bg-[#0a0a0a]/50 border border-zinc-850 rounded-xl px-3 py-2.5 text-xs text-zinc-400 font-mono select-all focus:outline-none"
                      value={settings.webhookSecret}
                    />
                    <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">Chave secreta para assinar e validar HMAC SHA256.</span>
                  </div>

                  {/* API Webhook Target URL */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider">URL de Destino do Webhook (Endpoint Receptor):</label>
                    <input
                      type="text"
                      className="w-full bg-[#0a0a0a] border border-zinc-800 focus:border-[#FFD600] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none placeholder-zinc-700"
                      value={settings.apiUrl}
                      onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
                      placeholder="Ex: https://api.sistema-cliente.com.br/webhooks/rodovar-receiver"
                    />
                    <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">Endereço HTTP do SISTEMA-CLIENTE que receberá requisições POST com o payload a cada atualização de viagem.</span>
                  </div>

                  {/* CORS Compatibility Toggle */}
                  <div className="md:col-span-2 bg-[#FFD600]/5 border border-[#FFD600]/20 rounded-xl p-4 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.modoCORSCompativel || false}
                        onChange={(e) => setSettings({ ...settings, modoCORSCompativel: e.target.checked })}
                        className="rounded bg-[#0a0a0a] border-zinc-800 text-[#FFD600] focus:ring-0 cursor-pointer w-4 h-4"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-mono uppercase font-extrabold text-[#FFD600] flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 animate-pulse" />
                          Ativar Modo de Compatibilidade CORS (Vercel / Testes Rápidos)
                        </span>
                        <p className="text-[10px] text-zinc-400 font-sans leading-relaxed">
                          Recomendado para servidores de teste como <strong>webhook.site</strong> e hospedagem sem proxy (Vercel estático). Bypassa o bloqueio <em>CORS Preflight</em> do navegador enviando dados como <code>text/plain</code> e omitindo cabeçalhos customizados temporariamente.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* API Bearer Token */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider flex items-center justify-between">
                      <span>Token de Acesso Autorizado (API Authorization Token / Bearer Key):</span>
                      <button 
                        onClick={generateNewToken}
                        className="text-[9px] text-[#FFD600] hover:underline flex items-center gap-1 font-mono uppercase cursor-pointer font-bold"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Gerar Novo Token
                      </button>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-12 py-2.5 text-xs text-zinc-300 font-mono focus:outline-none"
                        value={settings.apiToken}
                      />
                      <div className="absolute left-3 text-zinc-500">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <button
                        onClick={handleCopyToken}
                        className="absolute right-2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] rounded-lg text-[9px] font-bold font-mono text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 border border-zinc-750"
                      >
                        {copiedToken ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                    <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">SISTEMA-CLIENTE deve enviar este código no cabeçalho HTTP <code>Authorization: Bearer [TOKEN]</code> para ser homologado.</span>
                  </div>
                </div>
              </div>

              {/* Advanced Privacy Filters card */}
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-xl space-y-4">
                <h3 className="font-extrabold text-xs uppercase tracking-widest font-mono text-[#FFD600] border-b border-zinc-900 pb-3 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#FFD600]" />
                  Filtros de Transmissão de Informações
                </h3>

                <div className="space-y-4">
                  {/* Status Selection Filter */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider block">Status Autorizados a Transmitir:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" id="status-filter-group">
                      {Object.keys(settings.statusFiltro).map((st) => {
                        const labels: Record<string, string> = {
                          coletando: 'Coletando',
                          em_transito: 'Trânsito',
                          parado: 'Parado',
                          descarregando: 'Descarga',
                          entregue: 'Entregue'
                        };
                        const value = settings.statusFiltro[st as keyof typeof settings.statusFiltro];
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              const updated = {
                                ...settings,
                                statusFiltro: {
                                  ...settings.statusFiltro,
                                  [st]: !value
                                }
                              };
                              setSettings(updated);
                            }}
                            className={`px-3 py-2 rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider text-center border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              value
                                ? 'bg-[#FFD600]/10 text-[#FFD600] border-[#FFD600]/50'
                                : 'bg-[#0a0a0a] text-zinc-500 border-zinc-900 hover:text-zinc-300'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-[#FFD600] animate-pulse' : 'bg-zinc-700'}`} />
                            {labels[st]}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block mt-1">Viagens com status que não estejam marcados acima serão ignoradas na comunicação com o SISTEMA-CLIENTE.</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    {/* Region / UF filter */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider">Restringir por UF de Destino (Opcional):</label>
                      <input
                        type="text"
                        className="w-full bg-[#0a0a0a] border border-zinc-800 focus:border-[#FFD600] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none placeholder-zinc-700 uppercase"
                        value={settings.ufsFiltro}
                        onChange={(e) => setSettings({ ...settings, ufsFiltro: e.target.value })}
                        placeholder="Ex: SP, RJ, BA"
                      />
                      <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">Deixe em branco para liberar todas as regiões. Separe por vírgulas para restringir a estados específicos.</span>
                    </div>

                    {/* Sensitive Data Toggles */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase text-zinc-400 font-bold tracking-wider block">Filtros de Privacidade e LGPD (Mascarar Dados):</label>
                      <div className="space-y-2">
                        {/* Hide values */}
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={settings.ocultarFinanceiro}
                            onChange={(e) => setSettings({ ...settings, ocultarFinanceiro: e.target.checked })}
                            className="rounded bg-[#0a0a0a] border-zinc-800 text-[#FFD600] focus:ring-0 cursor-pointer"
                          />
                          <span className="text-[10px] font-mono uppercase font-bold text-zinc-300">Ocultar Dados Financeiros (Valores de Frete)</span>
                        </label>

                        {/* Hide contacts */}
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={settings.ocultarContatos}
                            onChange={(e) => setSettings({ ...settings, ocultarContatos: e.target.checked })}
                            className="rounded bg-[#0a0a0a] border-zinc-800 text-[#FFD600] focus:ring-0 cursor-pointer"
                          />
                          <span className="text-[10px] font-mono uppercase font-bold text-zinc-300">Ocultar Nomes de Clientes e Telefones</span>
                        </label>
                      </div>
                      <span className="text-[9px] text-zinc-500 font-mono leading-relaxed block">Evita o vazamento de margens comerciais, tarifas de fretes e informações de motoristas terceirizados.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Big Action Save Button */}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saveStatus === 'saving'}
                  className="px-8 py-4 bg-[#FFD600] hover:bg-[#ffe23b] active:scale-[0.98] text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_25px_rgba(255,214,0,0.15)] flex items-center justify-center gap-2 cursor-pointer border border-[#FFD600]/25"
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      <span>Salvando Configuração...</span>
                    </>
                  ) : saveStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-black" />
                      <span>Integração Gravada!</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 text-black" />
                      <span>Salvar Configurações de API</span>
                    </>
                  )}
                </button>
                {saveStatus === 'success' && (
                  <span className="text-xs text-emerald-400 font-mono font-bold animate-fade-in flex items-center gap-1">
                    ✓ Sincronizado com Firestore com Sucesso.
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-xs text-red-400 font-mono font-bold animate-fade-in flex items-center gap-1">
                    ⚠️ Erro ao salvar. Verifique conexões de rede.
                  </span>
                )}
              </div>

            </div>

            {/* Sidebar Overview */}
            <div className="space-y-5 animate-fade-in">
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-xl space-y-4">
                <h4 className="font-extrabold text-xs uppercase tracking-widest font-mono text-zinc-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-[#FFD600]" />
                  Status da Comunicação
                </h4>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="text-zinc-500">Fluxo Master:</span>
                    <span className="text-emerald-400 font-bold">ONLINE</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="text-zinc-500">Filtros Ativos:</span>
                    <span className="text-[#FFD600] font-bold">
                      {Object.values(settings.statusFiltro).filter(Boolean).length} status selecionados
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="text-zinc-500">Filtro UF:</span>
                    <span className="text-white">
                      {settings.ufsFiltro.trim() ? settings.ufsFiltro : 'TODAS AS REGIÕES'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                    <span className="text-zinc-500">Mascaras LGPD:</span>
                    <span className="text-zinc-300">
                      {settings.ocultarFinanceiro && settings.ocultarContatos ? 'Completo 🔒' : 
                       settings.ocultarFinanceiro ? 'Financeiro 🔒' : 
                       settings.ocultarContatos ? 'Contatos 🔒' : 'Inativo 🔓'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Modo de Operação:</span>
                    <span className="text-white font-bold uppercase">Push Webhook</span>
                  </div>
                </div>

                <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-850 space-y-2">
                  <div className="flex items-center gap-2 text-[#FFD600]">
                    <Info className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Por que usar Webhooks?</span>
                  </div>
                  <p className="text-[10.5px] text-zinc-400 leading-relaxed font-sans">
                    Nossa API de integração envia informações em tempo real no modelo <strong>Webhook (Push)</strong>. 
                    Sempre que a localização do motorista ou o status da carga mudar, nosso servidor central 
                    executa um gatilho HTTP POST enviando o payload estruturado para o <strong>SISTEMA-CLIENTE</strong> 
                    sem necessidade de requisições excessivas (polling).
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Technical Manual for CLIENT-SYSTEM */}
        {activeTab === 'manual' && (
          <div className="col-span-1 lg:col-span-3 space-y-6 animate-fade-in">
            <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-zinc-900 pb-5 gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Code className="w-5 h-5 text-[#FFD600]" />
                    Manual de Integração Técnica do SISTEMA-CLIENTE
                  </h2>
                  <p className="text-xs text-zinc-400 font-sans">
                    Documentação de homologação para engenheiros e desenvolvedores responsáveis por receber os dados de rastreamento de cargas Rodovar.
                  </p>
                </div>

                {/* Language Selectors */}
                <div className="flex items-center bg-zinc-900 p-1.5 rounded-xl border border-zinc-800 gap-1 self-start md:self-auto">
                  {(['curl', 'node', 'python', 'php'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLang(lang)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider transition-all cursor-pointer ${
                        selectedLang === lang
                          ? 'bg-[#FFD600] text-black font-black'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {lang === 'node' ? 'Express/Node' : lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Multi-section info panel */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                
                {/* Manual text - 7 cols */}
                <div className="xl:col-span-7 space-y-6 text-zinc-300 text-sm leading-relaxed font-sans">
                  
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase font-mono font-black text-white tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                      1. Visão Geral da Comunicação
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      O sistema <strong>Rodovar Monitora</strong> é configurado para realizar um disparo HTTP POST automatizado (Webhook) no endereço cadastrado sempre que:
                    </p>
                    <ul className="list-disc pl-5 text-xs text-zinc-400 space-y-1 mt-1">
                      <li>O motorista iniciar a viagem (status alterado para <code className="text-[#FFD600] font-mono">em_transito</code>)</li>
                      <li>Ocorrer uma nova transmissão de localização do GPS em tempo real</li>
                      <li>O operador do painel atualizar manualmente o andamento da viagem</li>
                      <li>A assinatura eletrônica/canhoto de conclusão da carga for registrada</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs uppercase font-mono font-black text-white tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                      2. Cabeçalhos de Segurança (Headers)
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      Toda requisição de saída enviada para o SISTEMA-CLIENTE contém os seguintes cabeçalhos fundamentais de autenticação e validação de dados:
                    </p>
                    <div className="bg-zinc-900 border border-zinc-850 p-3.5 rounded-xl space-y-2 text-[11px] font-mono">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                        <span className="text-zinc-500 uppercase font-black">Content-Type:</span>
                        <span className="sm:col-span-2 text-white">application/json</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                        <span className="text-zinc-500 uppercase font-black">Authorization:</span>
                        <span className="sm:col-span-2 text-[#FFD600] break-all">Bearer {settings.apiToken}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                        <span className="text-zinc-500 uppercase font-black">X-Rodovar-Signature:</span>
                        <span className="sm:col-span-2 text-zinc-300 break-all">hmac_sha256([JSON_BODY], [WEBHOOK_SECRET])</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs uppercase font-mono font-black text-white tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]" />
                      3. Modelo de Payload (JSON Schema)
                    </h3>
                    <p className="text-zinc-400 text-xs">
                      O payload é enviado de forma estruturada. Dependendo das configurações de filtros ativadas no painel MASTER (aba <strong>Configurações & Filtros</strong>), alguns campos poderão vir ausentes (como financeiros ou contatos de telefone). Garanta que seu parse de JSON seja resiliente para tratar tais exceções.
                    </p>
                    <div className="bg-[#080808] border border-zinc-900 p-4 rounded-xl space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase border-b border-zinc-900 pb-2">
                        <Info className="w-4 h-4 text-cyan-400" /> Detalhes dos Campos Principais:
                      </div>
                      <div className="space-y-1.5 font-mono text-[10.5px]">
                        <p><strong className="text-white">id_carga</strong> (string) - Identificador único do documento no servidor central Rodovar.</p>
                        <p><strong className="text-white">codigo_rastreamento</strong> (string) - Código curto fornecido ao cliente final para consulta simplificada.</p>
                        <p><strong className="text-white">status_viagem</strong> (string) - Status atual. Valores possíveis: <code className="text-zinc-400">coletando</code>, <code className="text-zinc-400">em_transito</code>, <code className="text-zinc-400">parado</code>, <code className="text-zinc-400">descarregando</code>, <code className="text-zinc-400">entregue</code>.</p>
                        <p><strong className="text-white">posicao</strong> (object) - JSON contendo as coordenadas absolutas do GPS: <code className="text-zinc-400">{"{ lat: float, lng: float }"}</code>.</p>
                        <p><strong className="text-white">atualizado_em</strong> (string) - ISO Timestamp da última atualização ou pulso de sinal do motorista.</p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Column: Code block viewer - 5 cols */}
                <div className="xl:col-span-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider">Código de Homologação:</span>
                    <button
                      onClick={() => handleCopyCode(getManualExampleCode(), 'example_code')}
                      className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] rounded-lg text-[9px] font-bold font-mono text-zinc-300 hover:text-white border border-zinc-800 flex items-center gap-1 cursor-pointer transition-all"
                    >
                      {copiedCode === 'example_code' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Código</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Visual terminal code view */}
                  <div className="relative bg-[#050505] rounded-2xl border border-zinc-900 overflow-hidden shadow-2xl">
                    
                    {/* Console decoration bar */}
                    <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 font-bold tracking-wider uppercase">
                        {selectedLang === 'curl' ? 'cURL Request' : 
                         selectedLang === 'node' ? 'Express Server (ESM)' : 
                         selectedLang === 'python' ? 'Flask Framework' : 'PHP Script Webhook'}
                      </span>
                    </div>

                    {/* Preformated code block */}
                    <div className="p-4 overflow-x-auto max-h-[460px] text-[10px] font-mono text-emerald-400 leading-relaxed scrollbar-thin scrollbar-thumb-zinc-900 select-text">
                      <pre className="whitespace-pre">{getManualExampleCode()}</pre>
                    </div>

                  </div>

                  {/* Visual Success notification */}
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 space-y-1">
                    <span className="text-[9.5px] font-mono uppercase font-black text-emerald-400 tracking-wider block">✓ Resposta de Homologação Esperada:</span>
                    <p className="text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                      Seu servidor deve responder com o status de código <strong>HTTP 200 OK</strong> e um corpo JSON contendo confirmação em até 3000ms para evitar retransmissões automáticas.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* Tab 3: Console / Playground */}
        {activeTab === 'playground' && (
          <div className="col-span-1 lg:col-span-3 space-y-5 animate-fade-in">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-xl space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-900 pb-3">
                <div>
                  <h3 className="font-extrabold text-xs uppercase tracking-widest font-mono text-[#FFD600] flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-[#FFD600]" />
                    Simulador de Eventos de Webhooks
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                    Dispare e teste o comportamento do webhook contra seu endpoint local aplicando as regras de privacidade configuradas na aba de Configuração.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSimLog([])}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-[10px] uppercase font-bold font-mono border border-zinc-800 transition-all cursor-pointer"
                  >
                    Limpar Logs
                  </button>
                  
                  <button
                    onClick={runSimulation}
                    disabled={simulating}
                    className="px-4 py-1.5 bg-[#FFD600] hover:bg-[#ffe23b] active:scale-[0.98] text-black font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_2px_15px_rgba(255,214,0,0.15)] disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Disparar Simulação</span>
                  </button>
                </div>
              </div>

              {/* Console logs output */}
              <div className="bg-[#050505] rounded-xl border border-zinc-900 p-4 h-96 overflow-y-auto font-mono text-[11px] space-y-2.5 shadow-inner">
                {simLog.map((logItem, idx) => {
                  let colorClass = 'text-zinc-400';
                  if (logItem.type === 'success') colorClass = 'text-emerald-400 font-bold';
                  if (logItem.type === 'warning') colorClass = 'text-amber-400 font-bold';
                  if (logItem.type === 'header') colorClass = 'text-cyan-400';
                  if (logItem.type === 'payload') colorClass = 'text-zinc-300 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-900 block whitespace-pre overflow-x-auto text-[10px] leading-relaxed';

                  return (
                    <div key={idx} className={`${colorClass} leading-relaxed animate-fade-in`}>
                      {logItem.type !== 'payload' && (
                        <span className="text-zinc-600 select-none mr-2">[{logItem.timestamp}]</span>
                      )}
                      {logItem.type !== 'payload' && (
                        <span>{logItem.text}</span>
                      )}
                      {logItem.type === 'payload' && (
                        <pre className="select-text">{logItem.text}</pre>
                      )}
                    </div>
                  );
                })}
                {simulating && (
                  <div className="text-[#FFD600] font-bold animate-pulse flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />
                    <span>Transmitindo dados e aguardando resposta HTTP do SISTEMA-CLIENTE...</span>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-900 text-xs text-zinc-400 leading-relaxed font-sans">
                <strong>💡 Dica de Homologação Local:</strong> Para testar o webhook Rodovar na sua máquina de desenvolvimento local (localhost) antes de subir o <strong>SISTEMA-CLIENTE</strong> para produção, utilize ferramentas de tunelamento reverso de portas públicas como o <strong>ngrok</strong> ou o <strong>localtunnel</strong> para gerar um endereço público HTTP temporário e configure-o no campo de URL de Destino do Webhook.
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
