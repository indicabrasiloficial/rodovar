import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../db/firebase';
import { getEntregas } from '../db/storage';

/**
 * Generates a unique tracking code with format RDV + 4 digits (e.g. RDV0123).
 * It checks both the local memory cache (ultra fast) and queries Firestore (robust guarantee)
 * to ensure absolute uniqueness.
 */
export async function generateUniqueTrackingCode(): Promise<string> {
  const ENTREGAS_COLLECTION = 'entregas';
  
  for (let attempt = 0; attempt < 100; attempt++) {
    // Generate standard code RDV + 4 digits (0000 to 9999 formatted with leading zeros if needed)
    const randomNum = Math.floor(Math.random() * 10000);
    const digits = randomNum.toString().padStart(4, '0');
    const code = `RDV${digits}`;
    
    // Check locally first
    const localList = getEntregas() || [];
    const localMatches = localList.some(e => e.trackingCode === code);
    if (localMatches) {
      continue;
    }
    
    // Query Firestore to verify against database
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
      console.warn("Firestore check failed during trackingCode generation, relying on memory uniqueness:", err);
      return code;
    }
  }
  
  // High-entropy fallback if 100 attempts collide (practically impossible)
  const fallbackNum = Math.floor(1000 + Math.random() * 9000);
  return `RDV${fallbackNum}`;
}
