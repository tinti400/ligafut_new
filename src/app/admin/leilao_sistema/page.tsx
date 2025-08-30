'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import classNames from 'classnames'
import toast, { Toaster } from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_ATIVOS = 15
const INCREMENTO_MINIMO = 20_000_000 // mínimo +20mi para lance manual

type Leilao = {
  id: string
  nome: string
  posicao: string
  overall: number
  nacionalidade?: string | null
  imagem_url?: string | null
  link_sofifa?: string | null
  valor_atual: number
  nome_time_vencedor?: string | null
  fim: string
  criado_em: string
  status: 'ativo' | 'leiloado' | 'cancelado'
  anterior?: string | null
}

export default function LeilaoSistemaPage() {
  const router = useRouter()

  // identidade do time em estado
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState<string | null>(null)

  // dados
  const [leiloes, setLeiloes] = useState<Leilao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [saldo, setSaldo] = useState<number | null>(null)

  // ui
  const [cooldownGlobal, setCooldownGlobal] = useState(false)
  const [cooldownPorLeilao, setCooldownPorLeilao] = useState<Record<string, boolean>>({})
  const [tremores, setTremores] = useState<Record<string, boolean>>({})
  const [burst, setBurst] = useState<Record<string, boolean>>({}) // animação extra
  const [erroTela, setErroTela] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervaloRef = useRef<NodeJS.Timeout | null>(null)

  // input manual por leilão
  const [propostas, setPropostas] = useState<Record<string, string>>({})

  // logos de times (nome -> url)
  const [logos, setLogos] = useState<Record<string, string>>({})

  // ===== admin =====
  const [isAdmin, setIsAdmin] = useState(false)

  // ===== efeitos por botão (novos) =====
  const [efeito, setEfeito] = useState<
    Record<string, { tipo: 'sad' | 'morno' | 'empolgado' | 'fogo' | 'explosao'; key: number }>
  >({})
  const DUR = { sad: 1000, morno: 1100, empolgado: 1400, fogo: 1800, explosao: 2200 } as const
  function acionarEfeito(leilaoId: string, tipo: keyof typeof DUR) {
    setEfeito((prev) => ({ ...prev, [leilaoId]: { tipo, key: (prev[leilaoId]?.key ?? 0) + 1 } }))
    setTimeout(() => {
      setEfeito((prev) => {
        const c = { ...prev }
        delete c[leilaoId]
        return c
      })
    }, DUR[tipo])
  }

  // -------- utils ----------
  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const sane = (str: any) => {
    if (typeof str !== 'string') return null
    const s = str.trim()
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null
    return s
  }

  const brl = (v?: number | null) =>
    typeof v === 'number'
      ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      : '—'

  const normalizeUrl = (u?: string | null) => {
    if (!u) return ''
    let url = String(u).trim().replace(/^"(.*)"$/, '$1')
    if (url.startsWith('//')) url = 'https:' + url
    if (url.startsWith('http://')) url = 'https://' + url.slice(7)
    if (!/^https?:\/\/\S+/i.test(url)) return ''
    return url
  }

  const pickImagemUrl = (row: any) => {
    const keys = [
      'imagem_url',
      'Imagem_url',
      'Imagem URL',
      'imagem URL',
      'imagemURL',
      'url_imagem',
      'URL_Imagem',
    ]
    for (const k of keys) {
      if (row?.[k]) {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }
    for (const k in row || {}) {
      if (k && k.replace(/\s+/g, '').toLowerCase() === 'imagem_url') {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }
    return row?.imagem_url ? normalizeUrl(row.imagem_url) : ''
  }

  function carregarIdentidadeLocal() {
    try {
      const id_raw = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
      const nome_raw = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : null

      let id = sane(id_raw)
      let nome = sane(nome_raw)

      if (!id || !nome) {
        const userStr =
          typeof window !== 'undefined'
            ? localStorage.getItem('user') || localStorage.getItem('usuario')
            : null
        if (userStr) {
          try {
            const obj = JSON.parse(userStr)
            if (!id) id = sane(obj?.id_time || obj?.time_id || obj?.idTime)
            if (!nome) nome = sane(obj?.nome_time || obj?.nomeTime || obj?.time_nome || obj?.nome)
          } catch {}
        }
      }

      setIdTime(id || null)
      setNomeTime(nome || null)
    } catch {
      setIdTime(null)
      setNomeTime(null)
    }
  }

  async function garantirIdTimeValido() {
    try {
      if (idTime && isUuid(idTime)) return
      if (!nomeTime) return
      const { data, error } = await supabase.from('times').select('id').eq('nome', nomeTime).single()
      if (!error && data?.id && isUuid(data.id)) {
        localStorage.setItem('id_time', data.id)
        setIdTime(data.id)
      }
    } catch {
      /* ignore */
    }
  }

  const buscarSaldo = async () => {
    if (!idTime || !isUuid(idTime)) return
    const { data, error } = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (!error && data) setSaldo(data.saldo)
    else setSaldo(null)
  }

  const carregarLogosTimes = async () => {
    const { data, error } = await supabase.from('times').select('nome, logo_url')
    if (!error && data) {
      const map: Record<string, string> = {}
      for (const t of data) {
        const url = normalizeUrl(t.logo_url)
        if (t.nome && url) map[t.nome] = url
      }
      setLogos(map)
    }
  }

  const buscarLeiloesAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('criado_em', { ascending: true })
      .limit(MAX_ATIVOS)

    if (!error && data) {
      const arr = data.map((l: any) => ({
        ...l,
        imagem_url: pickImagemUrl(l) || null,
      }))

      // beep ao perder liderança
      arr.forEach((leilao: any) => {
        if (leilao.nome_time_vencedor !== nomeTime && leilao.anterior === nomeTime) {
          audioRef.current?.play().catch(() => {})
        }
      })

      setLeiloes(arr as Leilao[])

      // inicializa input manual com (valor_atual + 20mi)
      setPropostas((prev) => {
        const next = { ...prev }
        for (const l of arr as Leilao[]) {
          if (!next[l.id]) next[l.id] = String((l.valor_atual ?? 0) + INCREMENTO_MINIMO)
        }
        return next
      })
    }
  }

  useEffect(() => {
    carregarIdentidadeLocal()
    carregarLogosTimes()
  }, [])

  useEffect(() => {
    garantirIdTimeValido()
  }, [nomeTime, idTime])

  // detectar admin (auth -> localStorage -> coluna times.is_admin)
  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const u = data?.user
        if (!stop && (u?.app_metadata?.role === 'admin' || u?.user_metadata?.is_admin === true)) {
          setIsAdmin(true); return
        }
      } catch {}

      try {
        const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
        if (raw) {
          const obj = JSON.parse(raw)
          if (!stop && (obj?.is_admin === true || obj?.role === 'admin')) {
            setIsAdmin(true); return
          }
        }
      } catch {}

      try {
        if (idTime && isUuid(idTime)) {
          const { data, error } = await supabase.from('times').select('is_admin').eq('id', idTime).maybeSingle()
          if (!stop && !error && data?.is_admin === true) {
            setIsAdmin(true); return
          }
        }
      } catch {}
    })()
    return () => { stop = true }
  }, [idTime])

  useEffect(() => {
    ;(async () => {
      await Promise.all([buscarLeiloesAtivos(), buscarSaldo()])
      setCarregando(false)
    })()

    if (intervaloRef.current) clearInterval(intervaloRef.current)
    intervaloRef.current = setInterval(() => {
      buscarLeiloesAtivos()
      buscarSaldo()
    }, 1000)

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTime, nomeTime])

  // ==== Realtime: toast global animado 6s quando valor_atual subir ====
  useEffect(() => {
    const channel = supabase
      .channel('leiloes_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leiloes_sistema' },
        (payload) => {
          const novo = payload.new as any
          const antigo = payload.old as any
          const aumentou = Number(novo?.valor_atual ?? 0) > Number(antigo?.valor_atual ?? 0)
          if (novo?.status !== 'ativo' || !aumentou) return

          const quem = novo?.nome_time_vencedor || 'Um time'
          const jogador = novo?.nome || 'jogador'
          const valor = Number(novo?.valor_atual ?? 0)

          toast.custom(
            (t) => (
              <div
                className={`pointer-events-auto w-[min(92vw,520px)] overflow-hidden rounded-2xl border border-emerald-700/30 bg-neutral-950/95 shadow-lg ${
                  t.visible ? 'lf-enter' : 'lf-exit'
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-600/20">📢</div>
                  <div className="flex-1 text-sm leading-5">
                    <b>{quem}</b> enviou{' '}
                    <b>
                      {valor.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                        maximumFractionDigits: 0,
                      })}
                    </b>{' '}
                    no <b>{jogador}</b>
                  </div>
                </div>
                <div className="h-1 w-full bg-zinc-800">
                  <div className="lf-progress h-full bg-emerald-500" />
                </div>
              </div>
            ),
            { duration: 6000, position: 'top-center' }
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // ===== UI helpers =====
  const formatarTempo = (segundos: number) => {
    const h = Math.floor(segundos / 3600)
    const min = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0')
    const sec = Math.max(0, Math.floor(segundos % 60)).toString().padStart(2, '0')
    return h > 0 ? `${h}:${min}:${sec}` : `${min}:${sec}`
  }

  const tierGrad = (valor: number) => {
    if (valor >= 360_000_000) return 'from-fuchsia-500/50 via-purple-500/35 to-amber-400/25'
    if (valor >= 240_000_000) return 'from-cyan-400/45 via-blue-500/35 to-purple-500/25'
    if (valor >= 120_000_000) return 'from-emerald-400/45 via-teal-400/30 to-cyan-400/20'
    return 'from-emerald-500/25 via-emerald-400/15 to-transparent'
  }

  const tierBadge = (valor: number) => {
    if (valor >= 360_000_000) return 'text-fuchsia-300 border-fuchsia-900/40 bg-fuchsia-950/30'
    if (valor >= 240_000_000) return 'text-blue-300 border-blue-900/40 bg-blue-950/30'
    if (valor >= 120_000_000) return 'text-emerald-300 border-emerald-900/40 bg-emerald-950/30'
    return 'text-emerald-200 border-emerald-900/30 bg-emerald-950/20'
  }

  const travadoPorIdentidade = useMemo(() => {
    if (!idTime || !isUuid(idTime) || !nomeTime)
      return 'Identificação do time inválida. Faça login novamente.'
    return null
  }, [idTime, nomeTime])

  // ===== helpers de animação já existentes =====
  const acionarAnimacao = (leilaoId: string) => {
    setTremores((prev) => ({ ...prev, [leilaoId]: true }))
    setBurst((prev) => ({ ...prev, [leilaoId]: true }))
    setTimeout(() => {
      setBurst((prev) => ({ ...prev, [leilaoId]: false }))
    }, 700)
    setTimeout(() => {
      setTremores((prev) => ({ ...prev, [leilaoId]: false }))
    }, 150)
  }

  // ===== ações admin =====
  const excluirDoLeilao = async (leilaoId: string) => {
    if (!isAdmin) {
      alert('Ação restrita a administradores.')
      return
    }
    if (!confirm('Tem certeza que deseja excluir este item do leilão?')) return

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'cancelado' }) // soft delete; troque por delete() se preferir
      .eq('id', leilaoId)

    if (error) {
      toast.error('Erro ao excluir: ' + (error.message || ''))
    } else {
      toast.success('Leilão excluído.')
      await buscarLeiloesAtivos()
    }
  }

  // ===== Lance manual (valor livre, mínimo +20mi) =====
  async function darLanceManual(
    leilaoId: string,
    valorAtual: number,
    valorProposto: number,
    tempoRestante: number
  ) {
    setErroTela(null)

    await garantirIdTimeValido()
    if (travadoPorIdentidade) {
      setErroTela(travadoPorIdentidade)
      return
    }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const minimo = Number(valorAtual) + INCREMENTO_MINIMO
    const novoValor = Math.floor(Number(valorProposto) || 0)

    if (!isFinite(novoValor) || novoValor < minimo) {
      setErroTela(`O lance mínimo é ${brl(minimo)}.`)
      return
    }
    if (saldo !== null && novoValor > saldo) {
      setErroTela('Saldo insuficiente para este lance.')
      return
    }

    setCooldownGlobal(true)
    setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: true }))
    acionarAnimacao(leilaoId)

    try {
      const { data: atual, error: e1 } = await supabase
        .from('leiloes_sistema')
        .select('status, valor_atual, fim')
        .eq('id', leilaoId)
        .single()
      if (e1 || !atual) throw new Error('Não foi possível validar o leilão.')
      if (atual.status !== 'ativo') throw new Error('Leilão não está mais ativo.')
      const fimMs = new Date(atual.fim).getTime()
      if (isNaN(fimMs) || fimMs - Date.now() <= 0) throw new Error('Leilão encerrado.')

      const incremento = novoValor - Number(valorAtual)
      if (incremento < INCREMENTO_MINIMO) {
        throw new Error(`O lance deve ser pelo menos ${brl(INCREMENTO_MINIMO)} acima.`)
      }

      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: idTime,
        p_nome_time_vencedor: nomeTime,
        p_estender: tempoRestante < 15,
      })
      if (error) {
        console.error('RPC error:', error)
        throw new Error(error.message || 'Falha ao registrar lance.')
      }

      // animação por delta (manual)
      if (incremento > 20_000_000) acionarEfeito(leilaoId, 'explosao')
      else if (incremento === 20_000_000) acionarEfeito(leilaoId, 'fogo')
      else if (incremento >= 15_000_000) acionarEfeito(leilaoId, 'empolgado')
      else if (incremento >= 6_000_000) acionarEfeito(leilaoId, 'morno')
      else acionarEfeito(leilaoId, 'sad')

      await buscarLeiloesAtivos()
      await buscarSaldo()
      setPropostas((prev) => ({ ...prev, [leilaoId]: String(novoValor + INCREMENTO_MINIMO) }))
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => {
        setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: false }))
      }, 150)
    }
  }

  async function darLance(
    leilaoId: string,
    valorAtual: number,
    incremento: number,
    tempoRestante: number
  ) {
    setErroTela(null)

    await garantirIdTimeValido()
    if (travadoPorIdentidade) {
      setErroTela(travadoPorIdentidade)
      return
    }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const novoValor = Number(valorAtual) + Number(incremento)

    if (saldo !== null && novoValor > saldo) {
      setErroTela('Saldo insuficiente para este lance.')
      return
    }

    setCooldownGlobal(true)
    setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: true }))
    acionarAnimacao(leilaoId)

    try {
      const { data: atual, error: e1 } = await supabase
        .from('leiloes_sistema')
        .select('status, valor_atual, fim')
        .eq('id', leilaoId)
        .single()
      if (e1 || !atual) throw new Error('Não foi possível validar o leilão.')
      if (atual.status !== 'ativo') throw new Error('Leilão não está mais ativo.')
      const fimMs = new Date(atual.fim).getTime()
      if (isNaN(fimMs) || fimMs - Date.now() <= 0) throw new Error('Leilão encerrado.')

      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: idTime,
        p_nome_time_vencedor: nomeTime,
        p_estender: tempoRestante < 15,
      })
      if (error) {
        console.error('RPC error:', error)
        throw new Error(error.message || 'Falha ao registrar lance.')
      }

      // animação por botão (incrementos fixos)
      if (incremento === 4_000_000) acionarEfeito(leilaoId, 'sad')
      else if (incremento <= 10_000_000) acionarEfeito(leilaoId, 'morno')
      else if (incremento === 15_000_000) acionarEfeito(leilaoId, 'empolgado')
      else if (incremento === 20_000_000) acionarEfeito(leilaoId, 'fogo')

      await buscarLeiloesAtivos()
      await buscarSaldo()
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => {
        setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: false }))
      }, 150)
    }
  }

  const finalizarLeilaoAgora = async (leilaoId: string) => {
    if (!confirm('Deseja finalizar esse leilão agora?')) return
    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'leiloado' })
      .eq('id', leilaoId)

    if (error) alert('Erro ao finalizar leilão: ' + error.message)
    else {
      alert('Leilão finalizado!')
      await buscarLeiloesAtivos()
    }
  }

  // ================== RENDER ==================
  return (
    <main className="min-h-screen bg-neutral-950 text-zinc-100">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      {/* Toaster global (6s) */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 6000,
          style: { background: '#0a0a0a', color: '#e5e7eb', border: '1px solid #27272a' },
        }}
      />

      {/* Header fixo com saldo */}
      <header className="sticky top-0 z-20 border-b border-zinc-900/80 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-400 shadow" />
              <h1 className="text-lg font-semibold tracking-tight">Leilão do Sistema</h1>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div
                className={classNames(
                  'rounded-xl border px-3 py-2 text-sm',
                  saldo !== null
                    ? 'border-emerald-900/40 bg-emerald-950/40 text-emerald-200'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
                )}
              >
                💳 Saldo: <b className="ml-1 tabular-nums">{brl(saldo ?? undefined)}</b>
              </div>
              {travadoPorIdentidade && (
                <div className="rounded-xl border border-yellow-900/40 bg-yellow-950/40 px-3 py-2 text-xs text-yellow-200">
                  ⚠️ {travadoPorIdentidade}
                </div>
              )}
            </div>
          </div>

          {erroTela && (
            <div className="mt-3 rounded-2xl border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              ⚠️ {erroTela}
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
        {/* Estado vazio / carregando */}
        {carregando ? (
          <div className="grid grid-cols-1 gap-4 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: MAX_ATIVOS }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-zinc-800" />
                  <div className="flex-1">
                    <div className="h-4 w-2/3 rounded bg-zinc-800" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-zinc-800" />
                  </div>
                </div>
                <div className="mt-4 h-8 w-full rounded-xl bg-zinc-800" />
                <div className="mt-3 h-10 w-full rounded-xl bg-zinc-800" />
              </div>
            ))}
          </div>
        ) : leiloes.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <div className="mx-auto mb-2 h-10 w-10 rounded-2xl border border-zinc-800 bg-zinc-950" />
            <h3 className="text-base font-semibold">Nenhum leilão ativo</h3>
            <p className="mt-1 text-sm text-zinc-400">Volte em instantes ou verifique com o administrador.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
            {leiloes.map((leilao, index) => {
              const tempoFinal = new Date(leilao.fim).getTime()
              const tempoInicio = new Date(leilao.criado_em).getTime()
              const agora = Date.now()

              let tempoRestante = Math.floor((tempoFinal - agora) / 1000)
              if (!isFinite(tempoRestante) || tempoRestante < 0) tempoRestante = 0

              const totalMs = Math.max(0, tempoFinal - tempoInicio)
              const remMs = Math.max(0, tempoFinal - agora)
              const pctRestante = totalMs > 0 ? Math.min(100, Math.max(0, (remMs / totalMs) * 100)) : 0

              const disabledPorTempo = tempoRestante === 0
              const disabledPorIdentidade = !!travadoPorIdentidade
              const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]

              const increments = [4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000]

              const minimoPermitido = (leilao.valor_atual ?? 0) + INCREMENTO_MINIMO
              const valorPropostoNum = Math.floor(Number(propostas[leilao.id] ?? minimoPermitido))

              const vencedor = leilao.nome_time_vencedor || ''
              const logoVencedor = vencedor ? logos[vencedor] : undefined

              return (
                <div key={leilao.id} className="relative">
                  {/* efeito de borda */}
                  <div className={classNames('rounded-2xl bg-gradient-to-br p-[1px]', tierGrad(leilao.valor_atual))}>
                    <article
                      className={classNames(
                        'relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur transition',
                        'hover:border-emerald-600/30 hover:bg-zinc-900/70',
                        tremores[leilao.id] ? 'animate-[pulse_0.3s_ease_1] ring-1 ring-emerald-500/30' : ''
                      )}
                    >
                      {/* botão admin: excluir */}
                      {isAdmin && (
                        <button
                          onClick={() => excluirDoLeilao(leilao.id)}
                          className="absolute right-3 top-3 rounded-lg border border-red-900/40 bg-red-950/40 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                          title="Excluir do leilão (admin)"
                        >
                          🗑️ Excluir
                        </button>
                      )}

                      {/* burst de emojis existente */}
                      {burst[leilao.id] && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="animate-[fadeout_0.7s_ease_forwards] select-none text-2xl">💥✨🔥</div>
                        </div>
                      )}

                      {/* overlay de efeitos por botão */}
                      {efeito[leilao.id] && (
                        <div key={efeito[leilao.id].key} className="pointer-events-none absolute inset-0">
                          {efeito[leilao.id].tipo === 'sad' && (
                            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-3 text-2xl">
                              <span className="lf-float-slow opacity-80">😕</span>
                              <span className="lf-float-slow delay-100 opacity-80">🙁</span>
                              <span className="lf-float-slow delay-200 opacity-80">😞</span>
                            </div>
                          )}

                          {efeito[leilao.id].tipo === 'morno' && (
                            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3 text-2xl">
                              <span className="lf-pop opacity-90">👍</span>
                              <span className="lf-pop delay-100 opacity-90">👏</span>
                              <span className="lf-pop delay-200 opacity-90">🙂</span>
                            </div>
                          )}

                          {efeito[leilao.id].tipo === 'empolgado' && (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="relative">
                                <span className="lf-confetti block text-2xl">🎉</span>
                                <span className="lf-confetti delay-75 absolute -left-8 -top-2 text-xl">✨</span>
                                <span className="lf-confetti delay-150 absolute -right-8 -top-1 text-xl">🎉</span>
                              </div>
                            </div>
                          )}

                          {efeito[leilao.id].tipo === 'fogo' && (
                            <div className="absolute inset-x-0 bottom-2 flex items-end justify-center gap-2 text-2xl">
                              <span className="lf-fire">🔥</span>
                              <span className="lf-fire delay-100">🔥</span>
                              <span className="lf-fire delay-200">🔥</span>
                            </div>
                          )}

                          {efeito[leilao.id].tipo === 'explosao' && (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="relative">
                                <span className="lf-burst text-3xl">💥</span>
                                <span className="lf-sparkle absolute -left-10 -top-2 text-2xl">✨</span>
                                <span className="lf-sparkle delay-150 absolute -right-10 -top-3 text-2xl">✨</span>
                                <span className="lf-ring absolute left-1/2 top-1/2 -z-10 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/40" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* barra de tempo */}
                      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/70">
                        <div
                          className="h-full bg-emerald-500 transition-[width] duration-1000"
                          style={{ width: `${pctRestante}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-zinc-300">Leilão #{index + 1}</h2>
                        <span
                          className={classNames(
                            'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px]',
                            disabledPorTempo
                              ? 'border-red-900/60 bg-red-950/40 text-red-200'
                              : 'border-emerald-900/40 bg-emerald-950/40 text-emerald-200'
                          )}
                        >
                          {disabledPorTempo ? 'Encerrado' : 'Termina em'}
                          {!disabledPorTempo && <b className="tabular-nums">{formatarTempo(tempoRestante)}</b>}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-4">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                          {leilao.imagem_url ? (
                            <img
                              src={leilao.imagem_url}
                              alt={leilao.nome}
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                            />
                          ) : (
                            <div className="h-full w-full bg-zinc-900" />
                          )}
                          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-emerald-500/0 transition group-hover:ring-2 group-hover:ring-emerald-500/20" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold leading-5">{leilao.nome}</p>
                            <span className={classNames('rounded-md border px-2 py-0.5 text-xs', tierBadge(leilao.valor_atual))}>
                              {brl(leilao.valor_atual)}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                              {leilao.posicao}
                            </span>
                            <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                              ⭐ OVR {leilao.overall}
                            </span>
                            {leilao.nacionalidade && (
                              <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                                🌍 {leilao.nacionalidade}
                              </span>
                            )}
                            {vencedor && (
                              <span className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                                👑
                                {logoVencedor ? (
                                  <img
                                    src={logoVencedor}
                                    alt={vencedor}
                                    className="h-4 w-4 rounded-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                  />
                                ) : (
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-200">
                                    {vencedor.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span>{vencedor}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ==== LANCE MANUAL ==== */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className={classNames(
                              'w-full rounded-xl border bg-zinc-950/60 px-3 py-2 text-sm tabular-nums outline-none',
                              (!isFinite(valorPropostoNum) || valorPropostoNum < minimoPermitido)
                                ? 'border-red-900/60 focus:ring-2 focus:ring-red-400/30'
                                : 'border-emerald-900/40 focus:ring-2 focus:ring-emerald-400/30'
                            )}
                            value={propostas[leilao.id] ?? String(minimoPermitido)}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d]/g, '')
                              setPropostas((prev) => ({ ...prev, [leilao.id]: raw }))
                            }}
                            placeholder={String(minimoPermitido)}
                            disabled={disabledPorTempo || disabledPorIdentidade}
                          />
                          <button
                            onClick={() =>
                              darLanceManual(leilao.id, leilao.valor_atual, valorPropostoNum, tempoRestante)
                            }
                            disabled={
                              disabledPorTempo ||
                              disabledPorIdentidade ||
                              disabledPorCooldown ||
                              !isFinite(valorPropostoNum) ||
                              valorPropostoNum < minimoPermitido ||
                              (saldo !== null && valorPropostoNum > Number(saldo))
                            }
                            className={classNames(
                              'shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition',
                              disabledPorTempo ||
                                disabledPorIdentidade ||
                                disabledPorCooldown ||
                                !isFinite(valorPropostoNum) ||
                                valorPropostoNum < minimoPermitido ||
                                (saldo !== null && valorPropostoNum > Number(saldo))
                                ? 'cursor-not-allowed border border-zinc-800 bg-zinc-900/60 text-zinc-500'
                                : 'border border-emerald-900/40 bg-emerald-600/90 text-white hover:bg-emerald-600'
                            )}
                            title={
                              disabledPorTempo
                                ? '⏱️ Leilão encerrado'
                                : disabledPorIdentidade
                                ? '🔐 Faça login novamente (time não identificado)'
                                : !isFinite(valorPropostoNum) || valorPropostoNum < minimoPermitido
                                ? `O lance deve ser pelo menos ${brl(minimoPermitido)}`
                                : saldo !== null && valorPropostoNum > Number(saldo)
                                ? '💸 Saldo insuficiente'
                                : disabledPorCooldown
                                ? '⏳ Aguarde um instante...'
                                : ''
                            }
                          >
                            Dar lance
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                          <span>
                            Mínimo permitido:{' '}
                            <b className="tabular-nums text-zinc-200">{brl(minimoPermitido)}</b>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPropostas((prev) => ({ ...prev, [leilao.id]: String(minimoPermitido) }))
                            }
                            className="rounded-lg border border-emerald-900/40 bg-emerald-950/40 px-2 py-1 font-semibold text-emerald-200 hover:bg-emerald-900/40"
                          >
                            +20mi (mínimo)
                          </button>
                        </div>
                      </div>

                      {/* ==== Botões de incremento ==== */}
                      <div className="mt-4">
                        <div className="grid grid-cols-3 gap-2">
                          {increments.map((inc) => {
                            const disabled =
                              tempoRestante === 0 ||
                              !!travadoPorIdentidade ||
                              cooldownGlobal ||
                              !!cooldownPorLeilao[leilao.id] ||
                              (saldo !== null && Number(leilao.valor_atual) + inc > saldo)

                            return (
                              <button
                                key={inc}
                                onClick={() => darLance(leilao.id, leilao.valor_atual, inc, tempoRestante)}
                                disabled={disabled}
                                title={
                                  tempoRestante === 0
                                    ? '⏱️ Leilão encerrado'
                                    : travadoPorIdentidade
                                    ? '🔐 Faça login novamente (time não identificado)'
                                    : saldo !== null && Number(leilao.valor_atual) + inc > saldo
                                    ? '💸 Saldo insuficiente'
                                    : cooldownGlobal || !!cooldownPorLeilao[leilao.id]
                                    ? '⏳ Aguarde um instante...'
                                    : ''
                                }
                                className={classNames(
                                  'rounded-xl px-3 py-2 text-xs font-bold tabular-nums transition',
                                  'border bg-zinc-950/60 hover:bg-zinc-900',
                                  'focus:outline-none focus:ring-2 focus:ring-emerald-400/30',
                                  disabled
                                    ? 'border-zinc-800 text-zinc-500 opacity-60'
                                    : 'border-emerald-900/40 text-emerald-200 hover:text-emerald-100'
                                )}
                              >
                                + {(inc / 1_000_000).toLocaleString()} mi
                              </button>
                            )
                          })}
                        </div>

                        {leilao.link_sofifa && (
                          <a
                            href={leilao.link_sofifa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-block text-xs text-cyan-300 underline hover:text-cyan-200"
                          >
                            🔗 Ver no Sofifa
                          </a>
                        )}
                      </div>

                      {tempoRestante === 0 && (
                        <button
                          onClick={() => finalizarLeilaoAgora(leilao.id)}
                          className="mt-4 w-full rounded-xl bg-red-600/90 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/30"
                        >
                          Finalizar Leilão
                        </button>
                      )}
                    </article>
                  </div>

                  {tempoRestante === 0 && (
                    <div className="pointer-events-none absolute -right-2 -top-2 rotate-3 rounded-lg border border-red-900/50 bg-red-950/70 px-2 py-1 text-[10px] font-semibold text-red-200 shadow">
                      ENCERRADO
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* keyframes (existentes + novos) */}
      <style jsx>{`
        /* usado pelo burst existente */
        @keyframes fadeout {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(1.3) translateY(-10px); }
        }

        /* toast global animado */
        @keyframes lfSlideIn {
          0% { transform: translateY(-12px) scale(.98); opacity: 0; }
          40% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes lfSlideOut {
          to { transform: translateY(-6px); opacity: 0; }
        }
        .lf-enter { animation: lfSlideIn .35s ease-out; }
        .lf-exit { animation: lfSlideOut .25s ease-in forwards; }

        @keyframes lfProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
        .lf-progress { animation: lfProgress 6s linear forwards; }

        /* === efeitos por botão === */
        /* flutuar pra cima (carinhas tristes) */
        @keyframes lfFloat {
          0% { transform: translateY(8px) scale(.98); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(-36px) scale(1); opacity: 0; }
        }
        .lf-float-slow { animation: lfFloat 1s ease-out forwards; }

        /* pop/elastic (morno) */
        @keyframes lfPop {
          0% { transform: scale(.6); opacity: 0; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        .lf-pop { animation: lfPop 1.1s cubic-bezier(.2, .8, .2, 1) forwards; }

        /* confete curto */
        @keyframes lfConfetti {
          0% { transform: translateY(-6px) rotate(-8deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(26px) rotate(12deg); opacity: 0; }
        }
        .lf-confetti { animation: lfConfetti 1.4s ease-out forwards; }

        /* fogo: tremula + sobe */
        @keyframes lfRise {
          0% { transform: translateY(8px) scale(.9); opacity: .2; }
          25% { opacity: .8; }
          100% { transform: translateY(-28px) scale(1.05); opacity: 0; }
        }
        @keyframes lfFlicker {
          0%, 100% { filter: drop-shadow(0 0 0px #ef4444); }
          50% { filter: drop-shadow(0 0 8px #f59e0b); }
        }
        .lf-fire { animation: lfRise 1.8s ease-out forwards, lfFlicker .6s ease-in-out infinite; }

        /* explosão: burst + brilhos + anel */
        @keyframes lfBurst {
          0% { transform: scale(.7); opacity: 0; }
          35% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
        .lf-burst { animation: lfBurst 1.4s cubic-bezier(.2,.8,.2,1) forwards; }

        @keyframes lfSparkle {
          0% { transform: translateY(0) scale(.8) rotate(0deg); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(-26px) scale(1.1) rotate(15deg); opacity: 0; }
        }
        .lf-sparkle { animation: lfSparkle 1.6s ease-out forwards; }

        @keyframes lfRing {
          0% { transform: translate(-50%, -50%) scale(.6); opacity: .4; }
          80% { opacity: .2; }
          100% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
        }
        .lf-ring { animation: lfRing 2.2s ease-out forwards; }
      `}</style>

      <div className="h-6 md:h-8" />
    </main>
  )
}
