# Guia de Portabilidade & Migração — RODOVAR MONITORA

Este documento descreve a arquitetura da camada de abstração de dados (padrão **Adapter/Repository**) implementada no RODOVAR MONITORA para permitir a migração do sistema para qualquer outro banco de dados ou servidor no futuro sem a necessidade de reescrever o código das telas ou lógica de negócios.

---

## 1. Arquitetura da Abstração

Toda a interação com o banco de dados (anteriormente realizada por chamadas diretas ao Firebase Firestore e Realtime Database) agora é mediada pela interface única `DatabaseAdapter`.

- **Contrato Unificado:** `/src/db/databaseAdapter.ts` define a interface `DatabaseAdapter`.
- **Implementação Ativa:** `/src/db/firebaseAdapter.ts` fornece a implementação concreta para o Google Firebase (Firestore + Realtime Database).
- **Centralização:** `/src/config/env.ts` centraliza todas as credenciais de servidor de forma limpa.

Nenhuma tela ou componente do sistema realiza conexões diretas ou importa módulos do SDK do Firebase. Todos consomem exclusivamente o objeto exportado `dbAdapter`.

---

## 2. Métodos da Interface `DatabaseAdapter`

Abaixo estão detalhados os métodos genéricos por entidade expostos pela interface única:

### Entregas (Cargas)
- `getCarga(id: string): Promise<Entrega | null>` — Busca uma carga por ID.
- `listarCargas(): Promise<Entrega[]>` — Lista todas as cargas ativas.
- `salvarCarga(id: string, dados: Partial<Entrega>): Promise<void>` — Insere ou atualiza dados de uma carga.
- `excluirCarga(id: string): Promise<void>` — Exclui uma carga pelo ID.
- `excluirCargasBulk(ids: string[]): Promise<void>` — Exclui múltiplas cargas em lote.
- `inscreverCargasRealtime(callback: (dados: Entrega[]) => void): () => void` — Escuta alterações de cargas em tempo real.
- `inscreverCarga(id: string, callback: (carga: Entrega | null) => void): () => void` — Escuta uma única carga em tempo real.
- `inscreverCargaPorCodigoRastreio(code: string, callback: (carga: Entrega | null) => void): () => void` — Escuta uma carga por código de rastreamento em tempo real.
- `buscarCargaPorVoz(termo: string): Promise<Entrega | null>` — Pesquisa de cargas por voz (prefixo de motorista ou destino).

### Controle de Rastreamento (RTDB)
- `setTrackingMode(mode: 'economy' | 'express' | 'normal'): Promise<void>` — Altera a frequência de atualização global de rastreamento.
- `inscreverTrackingMode(callback: (mode: 'economy' | 'express' | 'normal') => void): () => void` — Escuta a frequência de rastreamento global ativa.
- `inscreverTrackingCargo(id: string, callback: (tracking: any) => void): () => void` — Escuta telemetria em tempo real de uma carga específica.
- `atualizarTrackingCargo(id: string, tracking: any): Promise<void>` — Grava telemetria em tempo real (coordenadas, bateria, etc.) de uma carga.
- `inscreverTrackingGeral(callback: (tracking: Record<string, any>) => void): () => void` — Escuta a telemetria consolidada de todos os motoristas em trânsito.

### Colaboradores & Convites
- `getColaboradorByEmail(email: string): Promise<Colaborador | null>` — Busca um colaborador pelo e-mail.
- `getColaboradorByUsername(username: string): Promise<Colaborador | null>` — Busca um colaborador pelo nome de usuário.
- `listarColaboradores(): Promise<Colaborador[]>` — Lista todos os colaboradores cadastrados.
- `salvarColaborador(id: string, colab: Colaborador): Promise<void>` — Salva ou atualiza o perfil de um colaborador.
- `getInvitationByToken(token: string): Promise<Invitation | null>` — Busca um convite ativo de cadastro via token único de 48h.
- `salvarInvitation(id: string, invite: Invitation): Promise<void>` — Cria ou atualiza um token de convite.
- `listarInvitations(): Promise<Invitation[]>` — Lista todos os convites emitidos pelo Administrador Master.

### Lista Negra (Blacklist)
- `listarBlacklistMotoristas(): Promise<BlacklistMotorista[]>` — Obtém a lista negra de CPFs de motoristas banidos.
- `salvarBlacklistMotorista(id: string, dados: BlacklistMotorista): Promise<void>` — Adiciona motorista à lista negra.
- `excluirBlacklistMotorista(id: string): Promise<void>` — Remove motorista da lista negra.
- `listarBlacklistClientes(): Promise<BlacklistCliente[]>` — Obtém a lista negra de CNPJs de clientes banidos.
- `salvarBlacklistCliente(id: string, dados: BlacklistCliente): Promise<void>` — Adiciona cliente à lista negra.
- `excluirBlacklistCliente(id: string): Promise<void>` — Remove cliente da lista negra.

