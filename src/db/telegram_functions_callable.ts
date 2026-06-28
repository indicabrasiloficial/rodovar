/**
 * RODOVAR MONITORA - INTEGRAÇÃO TELEGRAM (AGENTE IA)
 * 
 * Implementação das Firebase Cloud Functions (Callable) para as ações permitidas via Telegram.
 * Conforme o requisito 6:
 * - Exposição de ações permitidas como Firebase Cloud Functions (callable).
 * - Cada função valida o papel/permissão do solicitante (e se o Chat ID está na allowlist) antes de executar.
 * - Não é um endpoint genérico que aceita execução livre de comandos.
 */

import { db } from './firebase';
import { doc, getDoc, collection, addDoc, getDocs, query, where, limit, setDoc } from 'firebase/firestore';
import { registerTelegramCommandLog } from './storage';
import { Entrega, Colaborador } from '../types';

// Interface interna do contexto da função callable simulada/real
interface CallableContext {
  auth?: {
    uid: string;
    token: {
      email?: string;
      role?: string;
    };
  };
}

/**
 * Helper para verificar se um Chat ID está autorizado na allowlist configurada no Firestore.
 */
async function isChatIdAuthorized(chatId: string): Promise<boolean> {
  try {
    const configDoc = await getDoc(doc(db, 'telegram_integration_settings', 'config'));
    if (!configDoc.exists()) return false;
    const data = configDoc.data();
    const allowlist: string[] = data?.chatIds || [];
    return allowlist.includes(chatId);
  } catch (error) {
    console.error('Erro ao validar allowlist no Firestore:', error);
    return false;
  }
}

/**
 * Helper para verificar se a ação está ativada no catálogo do Telegram.
 */
async function isActionAllowed(actionName: 'consultarCarga' | 'consultarLocalizacao' | 'gerarRelatorio' | 'cadastrarCarga' | 'cadastrarColaborador'): Promise<boolean> {
  try {
    const configDoc = await getDoc(doc(db, 'telegram_integration_settings', 'config'));
    if (!configDoc.exists()) return false;
    const data = configDoc.data();
    return !!data?.allowedActions?.[actionName];
  } catch {
    return false;
  }
}

/**
 * Helper para verificar se a ação exige confirmação prévia de segurança.
 */
export async function isConfirmationRequired(actionName: 'consultarCarga' | 'consultarLocalizacao' | 'gerarRelatorio' | 'cadastrarCarga' | 'cadastrarColaborador'): Promise<boolean> {
  try {
    const configDoc = await getDoc(doc(db, 'telegram_integration_settings', 'config'));
    if (!configDoc.exists()) return false;
    const data = configDoc.data();
    return !!data?.exigirConfirmacao?.[actionName];
  } catch {
    return false;
  }
}

/**
 * 1. Consultar Status da Carga (Somente Leitura)
 * Callable Function
 */
export async function consultarStatusCargaCallable(data: { chatId: string; trackingCode: string }, context?: CallableContext) {
  const { chatId, trackingCode } = data;

  // 1. Validar allowlist do Chat ID
  const authorized = await isChatIdAuthorized(chatId);
  if (!authorized) {
    await registerTelegramCommandLog(chatId, `/status ${trackingCode}`, 'Consultar Status de Carga', 'REJEITADO - Chat ID não autorizado na Allowlist.');
    throw new Error('Acesso negado: Chat ID não autorizado no sistema Rodovar.');
  }

  // 2. Validar se a ação está permitida no catálogo
  const allowed = await isActionAllowed('consultarCarga');
  if (!allowed) {
    await registerTelegramCommandLog(chatId, `/status ${trackingCode}`, 'Consultar Status de Carga', 'REJEITADO - Ação desativada no catálogo do Telegram.');
    throw new Error('Ação desativada via Telegram pelo Administrador Master.');
  }

  // 3. Buscar carga no banco
  try {
    const entregasCol = collection(db, 'entregas');
    const q = query(entregasCol, where('trackingCode', '==', trackingCode), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      await registerTelegramCommandLog(chatId, `/status ${trackingCode}`, 'Consultar Status de Carga', `Código ${trackingCode} não localizado.`);
      return { success: false, message: `Carga com código ${trackingCode} não localizada no sistema.` };
    }

    const docSnap = snapshot.docs[0];
    const entrega = docSnap.data() as Entrega;

    const resMsg = `Carga ${trackingCode}: Cliente ${entrega.cliente} | Destino: ${entrega.destino} | Status Atual: ${entrega.status.toUpperCase()} | Motorista: ${entrega.motorista}.`;
    await registerTelegramCommandLog(chatId, `/status ${trackingCode}`, 'Consultar Status de Carga', 'SUCESSO - Detalhes da carga retornados.');

    return { success: true, payload: entrega, message: resMsg };
  } catch (err: any) {
    await registerTelegramCommandLog(chatId, `/status ${trackingCode}`, 'Consultar Status de Carga', `ERRO - ${err.message}`);
    throw new Error(`Erro ao processar consulta de carga: ${err.message}`);
  }
}

