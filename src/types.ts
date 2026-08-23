export type DeliveryStatus = 'coletando' | 'em_transito' | 'parado' | 'entregue' | 'descarregando';

export interface EventoEntrega {
  id: string;
  timestamp: string;
  usuario: string;
  usuarioNome: string;
  cargo: string;
  descricao: string;
}

export interface Entrega {
  id: string;
  created_at: string;
  data_coleta: string;
  data?: string;
  vendedor: string;
  cliente: string;
  tel_cliente: string;
  motorista: string;
  tel_motorista: string;
  origem: string;
  destino: string;
  frete_empresa: number;
  frete_motorista: number;
  prazo: string;
  status: DeliveryStatus;
  observacoes: string;
  link_localizacao?: string;
  lat: number;
  lng: number;
  canhoto_solicitado: boolean;
  updated_at: string;
  km?: number;
  historico?: EventoEntrega[];
  valor_carga?: number;
  categoria_risco?: 'comum' | 'medio' | 'alto' | 'critico';
  editando_por?: {
    nome: string;
    usuario: string;
    timestamp: string;
  } | null;
  avaliacao_viagem?: 'boa' | 'ruim' | null;
  avaliacao_cliente?: 'boa' | 'ruim' | null;
  avaliacao_estrelas?: number;
  avaliacao_comentario?: string;
  avaliacao_tags?: string[];
  avaliacao_data?: string;
  cpf_motorista?: string;
  cpf_cnpj_cliente?: string;
  documentos?: DocumentoAnexo[];
  trackingCode?: string;
  cte?: string;
  localizacaoAtual?: { lat: number; lng: number } | null;
  ultimaAtualizacao?: string | null;
  etapasOperador?: {
    e01?: boolean;
    e02?: boolean;
    e03?: boolean;
    e04?: boolean;
    e05?: boolean;
    e06?: boolean;
    e07?: boolean;
    e08?: boolean;
    e09?: boolean;
    e10?: boolean;
    e11?: boolean;
    e12?: boolean;
    e13?: boolean;
    ultimaAtualizacao?: any;
  };
  notasOperador?: string;
  notasAtualizadaEm?: any;
  acompanhando?: Record<string, {
    nome: string;
    desde: string | any;
  }>;
  // Campos de Pagamento (Módulo Pagamentos RODOVAR)
  statusPagamentoAdiantamento?: 'pendente' | 'pago' | 'atrasado';
  statusPagamentoSaldo?: 'pendente' | 'pago' | 'atrasado';
  dataPagoAdiantamento?: string | null;
  dataPagoSaldo?: string | null;
  prazoAdiantamento?: string; // YYYY-MM-DD
  prazoSaldo?: string; // YYYY-MM-DD
  valorAdiantamento?: number;
  valorSaldo?: number;
  anexosPagamento?: AnexoPagamento[];
  rpaLido?: boolean;
  rpaNomeArquivo?: string;
  // Campos adicionais de RPA / Contrato
  contratoNum?: string;
  emissaoContrato?: string;
  ciot?: string;
  favorecidoPix?: string;
  chavePix?: string;
  bancoPix?: string;
  telEmergencia?: string;
  contatoEmergencia?: string;
  placaVeiculo?: string;
  // Sinalizações Visuais Rápidas
  locEntregaFeito?: boolean;
  previsaoClienteFeita?: boolean;
  // Timestamps de Controle de Pagamentos
  dataPagoAdiantamentoTimestamp?: number;
  dataPagoSaldoTimestamp?: number;
  solicitadoPagamento?: boolean;
  solicitadoPagamentoAdiantamento?: boolean;
  solicitadoPagamentoAdiantamentoData?: string;
  solicitadoPagamentoSaldo?: boolean;
  solicitadoPagamentoData?: string;
  data_entrega?: string;
}

export interface AnexoPagamento {
  id: string;
  tipo: 'nf' | 'coleta' | 'entrega' | 'rap';
  url: string; // Data URL or storage link
  nomeArquivo: string;
  dataUpload: string;
  tamanhoKb?: number;
}

export interface DocumentoAnexo {
  id: string;
  nome: string;
  tipo: 'MDFE' | 'CTE' | 'CANHOTO' | 'OUTROS';
  dataAnexado: string;
  tamanho?: string;
  conteudoBase64?: string;
}

export interface BlacklistMotorista {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  observacao: string;
  created_at: string;
  usuarioNome?: string;
  userId?: string;
}

export interface BlacklistCliente {
  id: string;
  nome: string;
  cpf_cnpj?: string;
  telefone?: string;
  observacao: string;
  created_at: string;
  usuarioNome?: string;
  userId?: string;
}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  useMock: boolean;
}

export interface ScheduledMessage {
  id: string;
  deliveryId: string;
  deliveryDriver: string;
  deliveryDestiny: string;
  recipientName: string;
  recipientPhone: string;
  recipientType: 'motorista' | 'cliente';
  scheduledTime: string; // "YYYY-MM-DDTHH:mm" format
  messageText: string;
  status: 'pendente' | 'enviado' | 'cancelado';
  createdAt: string;
}

export interface GroupChatMessage {
  id: string;
  category: 'comercial' | 'operacional' | 'ai' | 'diretoria';
  text: string;
  userId: string;
  userName: string;
  userRole: string;
  timestamp: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentPreview?: string; // base64 preview or visual data
  audioUrl?: string; // voice audio note URL if applicable
  isVoiceNote?: boolean;
  isAiTriggered?: boolean;
  aiAgentResponse?: string;
  seenBy?: Record<string, { userName: string; timestamp: string }>;
}

export interface Invitation {
  id: string; // the token
  email: string;
  role: 'admin' | 'operador' | 'leitura';
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface Colaborador {
  id: string;
  uid: string;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'operador' | 'leitura';
  detailedRole: string;
  status: 'pendente' | 'aprovado';
  forcePasswordChange: boolean;
  passwordOverride?: string;
  created_at: string;
}

export interface FailedLogin {
  username: string;
  attempts: number;
  lastAttempt: string;
  lockedUntil: number;
}

export interface TelegramSettings {
  botToken: string;
  chatIds: string[];
  allowedActions: {
    consultarCarga: boolean;
    consultarLocalizacao: boolean;
    gerarRelatorio: boolean;
    cadastrarCarga: boolean;
    cadastrarColaborador: boolean;
  };
  exigirConfirmacao: {
    consultarCarga: boolean;
    consultarLocalizacao: boolean;
    gerarRelatorio: boolean;
    cadastrarCarga: boolean;
    cadastrarColaborador: boolean;
  };
}

export interface Anotacao {
  id: string;
  texto: string;
  tag: 'urgente' | 'lembrete' | 'observacao';
  fixada: boolean;
  fretId: string | null;
  autorNome: string;
  autorUsername?: string;
  autorRole: string;
  status: 'ativa' | 'arquivada';
  criadoEm: any;
  atualizadoEm: any;
}

declare global {
  interface Window {
    falarRodovar?: (texto: string, onEndCallback?: () => void) => void;
  }
}


