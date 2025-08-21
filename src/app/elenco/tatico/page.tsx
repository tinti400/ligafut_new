'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ================== Tipos ================== */
type Jogador = {
  id: string
  id_time: string
  nome: string
  posicao: string
  imagem_url?: string | null
}

/** ================== Formações ================== */
const formacoes: Record<string, string[][]> = {
  '4-4-2': [
    ['ATA1', 'ATA2'],
    ['MEI1', 'MEI2', 'MEI3', 'MEI4'],
    ['LAT1', 'ZAG1', 'ZAG2', 'LAT2'],
    ['GOL'],
  ],
  '4-3-3': [
    ['ATA1', 'ATA2', 'ATA3'],
    ['MEI1', 'MEI2', 'MEI3'],
    ['LAT1', 'ZAG1', 'ZAG2', 'LAT2'],
    ['GOL'],
  ],
  '3-5-2': [
    ['ATA1', 'ATA2'],
    ['MEI1', 'MEI2', 'MEI3', 'MEI4', 'MEI5'],
    ['ZAG1', 'ZAG2', 'ZAG3'],
    ['GOL'],
  ],
}

/** Badge curto para cada grupo de posição */
const labelCurta = (slot: string) =>
  slot.startsWith('ATA') ? 'ATA' :
  slot.startsWith('MEI') ? 'MEI' :
  slot.startsWith('LAT') ? 'LAT' :
  slot.startsWith('ZAG') ? 'ZAG' : 'GOL'

/** ===== helpers de layout (coordenadas) =====
 *  y por linha (topo→base): ataque, meio, defesa, goleiro
 *  usei % que funcionam bem em desktop e mobile
 */
const ROW_Y = [18, 42, 68, 88] // ataque, meio, defesa, goleiro (em %)
const rowY = (rowIndex: number) => ROW_Y[Math.min(rowIndex, ROW_Y.length - 1)]

/** xSpread: distribui N itens na largura com padding lateral */
const xSpread = (n: number, pad = 12) =>
  Array.from({ length: n }, (_, i) => {
    const frac = (i + 1) / (n + 1) // de 0..1
    return pad + (100 - 2 * pad) * frac
  })