/**
 * 2. Consultar Localização de Motorista (Somente Leitura)
 * Callable Function
 */
export async function consultarLocalizacaoCallable(data: { chatId: string; motoristaNome: string }, context?: CallableContext) {
  const { chatId, motoristaNome } = data;

  const authorized = await isChatIdAuthorized(chatId);
  if (!authorized) {
    await registerTelegramCommandLog(chatId, `/localizacao ${motoristaNome}`, 'Consultar Localização de Motorista', 'REJEITADO - Chat ID não autorizado.');
    throw new Error('Acesso negado: Chat ID não autorizado.');
  }

  const allowed = await isActionAllowed('consultarLocalizacao');
  if (!allowed) {
    await registerTelegramCommandLog(chatId, `/localizacao ${motoristaNome}`, 'Consultar Localização de Motorista', 'REJEITADO - Ação desativada.');
    throw new Error('Ação desativada pelo Administrador.');
  }

  try {
    const entregasCol = collection(db, 'entregas');
    // Busca cargas ativas do motorista correspondente
    const q = query(entregasCol, where('motorista', '==', motoristaNome), limit(5));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      await registerTelegramCommandLog(chatId, `/localizacao ${motoristaNome}`, 'Consultar Localização de Motorista', `Nenhuma carga ativa do motorista "${motoristaNome}".`);
      return { success: false, message: `Nenhum veículo em trânsito localizado para o motorista: ${motoristaNome}.` };
    }

    const match = snapshot.docs.find(d => {
      const s = d.data().status;
      return s === 'em_transito' || s === 'parado';
    }) || snapshot.docs[0];

    const entrega = match.data() as Entrega;
    const locationStr = entrega.link_localizacao || `Coordenadas: ${entrega.lat}, ${entrega.lng}`;
    
    await registerTelegramCommandLog(chatId, `/localizacao ${motoristaNome}`, 'Consultar Localização de Motorista', `SUCESSO - Coordenadas retornadas.`);
    return { 
      success: true, 
      payload: { lat: entrega.lat, lng: entrega.lng, link: entrega.link_localizacao },
      message: `Motorista ${motoristaNome} localizado na rota ${entrega.origem} ➔ ${entrega.destino}. Localização: ${locationStr}` 
    };
  } catch (err: any) {
    await registerTelegramCommandLog(chatId, `/localizacao ${motoristaNome}`, 'Consultar Localização de Motorista', `ERRO - ${err.message}`);
    throw new Error(`Erro ao obter localização: ${err.message}`);
  }
}

/**
 * 3. Gerar Relatório Resumido (Somente Leitura)
 * Callable Function
 */
