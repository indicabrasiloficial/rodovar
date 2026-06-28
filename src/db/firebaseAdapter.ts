import { 
  db, 
  database 
} from './firebase';
import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy as firestoreOrderBy, 
  limit as firestoreLimit,
  getDocFromServer
} from 'firebase/firestore';
import { 
  ref, 
  onValue, 
  set as rtdbSet, 
  update as rtdbUpdate, 
  off, 
  get as rtdbGet, 
  remove as rtdbRemove 
} from 'firebase/database';
import { DatabaseAdapter } from './databaseAdapter';
import { 
  Entrega, 
  Colaborador, 
  BlacklistMotorista, 
  BlacklistCliente, 
  GroupChatMessage, 
  Invitation, 
  TelegramSettings,
  ScheduledMessage
} from '../types';

const ENTREGAS_COLLECTION = 'entregas';
const MESSAGES_COLLECTION = 'scheduled_messages';
const BLACKLIST_COLLECTION = 'blacklist_motoristas';
const BLACKLIST_CLIENTS_COLLECTION = 'blacklist_clientes';
const CHAT_COLLECTION = 'group_chat_messages';
const KICKED_COLLECTION = 'kicked_users';
const PRESENCE_COLLECTION = 'group_chat_presence';
const SYSTEM_LOGS_COLLECTION = 'system_logs';
const INVITES_COLLECTION = 'invites';
const COLABORADORES_COLLECTION = 'colaboradores';
const FAILED_LOGINS_COLLECTION = 'failed_logins';
const TELEGRAM_SETTINGS_COLLECTION = 'telegram_integration_settings';

