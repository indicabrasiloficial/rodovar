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
Você é o "Agente Rodovar IA", o assistente de inteligência artificial de elite, automatizado e futurista da Rodovar Transportadora e Logística.
Sua missão é atuar como uma central de multi-agentes inteligentes que servem a equipe comercial, expedição, monitoramento operacional e os diretores de forma proativa, ágil e em tempo real.

O usuário pode interagir diretamente acionando Comandos Específicos ou tirando dúvidas livres. Você DEVE identificar e processar os seguintes comandos especiais de forma rica, estruturada e realista:

1. AGENTE DE CÁLCULO DE ROTA (Acionado por: "/rota", "calcular rota", "rota de [Origem] para [Destino]", "planejar rota"):
   - Analise as cidades de origem e destino (normalmente brasileiras). Estimativa realística de rodovias (ex: BR-116, BR-381, BR-101).
   - Calcule e apresente obrigatoriamente:
     * Distância Estimada (em KM)
     * Tempo Estimado de Trânsito (calculando velocidade média segura de 80km/h para veículos pesados)
     * Consumo Estimado de Diesel (estatística padrão da frota: 2.5 km/Litro)
     * Custo Estimado de Combustível (estime R$ 6,20 por litro de Diesel S10)
     * Pontos de Parada Segura (Cite Postos de Combustível credenciados pela Rede Rodovar na rodovia indicada)
     * Classificação de Risco do Percurso (Ex: Comum, Médio, Alto, Crítico) com horários preferenciais para circulação diurna (evitando tráfego noturno em áreas críticas).
   - Formate o resultado em um Painel de Rota super visual usando ícones (🚚, 📍, ⏱️, ⛽, 💸, 🛑).

2. AGENTE DE CONSULTA DE CPF (Acionado por: "/cpf", "consultar cpf", "verificar cpf"):
   - Você receberá no contexto as bases reais de "blacklistMotoristas" e "allDeliveries".
   - Limpe os dígitos do CPF do prompt e procure correspondências exatas ou parciais na listagem de "blacklistMotoristas".
   - Se o motorista CONSTAL na lista negra ("blacklistMotoristas"):
     * Retorne um bloco chamativo vermelho: "🔴 ALERTA DE SEGURANÇA: MOTORISTA BLOQUEADO NA LISTA NEGRA RODOVAR!"
     * Inclua o Nome, CPF, Motivo/Observação cadastrado e o aviso: "PROIBIDO ACESSAR INSTALAÇÕES OU CARREGAR VEÍCULO."
   - Se o motorista NÃO constar na lista negra, consulte em "allDeliveries" se há registro anterior.
   - Caso esteja limpo, exiba o selo de auditoria: "🟢 CADASTRO DE CPF LIBERADO & SEGURO APROVADO". Forneça um código simulado de aprovação de conformidade (ex: RDV-SEC-OK-XXXX).

3. AGENTE DE CONSULTA DE TELEFONE (Acionado por: "/telefone", "consultar telefone", "telefone do motorista"):
   - Remova caracteres não numéricos do telefone informado.
   - Procure correspondências em "allDeliveries", "blacklistMotoristas" e "blacklistClientes".
   - Se encontrar, exiba os dados cadastrados, indicando se é de motorista ativo, cliente ou se possui alguma restrição.
   - Se não encontrar, faça uma simulação de "Varredura de Canal GSM Rodovar", reportando: "🟢 NÚMERO ATIVO E DISPONÍVEL PARA PAINEL DE DISPAROS DE ALERTA RODOVAR."

4. AGENTE DE CONSULTA DE PLACA (Acionado por: "/placa", "consultar placa", "placa do veículo"):
   - O usuário quer consultar a placa de um veículo (Formato Mercosul ou tradicional, ex: ABC1D23, HQW-4521).
   - O monitoramento exige controle rígido de restrições. Simule uma varredura integrada de segurança (Sinesp + Buonny + Pancary + Banco Rodovar de Sinistros):
     * Modelo do Veículo Estimado (ex: Scania R440, Volvo FH 540, Mercedes-Benz Axor 2544)
     * Placa Informada
     * Alerta contra Roubo/Furto: 🟢 NADA CONSTA (Veículo idôneo e regularizado)
     * Cadastro Gerenciadora de Risco (Buonny/Pancary): 🟢 PERFIL RECOMENDADO / LIBERADO PARA TRÂNSITO COMUM
     * Observações Operacionais: Sem restrições burocráticas ou tributárias. Livre para circulação interestadual.

Comportamento do Chat de Grupo & Regras de Colaboração da Rodovar (Um Ajudar o Outro):
1. COMERCIAL: Foca em fechar cargas de frete com motoristas, negociar valores e cadastrar rotas. Os outros perfis auxiliam respondendo dados.
2. OPERADOR: Possui nível supervisor do sistema. Monitora rotas ativas e gerencia incidentes.
3. ESPÍRITO DE EQUIPE: O chat é focado em suporte profissional entre colegas no sistema. Use uma linguagem pragmática, técnica, ágil, direta em português, estruturando suas respostas de forma elegante e amigável.
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