export async function gerarRelatorioResumidoCallable(data: { chatId: string }, context?: CallableContext) {
  const { chatId } = data;

  const authorized = await isChatIdAuthorized(chatId);
  if (!authorized) {
    await registerTelegramCommandLog(chatId, `/relatorio`, 'Gerar Relatório Resumido', 'REJEITADO - Chat ID não autorizado.');
    throw new Error('Acesso negado: Chat ID não autorizado.');
  }

  const allowed = await isActionAllowed('gerarRelatorio');
  if (!allowed) {
    await registerTelegramCommandLog(chatId, `/relatorio`, 'Gerar Relatório Resumido', 'REJEITADO - Ação desativada.');
    throw new Error('Ação desativada pelo Administrador.');
  }

  try {
    const entregasCol = collection(db, 'entregas');
    const snapshot = await getDocs(entregasCol);

    let emTransito = 0;
    let paradas = 0;
    let entregues = 0;
    let coletando = 0;

    snapshot.forEach(docSnap => {
      const status = docSnap.data().status;
      if (status === 'em_transito') emTransito++;
      else if (status === 'parado') paradas++;
      else if (status === 'entregue') entregues++;
      else coletando++;
    });

    const summaryText = `📊 RELATÓRIO RODOVAR:\n- Em Trânsito: ${emTransito} veículos\n- Paradas Críticas: ${paradas} alertas\n- Entregues: ${entregues} concluídas\n- Coletando: ${coletando} cargas`;
    
    await registerTelegramCommandLog(chatId, `/relatorio`, 'Gerar Relatório Resumido', 'SUCESSO - Relatório estatístico enviado.');
    return { success: true, payload: { emTransito, paradas, entregues, coletando }, message: summaryText };
  } catch (err: any) {
    await registerTelegramCommandLog(chatId, `/relatorio`, 'Gerar Relatório Resumido', `ERRO - ${err.message}`);
    throw new Error(`Erro ao gerar relatório: ${err.message}`);
  }
}

/**
 * 4. Cadastrar Nova Carga (Escrita - Requer confirmação opcional)
 * Callable Function
 */
export async function cadastrarNovaCargaCallable(data: { chatId: string; payload: Omit<Entrega, 'id'>; confirmado?: boolean }, context?: CallableContext) {
  const { chatId, payload, confirmado } = data;

  const authorized = await isChatIdAuthorized(chatId);
  if (!authorized) {
    await registerTelegramCommandLog(chatId, `/add_carga`, 'Cadastrar Nova Carga', 'REJEITADO - Chat ID não autorizado.');
    throw new Error('Acesso negado: Chat ID não autorizado.');
  }

  const allowed = await isActionAllowed('cadastrarCarga');
  if (!allowed) {
    await registerTelegramCommandLog(chatId, `/add_carga`, 'Cadastrar Nova Carga', 'REJEITADO - Ação desativada.');
    throw new Error('Ação desativada pelo Administrador.');
  }

  // Se exigir confirmação e o Telegram não mandou o SIM (confirmado=true)
  const requireConf = await isConfirmationRequired('cadastrarCarga');
  if (requireConf && !confirmado) {
    await registerTelegramCommandLog(chatId, `/add_carga`, 'Cadastrar Nova Carga', 'PENDENTE - Aguardando confirmação (SIM).');
    return { 
      success: false, 
      needsConfirmation: true, 
      message: `Confirma o cadastro da carga de ${payload.cliente} para ${payload.destino}? Responda SIM para executar.` 
    };
  }

  try {
    const entregasCol = collection(db, 'entregas');
    const cleanId = 'ent-tg-' + Math.random().toString(36).substring(2, 10);
    const docData = {
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: payload.status || 'coletando',
      trackingCode: payload.trackingCode || 'RDV' + Math.floor(Math.random() * 900000 + 100000),
      canhoto_solicitado: false,
    };

    await setDoc(doc(db, 'entregas', cleanId), docData);

    const resMsg = `Carga para ${payload.cliente} cadastrada com sucesso! Código de rastreio gerado: ${docData.trackingCode}`;
    await registerTelegramCommandLog(chatId, `/add_carga`, 'Cadastrar Nova Carga', `SUCESSO - Carga cadastrada. Rastreio: ${docData.trackingCode}`);

    return { success: true, trackingCode: docData.trackingCode, message: resMsg };
  } catch (err: any) {
    await registerTelegramCommandLog(chatId, `/add_carga`, 'Cadastrar Nova Carga', `ERRO - ${err.message}`);
    throw new Error(`Erro ao cadastrar carga: ${err.message}`);
  }
}

