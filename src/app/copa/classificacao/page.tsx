'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'
import toast from 'react-hot-toast'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
interface LinhaClassificacao {
  id_time: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo: number
  jogos: number
}

interface TimeInfo {
  id: string
  nome: string
  logo_url?: string | null
  logo?: string | null
}

type JogoLiga = {
  id?: number
  id_time1?: string | null
  id_time2?: string | null
  time1?: string | null // pode ser nome OU id dependendo do seu seed
  time2?: string | null
  gols_time1: number | null
  gols_time2: number | null
}

/** ===== Constantes ===== */
const TOTAL_TIMES = 30
// Times a ocultar (removidos da tabela e das partidas)
const TIMES_EXCLUIDOS = ['palmeiras', 'sociedade esportiva palmeiras']

/** ===== Utils ===== */
function norm(s?: string | null) {
  return (s || '').toLowerCase().trim()
}

function ehExcluido(timesMap: Record<string, TimeInfo>, idOuNome?: string | null) {
  if (!idOuNome) return false
  // bate por id
  if (timesMap[idOuNome]) {
    const n = norm(timesMap[idOuNome]?.nome)
    return TIMES_EXCLUIDOS.includes(n)
  }
  // bate por nome
  return TIMES_EXCLUIDOS.includes(norm(idOuNome))
}

