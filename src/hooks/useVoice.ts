import { useState, useEffect, useRef } from 'react';
import { Entrega } from '../types';
import { getEntregas } from '../db/storage';

export interface VoiceState {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  assistantResponse: string;
  error: string;
  showConfirmPrompt: boolean;
  pendingActionDeliveryId?: string;
  pendingActionType?: 'motorista' | 'cliente';
}

const monthNamesSpeak: Record<string, string> = {
  '01': 'de janeiro', '02': 'de fevereiro', '03': 'de março', '04': 'de abril',
  '05': 'de maio', '06': 'de junho', '07': 'de julho', '08': 'de agosto',
  '09': 'de setembro', '10': 'de outubro', '11': 'de novembro', '12': 'de dezembro',
  '1': 'de janeiro', '2': 'de fevereiro', '3': 'de março', '4': 'de abril',
  '5': 'de maio', '6': 'de junho', '7': 'de julho', '8': 'de agosto',
  '9': 'de setembro',
  'jan': 'de janeiro', 'fev': 'de fevereiro', 'mar': 'de março', 'abr': 'de abril',
  'mai': 'de maio', 'jun': 'de junho', 'jul': 'de julho', 'ago': 'de agosto',
  'set': 'de setembro', 'out': 'de outubro', 'nov': 'de novembro', 'dez': 'de dezembro',
  'janeiro': 'de janeiro', 'fevereiro': 'de fevereiro', 'março': 'de março', 'abril': 'de abril',
  'maio': 'de maio', 'junho': 'de junho', 'julho': 'de julho', 'agosto': 'de agosto',
  'setembro': 'de setembro', 'outubro': 'de outubro', 'novembro': 'de novembro', 'dezembro': 'de dezembro'
};

const numberWordsSpeak: Record<number, string> = {
  1: 'primeiro', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
  6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
  11: 'onze', 12: 'doze', 13: 'treze', 14: 'quatorze', 15: 'quinze',
  16: 'dezesseis', 17: 'dezessete', 18: 'dezoito', 19: 'dezenove', 20: 'vinte',
  21: 'vinte e um', 22: 'vinte e dois', 23: 'vinte e três', 24: 'vinte e quatro', 25: 'vinte e cinco',
  26: 'vinte e seis', 27: 'vinte e sete', 28: 'vinte e oito', 29: 'vinte e nove', 30: 'trinta', 31: 'trinta e um'
};

