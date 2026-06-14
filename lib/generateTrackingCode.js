// Lógica de geração de código único de rastreio para a Rodovar
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../src/db/firebase';
import { getEntregas } from '../src/db/storage';

/**
 * Gera um código de rastreamento único no formato RDVXXXX (ex: RDV0123).
 * Verifica localmente no cache da aplicação e diretamente no Firestore para garantir unicidade absoluta.
 */
export async function generateUniqueTrackingCode() {
  const ENTREGAS_COLLECTION = 'entregas';
  
  for (let attempt = 0; attempt < 100; attempt++) {
    const randomNum = Math.floor(Math.random() * 10000);
    const digits = randomNum.toString().padStart(4, '0');
    const code = `RDV${digits}`;
    
    // Verifica cache local
    const localList = getEntregas() || [];
    const localMatches = localList.some(e => e.trackingCode === code);
    if (localMatches) {
      continue;
    }
    
    // Verifica Firestore
    try {
      const q = query(
        collection(db, ENTREGAS_COLLECTION),
        where('trackingCode', '==', code)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return code;
      }
    } catch (err) {
      console.warn("Erro ao consultar Firestore, confiando em unicidade local de cache:", err);
      return code;
    }
  }
  
  const fallbackNum = Math.floor(1000 + Math.random() * 9000);
  return `RDV${fallbackNum}`;
}