### Integrações e Sistema
- `getApiSettings(): Promise<ApiSettings | null>` — Recupera segredos e assinaturas de webhook da API ativa.
- `saveApiSettings(settings: ApiSettings): Promise<void>` — Atualiza chaves e assinaturas da API de Integração.
- `getTelegramSettings(): Promise<TelegramSettings | null>` — Recupera chaves, catálogo de permissões e chats autorizados do bot Telegram.
- `saveTelegramSettings(settings: TelegramSettings): Promise<void>` — Salva definições e catálogo do Telegram.
- `listarSystemLogs(): Promise<any[]>` — Lista registros e logs de auditoria do sistema.
- `salvarSystemLog(log: any): Promise<void>` — Adiciona um novo log de auditoria.
- `limparSystemLogs(): Promise<void>` — Limpa permanentemente todos os logs de auditoria.

### Backup & Portabilidade de Dados
- `exportarDados(): Promise<any>` — Executa o dump integral do banco em formato JSON padronizado.
- `importarDados(dados: any): Promise<void>` — Importa e propaga a massa de dados JSON completa no driver ativo.
- `getConnectionStatus(): Promise<'online' | 'offline'>` — Verifica se a conectividade com o banco está ativa.

---

## 3. Esquema de Dados (Schema JSON versão "3.2-PRO")

O arquivo exportado e importado pelo painel do Master possui o seguinte formato estrutural rígido para validação:

```json
{
  "schema_version": "3.2-PRO",
  "entregas": [
    {
      "id": "string",
      "motorista": "string",
      "cpf": "string",
      "placa": "string",
      "origem": "string",
      "destino": "string",
      "status": "pendente | em_transito | concluida | cancelada",
      "valor_frete": 0,
      "trackingCode": "string",
      "search_motorista": "string",
      "search_destino": "string",
      "created_at": "string (ISO)"
    }
  ],
  "colaboradores": [
    {
      "id": "string",
      "username": "string",
      "email": "string",
      "role": "Master | Operador | Motorista | Parceria",
      "status": "pendente | ativo",
      "created_at": "string (ISO)"
    }
  ],
  "blacklist_motoristas": [],
  "blacklist_clientes": [],
  "invitations": [],
  "telegram_settings": {
    "botToken": "string",
    "authorizedChats": ["string"],
    "allowedActions": {
      "consultarCarga": true,
      "consultarMotorista": true,
      "gerarRelatorio": true,
      "cadastrarCarga": false,
      "cadastrarColaborador": false
    }
  },
  "system_logs": [],
  "chat_messages": [],
  "scheduled_messages": []
}
```

---

## 4. Passo a Passo para Criar um Novo Adaptador (Ex: PostgreSQL / MySQL / Supabase)

Se no futuro você desejar migrar a aplicação para um banco relacionalSQL ou outra infraestrutura em nuvem, siga estes passos simplificados:

### Passo 1: Criar o arquivo do adaptador
Crie o arquivo `/src/db/sqlAdapter.ts` e declare a implementação da interface:

```typescript
import { DatabaseAdapter } from './databaseAdapter';
import { Entrega, Colaborador, ... } from '../types';

export const sqlAdapter: DatabaseAdapter = {
  providerName: 'PostgreSQL / Supabase',

  async getCarga(id: string): Promise<Entrega | null> {
    // Exemplo usando fetch() para sua API Backend SQL ou ORM Prisma/Drizzle:
    const res = await fetch(\`/api/cargas/\${id}\`);
    return res.json();
  },

  async listarCargas(): Promise<Entrega[]> {
    const res = await fetch('/api/cargas');
    return res.json();
  },

  // Implemente todos os outros métodos definidos na interface...
};
```

### Passo 2: Redirecionar a exportação padrão
Abra o arquivo `/src/db/databaseAdapter.ts` e mude as linhas finais para apontar para seu novo adaptador SQL:

```typescript
// Mude de:
// import { firebaseAdapter } from './firebaseAdapter';
// export const dbAdapter: DatabaseAdapter = firebaseAdapter;

// Para:
import { sqlAdapter } from './sqlAdapter';
export const dbAdapter: DatabaseAdapter = sqlAdapter;
```

Pronto! Ao salvar, o compilador TypeScript verificará se você implementou todos os métodos exigidos pelo contrato. O seu sistema inteiro passará a ler e gravar no novo banco de dados imediatamente, sem precisar alterar uma única linha de código sequer nas telas do painel de controle, aplicativo do motorista ou telas públicas de rastreamento.
