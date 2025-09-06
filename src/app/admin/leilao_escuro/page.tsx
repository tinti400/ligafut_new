'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'
import classNames from 'classnames'

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= CONFIG ================= */
const INCREMENTO_MINIMO = 20_000_000
const DESBLOQUEIO_POR_FAIXA = 70_000_000
const ATRIBUTOS_ORDEM = [
  'nacionalidade',
  'posicao',
  'overall',
  'velocidade',
  'finalizacao',
  'cabeceio',
] as const

const LIMIAR_IMAGEM = ATRIBUTOS_ORDEM.length
const BUCKET_PRIVADO = 'imagens-privadas'

type CampoAtributo = typeof ATRIBUTOS_ORDEM[number]

/* ================= TIPOS ================= */
type LeilaoEscuro = {
  id: string
  nacionalidade?: string | null
  posicao?: string | null
  overall?: number | null
  velocidade?: number | null
  finalizacao?: number | null
  cabeceio?: number | null

  valor_atual: number
  id_time_vencedor?: string | null
  nome_time_vencedor?: string | null
  fim: string
  criado_em: string
  status: 'fila' | 'ativo' | 'leiloado' | 'cancelado'

  silhueta_url?: string | null
  imagem_path_privada?: string | null
}

/* ================= UTILS ================= */
const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function atributosLiberados(valorAtual: number): number {
  const n = Math.floor(valorAtual / DESBLOQUEIO_POR_FAIXA)
  return Math.max(0, Math.min(n, ATRIBUTOS_ORDEM.length))
}

function segundosRestantes(iso: string) {
  const fim = new Date(iso).getTime()
  const agora = Date.now()
  return Math.max(0, Math.floor((fim - agora) / 1000))
}