export default function ClassificacaoCopaPage() {
  const { isAdmin } = useAdmin()

  const [classificacao, setClassificacao] = useState<LinhaClassificacao[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeInfo>>({})
  const [loading, setLoading] = useState(true)
  const [sorteando, setSorteando] = useState(false)
  const [existePlayoff, setExistePlayoff] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregarTudo()
    // playoff já existe?
    supabase.from('copa_playoff').select('id').limit(1).then(({ data }) => {
      setExistePlayoff(!!data && data.length > 0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregarTudo() {
    setLoading(true)
    try {
      // 1) Times
      const { data: times, error: errTimes } = await supabase
        .from('times')
        .select('id, nome, logo_url, logo')

      if (errTimes) throw errTimes
      const mapa: Record<string, TimeInfo> = {}
      for (const t of (times || [])) {
        // pula excluídos
        if (TIMES_EXCLUIDOS.includes(norm(t.nome))) continue
        mapa[t.id] = { id: t.id, nome: t.nome, logo_url: t.logo_url, logo: t.logo }
      }
      setTimesMap(mapa)

      // 2) Jogos da fase liga (tenta copa_fase_liga, senão fase_liga)
      const jogos = await carregarJogosFaseLiga()

      // 3) Monta tabela base
      const base: Record<string, LinhaClassificacao> = {}
      Object.values(mapa).forEach((t) => {
        base[t.id] = {
          id_time: t.id,
          pontos: 0,
          vitorias: 0,
          empates: 0,
          derrotas: 0,
          gols_pro: 0,
          gols_contra: 0,
          saldo: 0,
          jogos: 0
        }
      })

      // 4) Aplica resultados
      for (const j of jogos) {
        if (j.gols_time1 == null || j.gols_time2 == null) continue

        const id1 = resolverIdDoTime(j, 1, mapa)
        const id2 = resolverIdDoTime(j, 2, mapa)

        // ignora partidas com times desconhecidos ou excluídos
        if (!id1 || !id2) continue
        if (ehExcluido(mapa, id1) || ehExcluido(mapa, id2)) continue
        if (!base[id1] || !base[id2]) continue

        const g1 = Number(j.gols_time1)
        const g2 = Number(j.gols_time2)

        base[id1].gols_pro += g1
        base[id1].gols_contra += g2
        base[id1].jogos += 1

        base[id2].gols_pro += g2
        base[id2].gols_contra += g1
        base[id2].jogos += 1

        if (g1 > g2) {
          base[id1].vitorias += 1
          base[id1].pontos += 3
          base[id2].derrotas += 1
        } else if (g2 > g1) {
          base[id2].vitorias += 1
          base[id2].pontos += 3
          base[id1].derrotas += 1
        } else {
          base[id1].empates += 1
          base[id2].empates += 1
          base[id1].pontos += 1
          base[id2].pontos += 1
        }

        base[id1].saldo = base[id1].gols_pro - base[id1].gols_contra
        base[id2].saldo = base[id2].gols_pro - base[id2].gols_contra
      }

      setClassificacao(Object.values(base))
      toast.success('Classificação atualizada!')
    } catch (e) {
      console.error(e)
      toast.error('Falha ao carregar a classificação da fase liga.')
    } finally {
      setLoading(false)
    }
  }

  // Tenta pegar da copa_fase_liga; se vier vazio, tenta fase_liga
  async function carregarJogosFaseLiga(): Promise<JogoLiga[]> {
    const { data: jogosCopa, error: errCopa } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .not('gols_time1', 'is', null)
      .not('gols_time2', 'is', null)

    if (!errCopa && jogosCopa && jogosCopa.length > 0) return jogosCopa as JogoLiga[]

    const { data: jogosAlt, error: errAlt } = await supabase
      .from('fase_liga')
      .select('*')
      .not('gols_time1', 'is', null)
      .not('gols_time2', 'is', null)

    if (errAlt) return []
    return (jogosAlt || []) as JogoLiga[]
  }

  // Resolve id do time a partir do registro do jogo (aceita id_timeX, timeX com id, ou timeX nome)
  function resolverIdDoTime(j: JogoLiga, lado: 1 | 2, mapa: Record<string, TimeInfo>): string | null {
    const idDireto = lado === 1 ? j.id_time1 : j.id_time2
    if (idDireto && mapa[idDireto]) return idDireto

    const raw = lado === 1 ? j.time1 : j.time2
    if (!raw) return null

    // pode ser um id salvo no campo timeX
    if (mapa[raw]) return raw

    // caso seja nome, procura por nome
    const nome = norm(raw)
    for (const [id, info] of Object.entries(mapa)) {
      if (norm(info.nome) === nome) return id
    }
    return null
  }

  /** ===== Ordenação + busca ===== */
  const classificacaoOrdenada = useMemo(() => {
    const ordenada = [...classificacao].sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
      return b.vitorias - a.vitorias
    })

    const filtrada = busca
      ? ordenada.filter((l) => norm(timesMap[l.id_time]?.nome).includes(norm(busca)))
      : ordenada

    return filtrada.slice(0, TOTAL_TIMES)
  }, [classificacao, busca, timesMap])

  /** ===== Playoff (9º–24º) ===== */
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  async function sortearPlayoffAleatorio() {
    if (!isAdmin) return toast.error('Apenas administradores podem sortear o playoff.')
    if (existePlayoff) return toast('Playoff já existe. Use "Limpar e re-sortear".')

    try {
      setSorteando(true)

      if (classificacaoOrdenada.length < 24) {
        toast.error('É necessário ter ao menos 24 times na classificação.')
        return
      }

      const classificados = classificacaoOrdenada.slice(8, 24) // 9º a 24º (0-based)
      const embaralhados = shuffle(classificados)

      const jogos: any[] = []
      let ordem = 1
      for (let i = 0; i < embaralhados.length; i += 2) {
        const a = embaralhados[i]
        const b = embaralhados[i + 1]
        if (!a || !b) continue
        const nomeA = timesMap[a.id_time]?.nome ?? 'Indefinido'
        const nomeB = timesMap[b.id_time]?.nome ?? 'Indefinido'

        // ida
        jogos.push({
          rodada: 1, ordem: ordem++,
          id_time1: a.id_time, id_time2: b.id_time,
          time1: nomeA, time2: nomeB,
          gols_time1: null, gols_time2: null
        })
        // volta
        jogos.push({
          rodada: 2, ordem: ordem++,
          id_time1: b.id_time, id_time2: a.id_time,
          time1: nomeB, time2: nomeA,
          gols_time1: null, gols_time2: null
        })
      }

      // evita duplicidade
      const { data: exist } = await supabase.from('copa_playoff').select('id').limit(1)
      if (exist && exist.length > 0) {
        setExistePlayoff(true)
        return toast('Playoff já existe.')
      }

      const { error: insertErr } = await supabase.from('copa_playoff').insert(jogos)
      if (insertErr) {
        console.error(insertErr)
        return toast.error('Erro ao salvar confrontos do playoff.')
      }
      setExistePlayoff(true)
      toast.success('Playoff sorteado com sucesso!')
    } finally {
      setSorteando(false)
    }
  }

  async function limparEReSortear() {
    if (!isAdmin) return toast.error('Apenas administradores podem executar essa ação.')
    if (!confirm('Apagar confrontos do playoff e sortear novamente?')) return

    const { error: delErr } = await supabase.from('copa_playoff').delete().neq('id', 0)
    if (delErr) return toast.error('Erro ao limpar confrontos existentes.')
    setExistePlayoff(false)
    await sortearPlayoffAleatorio()
  }

  /** ===== UI ===== */
  return (
    <div className="bg-zinc-950 text-white min-h-screen">
      {/* Topbar */}
      <div className="sticky top-0 z-20 backdrop-blur bg-zinc-950/80 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                🏆 Classificação – Fase Liga
              </span>
            </h1>
            {existePlayoff ? (
              <span className="text-xs px-2 py-1 rounded-full border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                Playoff sorteado
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full border border-yellow-500/40 text-yellow-300 bg-yellow-500/10">
                Playoff pendente
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar time..."
              className="w-full sm:w-56 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 outline-none focus:ring-2 ring-emerald-500 text-sm"
            />
            <button
              onClick={carregarTudo}
              className="px-3 py-2 rounded bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-sm"
              title="Recalcular a partir dos resultados da fase liga"
            >
              Atualizar
            </button>

            {isAdmin && (
              <>
                <button
                  disabled={sorteando || existePlayoff}
                  onClick={sortearPlayoffAleatorio}
                  className={classNames(
                    'px-3 py-2 rounded text-sm transition',
                    existePlayoff
                      ? 'bg-zinc-700 cursor-not-allowed'
                      : 'bg-blue-600 hover:brightness-110',
                    sorteando && 'opacity-80'
                  )}
                  title={existePlayoff ? 'Já existe playoff. Use "Limpar e re-sortear".' : 'Sortear playoff (9º–24º) 100% aleatório'}
                >
                  {sorteando ? 'Sorteando...' : 'Sortear Playoff'}
                </button>

                <button
                  disabled={sorteando}
                  onClick={limparEReSortear}
                  className="px-3 py-2 rounded bg-red-600 text-white hover:brightness-110 text-sm"
                  title="Apaga confrontos existentes e sorteia novamente"
                >
                  Limpar e re-sortear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="overflow-x-auto rounded-xl border border-zinc-800 shadow-lg shadow-black/20">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-900 sticky top-[56px] z-10 text-zinc-300">
              <tr className="[&>th]:px-3 [&>th]:py-2 border-b border-zinc-800">
                <th>#</th>
                <th>Time</th>
                <th className="text-center">J</th>
                <th className="text-center">Pts</th>
                <th className="text-center">V</th>
                <th className="text-center">E</th>
                <th className="text-center">D</th>
                <th className="text-center">GP</th>
                <th className="text-center">GC</th>
                <th className="text-center">SG</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="animate-pulse">
                    <td className="px-3 py-3 text-zinc-500">--</td>
                    <td className="px-3 py-3">
                      <div className="h-6 w-48 bg-zinc-800 rounded" />
                    </td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                    <td className="px-3 py-3 text-center text-zinc-500">--</td>
                  </tr>
                ))
              ) : (
                classificacaoOrdenada.map((linha, index) => {
                  const posicao = index + 1
                  const t = timesMap[linha.id_time]
                  const escudo = t?.logo_url || t?.logo || ''
                  const nome = t?.nome || 'Desconhecido'

                  const bgClass = classNames(
                    'transition-colors',
                    posicao <= 8
                      ? 'bg-emerald-950/40'
                      : posicao <= 24
                      ? 'bg-yellow-950/20'
                      : 'bg-red-950/20',
                    index % 2 === 0 ? 'bg-opacity-70' : 'bg-opacity-40',
                  )

                  return (
                    <tr key={linha.id_time} className={`${bgClass} hover:bg-zinc-900/60`}>
                      <td className="px-3 py-2 text-zinc-300 font-bold">{posicao}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          {escudo ? (
                            <img
                              src={escudo}
                              alt={nome}
                              width={28}
                              height={28}
                              className="rounded-full border border-zinc-700"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700" />
                          )}
                          <span className="font-medium">{nome}</span>
                          {posicao <= 8 && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                              Oitavas
                            </span>
                          )}
                          {posicao > 8 && posicao <= 24 && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide bg-yellow-500/15 text-yellow-300 border border-yellow-400/30 px-2 py-0.5 rounded-full">
                              Playoff
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-zinc-300">{linha.jogos}</td>
                      <td className="px-3 py-2 text-center font-bold text-white">{linha.pontos}</td>
                      <td className="px-3 py-2 text-center">{linha.vitorias}</td>
                      <td className="px-3 py-2 text-center">{linha.empates}</td>
                      <td className="px-3 py-2 text-center">{linha.derrotas}</td>
                      <td className="px-3 py-2 text-center">{linha.gols_pro}</td>
                      <td className="px-3 py-2 text-center">{linha.gols_contra}</td>
                      <td className="px-3 py-2 text-center">{linha.saldo}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Legendas */}
        <div className="mt-4 text-xs text-zinc-400 grid gap-1 sm:grid-cols-3">
          <p><span className="text-emerald-400 font-semibold">Verde</span>: classificados direto para as <b>oitavas</b> (1º–8º)</p>
          <p><span className="text-yellow-400 font-semibold">Amarelo</span>: disputam o <b>playoff</b> (9º–24º)</p>
          <p><span className="text-red-400 font-semibold">Vermelho</span>: <b>fora</b> (25º+)</p>
        </div>

        {/* Nota sobre exclusão */}
        <p className="mt-3 text-[11px] text-zinc-500">
          * Partidas envolvendo times excluídos (ex.: Palmeiras) não contam na classificação para manter justiça entre os demais clubes.
        </p>
      </div>
    </div>
  )
}