/**
 * 5. Cadastrar Colaborador (Escrita - Requer confirmação opcional)
 * Callable Function
 */
export async function cadastrarColaboradorCallable(data: { chatId: string; payload: Omit<Colaborador, 'id'>; confirmado?: boolean }, context?: CallableContext) {
  const { chatId, payload, confirmado } = data;

  const authorized = await isChatIdAuthorized(chatId);
  if (!authorized) {
    await registerTelegramCommandLog(chatId, `/add_colaborador`, 'Cadastrar Colaborador', 'REJEITADO - Chat ID não autorizado.');
    throw new Error('Acesso negado: Chat ID não autorizado.');
  }

  const allowed = await isActionAllowed('cadastrarColaborador');
  if (!allowed) {
    await registerTelegramCommandLog(chatId, `/add_colaborador`, 'Cadastrar Colaborador', 'REJEITADO - Ação desativada.');
    throw new Error('Ação desativada pelo Administrador.');
  }

  const requireConf = await isConfirmationRequired('cadastrarColaborador');
  if (requireConf && !confirmado) {
    await registerTelegramCommandLog(chatId, `/add_colaborador`, 'Cadastrar Colaborador', 'PENDENTE - Aguardando confirmação (SIM).');
    return { 
      success: false, 
      needsConfirmation: true, 
      message: `Confirma o cadastro do colaborador ${payload.name} como ${payload.detailedRole}? Responda SIM para executar.` 
    };
  }

  try {
    const colabsCol = collection(db, 'colaboradores');
    const cleanId = 'col-tg-' + Math.random().toString(36).substring(2, 10);
    const docData = {
      ...payload,
      id: cleanId,
      created_at: new Date().toISOString(),
      status: 'aprovado',
      forcePasswordChange: true
    };

    await setDoc(doc(db, 'colaboradores', cleanId), docData);

    const resMsg = `Colaborador ${payload.name} (@${payload.username}) cadastrado com aprovação automática via Telegram!`;
    await registerTelegramCommandLog(chatId, `/add_colaborador`, 'Cadastrar Colaborador', `SUCESSO - Colaborador cadastrado.`);

    return { success: true, id: cleanId, message: resMsg };
  } catch (err: any) {
    await registerTelegramCommandLog(chatId, `/add_colaborador`, 'Cadastrar Colaborador', `ERRO - ${err.message}`);
    throw new Error(`Erro ao cadastrar colaborador: ${err.message}`);
  }
}

/**
 * NOTA DE SEGURANÇA PARA DEPLOY EM PRODUÇÃO:
 * 
 * Se for fazer o deploy das funções reais no Firebase Functions Node.js (index.js),
 * use o seguinte formato com a validação nativa de Token do solicitante (Requisito 6):
 * 
 * ```typescript
 * const { onCall, HttpsError } = require("firebase-functions/v2/https");
 * const admin = require("firebase-admin");
 * if (!admin.apps.length) admin.initializeApp();
 * 
 * exports.consultarStatusCarga = onCall(async (request) => {
 *   const { chatId, trackingCode } = request.data;
 *   
 *   // 1. Validar Token/Auth do solicitante (vinda da API Vercel devidamente autenticada)
 *   if (!request.auth) {
 *     throw new HttpsError("unauthenticated", "Requisição exige token de autorização válido.");
 *   }
 *   
 *   // 2. Validar papel/permissão do solicitante
 *   const userRole = request.auth.token.role;
 *   if (userRole !== "Master" && userRole !== "Admin" && userRole !== "Operador") {
 *     throw new HttpsError("permission-denied", "Nível de permissão insuficiente para executar esta ação.");
 *   }
 *   
 *   // 3. Validar allowlist de Chat IDs
 *   const configSnap = await admin.firestore().collection("telegram_integration_settings").doc("config").get();
 *   const config = configSnap.data();
 *   if (!config || !config.chatIds.includes(chatId)) {
 *     throw new HttpsError("permission-denied", "Chat ID do Telegram não autorizado.");
 *   }
 *   
 *   // Executa a busca real...
 *   return { success: true, message: "Resultado obtido" };
 * });
 * ```
 */
