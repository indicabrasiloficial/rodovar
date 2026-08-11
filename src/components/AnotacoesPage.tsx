import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  RefreshCw, 
  Pin, 
  Archive, 
  Edit3, 
  AlertCircle, 
  CheckCircle2, 
  Tag, 
  User, 
  Search, 
  Clock, 
  Truck, 
  ShieldAlert, 
  X, 
  ChevronDown
} from 'lucide-react';
import { useAnotacoes } from '../hooks/useAnotacoes';
import { Anotacao, Entrega } from '../types';
import { getEntregas, fetchEntregasFromServer } from '../db/storage';

interface AnotacoesPageProps {
  currentUser?: {
    uid?: string;
    username?: string;
    displayName?: string;
    name?: string;
    role?: string;
  } | null;
}

export const AnotacoesPage: React.FC<AnotacoesPageProps> = ({ currentUser }) => {
  // Normalize user identification & role
  const userRole = (currentUser?.role || '').toLowerCase();
  const userName = currentUser?.displayName || currentUser?.name || currentUser?.username || 'Usuário';
  const userUsername = (currentUser?.username || '').toLowerCase();

  // Permissões: apenas master, gerente e operador têm acesso
  const isMaster = userRole === 'master' || userUsername === 'master' || userRole === 'administrador';
  const isGerente = userRole.includes('gerente') || userRole.includes('gerencia');
  const isOperador = userRole.includes('operador') || userRole.includes('operacao');

  const hasAccess = isMaster || isGerente || isOperador;

  // Custom hook isolado com regras de cache (4 min TTL, getDocs, limit 30)
  const {
    notes,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch,
    loadMore,
    createNote,
    updateNote,
    archiveNote
  } = useAnotacoes();

  // Estados locais da UI
  const [tagFilter, setTagFilter] = useState<'todas' | 'urgente' | 'lembrete' | 'observacao'>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Anotacao | null>(null);

  // Form local do Modal
  const [formTexto, setFormTexto] = useState('');
  const [formTag, setFormTag] = useState<'urgente' | 'lembrete' | 'observacao'>('observacao');
  const [formFixada, setFormFixada] = useState(false);
  const [formFretId, setFormFretId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Lista de entregas para auxílio no vínculo de fretes (Reativa com tempo real)
  const [entregasDisponiveis, setEntregasDisponiveis] = useState<Entrega[]>(() => {
    try {
      return getEntregas();
    } catch {
      return [];
    }
  });

  // Atualização em tempo real das entregas para vincular no modal e badges
  useEffect(() => {
    const updateEntregas = () => {
      try {
        const list = getEntregas();
        setEntregasDisponiveis(list);
      } catch (err) {
        console.error('Erro ao carregar entregas:', err);
      }
    };

    updateEntregas();

    // Sincroniza do servidor Firestore ao carregar a página
    fetchEntregasFromServer(true).then(() => {
      updateEntregas();
    }).catch(() => {});

    window.addEventListener('rodovar_realtime_event', updateEntregas);
    return () => {
      window.removeEventListener('rodovar_realtime_event', updateEntregas);
    };
  }, []);

  // Mapa indexado de fretes por ID para busca O(1) e formatacao de badges
  const entregasMap = useMemo(() => {
    const map = new Map<string, Entrega>();
    entregasDisponiveis.forEach(e => {
      if (e.id) map.set(e.id.toLowerCase().trim(), e);
      if (e.trackingCode) map.set(e.trackingCode.toLowerCase().trim(), e);
    });
    return map;
  }, [entregasDisponiveis]);

  // Se o usuário não tiver permissão, exibe tela de Acesso Negado
  if (!currentUser || !hasAccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-zinc-950 border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-red-950/80 border border-red-800/60 text-red-500 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(239,68,68,0.2)]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black uppercase text-white font-mono tracking-wider">Acesso Restrito</h2>
            <p className="text-xs text-zinc-400 font-mono leading-relaxed">
              O módulo de <strong className="text-red-400 uppercase">Anotações Internas</strong> é de acesso exclusivo para <span className="text-white">Gerentes</span> e <span className="text-white">Operadores</span> do sistema.
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-900">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-zinc-900 text-zinc-500 border border-zinc-800">
              Seu perfil atual: {currentUser?.role || 'Visitante'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Abertura do modal em modo criação
  const handleOpenCreateModal = () => {
    try { setEntregasDisponiveis(getEntregas()); } catch {}
    setEditingNote(null);
    setFormTexto('');
    setFormTag('observacao');
    setFormFixada(false);
    setFormFretId('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abertura do modal em modo edição
  const handleOpenEditModal = (note: Anotacao) => {
    try { setEntregasDisponiveis(getEntregas()); } catch {}
    setEditingNote(note);
    setFormTexto(note.texto);
    setFormTag(note.tag);
    setFormFixada(note.fixada);
    setFormFretId(note.fretId || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Salvar nota (Criação ou Edição)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTexto.trim()) {
      setFormError('Por favor, digite o texto da anotação.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingNote) {
        // Atualizar nota existente
        await updateNote(editingNote.id, {
          texto: formTexto.trim(),
          tag: formTag,
          fixada: formFixada,
          fretId: formFretId.trim() || null
        });
      } else {
        // Criar nova nota (1 única escrita via addDoc)
        await createNote({
          texto: formTexto.trim(),
          tag: formTag,
          fixada: formFixada,
          fretId: formFretId.trim() || null,
          autorNome: userName,
          autorUsername: userUsername,
          autorRole: currentUser.role || 'Operador'
        });
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar anotação:', err);
      setFormError(err?.message || 'Erro ao salvar no Firestore.');
    } finally {
      setSaving(false);
    }
  };

  // Alternar fixação da nota diretamente no card
  const handleTogglePin = async (note: Anotacao) => {
    try {
      await updateNote(note.id, { fixada: !note.fixada });
    } catch (err) {
      console.error('Erro ao alternar fixação:', err);
    }
  };

  // Arquivar nota
  const handleArchive = async (id: string) => {
    if (window.confirm('Deseja realmente arquivar esta anotação?')) {
      try {
        await archiveNote(id);
      } catch (err) {
        console.error('Erro ao arquivar:', err);
      }
    }
  };

  // Regra de edição/arquivamento do operador:
  // Gerente / Master: podem editar/arquivar QUALQUER nota.
  // Operador: só pode editar/arquivar se for o AUTOR da nota.
  const canEditNote = (note: Anotacao) => {
    if (isMaster || isGerente) return true;
    if (isOperador) {
      const isAuthorName = note.autorNome.toLowerCase() === userName.toLowerCase();
      const isAuthorUsername = note.autorUsername && userUsername && note.autorUsername.toLowerCase() === userUsername;
      return isAuthorName || isAuthorUsername;
    }
    return false;
  };

  // Filtragem e ordenação em memória das notas carregadas
  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => {
        // Filtro por Tag
        if (tagFilter !== 'todas' && n.tag !== tagFilter) return false;
        
        // Filtro por busca de texto ou autor ou frete
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const matchTexto = n.texto.toLowerCase().includes(q);
          const matchAutor = n.autorNome.toLowerCase().includes(q);
          
          let matchFrete = false;
          if (n.fretId) {
            const frete = entregasMap.get(n.fretId.toLowerCase().trim());
            if (frete) {
              matchFrete = 
                (frete.motorista && frete.motorista.toLowerCase().includes(q)) ||
                (frete.cliente && frete.cliente.toLowerCase().includes(q)) ||
                (frete.origem && frete.origem.toLowerCase().includes(q)) ||
                (frete.destino && frete.destino.toLowerCase().includes(q)) ||
                frete.id.toLowerCase().includes(q);
            } else {
              matchFrete = n.fretId.toLowerCase().includes(q);
            }
          }

          return matchTexto || matchAutor || matchFrete;
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned notes em primeiro lugar
        if (a.fixada && !b.fixada) return -1;
        if (!a.fixada && b.fixada) return 1;
        
        // Depois por atualizadoEm decrescente
        const timeA = new Date(a.atualizadoEm).getTime() || 0;
        const timeB = new Date(b.atualizadoEm).getTime() || 0;
        return timeB - timeA;
      });
  }, [notes, tagFilter, searchTerm]);

  // Formatação de data/hora pt-BR
  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 sm:p-4 max-w-7xl mx-auto">
      
      {/* CAVEÇALHO PRINCIPAL DA PÁGINA */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#FFD600]/10 border border-[#FFD600]/30 flex items-center justify-center text-[#FFD600]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-white font-mono flex items-center gap-2">
                ANOTAÇÕES INTERNAS
              </h1>
              <p className="text-xs text-zinc-400 font-mono">
                Módulo restrito para alinhamentos, lembretes e observações de fretes.
              </p>
            </div>
          </div>
        </div>

        {/* BOTOES DE AÇÃO */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              refetch();
              fetchEntregasFromServer(true).then(() => {
                try { setEntregasDisponiveis(getEntregas()); } catch {}
              }).catch(() => {});
            }}
            disabled={loading}
            className="px-3.5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Forçar releitura no Firestore"
          >
            <RefreshCw className={`w-4 h-4 text-[#FFD600] ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-[#FFD600] hover:bg-yellow-400 text-black font-mono font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.2)]"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Nova Anotação</span>
          </button>
        </div>
      </div>

      {/* PAINEL DE FILTROS E BUSCA */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          
          {/* Botoes de Filtro de Tag */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setTagFilter('todas')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border shrink-0 ${
                tagFilter === 'todas'
                  ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-white'
              }`}
            >
              Todas ({notes.length})
            </button>

            <button
              type="button"
              onClick={() => setTagFilter('urgente')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                tagFilter === 'urgente'
                  ? 'bg-red-950 text-red-400 border-red-800 shadow-sm'
                  : 'bg-zinc-900/80 text-red-400/70 border-zinc-800 hover:text-red-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              ⚡ Urgente ({notes.filter(n => n.tag === 'urgente').length})
            </button>

            <button
              type="button"
              onClick={() => setTagFilter('lembrete')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                tagFilter === 'lembrete'
                  ? 'bg-yellow-950 text-[#FFD600] border-yellow-800 shadow-sm'
                  : 'bg-zinc-900/80 text-yellow-500/70 border-zinc-800 hover:text-[#FFD600]'
              }`}
            >
              📌 Lembrete ({notes.filter(n => n.tag === 'lembrete').length})
            </button>

            <button
              type="button"
              onClick={() => setTagFilter('observacao')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                tagFilter === 'observacao'
                  ? 'bg-cyan-950 text-cyan-400 border-cyan-800 shadow-sm'
                  : 'bg-zinc-900/80 text-cyan-400/70 border-zinc-800 hover:text-cyan-400'
              }`}
            >
              📝 Observação ({notes.filter(n => n.tag === 'observacao').length})
            </button>
          </div>

          {/* Campo de Busca em Memoria */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar texto, autor ou frete..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#FFD600]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* MENSAGEM DE ERRO SE OCURRER NO HOOK */}
      {error && (
        <div className="bg-red-950/80 border border-red-800 text-red-300 p-4 rounded-xl text-xs font-mono flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* CARREGANDO INICIAL */}
      {loading ? (
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#FFD600] animate-spin mx-auto" />
          <p className="text-xs font-mono text-zinc-400">Carregando anotações internas do Firestore...</p>
        </div>
      ) : filteredNotes.length === 0 ? (
        /* ESTADO VAZIO */
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-12 text-center space-y-3">
          <FileText className="w-12 h-12 text-zinc-700 mx-auto" />
          <h3 className="text-sm font-bold uppercase text-zinc-300 font-mono">Nenhuma anotação encontrada</h3>
          <p className="text-xs text-zinc-500 font-mono max-w-sm mx-auto">
            {searchTerm || tagFilter !== 'todas'
              ? 'Nenhum item atende aos filtros selecionados. Tente limpar os filtros de busca.'
              : 'Ainda não há anotações cadastradas. Clique em "+ Nova Anotação" para incluir a primeira.'}
          </p>
          {(searchTerm || tagFilter !== 'todas') && (
            <button
              type="button"
              onClick={() => { setTagFilter('todas'); setSearchTerm(''); }}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-[#FFD600] rounded-lg border border-zinc-800 mt-2"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      ) : (
        /* LISTA VERTICAL DE CARDS DE ANOTAÇÃO */
        <div className="space-y-3">
          {filteredNotes.map(note => {
            const canManage = canEditNote(note);

            // Borda lateral colorida por Tag
            let borderTagClass = 'border-l-4 border-l-cyan-500';
            let tagBadgeClass = 'bg-cyan-950/80 text-cyan-400 border-cyan-800/80';
            let tagLabel = '📝 OBSERVAÇÃO';

            if (note.tag === 'urgente') {
              borderTagClass = 'border-l-4 border-l-red-500';
              tagBadgeClass = 'bg-red-950/80 text-red-400 border-red-800/80';
              tagLabel = '⚡ URGENTE';
            } else if (note.tag === 'lembrete') {
              borderTagClass = 'border-l-4 border-l-[#FFD600]';
              tagBadgeClass = 'bg-yellow-950/80 text-[#FFD600] border-yellow-800/80';
              tagLabel = '📌 LEMBRETE';
            }

            return (
              <div
                key={note.id}
                className={`bg-zinc-950 border ${
                  note.fixada ? 'border-[#FFD600]/40 shadow-[0_0_15px_rgba(255,214,0,0.08)]' : 'border-zinc-900'
                } ${borderTagClass} rounded-xl p-4 transition-all hover:border-zinc-800 space-y-3`}
              >
                {/* CABEÇALHO DO CARD */}
                <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase border ${tagBadgeClass}`}>
                      {tagLabel}
                    </span>

                    {note.fixada && (
                      <span className="px-2 py-0.5 bg-[#FFD600]/10 border border-[#FFD600]/30 text-[#FFD600] rounded-md text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                        <Pin className="w-3 h-3 fill-[#FFD600]" />
                        <span>FIXADA NO TOPO</span>
                      </span>
                    )}

                    {note.fretId && (() => {
                      const frete = entregasMap.get(note.fretId.toLowerCase().trim());
                      if (frete) {
                        const motoristaNome = frete.motorista ? frete.motorista.trim() : '';
                        const clienteNome = frete.cliente ? frete.cliente.trim() : '';
                        const origem = frete.origem ? frete.origem.trim() : '';
                        const destino = frete.destino ? frete.destino.trim() : '';
                        const rotaStr = (origem || destino) ? `${origem || '?'} ➔ ${destino || '?'}` : '';

                        let freteLabel = '';
                        if (motoristaNome && clienteNome) {
                          freteLabel = `${motoristaNome} (${clienteNome})`;
                        } else if (motoristaNome) {
                          freteLabel = motoristaNome;
                        } else {
                          freteLabel = clienteNome || 'Frete Sem Identificação';
                        }

                        return (
                          <span className="px-2.5 py-1 bg-blue-950/90 border border-blue-700 text-blue-200 rounded-lg text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 shadow-sm">
                            <Truck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>
                              FRETE: <strong className="text-white font-black">{freteLabel}</strong>
                              {rotaStr && <span className="text-blue-300 font-bold ml-1.5">[{rotaStr}]</span>}
                            </span>
                          </span>
                        );
                      }

                      return (
                        <span className="px-2.5 py-1 bg-blue-950/80 border border-blue-800 text-blue-300 rounded-lg text-[10px] font-mono font-bold uppercase flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-blue-400" />
                          <span>FRETE VINCULADO</span>
                        </span>
                      );
                    })()}
                  </div>

                  {/* ACOES DE FIXAR, EDITAR E ARQUIVAR */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(note)}
                      title={note.fixada ? 'Desfixar nota' : 'Fixar no topo'}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                        note.fixada 
                          ? 'bg-[#FFD600]/20 border-[#FFD600]/50 text-[#FFD600]' 
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Pin className={`w-3.5 h-3.5 ${note.fixada ? 'fill-[#FFD600]' : ''}`} />
                    </button>

                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(note)}
                          title="Editar anotação"
                          className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-lg transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#FFD600]" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleArchive(note.id)}
                          title="Arquivar anotação"
                          className="p-1.5 bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-800 rounded-lg transition-all cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-900">
                        Apenas autor pode editar
                      </span>
                    )}
                  </div>
                </div>

                {/* CONTEUDO DA ANOTAÇÃO */}
                <p className="text-xs text-zinc-200 font-sans leading-relaxed whitespace-pre-wrap select-text">
                  {note.texto}
                </p>

                {/* RODAPÉ DO CARD — AUTOR E DATA */}
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-zinc-900/60 pt-2">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-zinc-400" />
                    <span>
                      Por: <strong className="text-zinc-300 font-bold">{note.autorNome}</strong> ({note.autorRole})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>{formatDateTime(note.atualizadoEm)}</span>
                  </div>
                </div>

              </div>
            );
          })}

          {/* BOTAO CARREGAR MAIS (PAGINAÇÃO) */}
          {hasMore && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-[#FFD600] animate-spin" />
                    <span>Carregando mais...</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 text-[#FFD600]" />
                    <span>Carregar Mais Anotações (+30)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE ANOTAÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-fade-in relative">
            
            {/* CABEÇALHO DO MODAL */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#FFD600]" />
                <h3 className="text-base font-black uppercase text-white font-mono tracking-wider">
                  {editingNote ? 'EDITAR ANOTAÇÃO' : 'NOVA ANOTAÇÃO INTERNA'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg bg-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-950/80 border border-red-800 text-red-300 p-3 rounded-xl text-xs font-mono">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              
              {/* CAMPO DE TEXTO */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#FFD600]" />
                  <span>Conteúdo da Anotação *</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={formTexto}
                  onChange={e => setFormTexto(e.target.value)}
                  placeholder="Escreva a anotação, orientação ou recado interno..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 font-sans focus:outline-none focus:border-[#FFD600] leading-relaxed"
                />
              </div>

              {/* SELEÇÃO DE TAG */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold uppercase text-zinc-300">
                  Categoria / Tag
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTag('urgente')}
                    className={`py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${
                      formTag === 'urgente'
                        ? 'bg-red-950 text-red-400 border-red-700 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-red-400'
                    }`}
                  >
                    ⚡ Urgente
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTag('lembrete')}
                    className={`py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${
                      formTag === 'lembrete'
                        ? 'bg-yellow-950 text-[#FFD600] border-yellow-700 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-[#FFD600]'
                    }`}
                  >
                    📌 Lembrete
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTag('observacao')}
                    className={`py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${
                      formTag === 'observacao'
                        ? 'bg-cyan-950 text-cyan-400 border-cyan-700 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-cyan-400'
                    }`}
                  >
                    📝 Observação
                  </button>
                </div>
              </div>

              {/* VÍNCULO OPCIONAL DE FRETE */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-400" />
                    <span>Vincular a um Frete Cadastrado (Opcional)</span>
                  </label>
                  {formFretId && (
                    <button
                      type="button"
                      onClick={() => setFormFretId('')}
                      className="text-[10px] text-red-400 hover:text-red-300 hover:underline font-mono uppercase font-bold"
                    >
                      ✕ Desvincular
                    </button>
                  )}
                </div>

                {entregasDisponiveis.length > 0 ? (
                  <select
                    value={formFretId}
                    onChange={e => setFormFretId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#FFD600] transition-colors"
                  >
                    <option value="">-- Nenhum frete vinculado --</option>
                    {entregasDisponiveis.map(e => {
                      const motoristaStr = e.motorista ? `${e.motorista.toUpperCase().trim()}` : '';
                      const clienteStr = e.cliente ? ` [${e.cliente.toUpperCase().trim()}]` : '';
                      const rotaStr = (e.origem || e.destino) ? ` (${e.origem} ➔ ${e.destino})` : '';
                      
                      const label = motoristaStr 
                        ? `${motoristaStr}${clienteStr}${rotaStr}`
                        : `${e.cliente ? e.cliente.toUpperCase().trim() : 'Frete'}${rotaStr}`;

                      return (
                        <option key={e.id} value={e.id}>
                          Frete: {label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formFretId}
                    onChange={e => setFormFretId(e.target.value)}
                    placeholder="Digite o ID do frete ou CTRC (opcional)"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#FFD600]"
                  />
                )}

                {/* Preview do Frete Selecionado */}
                {formFretId && (() => {
                  const sel = entregasMap.get(formFretId.toLowerCase().trim());
                  if (sel) {
                    const mot = sel.motorista ? sel.motorista.trim() : '';
                    const cli = sel.cliente ? sel.cliente.trim() : '';
                    const ori = sel.origem ? sel.origem.trim() : '';
                    const des = sel.destino ? sel.destino.trim() : '';
                    return (
                      <div className="p-2.5 bg-blue-950/70 border border-blue-800/80 rounded-xl text-xs font-mono text-blue-200 flex items-center justify-between gap-2 shadow-sm">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-white truncate uppercase">
                            🚛 {mot || cli || 'Frete Sem Nome'}
                          </p>
                          <p className="text-[10px] text-blue-300 truncate font-semibold">
                            {(ori || des) ? `${ori} ➔ ${des}` : 'Rota não informada'} {cli ? `| Cliente: ${cli}` : ''}
                          </p>
                        </div>
                        <span className="text-[10px] bg-blue-900/90 text-blue-300 px-2 py-0.5 rounded-md shrink-0 font-bold border border-blue-700">
                          SELECIONADO
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* CHECKBOX FIXAR NO TOPO */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formFixada}
                    onChange={e => setFormFixada(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-900 border-zinc-800 text-[#FFD600] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-zinc-300 uppercase flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5 text-[#FFD600]" />
                    <span>Fixar esta anotação no topo da lista</span>
                  </span>
                </label>
              </div>

              {/* BOTOES DE ACAO DO MODAL */}
              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-mono uppercase rounded-xl border border-zinc-800 cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#FFD600] hover:bg-yellow-400 text-black font-mono font-black text-xs uppercase rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,214,0,0.2)] disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{editingNote ? 'Salvar Alterações' : 'Criar Anotação'}</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};

export default AnotacoesPage;