/** ================== Página ================== */
export default function PainelTaticoPage() {
  const [escala, setEscala] = useState<Record<string, Jogador>>({})
  const [jogadorSelecionado, setJogadorSelecionado] = useState<Jogador | null>(null)
  const [jogadoresDisponiveis, setJogadoresDisponiveis] = useState<Jogador[]>([])
  const [salvando, setSalvando] = useState(false)
  const [formacaoSelecionada, setFormacaoSelecionada] = useState<string>('4-4-2')
  const [busca, setBusca] = useState('')
  const [filtroPos, setFiltroPos] = useState<'TODOS'|'GOL'|'ZAG'|'LAT'|'MEI'|'ATA'>('TODOS')

  /** ====== carregar elenco ====== */
  useEffect(() => {
    const fetchElenco = async () => {
      try {
        const id_time = localStorage.getItem('id_time') || ''
        if (!id_time) return
        const { data, error } = await supabase
          .from('elenco')
          .select('*')
          .eq('id_time', id_time)

        if (error) throw error
        setJogadoresDisponiveis((data as any) || [])
      } catch (e: any) {
        alert('❌ Erro ao buscar elenco: ' + e.message)
      }
    }
    fetchElenco()
  }, [])

  /** ====== ações ====== */
  const handleEscalar = (posicao: string) => {
    if (!jogadorSelecionado) {
      alert('⚠️ Selecione um jogador primeiro!')
      return
    }
    const jaEscalado = Object.values(escala).some(j => j.id === jogadorSelecionado.id)
    if (jaEscalado) {
      alert('🚫 Esse jogador já está escalado em outra posição!')
      return
    }
    setEscala(prev => ({ ...prev, [posicao]: jogadorSelecionado }))
    setJogadorSelecionado(null)
  }

  const removerJogador = (posicao: string) => {
    const confirmar = confirm(`❌ Remover ${escala[posicao]?.nome} da posição ${posicao}?`)
    if (!confirmar) return
    const next = { ...escala }
    delete next[posicao]
    setEscala(next)
  }

  const limparTudo = () => {
    if (Object.keys(escala).length === 0) return
    const ok = confirm('🧹 Limpar toda a escalação do campo?')
    if (!ok) return
    setEscala({})
  }

  const salvarEscalacao = async () => {
    try {
      setSalvando(true)
      const id_time = localStorage.getItem('id_time') || ''
      if (!id_time) throw new Error('ID do time não encontrado!')

      const { error } = await supabase
        .from('taticos')
        .upsert(
          {
            id_time,
            formacao: formacaoSelecionada,
            escalação: escala,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'id_time' }
        )

      if (error) throw error
      alert('✅ Escalação salva com sucesso!')
    } catch (err: any) {
      alert('❌ Erro ao salvar escalação: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  /** ====== derivado: banco filtrado ====== */
  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return jogadoresDisponiveis
      .filter(j => {
        const passaBusca = !q || j.nome.toLowerCase().includes(q) || j.posicao.toLowerCase().includes(q)
        const grupo = j.posicao.toUpperCase().slice(0,3) as 'GOL'|'ZAG'|'LAT'|'MEI'|'ATA'
        const passaPos = filtroPos === 'TODOS' || grupo === filtroPos
        const jaEscalado = Object.values(escala).some(e => e.id === j.id)
        return passaBusca && passaPos && !jaEscalado
      })
      .sort((a,b) => a.nome.localeCompare(b.nome))
  }, [jogadoresDisponiveis, busca, filtroPos, escala])

  /** ====== UI ====== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
            🎯 Painel Tático
          </h1>

          {/* ações topo */}
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              {Object.keys(formacoes).map(f => (
                <button
                  key={f}
                  className={`px-3 py-1.5 text-sm rounded-lg transition
                    ${f === formacaoSelecionada
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-white/80 hover:bg-white/10'}`}
                  onClick={() => { setFormacaoSelecionada(f); setEscala({}) }}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={limparTudo}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
              title="Limpar escalação do campo"
            >
              🧹 Limpar
            </button>

            <button
              onClick={salvarEscalacao}
              disabled={salvando}
              className={`px-4 py-1.5 rounded-xl ${salvando ? 'bg-emerald-600/60 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500'} text-white shadow`}
            >
              💾 {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Campo */}
          <div className="lg:col-span-2">
            <div className="relative rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              {/* Gramado + linhas (camadas) */}
              <div
                className="relative p-4 sm:p-6 h-[560px] md:h-[620px]"
                style={{
                  background: 'linear-gradient(180deg,#0b5d34 0%, #0a4d2c 100%)',
                }}
              >
                {/* faixas do gramado */}
                <div className="absolute inset-0 opacity-25 pointer-events-none"
                  style={{
                    background:
                      'repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0px, rgba(255,255,255,.12) 2px, transparent 2px, transparent 80px)'
                  }}
                />
                {/* linhas do campo */}
                <div className="absolute inset-3 sm:inset-4 rounded-2xl border-2 border-white/40 pointer-events-none" />
                {/* meio-campo */}
                <div className="absolute left-1/2 top-3 sm:top-4 bottom-3 sm:bottom-4 w-[2px] bg-white/40 pointer-events-none -translate-x-1/2" />
                {/* círculo central */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 pointer-events-none"
                  style={{ width: 140, height: 140 }} />
                {/* áreas */}
                <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 border-2 border-white/40 pointer-events-none rounded"
                  style={{ width: 110, height: 220 }} />
                <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 border-2 border-white/40 pointer-events-none rounded"
                  style={{ width: 60, height: 120 }} />
                <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 border-2 border-white/40 pointer-events-none rounded"
                  style={{ width: 110, height: 220 }} />
                <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 border-2 border-white/40 pointer-events-none rounded"
                  style={{ width: 60, height: 120 }} />

                {/* ======= POSICIONAMENTO ABSOLUTO ======= */}
                <div className="absolute inset-0">
                  {formacoes[formacaoSelecionada].map((linha, rIdx) => {
                    const y = rowY(rIdx)
                    const xs = xSpread(linha.length, 12) // padding lateral 12%
                    return linha.map((pos, i) => {
                      const jogador = escala[pos]
                      const filled = !!jogador
                      const left = xs[i]
                      return (
                        <button
                          key={pos}
                          onClick={() => (filled ? removerJogador(pos) : handleEscalar(pos))}
                          className={[
                            'group absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-[92px] sm:h-[92px] rounded-full border transition shadow-lg flex items-center justify-center',
                            filled
                              ? 'border-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/25'
                              : 'border-white/30 bg-black/20 hover:bg-white/10'
                          ].join(' ')}
                          style={{ top: `${y}%`, left: `${left}%` }}
                          title={filled ? `Remover ${jogador!.nome}` : `Escalar em ${pos}`}
                        >
                          <PlayerAvatar
                            nome={jogador?.nome}
                            imagem_url={jogador?.imagem_url}
                            size={72}
                          />
                          <span className={[
                            'absolute -bottom-2 px-2 py-[2px] rounded-full text-[11px] border backdrop-blur',
                            filled
                              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                              : 'bg-white/10 text-white/80 border-white/20'
                          ].join(' ')}>
                            {filled ? jogador!.posicao : labelCurta(pos)}
                          </span>
                        </button>
                      )
                    })
                  })}
                </div>
              </div>
            </div>

            {/* dica */}
            <p className="mt-3 text-sm text-white/60">
              Toque em um jogador do painel da direita e depois em um círculo no campo para escalá-lo.
              Toque novamente no círculo para remover.
            </p>
          </div>

          {/* Banco / Painel lateral */}
          <aside className="lg:col-span-1">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 shadow-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">🎒 Jogadores Disponíveis</h2>
                <span className="text-xs text-white/60">{listaFiltrada.length} jogadores</span>
              </div>

              {/* filtros */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                <input
                  value={busca}
                  onChange={(e)=>setBusca(e.target.value)}
                  placeholder="Pesquisar nome/posição..."
                  className="col-span-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <div className="col-span-3 flex flex-wrap gap-2">
                  {(['TODOS','GOL','ZAG','LAT','MEI','ATA'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={()=>setFiltroPos(opt)}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition
                        ${filtroPos===opt
                          ? 'bg-sky-600 border-sky-500 text-white'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* selecionado preview */}
              {jogadorSelecionado && (
                <div className="mb-3 flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                  <PlayerAvatar nome={jogadorSelecionado.nome} imagem_url={jogadorSelecionado.imagem_url} size={44} />
                  <div className="leading-tight">
                    <div className="font-semibold">{jogadorSelecionado.nome}</div>
                    <div className="text-xs text-white/70">{jogadorSelecionado.posicao}</div>
                  </div>
                  <button
                    className="ml-auto text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                    onClick={()=>setJogadorSelecionado(null)}
                  >
                    Trocar
                  </button>
                </div>
              )}

              {/* lista */}
              <div className="max-h-[520px] overflow-y-auto pr-1 space-y-2">
                {listaFiltrada.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setJogadorSelecionado(j)}
                    className={`w-full text-left flex items-center gap-3 rounded-2xl border px-3 py-2
                      ${jogadorSelecionado?.id === j.id
                        ? 'border-emerald-400 bg-emerald-500/15'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                  >
                    <PlayerAvatar nome={j.nome} imagem_url={j.imagem_url} size={40} />
                    <div className="flex-1">
                      <div className="font-medium leading-5">{j.nome}</div>
                      <div className="text-[11px] text-white/60">{j.posicao}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">
                      Selecionar
                    </span>
                  </button>
                ))}
                {listaFiltrada.length === 0 && (
                  <div className="text-center text-sm text-white/60 py-6">
                    Nenhum jogador encontrado com os filtros atuais.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/** ================== Componentes ================== */
function PlayerAvatar({ nome, imagem_url, size=64 }:{
  nome?: string
  imagem_url?: string | null
  size?: number
}) {
  const iniciais = (nome || '?')
    .split(' ')
    .slice(0,2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

  if (imagem_url) {
    return (
      <Image
        src={imagem_url}
        alt={nome || 'Jogador'}
        width={size}
        height={size}
        className="rounded-full object-cover"
      />
    )
  }

  return (
    <div
      className="rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-white/90 font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(12, size/3) }}
    >
      {iniciais || '??'}
    </div>
  )
}
