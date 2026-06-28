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

export interface DatabaseAdapter {
  providerName: string;
  getConnectionStatus(): Promise<'online' | 'offline'>;

  // Cargas (entregas)
  getCarga(id: string): Promise<Entrega | null>;
  listarCargas(): Promise<Entrega[]>;
  salvarCarga(id: string, dados: Partial<Entrega>): Promise<void>;
  excluirCarga(id: string): Promise<void>;
  excluirCargasBulk(ids: string[]): Promise<void>;
  inscreverCargasRealtime(callback: (dados: Entrega[]) => void): () => void;
  inscreverCarga(id: string, callback: (carga: Entrega | null) => void): () => void;
  inscreverCargaPorCodigoRastreio(code: string, callback: (carga: Entrega | null) => void): () => void;
  buscarCargaPorVoz(termo: string): Promise<Entrega | null>;

  // Realtime Tracking
  setTrackingMode(mode: 'economy' | 'express' | 'normal'): Promise<void>;
  inscreverTrackingMode(callback: (mode: 'economy' | 'express' | 'normal') => void): () => void;
  atualizarTrackingCargo(id: string, dados: any): Promise<void>;
  inscreverTrackingCargo(id: string, callback: (dados: any) => void): () => void;
  inscreverTrackingGeral(callback: (dados: Record<string, any>) => void): () => void;

  // Colaboradores
  getColaboradorByEmail(email: string): Promise<Colaborador | null>;
  getColaboradorByUsername(username: string): Promise<Colaborador | null>;
  listarColaboradores(): Promise<Colaborador[]>;
  salvarColaborador(id: string, dados: Partial<Colaborador>): Promise<void>;
  excluirColaborador(id: string): Promise<void>;

  // Invitations (Convites)
  salvarInvitation(token: string, dados: Invitation): Promise<void>;
  getInvitation(token: string): Promise<Invitation | null>;
  listarInvitations(): Promise<Invitation[]>;

  // Blacklist (Lista Negra)
  listarBlacklistMotoristas(): Promise<BlacklistMotorista[]>;
  salvarBlacklistMotorista(id: string, dados: BlacklistMotorista): Promise<void>;
  excluirBlacklistMotorista(id: string): Promise<void>;
  inscreverBlacklistMotoristas(callback: (dados: BlacklistMotorista[]) => void): () => void;

  listarBlacklistClientes(): Promise<BlacklistCliente[]>;
  salvarBlacklistCliente(id: string, dados: BlacklistCliente): Promise<void>;
  excluirBlacklistCliente(id: string): Promise<void>;
  inscreverBlacklistClientes(callback: (dados: BlacklistCliente[]) => void): () => void;

  // Auditoria (System Logs)
  listarSystemLogs(): Promise<any[]>;
  salvarSystemLog(id: string, dados: any): Promise<void>;
  limparSystemLogs(): Promise<void>;
  inscreverSystemLogs(callback: (dados: any[]) => void): () => void;

  // Telegram Config
  getTelegramSettings(): Promise<TelegramSettings | null>;
  saveTelegramSettings(settings: TelegramSettings): Promise<void>;

  // API Integration Config
  getApiSettings(): Promise<any | null>;
  saveApiSettings(settings: any): Promise<void>;

  // Chat
  enviarMensagemChat(id: string, msg: GroupChatMessage): Promise<void>;
  excluirMensagemChat(id: string): Promise<void>;
  limparMensagensChat(category: string): Promise<void>;
  inscreverChatRealtime(callback: (msgs: GroupChatMessage[]) => void): () => void;

  // Presença / Usuários logados
  salvarPresenca(username: string, dados: any): Promise<void>;
  excluirPresenca(username: string): Promise<void>;
  inscreverPresenca(callback: (presencas: any[]) => void): () => void;

  // Kick List
  salvarKick(username: string, kick: boolean): Promise<void>;
  inscreverKickList(callback: (kickList: string[]) => void): () => void;

  // Scheduled Messages (Agenda/Mensagens Programadas)
  listarScheduledMessages(): Promise<ScheduledMessage[]>;
  salvarScheduledMessage(id: string, msg: ScheduledMessage): Promise<void>;
  excluirScheduledMessage(id: string): Promise<void>;

  // Failed Logins
  getFailedLogin(usernameOrEmail: string): Promise<any | null>;
  salvarFailedLogin(usernameOrEmail: string, dados: any): Promise<void>;
  resetFailedLogin(usernameOrEmail: string): Promise<void>;

  // Export/Import para migração
  exportarDados(): Promise<{
    schema_version: string;
    entregas: Entrega[];
    colaboradores: Colaborador[];
    blacklist_motoristas: BlacklistMotorista[];
    blacklist_clientes: BlacklistCliente[];
    invitations: Invitation[];
    telegram_settings: TelegramSettings | null;
    system_logs: any[];
    chat_messages: GroupChatMessage[];
    scheduled_messages: ScheduledMessage[];
  }>;
  importarDados(dados: any): Promise<void>;
}

// Nós exportaremos o adapter padrão (Firebase) configurado
import { firebaseAdapter } from './firebaseAdapter';

export const dbAdapter: DatabaseAdapter = firebaseAdapter;
