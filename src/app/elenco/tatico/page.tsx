'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'

/** ================== Supabase ================== */
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

type Escala = Record<string, Jogador>

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

/** ================== Helpers ================== */
const labelCurta = (slot: string) =>
  slot.startsWith('ATA') ? 'ATA' :
  slot.startsWith('MEI') ? 'MEI' :
  slot.startsWith('LAT') ? 'LAT' :
  slot.startsWith('ZAG') ? 'ZAG' : 'GOL'

const ROW_Y = [18, 42, 68, 88]
const rowY = (rowIndex: number) => ROW_Y[Math.min(rowIndex, ROW_Y.length - 1)]

const xSpread = (n: number, pad = 12) =>
  Array.from({ length: n }, (_, i) => {
    const frac = (i + 1) / (n + 1)
    return pad + (100 - 2 * pad) * frac
  })

/** ================== Página ================== */
export default function PainelTaticoPage() {
  const [escala, setEscala] = useState<Escala>({})
  const [jogadorSelecionado, setJogadorSelecionado] = useState<Jogador | null>(null)
  const [jogadoresDisponiveis, setJogadoresDisponiveis] = useState<Jogador[]>([])
  const [formacaoSelecionada, setFormacaoSelecionada] = useState('4-4-2')
  const [busca, setBusca] = useState('')
  const [filtroPos, setFiltroPos] = useState<'TODOS'|'GOL'|'ZAG'|'LAT'|'MEI'|'ATA'>('TODOS')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  /** ====== Buscar elenco ====== */
  useEffect(() => {
    const fetchElenco = async () => {
      try {
        setLoading(true)
        const id_time = localStorage.getItem('id_time')
        if (!id_time) return

        const { data, error } = await supabase
          .from('elenco')
          .select('*')
          .eq('id_time', id_time)

        if (error) throw error
        setJogadoresDisponiveis(data || [])
      } catch (err: any) {
        alert('Erro ao carregar elenco: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchElenco()
  }, [])

  /** ====== Ações ====== */
  const handleEscalar = useCallback((slot: string) => {
    if (!jogadorSelecionado) return alert('Selecione um jogador primeiro.')

    const jaUsado = Object.values(escala).some(j => j.id === jogadorSelecionado.id)
    if (jaUsado) return alert('Jogador já está escalado.')

    setEscala(prev => ({ ...prev, [slot]: jogadorSelecionado }))
    setJogadorSelecionado(null)
  }, [jogadorSelecionado, escala])

  const removerJogador = (slot: string) => {
    if (!confirm(`Remover ${escala[slot]?.nome}?`)) return
    setEscala(prev => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
  }

  const limparTudo = () => {
    if (!Object.keys(escala).length) return
    if (!confirm('Limpar toda a escalação?')) return
    setEscala({})
  }

  const salvarEscalacao = async () => {
    try {
      setSalvando(true)
      const id_time = localStorage.getItem('id_time')
      if (!id_time) throw new Error('ID do time não encontrado')

      const { error } = await supabase
        .from('taticos')
        .upsert({
          id_time,
          formacao: formacaoSelecionada,
          escalacao: escala,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id_time' })

      if (error) throw error
      alert('Escalação salva com sucesso!')
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  /** ====== Banco filtrado ====== */
  const listaFiltrada = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return jogadoresDisponiveis
      .filter(j => {
        const grupo = j.posicao.slice(0,3).toUpperCase()
        return (
          (!q || j.nome.toLowerCase().includes(q)) &&
          (filtroPos === 'TODOS' || grupo === filtroPos) &&
          !Object.values(escala).some(e => e.id === j.id)
        )
      })
      .sort((a,b) => a.nome.localeCompare(b.nome))
  }, [jogadoresDisponiveis, busca, filtroPos, escala])

  /** ================== UI ================== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white p-4">
      <h1 className="text-3xl font-bold mb-6 text-emerald-300">🎯 Painel Tático</h1>

      {/* Campo + Banco */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Campo */}
        <div className="lg:col-span-2 relative h-[600px] rounded-3xl bg-gradient-to-b from-green-800 to-green-900 border border-white/10 overflow-hidden">
          {formacoes[formacaoSelecionada].map((linha, rIdx) => {
            const y = rowY(rIdx)
            const xs = xSpread(linha.length)
            return linha.map((slot, i) => {
              const jogador = escala[slot]
              return (
                <button
                  key={slot}
                  onClick={() => jogador ? removerJogador(slot) : handleEscalar(slot)}
                  style={{ top: `${y}%`, left: `${xs[i]}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border flex items-center justify-center
                    ${jogador ? 'bg-emerald-500/30 border-emerald-400' : 'bg-black/30 border-white/30 hover:bg-white/10'}`}
                >
                  <PlayerAvatar nome={jogador?.nome} imagem_url={jogador?.imagem_url} />
                  <span className="absolute -bottom-2 text-xs bg-black/60 px-2 rounded-full">
                    {jogador ? jogador.posicao : labelCurta(slot)}
                  </span>
                </button>
              )
            })
          })}
        </div>

        {/* Banco */}
        <aside className="rounded-3xl border border-white/10 bg-black/40 p-4">
          <h2 className="text-lg font-semibold mb-3">🎒 Banco</h2>

          <input
            className="w-full mb-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10"
            placeholder="Buscar jogador..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />

          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {loading && <p className="text-white/60 text-sm">Carregando elenco...</p>}

            {!loading && listaFiltrada.map(j => (
              <button
                key={j.id}
                onClick={() => setJogadorSelecionado(j)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl border
                  ${jogadorSelecionado?.id === j.id
                    ? 'border-emerald-400 bg-emerald-500/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <PlayerAvatar nome={j.nome} imagem_url={j.imagem_url} size={36} />
                <div>
                  <div className="font-medium">{j.nome}</div>
                  <div className="text-xs text-white/60">{j.posicao}</div>
                </div>
              </button>
            ))}

            {!loading && !listaFiltrada.length && (
              <p className="text-center text-white/60 text-sm py-6">
                Nenhum jogador disponível
              </p>
            )}
          </div>

          <button
            onClick={salvarEscalacao}
            disabled={salvando}
            className="mt-4 w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60"
          >
            💾 {salvando ? 'Salvando...' : 'Salvar Escalação'}
          </button>

          <button
            onClick={limparTudo}
            className="mt-2 w-full py-2 rounded-xl bg-white/10 hover:bg-white/20"
          >
            🧹 Limpar Campo
          </button>
        </aside>
      </div>
    </div>
  )
}

/** ================== Avatar ================== */
function PlayerAvatar({
  nome,
  imagem_url,
  size = 56,
}: {
  nome?: string
  imagem_url?: string | null
  size?: number
}) {
  const iniciais = nome
    ?.split(' ')
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase()

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
      className="rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size }}
    >
      {iniciais || '?'}
    </div>
  )
}
