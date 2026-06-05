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

export function normalizeTextForSpeech(text: string): string {
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
  spoken = spoken.replace(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (_match, year, month, day) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    const yearStr = parseInt(year, 10) === 2026 ? 'de dois mil e vinte e seis' : `de ${year}`;
    return `${dayStr} ${monthStr} ${yearStr}`;
  });

  // 4. Match format DD/MM/YYYY (e.g. 15/06/2026) and convert to elegant spoken date
  spoken = spoken.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_match, day, month, year) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    const yearStr = parseInt(year, 10) === 2026 ? 'de dois mil e vinte e seis' : `de ${year}`;
    return `${dayStr} ${monthStr} ${yearStr}`;
  });

  // 5. Match format DD/MM (e.g. 15/06 or 15/6) and convert to day + month
  spoken = spoken.replace(/\b(\d{1,2})\/(\d{1,2})\b/g, (_match, day, month) => {
    const dayVal = parseInt(day, 10);
    const dayStr = numberWordsSpeak[dayVal] || String(dayVal);
    const monthStr = monthNamesSpeak[month] || `do mês ${month}`;
    return `${dayStr} ${monthStr}`;
  });

  // 6. Match format DD/MMM (e.g. 15/jun or 08/jun or 15/junho)
  spoken = spoken.replace(/\b(\d{1,2})\/([a-zA-Zçéáãõúí]{3,})\b/g, (_match, day, monthText) => {
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

export function falarRodovar(texto: string, onEndCallback?: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Cancel prior speech
  window.speechSynthesis.cancel();

  const normalized = normalizeTextForSpeech(texto);
  const utterance = new SpeechSynthesisUtterance(normalized);
  utterance.lang = 'pt-BR';
  utterance.pitch = 1.0; 
  utterance.volume = 1.0; 
  utterance.rate = 1.0; // Definindo velocidade em 1.0 (ritmo natural) como solicitado

  const voices = window.speechSynthesis.getVoices();
  
  const getBestVoice = (voiceList: SpeechSynthesisVoice[]) => {
    const ptBRVoices = voiceList.filter((v) => {
      const l = v.lang.toLowerCase().replace('_', '-');
      return l === 'pt-br' || l === 'pt';
    });

    if (ptBRVoices.length === 0) return null;

    const getScore = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      let score = 0;

      // Prefer "Google português do Brasil"
      if (name.includes('google português do brasil') || name.includes('google portugues do brasil')) {
        score += 1000;
      } else if (name.includes('google')) {
        score += 300;
      }

      // Check for male voice indicators
      const isMale = name.includes('daniel') || 
                     name.includes('felipe') || 
                     name.includes('male') || 
                     name.includes('homem') || 
                     name.includes('guy') || 
                     name.includes('antonio') || 
                     name.includes('junior') ||
                     name.includes('helio');
      
      if (isMale) {
        score += 500;
      }

      // Penalize female voices to prefer male unless it's the premium google voice
      const isFemale = name.includes('luciana') || 
                       name.includes('sandra') || 
                       name.includes('female') || 
                       name.includes('mulher') || 
                       name.includes('maria') || 
                       name.includes('helena') || 
                       name.includes('zita');
      if (isFemale && !name.includes('google')) {
        score -= 200;
      }

      return score;
    };

    const sorted = [...ptBRVoices].sort((a, b) => getScore(b) - getScore(a));
    return sorted[0];
  };

  let selectedVoice = getBestVoice(voices);
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang.toLowerCase().startsWith('pt')) || voices[0] || null;
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // Prevent browser garbage collection cutting off speech
  const win = window as any;
  win._activeUtterances = win._activeUtterances || [];
  win._activeUtterances.push(utterance);

  const cleanUp = () => {
    const idx = win._activeUtterances.indexOf(utterance);
    if (idx > -1) {
      win._activeUtterances.splice(idx, 1);
    }
  };

  utterance.onend = () => {
    cleanUp();
    if (onEndCallback) onEndCallback();
  };

  utterance.onerror = () => {
    cleanUp();
    if (onEndCallback) onEndCallback();
  };

  window.speechSynthesis.speak(utterance);
}

// Register as global function so any part of the system can call it
if (typeof window !== 'undefined') {
  (window as any).falarRodovar = falarRodovar;
  
  // Keep voice load updated
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      // Intentionally empty logic to maintain listeners
    };
  }
}
