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

const MAX_ATIVOS = 200
const INCREMENTO_MINIMO = 20_000_000 // +20mi

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
  const [burst, setBurst] = useState<Record<string, boolean>>({})
  const [erroTela, setErroTela] = useState<string | null>(null)

  // sincronização de relógio com o servidor
  const [serverOffsetMs, setServerOffsetMs] = useState<number>(0) // serverNow - clientNow

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervaloRef = useRef<NodeJS.Timeout | null>(null)

  // input manual por leilão
  const [propostas, setPropostas] = useState<Record<string, string>>({})

  // logos de times (nome -> url)
  const [logos, setLogos] = useState<Record<string, string>>({})

  // ===== admin =====
  const [isAdmin, setIsAdmin] = useState(false)
  const [finalizando, setFinalizando] = useState<Record<string, boolean>>({})

  // ===== efeitos por botão =====
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
    v === true || v === 1 || v === '1' || (typeof v === 'string' && ['true', 't', 'yes', 'on'].includes(v.toLowerCase()))

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

  // ===== parse de data estável =====
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

  // ===== sincroniza relógio cliente/servidor =====
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

  // ---------- TOAST helpers + fallback por diff ----------
  const prevLeiloesRef = useRef<Record<string, { valor: number; vencedor?: string | null; nome: string }>>({})
  const inicializadoRef = useRef(false)
  const lastToastValorRef = useRef<Record<string, number>>({})

  const showLanceToast = (quem: string | null | undefined, jogador: string | null | undefined, valor: number) => {
    toast.custom(
      (t) => (
        <div
          className={`pointer-events-auto w-[min(92vw,520px)] overflow-hidden rounded-2xl border border-emerald-700/30 bg-neutral-950/95 shadow-lg ${t.visible ? 'lf-enter' : 'lf-exit'}`}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-600/20">📢</div>
            <div className="flex-1 text-sm leading-5">
              <b>{quem || 'Um time'}</b> enviou{' '}
              <b>
                {Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              </b>{' '}
              no <b>{jogador || 'jogador'}</b>
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
      const arr = data.map((l: any) => ({
        ...l,
        imagem_url: pickImagemUrl(l) || null,
      })) as Leilao[]

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

      arr.forEach((leilao: any) => {
        if (leilao.nome_time_vencedor !== nomeTime && leilao.anterior === nomeTime) {
          audioRef.current?.play().catch(() => {})
        }
      })

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

  // ===== detectar admin (robusto) =====
  useEffect(() => {
    let cancelled = false

    async function resolveIsAdmin() {
      if (process.env.NEXT_PUBLIC_FORCE_ADMIN === '1') {
        if (!cancelled) setIsAdmin(true); return
      }
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get('force_admin') === '1') {
          if (!cancelled) setIsAdmin(true); return
        }
      } catch {}

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const u = session?.user
        if (u && !cancelled) {
          const roles = ([] as string[]).concat(
            (u.app_metadata?.roles as any) || [],
            (u.user_metadata?.roles as any) || []
          ).map(String).map(s => s.toLowerCase())
          const roleStr = String(u.app_metadata?.role || u.user_metadata?.role || '').toLowerCase()
          const metaFlag = isTrue(u.user_metadata?.is_admin) || isTrue(u.app_metadata?.is_admin)
          if (roleStr === 'admin' || roles.includes('admin') || metaFlag) { setIsAdmin(true); return }
        }
      } catch {}

      try {
        if (idTime && isUuid(idTime) && !cancelled) {
          const { data } = await supabase.from('times').select('is_admin, admin, role').eq('id', idTime).maybeSingle()
          const roleStr = String(data?.role || '').toLowerCase()
          if (isTrue(data?.is_admin) || isTrue(data?.admin) || roleStr === 'admin') { setIsAdmin(true); return }
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
          if (!cancelled && !error && data) { setIsAdmin(true); return }
        }
      } catch {}

      if (!cancelled) setIsAdmin(false)
    }

    resolveIsAdmin()
    return () => { cancelled = true }
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

  // ==== Realtime: toast quando valor_atual subir (dedupe) ====
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

          const novoValor = Number(novo?.valor_atual ?? 0)
          if ((lastToastValorRef.current[novo.id] || 0) >= novoValor) return
          lastToastValorRef.current[novo.id] = novoValor

          showLanceToast(novo?.nome_time_vencedor, novo?.nome, novoValor)
          efeitoPorDelta(novo.id, novoValor - Number(antigo?.valor_atual ?? 0))
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

  // ===== gradiente do card a cada 50 mi =====
  const CARD_GRADIENTS = [
    'from-emerald-500/40 via-emerald-400/25 to-emerald-300/20',
    'from-emerald-400/45 via-teal-400/30 to-cyan-400/20',
    'from-teal-400/45 via-cyan-400/30 to-sky-400/20',
    'from-cyan-400/45 via-sky-400/30 to-blue-400/20',
    'from-sky-400/45 via-blue-500/30 to-indigo-500/20',
    'from-blue-500/45 via-indigo-500/30 to-violet-500/20',
    'from-indigo-500/45 via-violet-500/30 to-fuchsia-500/20',
    'from-violet-500/45 via-fuchsia-500/30 to-pink-500/20',
    'from-fuchsia-500/45 via-pink-500/30 to-rose-500/20',
    'from-pink-500/45 via-rose-500/30 to-red-500/20',
    'from-rose-500/45 via-red-500/30 to-orange-500/20',
    'from-red-500/45 via-orange-500/30 to-amber-500/20',
    'from-orange-500/45 via-amber-500/30 to-yellow-500/20',
    'from-amber-500/45 via-yellow-400/30 to-lime-400/20',
    'from-yellow-400/45 via-lime-400/30 to-emerald-400/20',
    'from-lime-400/45 via-emerald-400/30 to-teal-400/20',
    'from-emerald-600/40 via-teal-500/30 to-cyan-500/20',
    'from-teal-500/45 via-cyan-500/30 to-sky-500/20',
    'from-cyan-500/45 via-sky-500/30 to-blue-500/20',
    'from-sky-500/45 via-blue-600/30 to-indigo-600/20',
    'from-blue-600/45 via-indigo-600/30 to-violet-600/20',
    'from-indigo-600/45 via-violet-600/30 to-fuchsia-600/20',
    'from-violet-600/45 via-fuchsia-600/30 to-pink-600/20',
    'from-fuchsia-600/45 via-pink-600/30 to-rose-600/20',
    'from-pink-600/45 via-rose-600/30 to-red-600/20',
    'from-rose-600/45 via-red-600/30 to-orange-600/20',
    'from-red-600/45 via-orange-600/30 to-amber-600/20',
    'from-orange-600/45 via-amber-600/30 to-yellow-600/20',
    'from-amber-600/45 via-yellow-500/30 to-lime-500/20',
    'from-yellow-500/45 via-lime-500/30 to-emerald-500/20',
    'from-lime-500/45 via-emerald-500/30 to-teal-500/20',
    'from-emerald-700/40 via-teal-600/30 to-cyan-600/20',
    'from-teal-600/45 via-cyan-600/30 to-sky-600/20',
    'from-cyan-600/45 via-sky-600/30 to-blue-600/20',
    'from-sky-600/45 via-blue-700/30 to-indigo-700/20',
    'from-blue-700/45 via-indigo-700/30 to-violet-700/20',
    'from-indigo-700/45 via-violet-700/30 to-fuchsia-700/20',
    'from-violet-700/45 via-fuchsia-700/30 to-pink-700/20',
    'from-fuchsia-700/45 via-pink-700/30 to-rose-700/20',
    'from-rose-700/45 via-red-700/30 to-orange-700/20',
    'from-red-700/45 via-orange-700/30 to-amber-700/20',
  ] as const
  const gradIndexForValor = (v: number) => {
    const idx = Math.floor((v || 0) / 50_000_000)
    return Math.max(0, Math.min(idx, CARD_GRADIENTS.length - 1))
  }

  const tierBadge = (valor: number) => {
    if (valor >= 1_500_000_000) return 'text-fuchsia-300 border-fuchsia-900/40 bg-fuchsia-950/30'
    if (valor >= 1_000_000_000) return 'text-blue-300 border-blue-900/40 bg-blue-950/30'
    if (valor >= 500_000_000) return 'text-emerald-300 border-emerald-900/40 bg-emerald-950/30'
    if (valor >= 250_000_000) return 'text-amber-300 border-amber-900/40 bg-amber-950/30'
    return 'text-emerald-200 border-emerald-900/30 bg-emerald-950/20'
  }

  const travadoPorIdentidade = useMemo(() => {
    if (!idTime || !isUuid(idTime) || !nomeTime)
      return 'Identificação do time inválida. Faça login novamente.'
    return null
  }, [idTime, nomeTime])

  const acionarAnimacao = (leilaoId: string) => {
    setTremores((prev) => ({ ...prev, [leilaoId]: true }))
    setBurst((prev) => ({ ...prev, [leilaoId]: true }))
    setTimeout(() => setBurst((prev) => ({ ...prev, [leilaoId]: false })), 700)
    setTimeout(() => setTremores((prev) => ({ ...prev, [leilaoId]: false })), 150)
  }

  // ===== ações admin =====
  const excluirDoLeilao = async (leilaoId: string) => {
    if (!isAdmin) { alert('Ação restrita a administradores.'); return }
    if (!confirm('Tem certeza que deseja excluir este item do leilão?')) return

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'cancelado' })
      .eq('id', leilaoId)

    if (error) toast.error('Erro ao excluir: ' + (error.message || ''))
    else { toast.success('Leilão excluído.'); await buscarLeiloesAtivos() }
  }

  async function finalizarLeilao(leilaoId: string) {
    if (!isAdmin) return
    setFinalizando(p => ({ ...p, [leilaoId]: true }))
    try {
      const { data, error } = await supabase
        .from('leiloes_sistema')
        .select('fim')
        .eq('id', leilaoId)
        .single()
      if (error) throw new Error('Erro ao validar fim do leilão.')
      const fimMs = toMs(data?.fim)
      const agoraSrv = nowServerMs()
      if (fimMs - agoraSrv > 0) {
        toast.error('Ainda não chegou a 0s no servidor.')
        return
      }
      const { error: e2 } = await supabase
        .from('leiloes_sistema')
        .update({ status: 'leiloado' })
        .eq('id', leilaoId)
      if (e2) throw new Error(e2.message)
      toast.success('Leilão finalizado!')
      await buscarLeiloesAtivos()
    } catch (e:any) {
      toast.error(e?.message || 'Erro ao finalizar.')
    } finally {
      setFinalizando(p => ({ ...p, [leilaoId]: false }))
    }
  }

  // ===== LANCES =====
  async function darLanceManual(leilaoId: string, valorAtual: number, valorProposto: number) {
    setErroTela(null)
    await garantirIdTimeValido()
    if (travadoPorIdentidade) { setErroTela(travadoPorIdentidade); return }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const minimo = Number(valorAtual) + INCREMENTO_MINIMO
    const novoValor = Math.floor(Number(valorProposto) || 0)
    if (!isFinite(novoValor) || novoValor < minimo) {
      setErroTela(`O lance mínimo é ${brl(minimo)}.`); return
    }
    if (saldo !== null && novoValor > saldo) { setErroTela('Saldo insuficiente.'); return }

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

      efeitoPorDelta(leilaoId, incremento)
      await buscarLeiloesAtivos()
      await buscarSaldo()
      setPropostas((prev) => ({ ...prev, [leilaoId]: String(novoValor + INCREMENTO_MINIMO) }))
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => setCooldownPorLeilao((p) => ({ ...p, [leilaoId]: false })), 150)
    }
  }

  async function darLance(leilaoId: string, valorAtual: number, incremento: number) {
    setErroTela(null)
    await garantirIdTimeValido()
    if (travadoPorIdentidade) { setErroTela(travadoPorIdentidade); return }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const novoValor = Number(valorAtual) + Number(incremento)
    if (saldo !== null && novoValor > saldo) { setErroTela('Saldo insuficiente.'); return }

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

      efeitoPorDelta(leilaoId, incremento)
      await buscarLeiloesAtivos()
      await buscarSaldo()
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: false })), 150)
    }
  }

  // ================== RENDER ==================
  return (
    <main className="min-h-screen bg-neutral-950 text-zinc-100">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      {/* Toaster global */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 6000,
          style: { background: '#0a0a0a', color: '#e5e7eb', border: '1px solid #27272a' },
        }}
      />

      {/* Header fixo */}
      <header className="sticky top-0 z-20 border-b border-zinc-900/80 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-400 shadow ring-1 ring-emerald-400/30" />
              <h1 className="text-lg font-semibold tracking-tight">
                Leilão do Sistema
                <span className="ml-2 align-middle text-[11px] text-zinc-400">relógio sincronizado</span>
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
            {Array.from({ length: MAX_ATIVOS }).map((_, i) => (
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

              const disabledPorTempo = tempoRestante === 0
              const disabledPorIdentidade = !!travadoPorIdentidade
              const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]

              const minimoPermitido = (leilao.valor_atual ?? 0) + INCREMENTO_MINIMO
              const valorPropostoNum = Math.floor(Number(propostas[leilao.id] ?? minimoPermitido))

              const vencedor = leilao.nome_time_vencedor || ''
              const logoVencedor = vencedor ? logos[vencedor] : undefined

              const gradIdx = gradIndexForValor(leilao.valor_atual)
              const barraCor =
                tempoRestante === 0 ? 'bg-red-500' : tempoRestante <= 15 ? 'bg-amber-400' : 'bg-emerald-500'

              return (
                <div key={leilao.id} className="relative group">
                  <div className={classNames('rounded-2xl bg-gradient-to-br p-[1px] shadow-[0_0_0_1px_rgba(0,0,0,.5)]', CARD_GRADIENTS[gradIdx])}>
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

                      {/* efeitos */}
                      {burst[leilao.id] && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="animate-[fadeout_0.7s_ease_forwards] select-none text-2xl">💥✨🔥</div>
                        </div>
                      )}
                      {efeito[leilao.id] && (
                        <div key={efeito[leilao.id].key} className="pointer-events-none absolute inset-0">
                          {efeito[leilao.id].tipo === 'sad' && (
                            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-3 text-2xl">
                              <span className="lf-float-slow opacity-80">😕</span>
                              <span className="lf-float-slow ad-100 opacity-80">🙁</span>
                              <span className="lf-float-slow ad-200 opacity-80">😞</span>
                            </div>
                          )}
                          {efeito[leilao.id].tipo === 'morno' && (
                            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3 text-2xl">
                              <span className="lf-pop opacity-90">👍</span>
                              <span className="lf-pop ad-100 opacity-90">👏</span>
                              <span className="lf-pop ad-200 opacity-90">🙂</span>
                            </div>
                          )}
                          {efeito[leilao.id].tipo === 'empolgado' && (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="relative">
                                <span className="lf-confetti block text-2xl">🎉</span>
                                <span className="lf-confetti ad-100 absolute -left-8 -top-2 text-xl">✨</span>
                                <span className="lf-confetti ad-200 absolute -right-8 -top-1 text-xl">🎉</span>
                              </div>
                            </div>
                          )}
                          {efeito[leilao.id].tipo === 'fogo' && (
                            <div className="absolute inset-x-0 bottom-2 flex items-end justify-center gap-2 text-2xl">
                              <span className="lf-fire">🔥</span>
                              <span className="lf-fire ad-100">🔥</span>
                              <span className="lf-fire ad-200">🔥</span>
                            </div>
                          )}
                          {efeito[leilao.id].tipo === 'explosao' && (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="relative">
                                <span className="lf-burst text-3xl">💥</span>
                                <span className="lf-sparkle ad-100 absolute -left-10 -top-2 text-2xl">✨</span>
                                <span className="lf-sparkle ad-200 absolute -right-10 -top-3 text-2xl">✨</span>
                                <span className="lf-ring absolute left-1/2 top-1/2 -z-10 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/40" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* barra de tempo */}
                      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/70">
                        <div
                          className={classNames('h-full transition-[width] duration-1000', barraCor)}
                          style={{ width: `${pctRestante}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-zinc-300">Leilão #{index + 1}</h2>
                        <span
                          className={classNames(
                            'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px]',
                            tempoRestante === 0
                              ? 'border-red-900/60 bg-red-950/40 text-red-200'
                              : 'border-emerald-900/40 bg-emerald-950/40 text-emerald-200'
                          )}
                        >
                          {tempoRestante === 0 ? 'Encerrado' : 'Termina em'}
                          {tempoRestante > 0 && <b className="tabular-nums">{formatarTempo(tempoRestante)}</b>}
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
                            {leilao.nome_time_vencedor && (
                              <span className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                                👑
                                {logoVencedor ? (
                                  <img
                                    src={logoVencedor}
                                    alt={leilao.nome_time_vencedor}
                                    className="h-4 w-4 rounded-full object-cover"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                  />
                                ) : (
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-200">
                                    {leilao.nome_time_vencedor.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span>{leilao.nome_time_vencedor}</span>
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
                            disabled={disabledPorIdentidade}
                          />
                          <button
                            onClick={() => darLanceManual(leilao.id, leilao.valor_atual, valorPropostoNum)}
                            disabled={
                              disabledPorIdentidade ||
                              disabledPorCooldown ||
                              !isFinite(valorPropostoNum) ||
                              valorPropostoNum < minimoPermitido ||
                              (saldo !== null && valorPropostoNum > Number(saldo))
                            }
                            className={classNames(
                              'shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition',
                              disabledPorIdentidade ||
                              disabledPorCooldown ||
                              !isFinite(valorPropostoNum) ||
                              valorPropostoNum < minimoPermitido ||
                              (saldo !== null && valorPropostoNum > Number(saldo))
                                ? 'cursor-not-allowed border border-zinc-800 bg-zinc-900/60 text-zinc-500'
                                : 'border border-emerald-900/40 bg-emerald-600/90 text-white hover:bg-emerald-600'
                            )}
                          >
                            Dar lance
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                          <span>
                            Mínimo permitido: <b className="tabular-nums text-zinc-200">{brl(minimoPermitido)}</b>
                          </span>
                          <button
                            type="button"
                            onClick={() => setPropostas((prev) => ({ ...prev, [leilao.id]: String(minimoPermitido) }))}
                            className="rounded-lg border border-emerald-900/40 bg-emerald-950/40 px-2 py-1 font-semibold text-emerald-200 hover:bg-emerald-900/40"
                          >
                            +20mi (mínimo)
                          </button>
                        </div>
                      </div>

                      {/* ==== Botões de incremento ==== */}
                      <div className="mt-4">
                        <div className="grid grid-cols-3 gap-2">
                          {([4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000] as const).map((inc) => {
                            const disabled =
                              !!travadoPorIdentidade ||
                              cooldownGlobal ||
                              !!cooldownPorLeilao[leilao.id] ||
                              (saldo !== null && Number(leilao.valor_atual) + inc > saldo)

                            return (
                              <button
                                key={inc}
                                onClick={() => darLance(leilao.id, leilao.valor_atual, inc)}
                                disabled={disabled}
                                className={classNames(
                                  'rounded-xl px-3 py-2 text-xs font-bold tabular-nums transition',
                                  'border bg-zinc-950/60 hover:bg-zinc-900',
                                  'focus:outline-none focus:ring-2 focus:ring-emerald-400/30',
                                  disabled
                                    ? 'border-zinc-800 text-zinc-500 opacity-60'
                                    : 'border-emerald-900/40 text-emerald-200 hover:text-emerald-100'
                                )}
                                title={disabled ? 'Indisponível no momento' : undefined}
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

                      {/* ===== Botão Finalizar (sempre visível p/ admin; habilita quando server<=0s) ===== */}
                      {isAdmin && (
                        <div className="mt-4">
                          <button
                            onClick={() => finalizarLeilao(leilao.id)}
                            disabled={finalizando[leilao.id] || tempoRestante > 0}
                            className={classNames(
                              'w-full rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2',
                              finalizando[leilao.id] || tempoRestante > 0
                                ? 'bg-zinc-900/60 text-zinc-400 border border-zinc-800 cursor-not-allowed'
                                : 'bg-red-600/90 text-white hover:bg-red-600 border border-red-700/40 focus:ring-red-400/30'
                            )}
                            title={
                              tempoRestante > 0
                                ? 'Aguarde o relógio do servidor zerar'
                                : 'Finaliza e marca como leiloado'
                            }
                          >
                            {finalizando[leilao.id] ? 'Finalizando…' : 'Finalizar Leilão'}
                          </button>
                        </div>
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

      {/* keyframes */}
      <style jsx>{`
        @keyframes fadeout {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(1.3) translateY(-10px); }
        }
        @keyframes lfSlideIn { 0% { transform: translateY(-12px) scale(.98); opacity: 0; } 40% { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes lfSlideOut { to { transform: translateY(-6px); opacity: 0; } }
        .lf-enter { animation: lfSlideIn .35s ease-out; }
        .lf-exit { animation: lfSlideOut .25s ease-in forwards; }
        @keyframes lfProgress { from { width: 100%; } to { width: 0%; } }
        .lf-progress { animation: lfProgress 6s linear forwards; }

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


