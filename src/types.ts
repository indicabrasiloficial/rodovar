export type DeliveryStatus = 'coletando' | 'em_transito' | 'parado' | 'entregue';

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

declare global {
  interface Window {
    falarRodovar?: (texto: string, onEndCallback?: () => void) => void;
  }
}


