import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Search, 
  MapPin, 
  Phone, 
  User, 
  Truck, 
  Building2, 
  Layers, 
  Sparkles, 
  ExternalLink, 
  Bookmark, 
  TrendingUp, 
  ArrowLeftRight,
  UserCheck,
  Plus,
  Trash2,
  CheckCircle,
  HelpCircle,
  Lightbulb
} from 'lucide-react';
import { Entrega } from '../types';
import { getEntregas } from '../db/storage';

interface Contact {
  id: string;
  nome: string;
  telefone: string;
  cidade: string;
  estado: string;
  tipo: 'Cliente' | 'Motorista' | 'Fornecedor';
  contadorViagens: number;
}

export default function Agenda() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'todos' | 'Cliente' | 'Motorista' | 'Fornecedor'>('todos');
  const [mascotBubble, setMascotBubble] = useState('');
  
  // Custom manual contacts addition (for numbers not yet tied to a delivery/carga)
  const [manualContacts, setManualContacts] = useState<Omit<Contact, 'contadorViagens'>[]>(() => {
    try {
      const saved = localStorage.getItem('rodovar_manual_agenda_contacts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    nome: '',
    telefone: '',
    cidade: '',
    estado: 'BA',
    tipo: 'Cliente' as 'Cliente' | 'Motorista' | 'Fornecedor'
  });

  // Load deliveries and parse contacts
  useEffect(() => {
    const list = getEntregas();
    setEntregas(list);
    
    // Auto-parse contacts from deliveries list
    const clientMap = new Map<string, { tel: string, cidade: string, estado: string, count: number }>();
    const driverMap = new Map<string, { tel: string, cidades: Set<string>, estados: Set<string>, count: number }>();
    const vendorMap = new Map<string, { tel: string, count: number }>();

    list.forEach(e => {
      // 1. Parse client from delivery
      if (e.cliente && e.cliente.trim()) {
        const clientName = e.cliente.trim();
        const clientTel = e.tel_cliente || '';
        
        // Extract city/state from destination
        let cidadeVal = 'Não informada';
        let estadoVal = 'BA';
        if (e.destino) {
          const parts = e.destino.split('-');
          if (parts.length > 1) {
            cidadeVal = parts[0].trim();
            estadoVal = parts[1].trim().toUpperCase().substring(0, 2);
          } else {
            cidadeVal = e.destino.trim();
          }
        }

        const existing = clientMap.get(clientName);
        if (existing) {
          clientMap.set(clientName, {
            tel: clientTel || existing.tel,
            cidade: cidadeVal !== 'Não informada' ? cidadeVal : existing.cidade,
            estado: estadoVal !== 'BA' ? estadoVal : existing.estado,
            count: existing.count + 1
          });
        } else {
          clientMap.set(clientName, {
            tel: clientTel,
            cidade: cidadeVal,
            estado: estadoVal,
            count: 1
          });
        }
      }

      // 2. Parse driver from delivery
      if (e.motorista && e.motorista.trim()) {
        const driverName = e.motorista.trim();
        const driverTel = e.tel_motorista || '';
        
        let destCidade = 'Rota Operacional';
        let destEstado = 'BA';
        if (e.destino) {
          const parts = e.destino.split('-');
          if (parts.length > 1) {
            destCidade = parts[0].trim();
            destEstado = parts[1].trim().toUpperCase().substring(0, 2);
          } else {
            destCidade = e.destino.trim();
          }
        }

        const existing = driverMap.get(driverName);
        if (existing) {
          existing.cidades.add(destCidade);
          existing.estados.add(destEstado);
          driverMap.set(driverName, {
            tel: driverTel || existing.tel,
            cidades: existing.cidades,
            estados: existing.estados,
            count: existing.count + 1
          });
        } else {
          const cSet = new Set<string>();
          const eSet = new Set<string>();
          cSet.add(destCidade);
          eSet.add(destEstado);
          driverMap.set(driverName, {
            tel: driverTel,
            cidades: cSet,
            estados: eSet,
            count: 1
          });
        }
      }

      // 3. Parse seller (Vendedor / Fornecedor) from delivery
      if (e.vendedor && e.vendedor.trim()) {
        const vendedorName = e.vendedor.trim();
        const existing = vendorMap.get(vendedorName);
        if (existing) {
          vendorMap.set(vendedorName, {
            tel: existing.tel, // vendors don't normally have specific tel on entrega fields
            count: existing.count + 1
          });
        } else {
          vendorMap.set(vendedorName, {
            tel: '',
            count: 1
          });
        }
      }
    });

    // Compile into final list of contact objects
    const compositeContacts: Contact[] = [];

    // Add Clients
    clientMap.forEach((val, name) => {
      compositeContacts.push({
        id: `client-${name}`,
        nome: name,
        telefone: val.tel,
        cidade: val.cidade,
        estado: val.estado,
        tipo: 'Cliente',
        contadorViagens: val.count
      });
    });

    // Add Drivers
    driverMap.forEach((val, name) => {
      const cidadesArr = Array.from(val.cidades);
      const estadosArr = Array.from(val.estados);
      compositeContacts.push({
        id: `driver-${name}`,
        nome: name,
        telefone: val.tel,
        cidade: cidadesArr[cidadesArr.length - 1] || 'Múltiplas Rotas',
        estado: estadosArr[estadosArr.length - 1] || 'BR',
        tipo: 'Motorista',
        contadorViagens: val.count
      });
    });

    // Add Sellers
    vendorMap.forEach((val, name) => {
      compositeContacts.push({
        id: `seller-${name}`,
        nome: name,
        telefone: val.tel || '',
        cidade: 'Suporte Comercial',
        estado: 'BR',
        tipo: 'Fornecedor',
        contadorViagens: val.count
      });
    });

    // Merge custom manual overrides or manually added contacts
    manualContacts.forEach(mc => {
      // Check if driver/client already present as auto-linked, update it
      const existingIdx = compositeContacts.findIndex(
        c => c.nome.toLowerCase() === mc.nome.toLowerCase() && c.tipo === mc.tipo
      );

      if (existingIdx !== -1) {
        compositeContacts[existingIdx] = {
          ...compositeContacts[existingIdx],
          telefone: mc.telefone || compositeContacts[existingIdx].telefone,
          cidade: mc.cidade || compositeContacts[existingIdx].cidade,
          estado: mc.estado || compositeContacts[existingIdx].estado,
        };
      } else {
        compositeContacts.push({
          ...mc,
          contadorViagens: 0
        });
      }
    });

    // Sort alphabetically by name
    compositeContacts.sort((a, b) => a.nome.localeCompare(b.nome));
    setContacts(compositeContacts);
  }, [manualContacts]);

  // Mascot quotes rotation
  const rodovinhoQuotes = [
    "Olá, Operador! Eu sou o Rodovinho! 🚛 Procurei no banco de dados todas as cargas e unifiquei os telefones de Clientes e Motoristas automaticamente aqui pra você!",
    "Dica de Ouro: Com o nosso banco de dados em tempo real, você descobre a origem de cada cliente em segundos e pode interagir direto pelo WhatsApp! ⚡",
    "Você sabia?! Sempre que cadastrar ou editar uma carga com telefone novo, eu atualizo a nossa Agenda Rodovar na mesma hora! Incrível, né? 😎",
    "Com o MODO LIGHT ativo, eu leio os contatos de forma super otimizada sem ferir os limites de cota grátis do Firebase! Trabalho focado e seguro!",
    "Mantenha os contatos salvos perfeitamente! Se precisar adicionar números de fornecedores ou clientes novos de forma preventiva, use o botão de cadastro manual!"
  ];

  useEffect(() => {
    // Choose initial random quote
    const randomQuote = rodovinhoQuotes[Math.floor(Math.random() * rodovinhoQuotes.length)];
    setMascotBubble(randomQuote);

    // Rotate quote every 15 seconds
    const interval = setInterval(() => {
      const nextQuote = rodovinhoQuotes[Math.floor(Math.random() * rodovinhoQuotes.length)];
      setMascotBubble(nextQuote);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleAddManualContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.nome || !newContact.telefone) {
      alert("Por favor, preencha o nome e o telefone!");
      return;
    }

    const contactToAdd: Omit<Contact, 'contadorViagens'> = {
      id: `manual-${Date.now()}`,
      nome: newContact.nome.trim(),
      telefone: newContact.telefone.replace(/\D/g, ''),
      cidade: newContact.cidade.trim() || 'Cadastrado Manual',
      estado: newContact.estado || 'BA',
      tipo: newContact.tipo
    };

    const updatedList = [...manualContacts, contactToAdd];
    setManualContacts(updatedList);
    localStorage.setItem('rodovar_manual_agenda_contacts', JSON.stringify(updatedList));

    // Reset state & close modal
    setNewContact({
      nome: '',
      telefone: '',
      cidade: '',
      estado: 'BA',
      tipo: 'Cliente'
    });
    setIsAddModalOpen(false);
    
    // Greet user with Mascot feedback
    setMascotBubble(`Maravilha! Adicionei o contato de "${contactToAdd.nome}" na categoria ${contactToAdd.tipo} permanentemente! 🎯`);
  };

  const handleDeleteContact = (id: string, name: string) => {
    if (!id.startsWith('manual-')) {
      alert("Contatos sincronizados do banco de dados de cargas não podem ser excluídos diretamente, pois dependem dos relatórios de viagens ativos no sistema!");
      return;
    }

    if (window.confirm(`Deseja remover o contato manual de "${name}" da agenda?`)) {
      const filtered = manualContacts.filter(c => c.id !== id);
      setManualContacts(filtered);
      localStorage.setItem('rodovar_manual_agenda_contacts', JSON.stringify(filtered));
      setMascotBubble(`Contato de "${name}" removido com sucesso!`);
    }
  };

  // Filtered contacts calculation
  const filteredContacts = contacts.filter(contact => {
    // Type Filter
    if (filterType !== 'todos' && contact.tipo !== filterType) return false;

    // Search Query Filter
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return (
      contact.nome.toLowerCase().includes(query) ||
      contact.telefone.includes(query) ||
      contact.cidade.toLowerCase().includes(query) ||
      contact.estado.toLowerCase().includes(query)
    );
  });

  const getCleanMobileLink = (tel: string, name: string, tipo: string) => {
    const cleanNumbers = tel.replace(/\D/g, '');
    const welcomeMsg = `Olá ${name}! Sou o representante operacional da Rodovar Transportadora. Código de monitoramento logístico ativo.`;
    return `https://wa.me/55${cleanNumbers}?text=${encodeURIComponent(welcomeMsg)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in" id="agenda-page-wrapper">
      
      {/* Decorative Mascot & Interactive Header */}
      <div 
        className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-900 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden shadow-2xl"
        id="agenda-mascot-banner"
      >
        {/* Abstract glowing backgrounds */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFD600]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Mascot Photo Frame */}
        <div className="relative shrink-0 flex items-center justify-center" id="mascot-frame">
          <div className="absolute inset-0 bg-[#FFD600]/20 rounded-full animate-ping pointer-events-none" style={{ animationDuration: '3s' }} />
          <div className="relative w-28 h-28 rounded-full border-2 border-[#FFD600] p-1 bg-zinc-950 overflow-hidden shadow-[0_0_20px_rgba(255,214,0,0.15)] flex items-center justify-center">
            {/* Real asset provided by the user */}
            <img 
              src="https://rodovar.com.br/wp-content/uploads/2026/02/Sua_carga_em_primeiro_lugar_-removebg-preview.png" 
              onError={(e) => {
                // Return fallback if needed
                e.currentTarget.src = "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=260&auto=format&fit=crop";
              }}
              alt="Mascote Rodovinho" 
              className="w-full h-full object-contain bg-zinc-900/35"
              referrerPolicy="no-referrer"
            />
          </div>
          {/* Active online badge */}
          <span className="absolute bottom-1.5 right-1.5 w-4 h-4 bg-emerald-500 border-2 border-zinc-950 rounded-full animate-pulse" />
        </div>

        {/* Mascot Animated Speech bubble */}
        <div className="flex-1 space-y-3 z-10" id="mascot-speech-bubble">
          <div className="relative bg-zinc-900 border border-zinc-800 text-zinc-100 p-4 rounded-2xl text-xs leading-relaxed animate-fade-in flex items-start gap-3 shadow-lg">
            {/* Little notch arrow pointing to mascot */}
            <div className="hidden md:block absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 border-b border-l border-zinc-800 rotate-45" />
            
            <div className="p-1 bg-[#FFD600]/10 rounded-lg">
              <Sparkles className="w-4 h-4 text-[#FFD600] shrink-0" />
            </div>
            
            <div>
              <span className="font-bold text-[#FFD600] block mb-1">Rodovinho, seu Assistente da Agenda:</span>
              <p className="font-medium text-gray-200">{mascotBubble || "Identificando contatos inteligentes..."}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-wide font-mono text-zinc-500">
            <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" /> Sincronismo Automático Ativo
            </span>
            <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900 flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-yellow-500" /> Modo Light de Redução de Quota
            </span>
          </div>
        </div>
      </div>

      {/* Main Database & Filters Layout Container */}
      <div 
        className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-6 shadow-xl space-y-6"
        id="agenda-database-container"
      >
        {/* Header toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2 m-0 uppercase tracking-wide">
              <BookOpen className="w-5 h-5 text-[#FFD600]" />
              Banco de Dados de Contatos Rodovar
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Consulte e acione diretamente clientes, fornecedores e motoristas filtrados e extraídos das coletas atuais.
            </p>
          </div>

          {/* Quick manual registration trigger */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center bg-[#FFD600]/10 text-[#FFD600] hover:bg-[#FFD600]/20 border border-[#FFD600]/40 rounded-xl px-4 py-2 gap-1.5 transition-all text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm hover:scale-[1.02] active:scale-95 duration-150 self-start md:self-auto"
            id="agenda-action-add-manual"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Cadastrar Contato</span>
          </button>
        </div>

        {/* Dynamic Filters & Search box row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="agenda-toolbar">
          
          {/* Search Bar Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, telefone, cidade ou estado..."
              className="w-full bg-zinc-900/40 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-550 focus:border-[#FFD600] focus:ring-0 focus:outline-none transition-colors"
              id="agenda-search-input"
            />
          </div>

          {/* Category Dropdown Navigation */}
          <div className="flex items-center gap-1.5 bg-zinc-900/30 p-1.5 rounded-xl border border-zinc-900">
            <button
              onClick={() => setFilterType('todos')}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                filterType === 'todos' 
                ? 'bg-zinc-800 text-white font-bold border-b border-yellow-500' 
                : 'text-zinc-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterType('Cliente')}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                filterType === 'Cliente' 
                ? 'bg-zinc-800 text-[#FFD600] font-bold border-b border-yellow-500' 
                : 'text-zinc-400 hover:text-white'
              }`}
            >
              Clientes
            </button>
            <button
              onClick={() => setFilterType('Motorista')}
              className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                filterType === 'Motorista' 
                ? 'bg-zinc-800 text-blue-400 font-bold border-b border-yellow-500' 
                : 'text-zinc-400 hover:text-white'
              }`}
            >
              Motoristas
            </button>
          </div>

          {/* Counter info */}
          <div className="bg-zinc-900/20 border border-zinc-900 rounded-xl px-4 py-2 flex items-center justify-between text-xs text-zinc-400">
            <span>Contatos listados:</span>
            <strong className="text-[#FFD600] text-sm font-mono font-black">{filteredContacts.length}</strong>
          </div>

        </div>

        {/* Database List view */}
        <div 
          className="border border-zinc-900 rounded-2xl overflow-hidden bg-zinc-950"
          id="agenda-database-table-wrapper"
        >
          {filteredContacts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-900/70 text-[10px] text-zinc-500 font-mono uppercase tracking-widest border-b border-zinc-900">
                    <th className="py-3 px-4 font-bold">Tipo</th>
                    <th className="py-3 px-4 font-bold">Nome</th>
                    <th className="py-3 px-4 font-bold">Identificação & Localidade</th>
                    <th className="py-3 px-4 font-bold">Telefone Principal</th>
                    <th className="py-3 px-4 font-bold">Engajamento / Cargas</th>
                    <th className="py-3 px-4 font-bold text-right">Ação Direta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 bg-zinc-950/40">
                  {filteredContacts.map((contact) => {
                    const cleanTel = contact.telefone.replace(/\D/g, '');
                    const hasValidTel = cleanTel.length >= 8;
                    
                    return (
                      <tr 
                        key={contact.id} 
                        className="hover:bg-zinc-900/30 transition-colors"
                        id={`contact-row-${contact.id}`}
                      >
                        {/* Status Icon */}
                        <td className="py-3.5 px-4">
                          {contact.tipo === 'Cliente' && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-500/10 text-[#FFD600] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-yellow-500/20">
                              <Building2 className="w-3 h-3" /> Cliente
                            </span>
                          )}
                          {contact.tipo === 'Motorista' && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-500/20">
                              <Truck className="w-3 h-3" /> Motorista
                            </span>
                          )}
                          {contact.tipo === 'Fornecedor' && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-purple-500/20">
                              <User className="w-3 h-3" /> Representante
                            </span>
                          )}
                        </td>

                        {/* Name (Polished Display) */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-100">{contact.nome}</span>
                            {contact.id.startsWith('manual-') && (
                              <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-500 font-bold mt-0.5">Adicionado Manualmente</span>
                            )}
                          </div>
                        </td>

                        {/* Identity (City & State) */}
                        <td className="py-3.5 px-4 font-sans text-xs">
                          <div className="flex items-center gap-1 text-zinc-300">
                            <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span>{contact.cidade}</span>
                            <span className="text-zinc-650 shrink-0 font-bold">—</span>
                            <span className="bg-zinc-900 text-zinc-400 border border-zinc-850 px-1 py-0.2 rounded text-[10px] font-bold font-mono">
                              {contact.estado}
                            </span>
                          </div>
                        </td>

                        {/* Telephone (Formatted) */}
                        <td className="py-3.5 px-4 text-xs font-mono">
                          {contact.telefone ? (
                            <div className="flex items-center gap-1.5 text-zinc-300">
                              <Phone className="w-3 h-3 text-zinc-500" />
                              <span>{contact.telefone}</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 font-sans italic text-xs">Sem número</span>
                          )}
                        </td>

                        {/* Engagement metrics */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <Layers className="w-3.5 h-3.5 text-zinc-550" />
                            <span>{contact.contadorViagens} {contact.contadorViagens === 1 ? 'viagem' : 'viagens'} registradas</span>
                          </div>
                        </td>

                        {/* Direct action links */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {hasValidTel ? (
                              <a
                                href={getCleanMobileLink(contact.telefone, contact.nome, contact.tipo)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 bg-[#128C7E]/10 hover:bg-[#128C7E]/20 text-[#25D366] border border-[#128C7E]/45 px-2.5 py-1.5 text-[10px] uppercase font-mono font-black rounded-lg transition-transform hover:scale-105 active:scale-95"
                                title={`Chamar no WhatsApp do ${contact.tipo}`}
                                id={`whatsapp-action-btn-${contact.id}`}
                              >
                                <Phone className="w-3 h-3" />
                                <span>Chamar Zap</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <button
                                disabled
                                className="px-2.5 py-1.5 text-[10px] text-zinc-600 border border-zinc-900 bg-zinc-900/20 rounded-lg cursor-not-allowed"
                              >
                                Chamar Zap
                              </button>
                            )}

                            {contact.id.startsWith('manual-') && (
                              <button
                                onClick={() => handleDeleteContact(contact.id, contact.nome)}
                                className="p-1.5 border border-zinc-900 hover:border-red-900 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                                title="Excluir Contato Manual"
                                id={`delete-manual-btn-${contact.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-zinc-500 space-y-3 font-sans">
              <HelpCircle className="w-8 h-8 text-zinc-650 mx-auto" />
              <div className="text-xs uppercase font-mono font-bold tracking-wider text-zinc-400">Nenhum contato localizado</div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                Tente alterar os termos da sua pesquisa ou filtre por uma categoria diferente de cadastro de contatos.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Manual Contact Registration Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[2000] p-4 animate-fade-in" id="register-contact-modal">
          <div className="bg-[#121212] border border-zinc-800 rounded-2xl max-w-md w-full flex flex-col shadow-2xl overflow-hidden">
            
            {/* Header */}
            <div className="border-b border-zinc-805 p-5 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#FFD600]" />
                <div>
                  <h3 className="text-sm font-bold font-sans uppercase tracking-wider text-white">Cadastrar Contato Manual</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Adicione de forma preventiva na Agenda Rodovar</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer text-xs font-semibold uppercase tracking-wider font-mono border border-zinc-800 px-2 rounded-lg bg-zinc-900"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddManualContact} className="p-6 space-y-4">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Nome do Contato:</label>
                <input
                  type="text"
                  required
                  value={newContact.nome}
                  onChange={(e) => setNewContact({...newContact, nome: e.target.value})}
                  placeholder="Nome do cliente, motorista ou fornecedor..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-[#FFD600] focus:ring-0 focus:outline-none transition-colors"
                />
              </div>

              {/* Telefone */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Telefone (com DDD):</label>
                <input
                  type="text"
                  required
                  value={newContact.telefone}
                  onChange={(e) => setNewContact({...newContact, telefone: e.target.value})}
                  placeholder="Ex: 11999991234"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-[#FFD600] focus:ring-0 focus:outline-none transition-colors font-mono"
                />
              </div>

              {/* Tipo */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Qual o Perfil / Tipo?</label>
                <select
                  value={newContact.tipo}
                  onChange={(e) => setNewContact({...newContact, tipo: e.target.value as any})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-white cursor-pointer focus:border-[#FFD600] focus:ring-0 focus:outline-none"
                >
                  <option value="Cliente">Cliente (Destinatário/Faturamento) 🏢</option>
                  <option value="Motorista">Motorista (Transporte Operacional) 🚚</option>
                  <option value="Fornecedor">Representante Comercial / Fornecedor 📦</option>
                </select>
              </div>

              {/* Localidade Row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Cidade:</label>
                  <input
                    type="text"
                    value={newContact.cidade}
                    onChange={(e) => setNewContact({...newContact, cidade: e.target.value})}
                    placeholder="Cidade"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-[#FFD600] focus:ring-0 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-mono tracking-widest text-[#FFD600] font-bold">Estado (UF):</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={newContact.estado}
                    onChange={(e) => setNewContact({...newContact, estado: e.target.value.toUpperCase()})}
                    placeholder="BA"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:border-[#FFD600] focus:ring-0 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Button Action */}
              <div className="pt-4 flex justify-end gap-2 border-t border-zinc-900 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold text-zinc-400 uppercase tracking-wider bg-zinc-900/40 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FFD600] hover:bg-[#ffe23b] text-black rounded-xl text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Gravar Contato
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
