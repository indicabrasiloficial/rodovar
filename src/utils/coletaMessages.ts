import { Entrega } from '../types';

/**
 * Retorna a saudação correta ('Bom dia', 'Boa tarde' ou 'Boa noite')
 * calculada dinamicamente pelo horário de Brasília / São Paulo (UTC-3).
 */
export const getSaopauloGreeting = (): string => {
  try {
    const optionsHour = { timeZone: 'America_Sao_Paulo', hour: '2-digit', hour12: false };
    const formatterHour = new Intl.DateTimeFormat('pt-BR', optionsHour as any);
    const hourStr = formatterHour.format(new Date());
    const hour = parseInt(hourStr, 10);
    if (isNaN(hour)) throw new Error('Invalid hour');
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  } catch (e) {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const brtHour = (utcHour - 3 + 24) % 24;
    if (brtHour >= 5 && brtHour < 12) return 'Bom dia';
    if (brtHour >= 12 && brtHour < 18) return 'Boa tarde';
    return 'Boa noite';
  }
};

/**
 * Obtém o nome completo do operador logado do localStorage
 */
export const getLoggedOperatorName = (): string => {
  try {
    const active = localStorage.getItem('rodovar_active_login_v2');
    if (active) {
      const parsed = JSON.parse(active);
      if (parsed && typeof parsed.displayName === 'string' && parsed.displayName.trim()) {
        return parsed.displayName.trim();
      }
      if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
        return parsed.name.trim();
      }
      if (parsed && typeof parsed.user === 'string' && parsed.user.trim()) {
        return parsed.user.trim();
      }
    }
  } catch (e) {
    console.error('Error reading operator name:', e);
  }
  return 'Operador Logística Rodovar';
};

/**
 * Função 1: Gera a mensagem personalizada para enviar ao MOTORISTA em fase de coleta (status 'coletando').
 */
export const buildMotoristaColetaMessage = (entrega?: Entrega, customOperatorName?: string): string => {
  if (!entrega) return '';
  const greeting = getSaopauloGreeting();
  const operatorName = customOperatorName || getLoggedOperatorName();
  const motoristaNome = (entrega.motorista || '').trim() || 'Motorista';
  const clienteNome = (entrega.cliente || '').trim() || '';
  const origem = (entrega.origem || '').trim() || 'Coleta';
  const destino = (entrega.destino || '').trim() || 'Destino';

  let msg = `${greeting}, ${motoristaNome}! Tudo bem?\n\n`;
  msg += `Faço parte da equipe de logística da Rodovar, me chamo ${operatorName}.\n\n`;
  msg += `Estamos acompanhando a sua viagem do frete de ${origem} ➔ ${destino}`;
  if (clienteNome) {
    msg += ` (Cliente: ${clienteNome})`;
  }
  msg += `.\n\nGostaria de saber se a coleta já foi realizada? Por favor, assim que possível, nos informe o seu status atual.\n\nObrigado e bom trabalho!`;

  return msg;
};

/**
 * Função 2: Gera a mensagem personalizada para enviar aos CLIENTES das cargas em fase de coleta (status 'coletando').
 */
export const buildClienteColetaMessage = (entrega?: Entrega, customOperatorName?: string): string => {
  if (!entrega) return '';
  const greeting = getSaopauloGreeting();
  const operatorName = customOperatorName || getLoggedOperatorName();
  const clienteNome = (entrega.cliente || '').trim() || 'Cliente';
  const origem = (entrega.origem || '').trim() || 'Origem';
  const destino = (entrega.destino || '').trim() || 'Destino';
  const motorista = (entrega.motorista || '').trim() || '';

  let msg = `${greeting}, equipe da ${clienteNome}! Tudo bem?\n\n`;
  msg += `Faço parte da equipe de logística da Rodovar, me chamo ${operatorName}.\n\n`;
  msg += `Estamos organizando e recolhendo as informações para iniciar a viagem do seu frete (Rota: ${origem} ➔ ${destino}).\n\n`;
  msg += `Poderia nos enviar a localização exata de entrega ou o endereço completo de destino para que possamos repassar as instruções ao motorista`;
  if (motorista) {
    msg += ` ${motorista}`;
  }
  msg += `?\n\nFicamos no aguardo das informações de destino para dar início à viagem. Muito obrigado!`;

  return msg;
};

/**
 * Auxiliar para higienizar telefone e abrir conversa no WhatsApp (wa.me)
 */
export const sendWhatsAppMessage = (phone: string | undefined | null, message: string): boolean => {
  if (!phone) return false;
  try {
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (!cleanPhone) return false;
    if (!cleanPhone.startsWith('55') && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
      cleanPhone = '55' + cleanPhone;
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    return true;
  } catch (e) {
    console.error('Error sending WhatsApp message:', e);
    return false;
  }
};