export const firebaseAdapter: DatabaseAdapter = {
  providerName: 'Firebase Realtime Database & Firestore',

  async getConnectionStatus(): Promise<'online' | 'offline'> {
    try {
      // Test firestore connection with a server fetch
      await getDocFromServer(doc(db, 'test', 'connection'));
      return 'online';
    } catch {
      return 'offline';
    }
  },

  // Cargas (entregas)
  async getCarga(id: string): Promise<Entrega | null> {
    const docRef = doc(db, ENTREGAS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Entrega;
    }
    return null;
  },

  async listarCargas(): Promise<Entrega[]> {
    const snap = await getDocs(collection(db, ENTREGAS_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Entrega));
  },

  async salvarCarga(id: string, dados: Partial<Entrega>): Promise<void> {
    const docRef = doc(db, ENTREGAS_COLLECTION, id);
    await setDoc(docRef, dados, { merge: true });
  },

  async excluirCarga(id: string): Promise<void> {
    const docRef = doc(db, ENTREGAS_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async excluirCargasBulk(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => this.excluirCarga(id)));
  },

  inscreverCargasRealtime(callback: (dados: Entrega[]) => void): () => void {
    const q = query(collection(db, ENTREGAS_COLLECTION), firestoreOrderBy('created_at', 'desc'), firestoreLimit(250));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Entrega));
      callback(items);
    });
    return unsubscribe;
  },

  inscreverCarga(id: string, callback: (carga: Entrega | null) => void): () => void {
    const docRef = doc(db, ENTREGAS_COLLECTION, id);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as Entrega);
      } else {
        callback(null);
      }
    }, (err) => {
      console.error('Error listening to single cargo:', err);
      callback(null);
    });
    return unsubscribe;
  },

  inscreverCargaPorCodigoRastreio(code: string, callback: (carga: Entrega | null) => void): () => void {
    const q = query(
      collection(db, ENTREGAS_COLLECTION),
      where('trackingCode', '==', code)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        callback({ id: docSnap.id, ...docSnap.data() } as Entrega);
      } else {
        callback(null);
      }
    }, (err) => {
      console.error('Error listening to public tracking code:', err);
      callback(null);
    });
    return unsubscribe;
  },

  async buscarCargaPorVoz(firstTerm: string): Promise<Entrega | null> {
    const qm = query(
      collection(db, ENTREGAS_COLLECTION),
      where('search_motorista', '>=', firstTerm),
      where('search_motorista', '<=', firstTerm + '\uf8ff'),
      firestoreLimit(1)
    );
    const snapM = await getDocs(qm);
    if (!snapM.empty) {
      return { id: snapM.docs[0].id, ...snapM.docs[0].data() } as Entrega;
    }

    const qd = query(
      collection(db, ENTREGAS_COLLECTION),
      where('search_destino', '>=', firstTerm),
      where('search_destino', '<=', firstTerm + '\uf8ff'),
      firestoreLimit(1)
    );
    const snapD = await getDocs(qd);
    if (!snapD.empty) {
      return { id: snapD.docs[0].id, ...snapD.docs[0].data() } as Entrega;
    }

    return null;
  },

  // Realtime Tracking
  async setTrackingMode(mode: 'economy' | 'express' | 'normal'): Promise<void> {
    const modeRef = ref(database, 'config/tracking/mode');
    await rtdbSet(modeRef, mode);
  },

  inscreverTrackingMode(callback: (mode: 'economy' | 'express' | 'normal') => void): () => void {
    const modeRef = ref(database, 'config/tracking/mode');
    const unsubscribe = onValue(modeRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        if (val === 'economy' || val === 'express' || val === 'normal') {
          callback(val);
        }
      }
    });
    return () => {
      off(modeRef, 'value', unsubscribe);
    };
  },

  async atualizarTrackingCargo(id: string, dados: any): Promise<void> {
    const trackerRef = ref(database, `tracking/${id}`);
    await rtdbUpdate(trackerRef, dados);
  },

  inscreverTrackingCargo(id: string, callback: (dados: any) => void): () => void {
    const trackerRef = ref(database, `tracking/${id}`);
    const unsubscribe = onValue(trackerRef, (snap) => {
      callback(snap.val());
    });
    return () => {
      off(trackerRef, 'value', unsubscribe);
    };
  },

  inscreverTrackingGeral(callback: (dados: Record<string, any>) => void): () => void {
    const trackingRef = ref(database, 'tracking');
    const unsubscribe = onValue(trackingRef, (snap) => {
      callback(snap.val() || {});
    });
    return () => {
      off(trackingRef, 'value', unsubscribe);
    };
  },

  // Colaboradores
  async getColaboradorByEmail(email: string): Promise<Colaborador | null> {
    const q = query(collection(db, COLABORADORES_COLLECTION), where('email', '==', email.trim().toLowerCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Colaborador;
    }
    return null;
  },

  async getColaboradorByUsername(username: string): Promise<Colaborador | null> {
    const q = query(collection(db, COLABORADORES_COLLECTION), where('username', '==', username.trim().toLowerCase()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as Colaborador;
    }
    return null;
  },

  async listarColaboradores(): Promise<Colaborador[]> {
    const snap = await getDocs(collection(db, COLABORADORES_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Colaborador));
  },

  async salvarColaborador(id: string, dados: Partial<Colaborador>): Promise<void> {
    const docRef = doc(db, COLABORADORES_COLLECTION, id);
    await setDoc(docRef, dados, { merge: true });
  },

  async excluirColaborador(id: string): Promise<void> {
    await deleteDoc(doc(db, COLABORADORES_COLLECTION, id));
  },

  // Invitations (Convites)
  async salvarInvitation(token: string, dados: Invitation): Promise<void> {
    await setDoc(doc(db, INVITES_COLLECTION, token), dados);
  },

  async getInvitation(token: string): Promise<Invitation | null> {
    const snap = await getDoc(doc(db, INVITES_COLLECTION, token));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Invitation;
    }
    return null;
  },

  async listarInvitations(): Promise<Invitation[]> {
    const snap = await getDocs(collection(db, INVITES_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
  },

  // Blacklist (Lista Negra)
  async listarBlacklistMotoristas(): Promise<BlacklistMotorista[]> {
    const snap = await getDocs(collection(db, BLACKLIST_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlacklistMotorista));
  },

  async salvarBlacklistMotorista(id: string, dados: BlacklistMotorista): Promise<void> {
    await setDoc(doc(db, BLACKLIST_COLLECTION, id), dados, { merge: true });
  },

  async excluirBlacklistMotorista(id: string): Promise<void> {
    await deleteDoc(doc(db, BLACKLIST_COLLECTION, id));
  },

  inscreverBlacklistMotoristas(callback: (dados: BlacklistMotorista[]) => void): () => void {
    const q = collection(db, BLACKLIST_COLLECTION);
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlacklistMotorista)));
    });
    return unsubscribe;
  },

  async listarBlacklistClientes(): Promise<BlacklistCliente[]> {
    const snap = await getDocs(collection(db, BLACKLIST_CLIENTS_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as BlacklistCliente));
  },

  async salvarBlacklistCliente(id: string, dados: BlacklistCliente): Promise<void> {
    await setDoc(doc(db, BLACKLIST_CLIENTS_COLLECTION, id), dados, { merge: true });
  },

  async excluirBlacklistCliente(id: string): Promise<void> {
    await deleteDoc(doc(db, BLACKLIST_CLIENTS_COLLECTION, id));
  },

  inscreverBlacklistClientes(callback: (dados: BlacklistCliente[]) => void): () => void {
    const q = collection(db, BLACKLIST_CLIENTS_COLLECTION);
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as BlacklistCliente)));
    });
    return unsubscribe;
  },

  // Auditoria (System Logs)
  async listarSystemLogs(): Promise<any[]> {
    const q = query(collection(db, SYSTEM_LOGS_COLLECTION), firestoreOrderBy('timestamp', 'desc'), firestoreLimit(250));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async salvarSystemLog(id: string, dados: any): Promise<void> {
    await setDoc(doc(db, SYSTEM_LOGS_COLLECTION, id), dados);
  },

  async limparSystemLogs(): Promise<void> {
    const snap = await getDocs(collection(db, SYSTEM_LOGS_COLLECTION));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  },

  inscreverSystemLogs(callback: (dados: any[]) => void): () => void {
    const q = query(collection(db, SYSTEM_LOGS_COLLECTION), firestoreOrderBy('timestamp', 'desc'), firestoreLimit(200));
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  },

  // Telegram Config
  async getTelegramSettings(): Promise<TelegramSettings | null> {
    const snap = await getDoc(doc(db, TELEGRAM_SETTINGS_COLLECTION, 'current'));
    if (snap.exists()) {
      return snap.data() as TelegramSettings;
    }
    return null;
  },

  async saveTelegramSettings(settings: TelegramSettings): Promise<void> {
    await setDoc(doc(db, TELEGRAM_SETTINGS_COLLECTION, 'current'), settings);
  },

  // API Integration Config
  async getApiSettings(): Promise<any | null> {
    const snap = await getDoc(doc(db, 'api_integration_settings', 'config'));
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  },

  async saveApiSettings(settings: any): Promise<void> {
    await setDoc(doc(db, 'api_integration_settings', 'config'), settings);
  },

  // Chat
  async enviarMensagemChat(id: string, msg: GroupChatMessage): Promise<void> {
    await setDoc(doc(db, CHAT_COLLECTION, id), msg);
  },

  async excluirMensagemChat(id: string): Promise<void> {
    await deleteDoc(doc(db, CHAT_COLLECTION, id));
  },

  async limparMensagensChat(category: string): Promise<void> {
    const q = query(collection(db, CHAT_COLLECTION), where("category", "==", category));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  },

  inscreverChatRealtime(callback: (msgs: GroupChatMessage[]) => void): () => void {
    const q = query(collection(db, CHAT_COLLECTION), firestoreOrderBy("timestamp", "asc"), firestoreLimit(500));
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupChatMessage)));
    });
    return unsubscribe;
  },

  // Presença / Usuários logados
  async salvarPresenca(username: string, dados: any): Promise<void> {
    await setDoc(doc(db, PRESENCE_COLLECTION, username), dados, { merge: true });
  },

  async excluirPresenca(username: string): Promise<void> {
    await deleteDoc(doc(db, PRESENCE_COLLECTION, username));
  },

  inscreverPresenca(callback: (presencas: any[]) => void): () => void {
    const q = collection(db, PRESENCE_COLLECTION);
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  },

  // Kick List
  async salvarKick(username: string, kick: boolean): Promise<void> {
    if (kick) {
      await setDoc(doc(db, KICKED_COLLECTION, username), { kicked: true, at: new Date().toISOString() });
    } else {
      await deleteDoc(doc(db, KICKED_COLLECTION, username));
    }
  },

  inscreverKickList(callback: (kickList: string[]) => void): () => void {
    const q = collection(db, KICKED_COLLECTION);
    const unsubscribe = onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => d.id));
    });
    return unsubscribe;
  },

  // Scheduled Messages
  async listarScheduledMessages(): Promise<ScheduledMessage[]> {
    const snap = await getDocs(collection(db, MESSAGES_COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledMessage));
  },

  async salvarScheduledMessage(id: string, msg: ScheduledMessage): Promise<void> {
    await setDoc(doc(db, MESSAGES_COLLECTION, id), msg, { merge: true });
  },

  async excluirScheduledMessage(id: string): Promise<void> {
    await deleteDoc(doc(db, MESSAGES_COLLECTION, id));
  },

  // Failed Logins
  async getFailedLogin(usernameOrEmail: string): Promise<any | null> {
    const safeKey = usernameOrEmail.replace(/[@.]/g, '_');
    const snap = await getDoc(doc(db, FAILED_LOGINS_COLLECTION, safeKey));
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  },

  async salvarFailedLogin(usernameOrEmail: string, dados: any): Promise<void> {
    const safeKey = usernameOrEmail.replace(/[@.]/g, '_');
    await setDoc(doc(db, FAILED_LOGINS_COLLECTION, safeKey), dados);
  },

  async resetFailedLogin(usernameOrEmail: string): Promise<void> {
    const safeKey = usernameOrEmail.replace(/[@.]/g, '_');
    await deleteDoc(doc(db, FAILED_LOGINS_COLLECTION, safeKey));
  },

  // Export/Import para migração
  async exportarDados(): Promise<any> {
    const [
      entregas,
      colaboradores,
      blacklist_motoristas,
      blacklist_clientes,
      invitations,
      telegram,
      logs,
      chat,
      scheduled
    ] = await Promise.all([
      this.listarCargas(),
      this.listarColaboradores(),
      this.listarBlacklistMotoristas(),
      this.listarBlacklistClientes(),
      this.listarInvitations(),
      this.getTelegramSettings(),
      this.listarSystemLogs(),
      // load chat messages
      getDocs(collection(db, CHAT_COLLECTION)).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      this.listarScheduledMessages()
    ]);

    return {
      schema_version: '3.2-PRO',
      entregas,
      colaboradores,
      blacklist_motoristas,
      blacklist_clientes,
      invitations,
      telegram_settings: telegram,
      system_logs: logs,
      chat_messages: chat,
      scheduled_messages: scheduled
    };
  },

  async importarDados(dados: any): Promise<void> {
    if (!dados || dados.schema_version !== '3.2-PRO') {
      throw new Error('Versão de schema inválida. Esperada: 3.2-PRO');
    }

    // Process parallel restoration
    const tasks: Promise<any>[] = [];

    if (Array.isArray(dados.entregas)) {
      dados.entregas.forEach((item: any) => {
        tasks.push(this.salvarCarga(item.id, item));
      });
    }

    if (Array.isArray(dados.colaboradores)) {
      dados.colaboradores.forEach((item: any) => {
        tasks.push(this.salvarColaborador(item.id, item));
      });
    }

    if (Array.isArray(dados.blacklist_motoristas)) {
      dados.blacklist_motoristas.forEach((item: any) => {
        tasks.push(this.salvarBlacklistMotorista(item.id, item));
      });
    }

    if (Array.isArray(dados.blacklist_clientes)) {
      dados.blacklist_clientes.forEach((item: any) => {
        tasks.push(this.salvarBlacklistCliente(item.id, item));
      });
    }

    if (Array.isArray(dados.invitations)) {
      dados.invitations.forEach((item: any) => {
        tasks.push(this.salvarInvitation(item.id, item));
      });
    }

    if (dados.telegram_settings) {
      tasks.push(this.saveTelegramSettings(dados.telegram_settings));
    }

    if (Array.isArray(dados.system_logs)) {
      dados.system_logs.forEach((item: any) => {
        tasks.push(this.salvarSystemLog(item.id, item));
      });
    }

    if (Array.isArray(dados.chat_messages)) {
      dados.chat_messages.forEach((item: any) => {
        tasks.push(this.enviarMensagemChat(item.id, item));
      });
    }

    if (Array.isArray(dados.scheduled_messages)) {
      dados.scheduled_messages.forEach((item: any) => {
        tasks.push(this.salvarScheduledMessage(item.id, item));
      });
    }

    await Promise.all(tasks);
  }
};
