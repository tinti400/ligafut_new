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
  logo_url?: string
  logo?: string
}

export default function ClassificacaoCopaPage() {
  const { isAdmin } = useAdmin()
  const [classificacao, setClassificacao] = useState<LinhaClassificacao[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeInfo>>({})
  const [loading, setLoading] = useState(true)
  const [sorteando, setSorteando] = useState(false)
  const [existePlayoff, setExistePlayoff] = useState(false)
  const TOTAL_TIMES = 30

  useEffect(() => {
    calcularClassificacao()
    checarSeJaExistePlayoff()
  }, [])

  async function checarSeJaExistePlayoff() {
    const { data, error } = await supabase.from('copa_playoff').select('id').limit(1)
    if (!error) setExistePlayoff(!!data && data.length > 0)
  }

  async function calcularClassificacao() {
    setLoading(true)

    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, nome, logo_url, logo')

    if (errTimes) {
      toast.error('Erro ao carregar times')
      setLoading(false)
      return
    }
    if (!times) {
      setLoading(false)
      return
    }

    const mapaTimes: Record<string, TimeInfo> = {}
    const tabela: Record<string, LinhaClassificacao> = {}

    for (const time of times) {
      mapaTimes[time.id] = {
        id: time.id,
        nome: time.nome,
        logo_url: time.logo_url,
        logo: time.logo
      }

      tabela[time.id] = {
        id_time: time.id,
        pontos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        gols_pro: 0,
        gols_contra: 0,
        saldo: 0,
        jogos: 0
      }
    }

    setTimesMap(mapaTimes)

    const { data: jogos, error: errJogos } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .not('gols_time1', 'is', null)
      .not('gols_time2', 'is', null)

    if (errJogos) {
      toast.error('Erro ao carregar jogos')
      setLoading(false)
      return
    }
    if (!jogos) {
      setClassificacao(Object.values(tabela))
      setLoading(false)
      return
    }

    for (const jogo of jogos) {
      const { time1, time2, gols_time1, gols_time2 } = jogo

      if (!tabela[time1] || !tabela[time2]) continue

      tabela[time1].gols_pro += gols_time1
      tabela[time1].gols_contra += gols_time2
      tabela[time1].jogos += 1

      tabela[time2].gols_pro += gols_time2
      tabela[time2].gols_contra += gols_time1
      tabela[time2].jogos += 1

      if (gols_time1 > gols_time2) {
        tabela[time1].vitorias += 1
        tabela[time1].pontos += 3
        tabela[time2].derrotas += 1
      } else if (gols_time1 < gols_time2) {
        tabela[time2].vitorias += 1
        tabela[time2].pontos += 3
        tabela[time1].derrotas += 1
      } else {
        tabela[time1].empates += 1
        tabela[time2].empates += 1
        tabela[time1].pontos += 1
        tabela[time2].pontos += 1
      }

      tabela[time1].saldo = tabela[time1].gols_pro - tabela[time1].gols_contra
      tabela[time2].saldo = tabela[time2].gols_pro - tabela[time2].gols_contra
    }

    const classificacaoFinal = Object.values(tabela)
    setClassificacao(classificacaoFinal)
    setLoading(false)
    toast.success('Classificação atualizada!')
  }

  const classificacaoOrdenada = useMemo(() => {
    const ordenada = [...classificacao].sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      if (b.saldo !== a.saldo) return b.saldo - a.saldo
      if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
      return b.vitorias - a.vitorias
    })
    return ordenada.slice(0, TOTAL_TIMES)
  }, [classificacao])

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  async function sortearPlayoffAleatorio() {
    if (!isAdmin) {
      toast.error('Apenas administradores podem sortear o playoff.')
      return
    }
    if (existePlayoff) {
      toast('Playoff já existe. Use "Limpar e re-sortear" para refazer.')
      return
    }

    try {
      setSorteando(true)

      if (classificacaoOrdenada.length < 24) {
        toast.error('É necessário ter ao menos 24 times na classificação.')
        setSorteando(false)
        return
      }

      // 9º–24º entram no sorteio
      const classificadosPlayoff = classificacaoOrdenada.slice(8, 24)
      const embaralhados = shuffle(classificadosPlayoff)

      const jogosInsert: any[] = []
      let ordem = 1

      for (let i = 0; i < embaralhados.length; i += 2) {
        const a = embaralhados[i]
        const b = embaralhados[i + 1]
        if (!a || !b) continue

        const nomeA = timesMap[a.id_time]?.nome ?? 'Indefinido'
        const nomeB = timesMap[b.id_time]?.nome ?? 'Indefinido'

        // Ida
        jogosInsert.push({
          rodada: 1,
          ordem: ordem++,
          id_time1: a.id_time,
          id_time2: b.id_time,
          time1: nomeA,
          time2: nomeB,
          gols_time1: null,
          gols_time2: null
        })

        // Volta
        jogosInsert.push({
          rodada: 2,
          ordem: ordem++,
          id_time1: b.id_time,
          id_time2: a.id_time,
          time1: nomeB,
          time2: nomeA,
          gols_time1: null,
          gols_time2: null
        })
      }

      const { data: exist, error: existErr } = await supabase
        .from('copa_playoff')
        .select('id')
        .limit(1)

      if (existErr) {
        toast.error('Erro ao validar estado do playoff.')
        setSorteando(false)
        return
      }
      if (exist && exist.length > 0) {
        setExistePlayoff(true)
        toast('Playoff já existe.')
        setSorteando(false)
        return
      }

      const { error: insertErr } = await supabase.from('copa_playoff').insert(jogosInsert)
      if (insertErr) {
        console.error(insertErr)
        toast.error('Erro ao salvar confrontos do playoff.')
      } else {
        toast.success('Playoff sorteado com sucesso!')
        setExistePlayoff(true)
      }
    } finally {
      setSorteando(false)
    }
  }

  async function limparEReSortear() {
    if (!isAdmin) {
      toast.error('Apenas administradores podem executar essa ação.')
      return
    }
    const ok = confirm('Apagar confrontos do playoff e sortear novamente?')
    if (!ok) return

    const { error: delErr } = await supabase.from('copa_playoff').delete().neq('id', 0)
    if (delErr) {
      toast.error('Erro ao limpar confrontos existentes.')
      return
    }
    setExistePlayoff(false)
    await sortearPlayoffAleatorio()
  }

  return (
    <div className="bg-zinc-900 text-white min-h-screen p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-3xl font-bold text-emerald-400">🏆 Classificação – Fase Liga</h1>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              disabled={sorteando || existePlayoff}
              onClick={sortearPlayoffAleatorio}
              className={classNames(
                'px-4 py-2 rounded text-white transition',
                existePlayoff
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:brightness-110',
                sorteando && 'opacity-80'
              )}
              title={existePlayoff ? 'Já existe playoff. Use "Limpar e re-sortear".' : 'Sortear playoff (9º–24º) 100% aleatório'}
            >
              {sorteando ? 'Sorteando...' : 'Sortear Playoff (9º–24º)'}
            </button>

            <button
              disabled={sorteando}
              onClick={limparEReSortear}
              className="px-4 py-2 rounded bg-red-600 text-white hover:brightness-110 transition"
              title="Apaga confrontos existentes e sorteia novamente"
            >
              Limpar e re-sortear
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-gray-300">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="w-full text-sm text-left border border-zinc-700">
            <thead className="bg-zinc-800 text-gray-300">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2 text-center">J</th>
                <th className="px-3 py-2 text-center">Pts</th>
                <th className="px-3 py-2 text-center">V</th>
                <th className="px-3 py-2 text-center">E</th>
                <th className="px-3 py-2 text-center">D</th>
                <th className="px-3 py-2 text-center">GP</th>
                <th className="px-3 py-2 text-center">GC</th>
                <th className="px-3 py-2 text-center">SG</th>
              </tr>
            </thead>
            <tbody>
              {classificacaoOrdenada.map((linha, index) => {
                const posicao = index + 1
                const timeData = timesMap[linha.id_time]
                const escudo = timeData?.logo_url || timeData?.logo
                const nome = timeData?.nome || 'Desconhecido'

                const bgClass = classNames({
                  'bg-emerald-800/60 border-l-4 border-emerald-400': posicao >= 1 && posicao <= 8,
                  'bg-yellow-900/40': posicao >= 9 && posicao <= 24,
                  'bg-red-900/40': posicao >= 25
                })

                return (
                  <tr key={linha.id_time} className={`${bgClass} border-b border-zinc-700`}>
                    <td className="px-3 py-2 text-gray-300 font-bold">{posicao}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {escudo && (
                          <img src={escudo} alt={nome} width={28} height={28} className="rounded-full border" />
                        )}
                        <span>{nome}</span>
                        {posicao <= 8 && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full">
                            OITAVAS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">{linha.jogos}</td>
                    <td className="px-3 py-2 text-center font-bold text-white">{linha.pontos}</td>
                    <td className="px-3 py-2 text-center">{linha.vitorias}</td>
                    <td className="px-3 py-2 text-center">{linha.empates}</td>
                    <td className="px-3 py-2 text-center">{linha.derrotas}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_pro}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_contra}</td>
                    <td className="px-3 py-2 text-center">{linha.saldo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 text-xs text-zinc-400 space-y-1">
        <p><span className="text-emerald-400 font-semibold">Verde</span>: classificados diretamente para as <b>oitavas</b> (1º–8º)</p>
        <p><span className="text-yellow-400 font-semibold">Amarelo</span>: disputam o <b>playoff</b> (9º–24º)</p>
        <p><span className="text-red-400 font-semibold">Vermelho</span>: <b>fora</b> (25º+)</p>
      </div>
    </div>
  )
}
