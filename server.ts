import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Enlarge limits to handle safely 50MB attachments (usually Base64 payload is ~33% larger, so 65mb provides safety)
app.use(express.json({ limit: "65mb" }));
app.use(express.urlencoded({ extended: true, limit: "65mb" }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// AI Assistant endpoint
app.post("/api/chat/ai", async (req, res) => {
  try {
    const { prompt, context, attachment } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({
        success: true,
        text: "⚠️ [Modo Demonstrativo] Chave de API GEMINI_API_KEY não configurada na aba de Configurações > Secrets. Adicione a chave para ativar a inteligência real da Rodovar! Enquanto isso, estou operando com respostas simuladas rápidas.",
        isDemo: true
      });
    }

    const systemInstruction = `
Você é o "Agente Rodovar IA", o assistente de inteligência artificial de elite, de caráter realista e corporativo, da Rodovar Transportadora e Logística.
Sua missão é atuar como uma central de multi-agentes inteligentes que servem a equipe comercial, expedição, monitoramento operacional e os diretores em tempo real com base nos dados do sistema.

O usuário pode interagir diretamente acionando Comandos Específicos ou tirando dúvidas livres. Você DEVE analisar as bases de dados corporativas reais fornecidas no contexto de forma pragmática e realista:

1. AGENTE DE CÁLCULO DE ROTA (Acionado por: "/rota", "calcular rota", "rota de [Origem] para [Destino]"):
   - Baseado na origem e destino, estime e calcule matematicamente de forma realista:
     * Distância aproximada real (em KM) pelas principais rodovias nacionais (ex: BR-116, BR-381, BR-101, etc.).
     * Tempo Estimado de Trânsito calculado de forma precisa sob velocidade média segura de 80km/h para caminhões pesados.
     * Consumo Estimado de Diesel (estatística padrão da frota real: 2.5 km/Litro).
     * Custo Estimado de Combustível (multiplique a quantidade de litros estimada pelo valor de R$ 6,20 por litro de Diesel S10).
     * Pontos de Parada Segura (Mencione pontos ou postos de serviços reais do trajeto indicado).
     * Classificação de Risco do Percurso (Comum, Médio, Alto, Crítico) recomendando horários adequados de circulação diurna apenas se o trecho possuir alta taxa de sinistralidade real histórica.
   - Apresente os dados formatados em um Painel de Rota organizado com os ícones correspondentes (🚚, 📍, ⏱️, ⛽, 💸, 🛑).

2. AGENTE DE CONSULTA DE CPF (Acionado por: "/cpf", "consultar cpf", "verificar cpf"):
   - Realize uma consulta na base de dados de motoristas no contexto ("blacklistMotoristas" e "allDeliveries").
   - Limpe os dígitos e caracteres especiais do CPF fornecido para realizar a busca exata.
   - Se o motorista estiver cadastrado na Lista Negra ("blacklistMotoristas"):
     * Exiba um alerta em vermelho de segurança: "🔴 ALERTA DE SEGURANÇA: MOTORISTA BLOQUEADO NA LISTA NEGRA RODOVAR!"
     * Detalhe o Nome, CPF e a Observação/Motivo do bloqueio registrado pela direção.
   - Se o motorista possuir viagens em "allDeliveries", descreva o histórico real dessas viagens de forma transparente.
   - Se não constar em nenhuma base, responda com sobriedade: "Cadastro de CPF não possui restrições internas registradas no banco de dados da Rodovar." (Sem simular selos de auditoria fictícios ou chaves artificiais de validação).

3. AGENTE DE CONSULTA DE TELEFONE (Acionado por: "/telefone", "consultar telefone"):
   - Busque correspondências exatas de telefone nas tabelas "allDeliveries", "blacklistMotoristas" e "blacklistClientes".
   - Se o número for encontrado, detalhe as informações do cadastro (seja motorista ativo, cliente ou inadimplente).
   - Se o número de telefone não constar em nenhuma das listas e históricos, responda de forma objetiva: "O contato telefônico consultado não foi localizado em nosso banco de dados operacionais." (NÃO simule varreduras de sinal GSM ou de satélite).

REGRAS CRÍTICAS DE ESCOPO:
- A consulta de placa de veículo/Buonny/Sinesp foi removida por não possuirmos integração ativa externa governamental. Portanto, nunca tente simular consultas de placas.
- Jamais invente ou insira dados falsos no sistema. Se perguntado sobre algo que não está presente no contexto de dados enviado, responda de forma profissional que os dados não estão nos registros atuais.
- Comporte-se de maneira técnica, ágil, direta em português de negócios, estruturando as informações claramente de forma amigável.
`;

    // Content assembly including attachments if relevant
    const contents: any[] = [];

    if (attachment && attachment.data && attachment.mimeType) {
      contents.push({
        parts: [
          {
            inlineData: {
              data: attachment.data,
              mimeType: attachment.mimeType
            }
          },
          {
            text: `[DADOS DO ANEXO ENVIADO - NOME: ${attachment.name || "Arquivo"}]\n${prompt}`
          }
        ]
      });
    } else {
      contents.push({
        parts: [
          {
            text: `${prompt}\n\nContexto operacional de cargas ativas enviadas pelo sistema: ${JSON.stringify(context || {})}`
          }
        ]
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return res.json({
      success: true,
      text: response.text,
      isDemo: false
    });
  } catch (err: any) {
    console.error("Erro na API do Gemini:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Erro interno ao processar a requisição de IA"
    });
  }
});

// Endpoint serving active firebase config parameters to the standalone tracker client
app.get("/api/firebase-config", (req, res) => {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: "Configuration blueprint file not found." });
    }
    const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const config = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || configData.apiKey,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || configData.authDomain,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || configData.projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || configData.storageBucket,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configData.messagingSenderId,
      appId: process.env.VITE_FIREBASE_APP_ID || configData.appId,
      databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || configData.databaseURL || `https://${process.env.VITE_FIREBASE_PROJECT_ID || configData.projectId}-default-rtdb.firebaseio.com`
    };
    return res.json(config);
  } catch (err: any) {
    console.error("Error reading Firebase Applet config:", err);
    return res.status(500).json({ error: "Failed to read application configurations." });
  }
});

// Setup Vite Dev server or static files depending on mode
async function boot() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Iniciando servidor Express com Vite middleware no modo desenvolvimento...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Iniciando servidor Express no modo produção...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RODOVAR SERVER] Online na porta http://localhost:${PORT}`);
  });
}

boot().catch(err => {
  console.error("Falha ao iniciar o servidor express:", err);
});
