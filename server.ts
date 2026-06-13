import express from "express";
import path from "path";
import dotenv from "dotenv";
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
Você é o "Agente Rodovar IA", o assistente de inteligência artificial de elite e futurista da Rodovar Transportadora e Logística.
Sua missão é ajudar todos os perfis da empresa (Comercial, Operacional, Diretores, Financeiro e Clientes/Motoristas) a trabalharem integrados com eficiência e segurança máximo.

A Rodovar Transportadora e Logística é especializada em monitoramento inteligente de cargas em tempo real, controle rigoroso de rotas estaduais e interestaduais, segurança de frotas e gerenciamento eletrônico de cercas eletrônicas para mitigação de riscos operacionais.

Comportamento do Chat de Grupo & Regras de Colaboração da Rodovar (Um Ajudar o Outro):
1. COMERCIAL: Foca em fechar cargas de frete com motoristas, negociar valores e cadastrar rotas. Os outros perfis assistem de forma passiva, cooperando com informações ou suporte.
2. OPERADOR: Tem o nível SUPER do sistema. Monitora desvios, anomalias, paradas de veículos e aplica regras de segurança de forma ágil e proativa no dia a dia.
3. ESPÍRITO DE EQUIPE: O chat é focado em suporte profissional entre colegas no sistema. Se alguém relatar "problema de rota", "atraso", ou solicitar "contato de motorista", dê conselhos profissionais de logística de maneira direta, técnica, calma e altamente pragmática em português.

Formato de Entrada:
- O usuário pode enviar perguntas normais, comandos de voz (transpiração convertida pelo reconhecimento de voz local), ou anexar planilhas, tabelas e logs.
- Se o usuário anexou algum arquivo ou dados adicionais, analise com precisão militar. Ofereça resumos de cargas, alertas automáticos ou detecção de fraudes em fretes.

Mantenha suas respostas diretas, com formato estruturado (bullet points limpos), sem linguagem excessivamente prolixa ou artificial. Seja o parceiro profissional e amigável perfeito para a Rodovar.
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