function normalizeTextForSpeech(text: string): string {
  let spoken = text;

  // 1. Normalize common terms and correct accents for ultra-realistic stress in PT-BR
  spoken = spoken.replace(/\bRodovar\b/gi, 'Rodóvar');
  spoken = spoken.replace(/\bWhatsApp\b/gi, 'uátisap');
  spoken = spoken.replace(/\bwa\.me\b/gi, 'o link do uátisap');
  spoken = spoken.replace(/\bkm\b/gi, ' quilômetrus');
  spoken = spoken.replace(/\b(\d+)\s*(h|hs)\b/gi, '$1 horas');
  spoken = spoken.replace(/\bnº\s*/gi, 'número ');
  spoken = spoken.replace(/\bLTDA\b/gi, 'Limitada');
  spoken = spoken.replace(/\bUTC\b/gi, 'U T C');
  spoken = spoken.replace(/\btel\s*:/gi, 'telefone ');
  spoken = spoken.replace(/\btel\b/gi, 'telefone');
  spoken = spoken.replace(/\bzap\b/gi, 'záp');

  // 2. Normalize and translate state abbreviations so they aren't spelled out letter-by-letter
  const statesSpeak: Record<string, string> = {
    'AC': 'no Acre', 'AL': 'em Alagoas', 'AP': 'no Amapá', 'AM': 'no Amazonas', 'BA': 'na Bahia',
    'CE': 'no Ceará', 'DF': 'no Distrito Federal', 'ES': 'no Espírito Santo', 'GO': 'em Goiás',
    'MA': 'no Maranhão', 'MT': 'no Mato Grosso', 'MS': 'no Mato Grosso do Sul', 'MG': 'em Minas Gerais',
    'PA': 'no Pará', 'PB': 'na Paraíba', 'PR': 'no Paraná', 'PE': 'em Pernambuco', 'PI': 'no Piauí',
    'RJ': 'no Rio de Janeiro', 'RN': 'no Rio Grande do Norte', 'RS': 'no Rio Grande do Sul',
    'RO': 'em Rondônia', 'RR': 'em Roraima', 'SC': 'em Santa Catarina', 'SP': 'em São Paulo',
    'SE': 'em Sergipe', 'TO': 'no Tocantins'
  };

  // Replace trailing "- SP" or " - SP" or "/SP"
  Object.entries(statesSpeak).forEach(([code, name]) => {
    const regHyphen = new RegExp(`\\s*[-]\\s*\\b${code}\\b`, 'gi');
    spoken = spoken.replace(regHyphen, `, ${name}`);
    
    const regSlash = new RegExp(`\\s*[/]\\s*\\b${code}\\b`, 'gi');
    spoken = spoken.replace(regSlash, `, ${name}`);
  });

  // 3. Match format YYYY-MM-DD (e.g. 2026-06-15) and convert to elegant spoken date
  spoken = spoken.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (match, year, month, day) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    const yearStr = parseInt(year, 10) === 2026 ? 'de dois mil e vinte e seis' : `de ${year}`;
    return `${dayStr} ${monthStr} ${yearStr}`;
  });

  // 4. Match format DD/MM/YYYY (e.g. 15/06/2026) and convert to elegant spoken date
  spoken = spoken.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (match, day, month, year) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    const yearStr = parseInt(year, 10) === 2026 ? 'de dois mil e vinte e seis' : `de ${year}`;
    return `${dayStr} ${monthStr} ${yearStr}`;
  });

  // 5. Match format DD/MM (e.g. 15/06 or 15/6) and convert to day + month
  spoken = spoken.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (match, day, month) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    return `${dayStr} ${monthStr}`;
  });

  // 6. Match format DD/MMM (e.g. 15/jun or 08/jun or 15/junho)
  spoken = spoken.replace(/\b(\d{1,2})\/([a-zA-Zçéáãõúí]{3,})\b/g, (match, day, monthText) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const mLower = monthText.toLowerCase().substring(0, 3);
    const monthStr = monthNamesSpeak[mLower] || monthNamesSpeak[monthText.toLowerCase()] || `de ${monthText}`;
    return `${dayStr} ${monthStr}`;
  });

  // 7. Render arrow symbols naturally
  spoken = spoken.replace(/➔|➔|➔|->|-->/g, ' com destino a ');

  // 8. Expand standalone numbers under 40 elegantly so they are spoken as words:
  spoken = spoken.replace(/\b(\d{1,2})\b/g, (match, numStr) => {
    const val = parseInt(numStr, 10);
    if (val >= 1 && val <= 31) {
      return numberWordsSpeak[val];
    }
    return match;
  });

  // 9. Extra cleanup: turn hyphens into pauses and correct spacing
  spoken = spoken.replace(/\s*-\s*/g, ', ');
  spoken = spoken.replace(/\s+/g, ' ').trim();

  return spoken;
}

