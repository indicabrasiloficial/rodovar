import React from 'react';
import { BookOpen, Mic, RefreshCw, Smartphone, ShieldAlert, CheckCircle, Flame, Star, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function AgentManual() {
  const commands = [
    {
      phrase: "@rodovar calcular rota de [Origem] para [Destino]",
      alternative: "/rota [Origem] [Destino] ou 'calcular rota de...'",
      effect: "Planeja o melhor percurso simulando quilometragem de rodovia, horas de viagem, consumo estimado de Diesel S10, custos de combustível, pontos de parada segura oficiais para descanço do motorista no percurso e classificação de risco da rota.",
      category: "Agente de Rotas"
    },
    {
      phrase: "@rodovar consultar cpf [Número do CPF]",
      alternative: "/cpf [Número] ou 'verificar cpf...'",
      effect: "Varre instantaneamente a Lista Negra da Central de Segurança Rodovar (blacklist) e de cargas ativas para assegurar que o motorista está com a documentação idônea e liberada pelas gerenciadoras Buonny e Pancary.",
      category: "Agente de Segurança (CPF)"
    },
    {
      phrase: "@rodovar consultar telefone [Contato comercial]",
      alternative: "/telefone [Número] ou 'telefone do motorista...'",
      effect: "Busca o contato telefônico nas bases de dados operacionais e de sinistros para validar se este telefone é ativo na central, listando detalhes cadastrados ou liberando o canal GSM de rastreamento.",
      category: "Agente de Contatos"
    },
    {
      phrase: "@rodovar consultar placa [Letras e Números]",
      alternative: "/placa [Placa] ou 'placa do veículo...'",
      effect: "Realiza uma simulação integrada de consulta contra bancos de roubo/furto de veículos Sinesp, bloqueios governamentais, restrições cadastrais nas gerenciadoras de riscos e integridade operacional do caminhão.",
      category: "Agente de Veículos (Placa)"
    },
    {
      phrase: "analisar frota",
      alternative: "auditoria de frota / rodovar alerta",
      effect: "Faz uma varredura instantânea de todos os motoristas buscando anomalias críticas como atrasos, paradas não planejadas ou ausência de sinal de GPS, recomendando ações rápidas por WhatsApp.",
      category: "Geral"
    },
    {
      phrase: "cargas paradas",
      alternative: "mostrar parados / veículos parados",
      effect: "Aplica instantaneamente o filtro de cargas que estão com o status de 'parado' na rodovia, organizando a lista e informando a quantidade via voz.",
      category: "Filtros"
    },
    {
      phrase: "cargas em trânsito",
      alternative: "cargas viajando / em trânsito",
      effect: "Exibe exclusivamente os motoristas que estão atualmente conduzindo os veículos pela rodovia, estimando as rotas.",
      category: "Filtros"
    },
    {
      phrase: "cargas coletando",
      alternative: "coletando / em fase de coleta",
      effect: "Mostra as cargas em preparação ou carregamento inicial no remetente.",
      category: "Filtros"
    },
    {
      phrase: "onde está [Nome do Motorista]?",
      alternative: "buscar por [Motorista, Origem ou Destino]",
      effect: "O Agente Rodovar busca no banco de dados geral e no Firestore pelo motorista or destino e descreve por áudio o status, trajeto, prazos de entrega e se oferece para abrir o WhatsApp dele com um script dinâmico.",
      category: "DQL Inteligente"
    },
    {
      phrase: "mostrar todas / limpar filtros",
      alternative: "todas / limpar",
      effect: "Restaura a visualização padrão mostrando a totalidade das cargas monitoradas no sistema.",
      category: "Geral"
    }
  ];

  const profiles = [
    {
      role: "Operador",
      focus: "Operação e Envios Rápidos",
      access: "Modificação completa de dados, criação e importação sequencial de planilhas Excel, acesso exclusivo aos Scripts Rápidos do WhatsApp de Jairo para motoristas e destinatários."
    },
    {
      role: "Gerente",
      focus: "Mitigação de Riscos e Auditoria",
      access: "Centralizada nas estatísticas de conformidade operacional, alertas de risco de viagem e painel de incidentes graves para apoiar decisões logísticas rápidas de sua equipe."
    },
    {
      role: "Diretor Comercial",
      focus: "Faturamento e Clientes Corporativos",
      access: "Acesso aos índices de frete bruto comercial da empresa, carteira de clientes ativos e ranking de vendas de cargas sem permissão de exclusão para garantir integridade fiscal."
    },
    {
      role: "Financeiro",
      focus: "Margens de Lucro e Saldos de Motoristas",
      access: "Exclusivo demonstrativo de repasses de frete (Diferença entre Frete Empresa e Frete Motorista), liquidez, análise de canhotos pendentes para pagamentos e bloqueios de perigo financeiro."
    },
    {
      role: "Diretor de Operações",
      focus: "KPIs de Tráfego e Pontualidade",
      access: "Visualização baseada em mapa tático de dispersão geográfica, tempos de parada, velocidade média da frota monitorada e taxas gerais de eficiência em trânsito."
    }
  ];

  const handleTestSpeech = () => {
    if (window.falarRodovar) {
      window.falarRodovar("Olá, tripulação Rodovar! Agente de Inteligência ativo e calibrado para responder a cada colaborador com precisão humana.");
    } else {
      alert("Recurso de voz indisponível ou bloqueado no seu navegador.");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Header */}
      <div className="bg-[#121212] border-2 border-[#FFD600] rounded-xl p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#FFD600]/10 border border-[#FFD600]/30 flex items-center justify-center text-[#FFD600]">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/20 rounded px-2 py-0.5 font-mono uppercase font-bold tracking-widest">
                Guia Técnico Oficial
              </span>
              <h1 className="text-xl font-black font-sans uppercase tracking-tight text-white mt-1.5 m-0">Manual de Instruções: Agente Rodovar 🤖</h1>
              <p className="text-xs text-zinc-400 mt-1 m-0">Entenda os comandos acústicos, automações inteligentes por voz e os perfis exclusivos do sistema.</p>
            </div>
          </div>

          <button
            onClick={handleTestSpeech}
            className="px-4 py-2 bg-[#FFD600] hover:bg-[#ffe23b] text-black font-mono text-xs uppercase font-extrabold rounded-lg transition-all hover:scale-105 cursor-pointer flex items-center gap-2 shadow-md shrink-0"
          >
            <Volume2 className="w-4 h-4 text-black" />
            Testar Sintetizador
          </button>
        </div>
      </div>

      {/* Grid of contents */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Voice Commands list */}
        <div className="lg:col-span-7 bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
            <Mic className="w-4 h-4 text-[#FFD600]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Comandos Verbais Homologados</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            O Agente de Rastreamento foi desenvolvido para operar via comandos livres por voz ou texto. Clique em qualquer comando abaixo para ouvir as instruções e testá-lo:
          </p>

          <div className="space-y-3">
            {commands.map((cmd, idx) => (
              <div 
                key={idx}
                onClick={() => {
                  if (window.falarRodovar) {
                    window.falarRodovar(`Comando verbal: ${cmd.phrase}. ${cmd.effect}`);
                  }
                }}
                className="bg-zinc-950 border border-zinc-900 rounded-lg p-3.5 hover:border-zinc-750 transition cursor-pointer group text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono font-black text-[#FFD600] uppercase group-hover:text-yellow-400 transition-colors">
                    💬 "{cmd.phrase}"
                  </p>
                  <span className="text-[9px] bg-zinc-900 border border-zinc-850 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                    {cmd.category}
                  </span>
                </div>
                {cmd.alternative && (
                  <p className="text-[9px] text-zinc-550 font-mono mt-1">
                    Alternativa aceita: <span className="text-zinc-400 italic">"{cmd.alternative}"</span>
                  </p>
                )}
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans mt-2">
                  {cmd.effect}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Visualizing uniques profile roles */}
        <div className="lg:col-span-5 bg-[#121212] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
            <ShieldAlert className="w-4 h-4 text-[#FFD600]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">Hierarquias de Perfil & Telas Reais</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            Com as novas regulamentações comerciais vigentes, cada perfil possui um portal sob medida focado em seu departamento de maior impacto:
          </p>

          <div className="space-y-4">
            {profiles.map((p, idx) => (
              <div key={idx} className="bg-zinc-950/60 p-3.5 border border-zinc-900 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FFD600]" />
                  <h4 className="text-xs font-bold text-gray-200 uppercase">{p.role}</h4>
                </div>
                <p className="text-[10px] font-mono text-[#FFD600] uppercase tracking-wider">{p.focus}</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans pt-1">
                  {p.access}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-[#FFD600]/5 border border-[#FFD600]/20 p-3.5 rounded-xl space-y-2 mt-4 font-sans text-xs">
            <h5 className="font-bold text-[#FFD600] flex items-center gap-1.5">
              <Flame className="w-4 h-4" /> Inteligência Conversacional
            </h5>
            <p className="text-[11px] text-zinc-300 leading-normal">
              O Agente reconhece quem está operando! Ele personaliza sua fala inicial com perguntas sobre fretes se você for <strong>Financeiro</strong>, atrasos operacionais se for <strong>Gerente</strong>, margens contratuais se for <strong>Diretor Comercial</strong> e roteiros se for <strong>Operador Geral</strong>.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
