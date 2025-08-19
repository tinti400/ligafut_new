'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import classNames from 'classnames'
import { motion, AnimatePresence } from 'framer-motion'

/** ===== Supabase ===== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
type JogoQuartas = {
  id: number
  ordem?: number | null
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

type ClassRow = { id_time: string; pontos: number }
type LogoMap = Record<string, string | null>

/** ===== Helpers UI ===== */
function placarToNumber(v: string): number | null {
  if (v === '') return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) || n < 0 ? null : n
}

function siglaDoTime(nome: string) {
  const parts = (nome || '').split(' ').filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return (parts[0][0] || '?').toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** ===== Componente ===== */
export default function QuartasPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<JogoQuartas[]>([])
  const [classificacao, setClassificacao] = useState<ClassRow[]>([])
  const [logos, setLogos] = useState<LogoMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Busca paralela
    Promise.all([buscarJogos(), buscarClassificacao()]).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Carrega logos assim que tiver jogos
    if (jogos.length > 0) {
      const ids = Array.from(
        new Set(jogos.flatMap(j => [j.id_time1, j.id_time2]).filter(Boolean))
      )
      buscarLogos(ids)
    }
  }, [jogos])

  /** ===== Queries ===== */
  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_quartas')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos das quartas')
      setJogos([])
    } else {
      setJogos((data || []) as JogoQuartas[])
    }
    setLoading(false)
  }

  async function buscarClassificacao() {
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos')

    if (!error && data) {
      setClassificacao(data as ClassRow[])
    } else {
      setClassificacao([])
    }
  }

  async function buscarLogos(ids: string[]) {
    if (!ids.length) return
    const { data, error } = await supabase
      .from('times')
      .select('id, logo_url')
      .in('id', ids)

    if (!error && data) {
      const mapa: LogoMap = {}
      for (const row of data as { id: string; logo_url: string | null }[]) {
        mapa[row.id] = row.logo_url
      }
      setLogos(mapa)
    }
  }

  /** ===== Atualizações ===== */
  function setScore(idJogo: number, campo: keyof JogoQuartas, valor: string) {
    const num = placarToNumber(valor)
    setJogos(prev =>
      prev.map(j => (j.id === idJogo ? { ...j, [campo]: num } as JogoQuartas : j))
    )
  }

  async function salvarPlacar(jogo: JogoQuartas) {
    const { error } = await supabase
      .from('copa_quartas')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
        gols_time1_volta: jogo.gols_time1_volta ?? null,
        gols_time2_volta: jogo.gols_time2_volta ?? null
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar placar')
    } else {
      toast.success('Placar salvo!')
    }
  }

  /** ===== Regras de classificação (igual Oitavas) ===== */
  function pontosCampanha(idTime: string): number {
    return classificacao.find(c => c.id_time === idTime)?.pontos ?? 0
  }

  function agregado(j: JogoQuartas) {
    const t1 = (j.gols_time1 ?? 0) + (j.gols_time1_volta ?? 0)
    const t2 = (j.gols_time2 ?? 0) + (j.gols_time2_volta ?? 0)
    return { t1, t2 }
  }

  function vencedorDoConfronto(j: JogoQuartas): '1' | '2' | null {
    const { t1, t2 } = agregado(j)
    if (
      j.gols_time1 == null ||
      j.gols_time2 == null ||
      j.gols_time1_volta == null ||
      j.gols_time2_volta == null
    ) {
      return null
    }
    if (t1 > t2) return '1'
    if (t2 > t1) return '2'
    // Empate no agregado -> melhor campanha (pontos)
    const p1 = pontosCampanha(j.id_time1)
    const p2 = pontosCampanha(j.id_time2)
    return p1 >= p2 ? '1' : '2'
  }

  const tudoPreenchido = useMemo(
    () =>
      jogos.length > 0 &&
      jogos.every(
        j =>
          j.gols_time1 != null &&
          j.gols_time2 != null &&
          j.gols_time1_volta != null &&
          j.gols_time2_volta != null
      ),
    [jogos]
  )

  async function finalizarQuartas() {
    if (!tudoPreenchido) {
      toast.error('Preencha todos os jogos (ida e volta) antes de finalizar.')
      return
    }

    const classificados: { id: string; nome: string }[] = []

    for (const jogo of jogos) {
      const vencedor = vencedorDoConfronto(jogo)
      if (vencedor === '1') {
        classificados.push({ id: jogo.id_time1, nome: jogo.time1 })
      } else if (vencedor === '2') {
        classificados.push({ id: jogo.id_time2, nome: jogo.time2 })
      } else {
        // fallback defensivo (não deveria cair aqui)
        const p1 = pontosCampanha(jogo.id_time1)
        const p2 = pontosCampanha(jogo.id_time2)
        if (p1 >= p2) {
          classificados.push({ id: jogo.id_time1, nome: jogo.time1 })
        } else {
          classificados.push({ id: jogo.id_time2, nome: jogo.time2 })
        }
      }
    }

    // Monta semifinais em ordem (1x2, 3x4, …)
    const novosJogos = []
    for (let i = 0; i < classificados.length; i += 2) {
      if (classificados[i + 1]) {
        novosJogos.push({
          id_time1: classificados[i].id,
          id_time2: classificados[i + 1].id,
          time1: classificados[i].nome,
          time2: classificados[i + 1].nome,
          gols_time1: null,
          gols_time2: null,
          gols_time1_volta: null,
          gols_time2_volta: null
        })
      }
    }

    const { error } = await supabase.from('copa_semi').insert(novosJogos)
    if (error) {
      toast.error('Erro ao enviar classificados para a semifinal')
    } else {
      toast.success('Classificados enviados para a semifinal!')
    }
  }

  /** ===== UI Pieces ===== */
  function TimeBadge({
    idTime,
    nome,
    vencedor
  }: {
    idTime: string
    nome: string
    vencedor?: boolean
  }) {
    const logo = logos[idTime]
    return (
      <div
        className={classNames(
          'flex items-center gap-3 px-3 py-2 rounded-xl border bg-white/60',
          vencedor ? 'ring-2 ring-green-500 border-green-300' : 'border-gray-200'
        )}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nome}
            className="w-8 h-8 rounded-md object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-8 h-8 rounded-md grid place-items-center bg-gray-100 text-gray-500 text-xs font-semibold">
            {siglaDoTime(nome)}
          </div>
        )}
        <span className="font-medium truncate max-w-[160px]">{nome}</span>
      </div>
    )
  }

  function LinhaPlacar({
    esquerda,
    direita,
    valorEsq,
    valorDir,
    onChangeEsq,
    onChangeDir
  }: {
    esquerda: React.ReactNode
    direita: React.ReactNode
    valorEsq: number | null
    valorDir: number | null
    onChangeEsq: (v: string) => void
    onChangeDir: (v: string) => void
  }) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1">{esquerda}</div>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="w-14 text-center border rounded-lg px-2 py-1"
          value={valorEsq ?? ''}
          onChange={(e) => onChangeEsq(e.target.value)}
        />
        <span className="font-semibold">x</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="w-14 text-center border rounded-lg px-2 py-1"
          value={valorDir ?? ''}
          onChange={(e) => onChangeDir(e.target.value)}
        />
        <div className="flex-1 text-right">{direita}</div>
      </div>
    )
  }

  if (loading) {
    return <div className="p-4">🔄 Carregando jogos...</div>
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">🥈 Quartas de Final</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence initial={false}>
          {jogos.map((jogo, idx) => {
            const { t1, t2 } = agregado(jogo)
            const vencedor = vencedorDoConfronto(jogo)
            const vencedorId =
              vencedor === '1' ? jogo.id_time1 : vencedor === '2' ? jogo.id_time2 : null

            return (
              <motion.div
                key={jogo.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="rounded-2xl border bg-white/80 backdrop-blur p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-600">
                    Confronto {idx + 1}
                  </div>
                  <div className="text-xs text-gray-500">
                    Critério de desempate: melhor campanha (pontos).
                  </div>
                </div>

                {/* Ida */}
                <div className="mb-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                    Ida
                  </div>
                  <LinhaPlacar
                    esquerda={
                      <TimeBadge
                        idTime={jogo.id_time1}
                        nome={jogo.time1}
                        vencedor={vencedorId === jogo.id_time1}
                      />
                    }
                    direita={
                      <TimeBadge
                        idTime={jogo.id_time2}
                        nome={jogo.time2}
                        vencedor={vencedorId === jogo.id_time2}
                      />
                    }
                    valorEsq={jogo.gols_time1}
                    valorDir={jogo.gols_time2}
                    onChangeEsq={(v) => setScore(jogo.id, 'gols_time1', v)}
                    onChangeDir={(v) => setScore(jogo.id, 'gols_time2', v)}
                  />
                </div>

                {/* Volta (mandante invertido) */}
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                    Volta
                  </div>
                  <LinhaPlacar
                    esquerda={
                      <TimeBadge
                        idTime={jogo.id_time2}
                        nome={jogo.time2}
                        vencedor={vencedorId === jogo.id_time2}
                      />
                    }
                    direita={
                      <TimeBadge
                        idTime={jogo.id_time1}
                        nome={jogo.time1}
                        vencedor={vencedorId === jogo.id_time1}
                      />
                    }
                    valorEsq={jogo.gols_time2_volta ?? null}
                    valorDir={jogo.gols_time1_volta ?? null}
                    onChangeEsq={(v) => setScore(jogo.id, 'gols_time2_volta', v)}
                    onChangeDir={(v) => setScore(jogo.id, 'gols_time1_volta', v)}
                  />
                </div>

                {/* Agregado + Botões */}
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-semibold">Agregado: </span>
                    <span
                      className={classNames(
                        'px-2 py-0.5 rounded-lg border',
                        vencedor
                          ? 'border-green-300 text-green-700 bg-green-50'
                          : 'border-gray-200 text-gray-700 bg-gray-50'
                      )}
                    >
                      {t1} x {t2}
                    </span>
                    {vencedorId && (
                      <span className="ml-2 text-gray-600">
                        Classifica:{' '}
                        <span className="font-semibold">
                          {vencedorId === jogo.id_time1 ? jogo.time1 : jogo.time2}
                        </span>
                      </span>
                    )}
                  </div>

                  <button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg"
                    onClick={() => salvarPlacar(jogo)}
                  >
                    Salvar
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {isAdmin && (
        <div className="mt-6">
          <button
            className={classNames(
              'px-4 py-2 rounded-lg text-white',
              tudoPreenchido
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
            )}
            disabled={!tudoPreenchido}
            onClick={finalizarQuartas}
          >
            ✅ Finalizar Quartas
          </button>
          {!tudoPreenchido && (
            <p className="text-xs text-gray-500 mt-2">
              Preencha todos os placares de ida e volta para habilitar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
