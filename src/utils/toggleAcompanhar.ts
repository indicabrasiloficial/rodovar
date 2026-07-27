import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../db/firebase';

const ENTREGAS_COLLECTION = 'entregas';

/**
 * Funcao utilitaria isolada para alternar (toggle) o acompanhamento de um frete por um operador no Firestore.
 * Utiliza escrita pontual via dot-notation (updateDoc) para evitar condicoes de corrida e nao sobrescrever dados.
 */
export async function toggleAcompanhar(
  freteId: string,
  operadorId: string,
  operadorNome: string,
  isCurrentlyFollowing: boolean
): Promise<void> {
  if (!freteId || !operadorId) {
    throw new Error('ID do frete ou do operador invalido.');
  }

  const docRef = doc(db, ENTREGAS_COLLECTION, freteId);

  if (isCurrentlyFollowing) {
    // Remove o operador especifico do mapa 'acompanhando' sem alterar o resto do documento
    await updateDoc(docRef, {
      [`acompanhando.${operadorId}`]: deleteField()
    });
  } else {
    // Adiciona o operador especifico com nome e data/hora no mapa 'acompanhando'
    await updateDoc(docRef, {
      [`acompanhando.${operadorId}`]: {
        nome: operadorNome || 'Operador',
        desde: new Date().toISOString()
      }
    });
  }
}