export function useVoice(
  onSelectDelivery: (id: string) => void,
  onFilterStatus: (status: string | 'all') => void,
  onSearchQuery: (query: string) => void
) {
  const [state, setState] = useState<VoiceState>({
    isSupported: false,
    isListening: false,
    transcript: '',
    assistantResponse: '',
    error: '',
    showConfirmPrompt: false,
  });

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if SpeechRecognition is supported
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'pt-BR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setState((prev) => ({
          ...prev,
          isListening: true,
          error: '',
          transcript: '',
          assistantResponse: '',
          showConfirmPrompt: false,
        }));
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event);
        setState((prev) => ({
          ...prev,
          isListening: false,
          error: `Erro de voz: ${event.error || 'Não reconhecido'}`,
        }));
      };

      recognition.onend = () => {
        setState((prev) => ({ ...prev, isListening: false }));
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setState((prev) => ({ ...prev, transcript: text }));
        processSpeech(text);
      };

      recognitionRef.current = recognition;
      setState((prev) => ({ ...prev, isSupported: true }));
    } else {
      setState((prev) => ({ ...prev, isSupported: false }));
    }
  }, []);

  const speak = (text: string, onEndCallback?: () => void) => {
    if (!window.speechSynthesis) return;
    
    // Cancel prior speech
    window.speechSynthesis.cancel();
    
    const normalized = normalizeTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(normalized);
    utterance.lang = 'pt-BR';
    utterance.pitch = 1.0; // Restored to 1.0 (default) to eliminate robotic trembling/vibrating DSP artifacts entirely
    utterance.volume = 1.0; 
    utterance.rate = 1.15; // Set to a perfectly balanced rate (1.15) for a natural, fluent, and highly professional delivery

    // Advanced Brazilian Portuguese Male Voice Selector
    const voices = window.speechSynthesis.getVoices();
    const ptBRVoices = voices.filter((v) => {
      const l = v.lang.toLowerCase().replace('_', '-');
      return l === 'pt-br' || l === 'pt';
    });

    // Score pt-BR voices prioritizing male sounding voice profiles
    const getScore = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      let score = 1;

      // Strong indicators for Male Brazilian Portuguese voices
      const isMale = name.includes('daniel') || 
                     name.includes('felipe') || 
                     name.includes('male') || 
                     name.includes('homem') || 
                     name.includes('guy') || 
                     name.includes('antonio') || 
                     name.includes('junior') ||
                     name.includes('helio');

      // Strong indicators for Female voices (to be deprioritized)
      const isFemale = name.includes('luciana') || 
                       name.includes('sandra') || 
                       name.includes('female') || 
                       name.includes('mulher') || 
                       name.includes('maria') || 
                       name.includes('helena') || 
                       name.includes('zita') ||
                       name.includes('google português do brasil'); // Usually defaults to female online on chrome

      if (isMale) {
        score += 300; // Top-tier priority for male voices
      } else if (isFemale) {
        score -= 200; // Heavily penalize female voices to keep masculine preference
      }

      // Quality markers
      if (name.includes('natural')) score += 50;
      if (name.includes('neural')) score += 45;
      if (name.includes('online')) score += 40;
      if (name.includes('google')) score += 30;
      if (name.includes('microsoft')) score += 20;

      return score;
    };

    const bestVoice = [...ptBRVoices].sort((a, b) => getScore(b) - getScore(a))[0] || 
                      voices.find((v) => v.lang.toLowerCase().startsWith('pt'));

    if (bestVoice) {
      utterance.voice = bestVoice;
    }
    
    // Prevent browser garbage collection bug cutting off speech sound
    (window as any)._activeUtterances = (window as any)._activeUtterances || [];
    (window as any)._activeUtterances.push(utterance);

    utterance.onend = () => {
      const idx = (window as any)._activeUtterances.indexOf(utterance);
      if (idx > -1) {
        (window as any)._activeUtterances.splice(idx, 1);
      }
      if (onEndCallback) onEndCallback();
    };

    window.speechSynthesis.speak(utterance);
    setState((prev) => ({ ...prev, assistantResponse: text }));
  };

  const startListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn('Recognition already started or error', err);
      }
    } else {
      setState((prev) => ({
        ...prev,
        error: 'Recurso de voz não habilitado ou negado pelo navegador.',
      }));
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const confirmPendingAction = (accepted: boolean) => {
    if (!accepted) {
      speak('Tranquilo, Jairo. O que mais você precisa monitorar?');
      setState((prev) => ({ ...prev, showConfirmPrompt: false }));
      return;
    }

    if (state.pendingActionDeliveryId) {
      const entregas = getEntregas();
      const entrega = entregas.find((e) => e.id === state.pendingActionDeliveryId);
      if (entrega) {
        let phone = '';
        let msg = '';
        
        if (state.pendingActionType === 'motorista') {
          phone = entrega.tel_motorista.replace(/\D/g, '');
          msg = `Olá ${entrega.motorista}! Tudo bem? Poderia me enviar sua localização em tempo real agora? Preciso informar ao cliente o status da carga. Grato!`;
        } else {
          phone = entrega.tel_cliente.replace(/\D/g, '');
          msg = `Olá! Aqui é o Jairo Bahia da Rodovar Transportadora. Sua carga está a caminho! O motorista ${entrega.motorista} está em deslocamento e chegará até ${entrega.prazo}. Qualquer dúvida estou à disposição.`;
        }

        const url = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        speak('Prontinho, Jairo! Abrindo o WhatsApp do motorista...');
        window.open(url, '_blank');
      }
    }
    setState((prev) => ({ ...prev, showConfirmPrompt: false }));
  };

  // Process the text input (works for typed prompts as well!)
  const processSpeech = (text: string) => {
    const query = text.toLowerCase().trim();
    const entregas = getEntregas();

    // Check if replying to the pending prompt
    if (state.showConfirmPrompt) {
      if (query === 'sim' || query.includes('quero') || query.includes('abrir') || query.includes('pode')) {
        confirmPendingAction(true);
        return;
      } else if (query === 'não' || query === 'nao' || query.includes('cancelar')) {
        confirmPendingAction(false);
        return;
      }
    }

    // 1. Proactive Fleet Analysis / "Agente Rodovar" audit command
    if (
      query.includes('analisar') || 
      query.includes('análise') || 
      query.includes('analise') || 
      query.includes('auditoria') || 
      query.includes('rodovar') || 
      query.includes('tempo') || 
      query.includes('relatório') ||
      query.includes('alerta')
    ) {
      const paradas = entregas.filter(e => e.status === 'parado');
      const semLocalizacao = entregas.filter(e => e.status === 'em_transito' && !e.link_localizacao);
      const coletando = entregas.filter(e => e.status === 'coletando');

      let diagnostic = 'Fala, Jairo! Rodovar na escuta. Analisei a frota ativa agora. ';

      if (paradas.length === 0 && semLocalizacao.length === 0) {
        diagnostic += 'Tudo rodando liso na rota ou entregue com sucesso! Nenhuma pendência crítica.';
      } else {
        diagnostic += 'Achei só uns detalhes na rodovia. ';
        if (paradas.length > 0) {
          const mNames = paradas.map(p => p.motorista).join(' e ');
          diagnostic += `O motorista ${mNames} tá parado na estrada. Precisa pedir localização. `;
        }
        if (semLocalizacao.length > 0) {
          const slNames = semLocalizacao.map(p => p.motorista).join(' e ');
          diagnostic += `Temos também a viagem de ${slNames} em trânsito sem rastreamento de mapa ativo. `;
        }
        diagnostic += 'Quer que eu abra o zap dele para cobrar?';
      }

      // If we have any parados, set them as pending confirmation to help speed up Jairo's workflow
      const firstTarget = paradas[0] || semLocalizacao[0] || coletando[0];
      if (firstTarget) {
        setState(prev => ({
          ...prev,
          showConfirmPrompt: true,
          pendingActionDeliveryId: firstTarget.id,
          pendingActionType: 'motorista'
        }));
      }

      speak(diagnostic);
      return;
    }

    // 2. "Mostre as cargas paradas" / "cargas em transito" / "coletando"
    if (query.includes('parada') || query.includes('parado') || query.includes('parados')) {
      onFilterStatus('parado');
      onSearchQuery('');
      const count = entregas.filter((e) => e.status === 'parado').length;
      const resp = `Na tela, Jairo! Filtrei aqui, são ${count} ${count === 1 ? 'carga parada' : 'cargas paradas atualmente'}.`;
      speak(resp);
      return;
    }

    if (query.includes('trânsito') || query.includes('transito') || query.includes('viajando')) {
      onFilterStatus('em_transito');
      onSearchQuery('');
      const count = entregas.filter((e) => e.status === 'em_transito').length;
      const resp = `Prontinho, Jairo! Temos ${count} ${count === 1 ? 'carga acelerando' : 'cargas ativas em trânsito'} agora.`;
      speak(resp);
      return;
    }

    if (query.includes('coletando') || query.includes('coleta')) {
      onFilterStatus('coletando');
      onSearchQuery('');
      const count = entregas.filter((e) => e.status === 'coletando').length;
      const resp = `Fala, Jairo. Temos ${count} ${count === 1 ? 'carga carregando' : 'cargas em fase de coleta'} agora.`;
      speak(resp);
      return;
    }

    if (query.includes('entregue') || query.includes('entregues') || query.includes('concluída') || query.includes('concluidas')) {
      onFilterStatus('entregue');
      onSearchQuery('');
      const count = entregas.filter((e) => e.status === 'entregue').length;
      const resp = `Show de bola! Temos ${count} ${count === 1 ? 'carga entregue com sucesso' : 'entregas concluídas'}!`;
      speak(resp);
      return;
    }

    if (query.includes('todas') || query.includes('limpar') || query.includes('todos')) {
      onFilterStatus('all');
      onSearchQuery('');
      speak(`Feito, Jairo! Painel com o total das ${entregas.length} cargas limpo.`);
      return;
    }

    // 3. Search by Driver or Destination
    // Look for matching driver or destination
    let bestMatch: Entrega | null = null;
    let matchType: 'motorista' | 'destino' | 'cliente' = 'motorista';

    for (const e of entregas) {
      const motName = e.motorista.toLowerCase();
      const destName = e.destino.toLowerCase();
      const cliName = e.cliente.toLowerCase();

      if (query.includes(motName) || motName.split(' ').some((word) => word.length > 2 && query.includes(word))) {
        bestMatch = e;
        matchType = 'motorista';
        break;
      }
      if (query.includes(destName) || destName.split('-')[0].toLowerCase().split(' ').some((word) => word.length > 2 && query.includes(word))) {
        bestMatch = e;
        matchType = 'destino';
        break;
      }
      if (query.includes(cliName) || cliName.split(' ').some((word) => word.length > 2 && query.includes(word))) {
        bestMatch = e;
        matchType = 'cliente';
        break;
      }
    }

    if (bestMatch) {
      onSelectDelivery(bestMatch.id);
      
      const statusLabel =
        bestMatch.status === 'em_transito'
          ? 'está em trânsito acelerando'
          : bestMatch.status === 'coletando'
          ? 'está carregando agora'
          : bestMatch.status === 'parado'
          ? 'está parada no momento'
          : 'já foi entregue';

      const resp = `Achei aqui, Jairo! A viagem do ${bestMatch.motorista} com destino a ${bestMatch.destino} ${statusLabel}. Saiu de ${bestMatch.origem} com prazo de chegada para ${bestMatch.prazo}. Deseja abrir o WhatsApp dele?`;

      setState((prev) => ({
        ...prev,
        showConfirmPrompt: true,
        pendingActionDeliveryId: bestMatch?.id,
        pendingActionType: 'motorista',
      }));

      speak(resp);
    } else {
      // General fallbacks
      const matchedSearchWords = query.replace('onde está', '').replace('cade', '').replace('buscar', '').trim();
      if (matchedSearchWords.length > 2) {
        onSearchQuery(matchedSearchWords);
        onFilterStatus('all');
        speak(`Jairo, não achei exato para "${matchedSearchWords}", mas ordenei a aproximação na tela.`);
      } else {
        speak('Não entendi bem Jairo. Me peça para analisar a frota, filtrar cargas paradas ou buscar motorista.');
      }
    }
  };

  return {
    ...state,
    startListening,
    stopListening,
    processSpeech,
    confirmPendingAction,
    speak,
  };
}
