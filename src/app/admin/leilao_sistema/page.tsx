'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'
import toast, { Toaster } from 'react-hot-toast'

// ✅ Ajuste o caminho se o seu componente estiver em outro lugar
import CardJogadorLeilao from '@/components/CardJogadorLeilao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_ATIVOS = 200
const INCREMENTO_MINIMO = 2_000_000 // +2mi
const LANCE_TOAST_ID = 'lance-unico'

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
  id_time_vencedor?: string | null
  fim: string
  criado_em: string
  status: 'ativo' | 'leiloado' | 'cancelado'
  anterior?: string | null
}

export default function LeilaoSistemaPage() {
  // identidade do time
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
  const [burst, setBurst] = useState<Record<string, boolean>>({})
  const [erroTela, setErroTela] = useState<string | null>(null)

  // sincronização de relógio
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervaloRef = useRef<NodeJS.Timeout | null>(null)

  // input manual por leilão
  const [propostas, setPropostas] = useState<Record<string, string>>({})

  // logos de times
  const [logos, setLogos] = useState<Record<string, string>>({})

  // admin
  const [isAdmin, setIsAdmin] = useState(false)
  const [finalizando, setFinalizando] = useState<Record<string, boolean>>({})

  // efeitos por botão
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

  const isTrue = (v: any) =>
    v === true ||
    v === 1 ||
    v === '1' ||
    (typeof v === 'string' && ['true', 't', 'yes', 'on'].includes(v.toLowerCase()))

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

  // parse de data estável
  const toMs = (v: any) => {
    if (!v) return NaN
    if (typeof v === 'string') {
      let s = v.trim()
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T')
      if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s = s + 'Z'
      return Date.parse(s)
    }
    return new Date(v).getTime()
  }

  // sincroniza relógio cliente/servidor
  async function syncServerClock() {
    try {
      const { data, error } = await supabase.rpc('servertime_ms')
      if (!error && typeof data === 'number') {
        const clientNow = Date.now()
        setServerOffsetMs(data - clientNow)
      }
    } catch {}
  }
  const nowServerMs = () => Date.now() + serverOffsetMs

  const normalizaEmail = (s?: string | null) => (s || '').trim().toLowerCase()

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
    } catch {}
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

  // ---------- TOAST helpers + dedupe ----------
  const prevLeiloesRef = useRef<Record<string, { valor: number; vencedor?: string | null; nome: string }>>({})
  const inicializadoRef = useRef(false)
  const lastToastValorRef = useRef<Record<string, number>>({})
  const orderRef = useRef<string[]>([])

  const showLanceToast = (quem: string | null | undefined, jogador: string | null | undefined, valor: number) => {
    toast(`${quem || 'Um time'} ofertou ${brl(valor)} em ${jogador || 'jogador'}`, {
      id: LANCE_TOAST_ID,
      position: 'top-center',
      duration: 4000,
    })
  }

  function efeitoPorDelta(leilaoId: string, delta: number) {
    if (delta > 20_000_000) acionarEfeito(leilaoId, 'explosao')
    else if (delta === 20_000_000) acionarEfeito(leilaoId, 'fogo')
    else if (delta >= 15_000_000) acionarEfeito(leilaoId, 'empolgado')
    else if (delta >= 6_000_000) acionarEfeito(leilaoId, 'morno')
    else acionarEfeito(leilaoId, 'sad')
  }

  const buscarLeiloesAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: true })
      .limit(MAX_ATIVOS)

    if (!error && data) {
      let arr = data.map((l: any) => ({ ...l, imagem_url: pickImagemUrl(l) || null })) as Leilao[]

      // fixa ordem
      if (!inicializadoRef.current || orderRef.current.length === 0) {
        orderRef.current = arr.map((l) => l.id)
      } else {
        for (const l of arr) if (!orderRef.current.includes(l.id)) orderRef.current.push(l.id)
        const idxMap = new Map(orderRef.current.map((id, i) => [id, i]))
        arr = arr
          .slice()
          .sort((a, b) => (idxMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idxMap.get(b.id) ?? Number.MAX_SAFE_INTEGER))
      }

      // toasts + efeitos por polling
      if (inicializadoRef.current) {
        for (const l of arr) {
          const prev = prevLeiloesRef.current[l.id]
          const novoValor = Number(l.valor_atual ?? 0)
          if (prev && novoValor > prev.valor) {
            if ((lastToastValorRef.current[l.id] || 0) < novoValor) {
              lastToastValorRef.current[l.id] = novoValor
              showLanceToast(l.nome_time_vencedor, l.nome, novoValor)
              efeitoPorDelta(l.id, novoValor - prev.valor)
            }
          }
        }
      }

      // beep quando você perde a liderança
      arr.forEach((leilao: any) => {
        if (leilao.nome_time_vencedor !== nomeTime && leilao.anterior === nomeTime) {
          audioRef.current?.play().catch(() => {})
        }
      })

      // snapshot
      const snapshot: Record<string, { valor: number; vencedor?: string | null; nome: string }> = {}
      for (const l of arr) snapshot[l.id] = { valor: Number(l.valor_atual ?? 0), vencedor: l.nome_time_vencedor, nome: l.nome }
      prevLeiloesRef.current = snapshot
      inicializadoRef.current = true

      setLeiloes(arr)

      setPropostas((prev) => {
        const next = { ...prev }
        for (const l of arr) {
          if (!next[l.id]) next[l.id] = String((l.valor_atual ?? 0) + INCREMENTO_MINIMO)
        }
        return next
      })
    }
  }

  useEffect(() => {
    carregarIdentidadeLocal()
    carregarLogosTimes()
    syncServerClock()
  }, [])

  useEffect(() => {
    garantirIdTimeValido()
  }, [nomeTime, idTime])

  // detectar admin
  useEffect(() => {
    let cancelled = false

    async function resolveIsAdmin() {
      if (process.env.NEXT_PUBLIC_FORCE_ADMIN === '1') {
        if (!cancelled) setIsAdmin(true)
        return
      }
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get('force_admin') === '1') {
          if (!cancelled) setIsAdmin(true)
          return
        }
      } catch {}

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const u = session?.user
        if (u && !cancelled) {
          const roles = ([] as string[])
            .concat((u.app_metadata?.roles as any) || [], (u.user_metadata?.roles as any) || [])
            .map(String)
            .map((s) => s.toLowerCase())
          const roleStr = String(u.app_metadata?.role || u.user_metadata?.role || '').toLowerCase()
          const metaFlag = isTrue(u.user_metadata?.is_admin) || isTrue(u.app_metadata?.is_admin)
          if (roleStr === 'admin' || roles.includes('admin') || metaFlag) {
            setIsAdmin(true)
            return
          }
        }
      } catch {}

      try {
        if (idTime && isUuid(idTime) && !cancelled) {
          const { data } = await supabase.from('times').select('is_admin, admin, role').eq('id', idTime).maybeSingle()
          const roleStr = String(data?.role || '').toLowerCase()
          if (isTrue(data?.is_admin) || isTrue(data?.admin) || roleStr === 'admin') {
            setIsAdmin(true)
            return
          }
        }
      } catch {}

      try {
        const { data: userData } = await supabase.auth.getUser()
        const emailAuth = normalizaEmail(userData?.user?.email)
        const emailLS1 = normalizaEmail(localStorage.getItem('email'))
        const emailLS2 = normalizaEmail(localStorage.getItem('Email'))
        let emailObj = ''
        try {
          const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
          if (raw) {
            const obj = JSON.parse(raw)
            emailObj = normalizaEmail(obj?.email || obj?.Email || obj?.e_mail)
          }
        } catch {}
        let emailURL = ''
        try {
          emailURL = normalizaEmail(new URL(window.location.href).searchParams.get('email'))
        } catch {}

        const email = emailAuth || emailLS1 || emailLS2 || emailObj || emailURL
        if (email) {
          localStorage.setItem('email', email)
          const { data, error } = await supabase.from('admins').select('email').ilike('email', email).maybeSingle()
          if (!cancelled && !error && data) {
            setIsAdmin(true)
            return
          }
        }
      } catch {}

      if (!cancelled) setIsAdmin(false)
    }

    resolveIsAdmin()
    return () => {
      cancelled = true
    }
  }, [idTime])

  useEffect(() => {
    ;(async () => {
      await Promise.all([buscarLeiloesAtivos(), buscarSaldo(), syncServerClock()])
      setCarregando(false)
    })()

    if (intervaloRef.current) clearInterval(intervaloRef.current)
    intervaloRef.current = setInterval(() => {
      buscarLeiloesAtivos()
      buscarSaldo()
      syncServerClock()
    }, 1000)

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTime, nomeTime])

  // realtime: notificação única + dedupe
  useEffect(() => {
    const channel = supabase
      .channel('leiloes_realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leiloes_sistema' }, (payload) => {
        const novo = payload.new as any
        const antigo = payload.old as any
        const aumentou = Number(novo?.valor_atual ?? 0) > Number(antigo?.valor_atual ?? 0)
        if (novo?.status !== 'ativo' || !aumentou) return

        const novoValor = Number(novo?.valor_atual ?? 0)
        if ((lastToastValorRef.current[novo.id] || 0) >= novoValor) return
        lastToastValorRef.current[novo.id] = novoValor

        showLanceToast(novo?.nome_time_vencedor, novo?.nome, novoValor)
        efeitoPorDelta(novo.id, novoValor - Number(antigo?.valor_atual ?? 0))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const travadoPorIdentidade = useMemo(() => {
    if (!idTime || !isUuid(idTime) || !nomeTime) return 'Identificação do time inválida. Faça login novamente.'
    return null
  }, [idTime, nomeTime])

  const formatarTempo = (segundos: number) => {
    const h = Math.floor(segundos / 3600)
    const min = Math.floor((segundos % 3600) / 60)
      .toString()
      .padStart(2, '0')
    const sec = Math.max(0, Math.floor(segundos % 60))
      .toString()
      .padStart(2, '0')
    return h > 0 ? `${h}:${min}:${sec}` : `${min}:${sec}`
  }

  const acionarAnimacao = (leilaoId: string) => {
    setTremores((prev) => ({ ...prev, [leilaoId]: true }))
    setBurst((prev) => ({ ...prev, [leilaoId]: true }))
    setTimeout(() => setBurst((prev) => ({ ...prev, [leilaoId]: false })), 700)
    setTimeout(() => setTremores((prev) => ({ ...prev, [leilaoId]: false })), 150)
  }

  // ações admin
  const excluirDoLeilao = async (leilaoId: string) => {
    if (!isAdmin) {
      alert('Ação restrita a administradores.')
      return
    }
    if (!confirm('Tem certeza que deseja excluir este item do leilão?')) return

    const { error } = await supabase.from('leiloes_sistema').update({ status: 'cancelado' }).eq('id', leilaoId)

    if (error) toast.error('Erro ao excluir: ' + (error.message || ''))
    else {
      toast.success('Leilão excluído.')
      await buscarLeiloesAtivos()
    }
  }

  async function finalizarLeilao(leilaoId: string) {
    if (!isAdmin) return
    setFinalizando((p) => ({ ...p, [leilaoId]: true }))
    try {
      const { data, error } = await supabase.from('leiloes_sistema').select('fim').eq('id', leilaoId).single()
      if (error) throw new Error('Erro ao validar fim do leilão.')
      const fimMs = toMs(data?.fim)
      const agoraSrv = nowServerMs()
      if (fimMs - agoraSrv > 0) {
        toast.error('Ainda não chegou a 0s no servidor.')
        return
      }
      const { error: e2 } = await supabase.from('leiloes_sistema').update({ status: 'leiloado' }).eq('id', leilaoId)
      if (e2) throw new Error(e2.message)
      toast.success('Leilão finalizado!')
      await buscarLeiloesAtivos()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao finalizar.')
    } finally {
      setFinalizando((p) => ({ ...p, [leilaoId]: false }))
    }
  }

  // ===== LANCES =====
  async function darLanceManual(leilaoId: string, valorAtual: number, valorProposto: number) {
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
      setErroTela('Saldo insuficiente.')
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

      const fimMs = toMs(atual.fim)
      const agoraSrv = nowServerMs()
      if (isNaN(fimMs) || fimMs - agoraSrv <= 0) throw new Error('Leilão encerrado.')

      const incremento = novoValor - Number(atual.valor_atual ?? valorAtual)
      if (incremento < INCREMENTO_MINIMO) throw new Error(`O lance deve ser pelo menos ${brl(INCREMENTO_MINIMO)} acima.`)

      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: idTime,
        p_nome_time_vencedor: nomeTime,
        p_estender: (fimMs - agoraSrv) / 1000 < 15,
      })
      if (error) throw new Error(error.message || 'Falha ao registrar lance.')

      toast.success(`Lance registrado: ${brl(novoValor)}`, { id: LANCE_TOAST_ID })
      efeitoPorDelta(leilaoId, incremento)

      await buscarLeiloesAtivos()
      await buscarSaldo()
      setPropostas((prev) => ({ ...prev, [leilaoId]: String(novoValor + INCREMENTO_MINIMO) }))
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
      toast.error(err?.message || 'Erro ao dar lance.', { id: LANCE_TOAST_ID })
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => setCooldownPorLeilao((p) => ({ ...p, [leilaoId]: false })), 150)
    }
  }

  async function darLance(leilaoId: string, valorAtual: number, incremento: number) {
    setErroTela(null)
    await garantirIdTimeValido()
    if (travadoPorIdentidade) {
      setErroTela(travadoPorIdentidade)
      return
    }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const novoValor = Number(valorAtual) + Number(incremento)
    if (saldo !== null && novoValor > saldo) {
      setErroTela('Saldo insuficiente.')
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

      const fimMs = toMs(atual.fim)
      const agoraSrv = nowServerMs()
      if (isNaN(fimMs) || fimMs - agoraSrv <= 0) throw new Error('Leilão encerrado.')

      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: idTime,
        p_nome_time_vencedor: nomeTime,
        p_estender: (fimMs - agoraSrv) / 1000 < 15,
      })
      if (error) throw new Error(error.message || 'Falha ao registrar lance.')

      toast.success(`Lance registrado: ${brl(novoValor)}`, { id: LANCE_TOAST_ID })
      efeitoPorDelta(leilaoId, incremento)

      await buscarLeiloesAtivos()
      await buscarSaldo()
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
      toast.error(err?.message || 'Erro ao dar lance.', { id: LANCE_TOAST_ID })
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: false })), 150)
    }
  }

  // ================== RENDER ==================
  return (
    <main className="min-h-screen bg-neutral-950 text-zinc-100">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#0a0a0a', color: '#e5e7eb', border: '1px solid #27272a' },
        }}
      />

      <header className="sticky top-0 z-20 border-b border-zinc-900/80 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-400 shadow ring-1 ring-emerald-400/30" />
              <h1 className="text-lg font-semibold tracking-tight">
                Leilão do Sistema <span className="ml-2 align-middle text-[11px] text-zinc-400">relógio sincronizado</span>
              </h1>
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

              {isAdmin && (
                <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                  Modo Admin
                </span>
              )}

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
        {carregando ? (
          <div className="grid grid-cols-1 gap-4 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5" />
            ))}
          </div>
        ) : leiloes.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <h3 className="text-base font-semibold">Nenhum leilão ativo</h3>
            <p className="mt-1 text-sm text-zinc-400">Volte em instantes ou verifique com o administrador.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
            {leiloes.map((leilao, index) => {
              const serverNow = nowServerMs()
              const tempoFinal = toMs(leilao.fim)
              const tempoInicio = toMs(leilao.criado_em)

              let tempoRestante = Math.floor((tempoFinal - serverNow) / 1000)
              if (!isFinite(tempoRestante) || tempoRestante < 0) tempoRestante = 0

              const totalMs = Math.max(0, tempoFinal - tempoInicio)
              const remMs = Math.max(0, tempoFinal - serverNow)
              const pctRestante = totalMs > 0 ? Math.min(100, Math.max(0, (remMs / totalMs) * 100)) : 0

              const minimoPermitido = (leilao.valor_atual ?? 0) + INCREMENTO_MINIMO
              const valorPropostoNum = Math.floor(Number(propostas[leilao.id] ?? minimoPermitido))

              const vencedor = leilao.nome_time_vencedor || ''
              const logoVencedor = vencedor ? logos[vencedor] : undefined

              const disabledPorIdentidade = !!travadoPorIdentidade
              const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]
              const disabledPorTempo = tempoRestante === 0

              const barraCor =
                tempoRestante === 0 ? 'bg-red-500' : tempoRestante <= 15 ? 'bg-amber-400' : 'bg-emerald-500'

              return (
                <div key={leilao.id} className="relative group">
                  {/* ✅ AGORA USANDO O CardJogadorLeilao */}
                  <CardJogadorLeilao
                    // identificação
                    leilaoId={leilao.id}
                    titulo={`Leilão #${index + 1}`}
                    encerrado={disabledPorTempo}
                    tempoRestanteTexto={tempoRestante === 0 ? 'Encerrado' : formatarTempo(tempoRestante)}
                    pctRestante={pctRestante}
                    barraClassName={barraCor}
                    tremor={!!tremores[leilao.id]}
                    burst={!!burst[leilao.id]}
                    efeito={efeito[leilao.id]}
                    isAdmin={isAdmin}
                    onExcluir={() => excluirDoLeilao(leilao.id)}
                    onFinalizar={() => finalizarLeilao(leilao.id)}
                    finalizarDisabled={!!finalizando[leilao.id] || tempoRestante > 0}
                    finalizarLoading={!!finalizando[leilao.id]}
                    // jogador
                    jogador={{
                      nome: leilao.nome,
                      posicao: leilao.posicao,
                      overall: leilao.overall,
                      nacionalidade: leilao.nacionalidade ?? null,
                      imagem_url: leilao.imagem_url ?? null,
                      link_sofifa: leilao.link_sofifa ?? null,
                      valor_atual: leilao.valor_atual,
                      tierClassName: tierBadge(leilao.valor_atual),
                    }}
                    // vencedor
                    vencedor={
                      leilao.nome_time_vencedor
                        ? {
                            nome: leilao.nome_time_vencedor,
                            logoUrl: logoVencedor,
                          }
                        : null
                    }
                    // lance manual
                    lanceManual={{
                      value: propostas[leilao.id] ?? String(minimoPermitido),
                      minimo: minimoPermitido,
                      invalido: !isFinite(valorPropostoNum) || valorPropostoNum < minimoPermitido,
                      saldoInsuficiente: saldo !== null && valorPropostoNum > Number(saldo),
                      disabled: disabledPorIdentidade,
                      onChange: (raw) => {
                        const onlyDigits = raw.replace(/[^\d]/g, '')
                        setPropostas((prev) => ({ ...prev, [leilao.id]: onlyDigits }))
                      },
                      onSubmit: () => darLanceManual(leilao.id, leilao.valor_atual, valorPropostoNum),
                      submitDisabled:
                        disabledPorIdentidade ||
                        disabledPorCooldown ||
                        disabledPorTempo ||
                        !isFinite(valorPropostoNum) ||
                        valorPropostoNum < minimoPermitido ||
                        (saldo !== null && valorPropostoNum > Number(saldo)),
                      onSetMinimo: () =>
                        setPropostas((prev) => ({ ...prev, [leilao.id]: String(minimoPermitido) })),
                      brl,
                    }}
                    // increments
                    incrementos={{
                      list: [4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000] as const,
                      disabledBase: disabledPorIdentidade || disabledPorCooldown || disabledPorTempo,
                      saldo: saldo,
                      valorAtual: leilao.valor_atual,
                      onClick: (inc) => darLance(leilao.id, leilao.valor_atual, inc),
                    }}
                  />

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

      {/* keyframes (mantidos) */}
      <style jsx>{`
        @keyframes fadeout {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(1.3) translateY(-10px); }
        }
        @keyframes lfFloat { 0% { transform: translateY(8px) scale(.98); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-36px) scale(1); opacity: 0; } }
        .lf-float-slow { animation: lfFloat 1s ease-out forwards; }

        @keyframes lfPop { 0% { transform: scale(.6); opacity: 0; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
        .lf-pop { animation: lfPop 1.1s cubic-bezier(.2, .8, .2, 1) forwards; }

        @keyframes lfConfetti { 0% { transform: translateY(-6px) rotate(-8deg); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(26px) rotate(12deg); opacity: 0; } }
        .lf-confetti { animation: lfConfetti 1.4s ease-out forwards; }

        @keyframes lfRise { 0% { transform: translateY(8px) scale(.9); opacity: .2; } 25% { opacity: .8; } 100% { transform: translateY(-28px) scale(1.05); opacity: 0; } }
        @keyframes lfFlicker { 0%, 100% { filter: drop-shadow(0 0 0px #ef4444); } 50% { filter: drop-shadow(0 0 8px #f59e0b); } }
        .lf-fire { animation: lfRise 1.8s ease-out forwards, lfFlicker .6s ease-in-out infinite; }

        @keyframes lfBurst { 0% { transform: scale(.7); opacity: 0; } 35% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 0; } }
        .lf-burst { animation: lfBurst 1.4s cubic-bezier(.2,.8,.2,1) forwards; }

        @keyframes lfSparkle { 0% { transform: translateY(0) scale(.8) rotate(0deg); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-26px) scale(1.1) rotate(15deg); opacity: 0; } }
        .lf-sparkle { animation: lfSparkle 1.6s ease-out forwards; }

        @keyframes lfRing { 0% { transform: translate(-50%, -50%) scale(.6); opacity: .4; } 80% { opacity: .2; } 100% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; } }
        .lf-ring { animation: lfRing 2.2s ease-out forwards; }

        .ad-100 { animation-delay: .1s !important; }
        .ad-150 { animation-delay: .15s !important; }
        .ad-200 { animation-delay: .2s !important; }
      `}</style>

      <div className="h-6 md:h-8" />
    </main>
  )
}

// ==== estilos auxiliares usados no tierBadge ====
function tierBadge(valor: number) {
  if (valor >= 1_500_000_000) return 'text-fuchsia-300 border-fuchsia-900/40 bg-fuchsia-950/30'
  if (valor >= 1_000_000_000) return 'text-blue-300 border-blue-900/40 bg-blue-950/30'
  if (valor >= 500_000_000) return 'text-emerald-300 border-emerald-900/40 bg-emerald-950/30'
  if (valor >= 250_000_000) return 'text-amber-300 border-amber-900/40 bg-amber-950/30'
  return 'text-emerald-200 border-emerald-900/30 bg-emerald-950/20'
}