function formatCountdown(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ================= PAGE ================= */
export default function LeilaoNoEscuroPage() {
  const [leilao, setLeilao] = useState<LeilaoEscuro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tempo, setTempo] = useState(0)
  const [dandoLance, setDandoLance] = useState(false)

  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [imgReveladaUrl, setImgReveladaUrl] = useState<string | null>(null)

  useEffect(() => {
    setIdTime(localStorage.getItem('id_time'))
    setNomeTime(localStorage.getItem('nome_time'))
    setIsAdmin(localStorage.getItem('is_admin') === 'true')
  }, [])

  useEffect(() => {
    const fetchAtivo = async () => {
      setCarregando(true)
      const { data, error } = await supabase
        .from('leiloes_escuros')
        .select('*')
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) toast.error('Erro ao carregar leilão')
      setLeilao(data ?? null)
      setCarregando(false)
    }
    fetchAtivo()
  }, [])

  useEffect(() => {
    if (!leilao?.id) return
    const ch = supabase
      .channel(`leilao_escuro_${leilao.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leiloes_escuros', filter: `id=eq.${leilao.id}` },
        (payload) => {
          if (payload.new) setLeilao(payload.new as LeilaoEscuro)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [leilao?.id])

  useEffect(() => {
    if (!leilao?.fim) return
    const tick = () => setTempo(segundosRestantes(leilao.fim))
    tick()
    const it = setInterval(tick, 1000)
    return () => clearInterval(it)
  }, [leilao?.fim])

  const liberados = useMemo(
    () => atributosLiberados(leilao?.valor_atual ?? 0),
    [leilao?.valor_atual]
  )

  const podeLance = useMemo(() => {
    if (!leilao) return false
    if (leilao.status !== 'ativo') return false
    if (tempo <= 0) return false
    return Boolean(idTime && nomeTime)
  }, [leilao, tempo, idTime, nomeTime])

  useEffect(() => {
    let refreshTimer: any

    const genSigned = async () => {
      if (!leilao?.imagem_path_privada) { setImgReveladaUrl(null); return }
      if (liberados < LIMIAR_IMAGEM) { setImgReveladaUrl(null); return }

      const { data, error } = await supabase
        .storage
        .from(BUCKET_PRIVADO)
        .createSignedUrl(leilao.imagem_path_privada, 600)

      if (error) {
        setImgReveladaUrl(null)
        return
      }
      setImgReveladaUrl(data.signedUrl)

      refreshTimer = setInterval(async () => {
        const { data, error } = await supabase
          .storage
          .from(BUCKET_PRIVADO)
          .createSignedUrl(leilao.imagem_path_privada!, 600)
        if (!error) setImgReveladaUrl(data.signedUrl)
      }, 9 * 60 * 1000)
    }

    genSigned()
    return () => {
      if (refreshTimer) clearInterval(refreshTimer)
    }
  }, [leilao?.imagem_path_privada, liberados])

  async function darLance(delta: number) {
    if (!leilao || !podeLance) return
    setDandoLance(true)
    try {
      const novoValor = leilao.valor_atual + delta
      const { error } = await supabase
        .from('leiloes_escuros')
        .update({
          valor_atual: novoValor,
          id_time_vencedor: idTime,
          nome_time_vencedor: nomeTime,
        })
        .eq('id', leilao.id)
        .eq('status', 'ativo')

      if (error) throw error
      toast.success(`Lance de ${fmtBRL(delta)} registrado!`)
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao dar lance')
    } finally {
      setDandoLance(false)
    }
  }

  async function finalizarEArquivar() {
    if (!leilao || !isAdmin) return
    const ok = confirm('Finalizar leilão e mover para finalizados?')
    if (!ok) return
    const { error } = await supabase
      .from('leiloes_escuros')
      .update({ status: 'leiloado' })
      .eq('id', leilao.id)
      .in('status', ['ativo'])
    if (error) {
      toast.error('Falha ao finalizar')
    } else {
      toast.success('Leilão finalizado e arquivado')
      window.location.href = '/admin/leiloes_finalizados'
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Toaster position="top-center" />

      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">🕵️‍♂️ Leilão no Escuro</h1>
          <div className="text-sm opacity-80">
            {idTime ? (
              <span>Time: <b>{nomeTime}</b></span>
            ) : (
              <span className="italic">Faça login / selecione seu time</span>
            )}
          </div>
        </header>

        {carregando && (
          <div className="animate-pulse rounded-2xl bg-neutral-800 p-6">Carregando…</div>
        )}

        {!carregando && !leilao && (
          <div className="rounded-2xl bg-neutral-900 p-6 text-center">
            Nenhum leilão no escuro ativo no momento.
          </div>
        )}

        {!carregando && leilao && (
          <div
            className={classNames(
              'rounded-2xl p-4 md:p-6',
              'bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800',
              'shadow-xl'
            )}
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm md:text-base">
                <div className="opacity-70">Tempo restante</div>
                <div className={classNames(
                  'font-mono text-2xl md:text-3xl',
                  tempo <= 10 ? 'text-red-400' : 'text-emerald-400'
                )}>
                  {formatCountdown(tempo)}
                </div>
              </div>

              <div className="text-right">
                <div className="opacity-70 text-sm md:text-base">Valor atual</div>
                <div className="text-2xl md:text-3xl font-bold">{fmtBRL(leilao.valor_atual)}</div>
                {leilao.nome_time_vencedor && (
                  <div className="text-xs md:text-sm opacity-75">
                    maior lance: <b>{leilao.nome_time_vencedor}</b>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
              <div className="rounded-2xl bg-neutral-800/70 aspect-[3/4] overflow-hidden flex items-center justify-center">
                {imgReveladaUrl ? (
                  <img src={imgReveladaUrl} alt="Jogador real" className="w-full h-full object-cover" />
                ) : leilao.silhueta_url ? (
                  <img src={leilao.silhueta_url} alt="Silhueta" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-neutral-400 text-center px-3">
                    <div className="text-6xl mb-2">🕶️</div>
                    Jogador Misterioso
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-3">Atributos</h2>
                <ul className="space-y-2">
                  {ATRIBUTOS_ORDEM.map((campo: CampoAtributo, i) => {
                    const desbloqueado = i < liberados
                    const valor = (leilao as any)[campo]
                    const label =
                      campo === 'posicao' ? 'Posição'
                      : campo === 'nacionalidade' ? 'Nacionalidade'
                      : campo === 'overall' ? 'Overall'
                      : campo === 'velocidade' ? 'Velocidade'
                      : campo === 'finalizacao' ? 'Finalização'
                      : campo === 'cabeceio' ? 'Cabeceio'
                      : campo

                    return (
                      <li key={campo} className="rounded-xl px-3 py-2 flex items-center justify-between bg-neutral-800/60 border border-neutral-700">
                        <div className="flex items-center gap-2">
                          <span className={classNames('text-xl', desbloqueado ? 'text-emerald-400' : 'text-neutral-500')}>
                            {desbloqueado ? '✅' : '🔒'}
                          </span>
                          <span className="font-medium">{label}</span>
                        </div>
                        <div className="text-right font-mono">
                          {desbloqueado ? valor ?? <span className="opacity-60 italic">—</span> : <span className="opacity-60 italic">oculto</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-3 text-xs opacity-70">
                  A cada <b>{fmtBRL(DESBLOQUEIO_POR_FAIXA)}</b> um atributo é revelado.
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs opacity-75">
                Incremento mínimo: <b>{fmtBRL(INCREMENTO_MINIMO)}</b>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={!podeLance || dandoLance}
                  onClick={() => darLance(INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  +{fmtBRL(INCREMENTO_MINIMO)}
                </button>
                <button
                  disabled={!podeLance || dandoLance}
                  onClick={() => darLance(5 * INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  +{fmtBRL(5 * INCREMENTO_MINIMO)}
                </button>
                <button
                  disabled={!podeLance || dandoLance}
                  onClick={() => darLance(10 * INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50"
                >
                  +{fmtBRL(10 * INCREMENTO_MINIMO)}
                </button>

                {isAdmin && (
                  <button
                    onClick={finalizarEArquivar}
                    className="px-4 py-2 rounded-xl font-semibold bg-amber-600 hover:bg-amber-700"
                  >
                    Finalizar & Arquivar
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs opacity-70">
              Status: <b className={leilao.status === 'ativo' ? 'text-emerald-400' : 'text-neutral-300'}>
                {leilao.status}
              </b>
              {tempo <= 0 && leilao.status === 'ativo' && (
                <span className="ml-2 text-red-400">— tempo esgotado</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
