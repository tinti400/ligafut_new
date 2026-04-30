'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'
import toast, { Toaster } from 'react-hot-toast'

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

type FiltroLeilao = 'todos' | 'meus' | 'terminando' | 'sem_lance' | 'mais_caros'

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

  // sincronização relógio
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
  const [filtroLeilao, setFiltroLeilao] = useState<FiltroLeilao>('todos')

  // efeitos por leilão (vira ReactNode pro card)
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

  // ---------- utils ----------
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
        const url = normalizeUrl((t as any).logo_url)
        if ((t as any).nome && url) map[(t as any).nome] = url
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
      let arr = (data as any[]).map((l: any) => ({ ...l, imagem_url: pickImagemUrl(l) || null })) as Leilao[]

      // fixa ordem
      if (!inicializadoRef.current || orderRef.current.length === 0) {
        orderRef.current = arr.map((l) => l.id)
      } else {
        for (const l of arr) if (!orderRef.current.includes(l.id)) orderRef.current.push(l.id)
        const idxMap = new Map(orderRef.current.map((id, i) => [id, i]))
        arr = arr
          .slice()
          .sort(
            (a, b) =>
              (idxMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (idxMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
          )
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
      for (const l of arr)
        snapshot[l.id] = {
          valor: Number(l.valor_atual ?? 0),
          vencedor: l.nome_time_vencedor,
          nome: l.nome,
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const { data } = await supabase
            .from('times')
            .select('is_admin, admin, role')
            .eq('id', idTime)
            .maybeSingle()
          const roleStr = String((data as any)?.role || '').toLowerCase()
          if (isTrue((data as any)?.is_admin) || isTrue((data as any)?.admin) || roleStr === 'admin') {
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

  // efeitos (vira overlay pro card novo)
  const efeitoOverlay = (leilaoId: string) => {
    const e = efeito[leilaoId]
    if (!e) return null

    const common = 'pointer-events-none absolute inset-0 flex items-center justify-center select-none'
    const key = `${leilaoId}-${e.key}`

    if (e.tipo === 'sad')
      return (
        <div key={key} className={common}>
          <div className="lf-float-slow text-3xl">😐</div>
        </div>
      )
    if (e.tipo === 'morno')
      return (
        <div key={key} className={common}>
          <div className="lf-pop text-3xl">✨</div>
        </div>
      )
    if (e.tipo === 'empolgado')
      return (
        <div key={key} className={common}>
          <div className="lf-confetti text-3xl">🎉</div>
        </div>
      )
    if (e.tipo === 'fogo')
      return (
        <div key={key} className={common}>
          <div className="lf-fire text-3xl">🔥</div>
        </div>
      )
    return (
      <div key={key} className={common}>
        <div className="lf-ring text-3xl">💥</div>
      </div>
    )
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
      const fimMs = toMs((data as any)?.fim)
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
      if ((atual as any).status !== 'ativo') throw new Error('Leilão não está mais ativo.')

      const fimMs = toMs((atual as any).fim)
      const agoraSrv = nowServerMs()
      if (isNaN(fimMs) || fimMs - agoraSrv <= 0) throw new Error('Leilão encerrado.')

      const incremento = novoValor - Number((atual as any).valor_atual ?? valorAtual)
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
      if ((atual as any).status !== 'ativo') throw new Error('Leilão não está mais ativo.')

      const fimMs = toMs((atual as any).fim)
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


  const calcularTempoRestante = (leilao: Leilao) => {
    const tempoFinal = toMs(leilao.fim)
    const restante = Math.floor((tempoFinal - nowServerMs()) / 1000)
    return Number.isFinite(restante) ? Math.max(0, restante) : 0
  }

  const leiloesFiltrados = useMemo(() => {
    const base = [...leiloes]

    if (filtroLeilao === 'meus') {
      return base.filter((l) => l.id_time_vencedor === idTime || l.nome_time_vencedor === nomeTime)
    }

    if (filtroLeilao === 'terminando') {
      return base
        .filter((l) => calcularTempoRestante(l) <= 30)
        .sort((a, b) => calcularTempoRestante(a) - calcularTempoRestante(b))
    }

    if (filtroLeilao === 'sem_lance') {
      return base.filter((l) => !l.id_time_vencedor && !l.nome_time_vencedor)
    }

    if (filtroLeilao === 'mais_caros') {
      return base.sort((a, b) => Number(b.valor_atual || 0) - Number(a.valor_atual || 0))
    }

    return base
  }, [leiloes, filtroLeilao, idTime, nomeTime, serverOffsetMs])

  const topLeiloes = useMemo(() => {
    return [...leiloes]
      .sort((a, b) => Number(b.valor_atual || 0) - Number(a.valor_atual || 0))
      .slice(0, 5)
  }, [leiloes])

  const totalValorAtivo = useMemo(() => {
    return leiloes.reduce((acc, l) => acc + Number(l.valor_atual || 0), 0)
  }, [leiloes])

  const leiloesTerminando = useMemo(() => {
    return leiloes.filter((l) => calcularTempoRestante(l) <= 30).length
  }, [leiloes, serverOffsetMs])

  const meusLeiloes = useMemo(() => {
    return leiloes.filter((l) => l.id_time_vencedor === idTime || l.nome_time_vencedor === nomeTime).length
  }, [leiloes, idTime, nomeTime])

  const filtroBtn = (id: FiltroLeilao, label: string, desc: string) => (
    <button
      type="button"
      onClick={() => setFiltroLeilao(id)}
      className={classNames(
        'rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]',
        filtroLeilao === id
          ? 'border-emerald-300/50 bg-emerald-400 text-black shadow-[0_0_30px_rgba(16,185,129,.22)]'
          : 'border-white/10 bg-white/[0.055] text-white hover:bg-white/[0.09]'
      )}
    >
      <div className="text-sm font-black">{label}</div>
      <div className={classNames('mt-0.5 text-[11px]', filtroLeilao === id ? 'text-black/65' : 'text-white/45')}>
        {desc}
      </div>
    </button>
  )

  // ================== RENDER ==================
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-zinc-100">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#070707', color: '#f4f4f5', border: '1px solid rgba(255,255,255,.12)' },
        }}
      />

      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(16,185,129,.28),transparent_35%),radial-gradient(circle_at_85%_10%,rgba(250,204,21,.18),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,.16),transparent_40%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.55),rgba(0,0,0,.9),#000)]" />
        <div className="absolute inset-0 opacity-[0.16] bg-[linear-gradient(rgba(255,255,255,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.09)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/55 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-emerald-400/15 shadow-[0_0_30px_rgba(16,185,129,.25)]">
                <span className="text-xl">⚡</span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black tracking-tight sm:text-2xl">
                  LEILÃO AO VIVO <span className="text-emerald-300">LIGAFUT</span>
                </h1>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  relógio sincronizado • lances em tempo real • disputa por elenco
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                💳 Saldo: <b className="ml-1 tabular-nums text-white">{brl(saldo ?? undefined)}</b>
              </div>

              {nomeTime && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/75">
                  🛡️ Time: <b className="text-white">{nomeTime}</b>
                </div>
              )}

              {isAdmin && (
                <span className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-200">
                  Modo Admin
                </span>
              )}
            </div>
          </div>

          {travadoPorIdentidade && (
            <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-100">
              ⚠️ {travadoPorIdentidade}
            </div>
          )}

          {erroTela && (
            <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              ⚠️ {erroTela}
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-4 pt-5">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(16,185,129,.20),rgba(255,255,255,.06)_48%,rgba(250,204,21,.13))] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-yellow-200/25 bg-yellow-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-yellow-100">
                Central de arremates
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
                Leilão do <span className="bg-gradient-to-r from-emerald-300 via-yellow-200 to-lime-300 bg-clip-text text-transparent">Sistema</span>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
                Dispute jogadores em tempo real, acompanhe os maiores lances e acelere nos últimos segundos.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[640px]">
              <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Ativos</div>
                <div className="mt-1 text-3xl font-black text-white">{leiloes.length}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Terminando</div>
                <div className="mt-1 text-3xl font-black text-red-200">{leiloesTerminando}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Meus lances</div>
                <div className="mt-1 text-3xl font-black text-emerald-200">{meusLeiloes}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/35 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Volume</div>
                <div className="mt-1 truncate text-xl font-black text-yellow-100">{brl(totalValorAtivo)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {filtroBtn('todos', 'Todos', `${leiloes.length} leilões`)}
              {filtroBtn('meus', 'Meus lances', `${meusLeiloes} liderando`)}
              {filtroBtn('terminando', 'Terminando', 'até 30s')}
              {filtroBtn('sem_lance', 'Sem lance', 'oportunidade')}
              {filtroBtn('mais_caros', 'Mais caros', 'ranking')}
            </div>
          </div>

          {carregando ? (
            <div className="grid grid-cols-1 gap-5 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[520px] animate-pulse rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-2xl" />
              ))}
            </div>
          ) : leiloes.length === 0 ? (
            <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-2xl backdrop-blur-xl">
              <div className="text-4xl">🏟️</div>
              <h3 className="mt-3 text-lg font-black">Nenhum leilão ativo</h3>
              <p className="mt-1 text-sm text-white/50">Volte em instantes ou verifique com o administrador.</p>
            </div>
          ) : leiloesFiltrados.length === 0 ? (
            <div className="mx-auto max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-2xl backdrop-blur-xl">
              <div className="text-4xl">🔎</div>
              <h3 className="mt-3 text-lg font-black">Nada encontrado nesse filtro</h3>
              <p className="mt-1 text-sm text-white/50">Troque o filtro para ver outros leilões ativos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
              {leiloesFiltrados.map((leilao, index) => {
                const serverNow = nowServerMs()
                const tempoFinal = toMs(leilao.fim)
                const tempoInicio = toMs(leilao.criado_em)

                let tempoRestante = Math.floor((tempoFinal - serverNow) / 1000)
                if (!isFinite(tempoRestante) || tempoRestante < 0) tempoRestante = 0

                const totalMs = Math.max(0, tempoFinal - tempoInicio)
                const remMs = Math.max(0, tempoFinal - serverNow)
                const pctRestante =
                  totalMs > 0 ? Math.min(100, Math.max(0, (remMs / totalMs) * 100)) : 0

                const minimoPermitido = (leilao.valor_atual ?? 0) + INCREMENTO_MINIMO
                const vencedor = leilao.nome_time_vencedor || ''
                const logoVencedor = vencedor ? logos[vencedor] : undefined
                const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]

                return (
                  <div
                    key={leilao.id}
                    className={classNames(
                      'relative rounded-[2rem] transition duration-300',
                      tempoRestante <= 15 && 'shadow-[0_0_35px_rgba(239,68,68,.20)]',
                      leilao.id_time_vencedor === idTime && 'ring-2 ring-emerald-300/45 shadow-[0_0_35px_rgba(16,185,129,.18)]'
                    )}
                  >
                    {tempoRestante <= 15 && (
                      <div className="pointer-events-none absolute -inset-1 rounded-[2.15rem] bg-gradient-to-r from-red-500/35 via-yellow-300/30 to-red-500/35 blur-xl" />
                    )}
                    <CardJogadorLeilao
                      leilao={leilao}
                      index={index}
                      travadoPorIdentidade={travadoPorIdentidade}
                      saldo={saldo}
                      isAdmin={isAdmin}
                      tempoRestante={tempoRestante}
                      pctRestante={pctRestante}
                      disabledPorCooldown={disabledPorCooldown}
                      tremendo={!!tremores[leilao.id]}
                      burst={!!burst[leilao.id]}
                      efeitoOverlay={efeitoOverlay(leilao.id)}
                      minimoPermitido={minimoPermitido}
                      valorProposto={propostas[leilao.id] ?? String(minimoPermitido)}
                      setValorProposto={(v) => {
                        const onlyDigits = String(v || '').replace(/[^\d]/g, '')
                        setPropostas((prev) => ({ ...prev, [leilao.id]: onlyDigits }))
                      }}
                      logoVencedor={logoVencedor}
                      onDarLanceManual={(valorPropostoNumCard) =>
                        darLanceManual(leilao.id, leilao.valor_atual, valorPropostoNumCard)
                      }
                      onDarLanceInc={(inc) => darLance(leilao.id, leilao.valor_atual, inc)}
                      onResetMinimo={() =>
                        setPropostas((prev) => ({ ...prev, [leilao.id]: String(minimoPermitido + 20_000_000) }))
                      }
                      onExcluir={isAdmin ? () => excluirDoLeilao(leilao.id) : undefined}
                      onFinalizar={isAdmin ? () => finalizarLeilao(leilao.id) : undefined}
                      finalizando={!!finalizando[leilao.id]}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black">🏆 Maiores lances</h3>
                <p className="text-xs text-white/45">Top 5 em andamento</p>
              </div>
              <span className="rounded-full border border-yellow-200/20 bg-yellow-300/10 px-3 py-1 text-[11px] font-black text-yellow-100">
                LIVE
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {topLeiloes.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/45">
                  Sem lances ativos.
                </div>
              ) : (
                topLeiloes.map((l, i) => (
                  <div key={l.id} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-white">
                          #{i + 1} {l.nome}
                        </div>
                        <div className="truncate text-xs text-white/45">{l.nome_time_vencedor || 'Sem líder'}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-black text-emerald-200">{brl(l.valor_atual)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <h3 className="text-lg font-black">🔥 Modo urgência</h3>
            <p className="mt-1 text-sm text-white/50">
              Quando faltar menos de 15 segundos, o card ganha brilho vermelho para chamar atenção e evitar perder o lance.
            </p>
          </div>
        </aside>
      </section>

      {/* keyframes */}
      <style jsx>{`
        @keyframes fadeout {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(1.3) translateY(-10px);
          }
        }
        @keyframes lfFloat {
          0% {
            transform: translateY(8px) scale(0.98);
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translateY(-36px) scale(1);
            opacity: 0;
          }
        }
        .lf-float-slow {
          animation: lfFloat 1s ease-out forwards;
        }

        @keyframes lfPop {
          0% {
            transform: scale(0.6);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        .lf-pop {
          animation: lfPop 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes lfConfetti {
          0% {
            transform: translateY(-6px) rotate(-8deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translateY(26px) rotate(12deg);
            opacity: 0;
          }
        }
        .lf-confetti {
          animation: lfConfetti 1.4s ease-out forwards;
        }

        @keyframes lfRise {
          0% {
            transform: translateY(8px) scale(0.9);
            opacity: 0.2;
          }
          25% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-28px) scale(1.05);
            opacity: 0;
          }
        }
        @keyframes lfFlicker {
          0%,
          100% {
            filter: drop-shadow(0 0 0px #ef4444);
          }
          50% {
            filter: drop-shadow(0 0 8px #f59e0b);
          }
        }
        .lf-fire {
          animation: lfRise 1.8s ease-out forwards, lfFlicker 0.6s ease-in-out infinite;
        }

        @keyframes lfBurst {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          35% {
            transform: scale(1.15);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0;
          }
        }
        .lf-burst {
          animation: lfBurst 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes lfSparkle {
          0% {
            transform: translateY(0) scale(0.8) rotate(0deg);
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translateY(-26px) scale(1.1) rotate(15deg);
            opacity: 0;
          }
        }
        .lf-sparkle {
          animation: lfSparkle 1.6s ease-out forwards;
        }

        @keyframes lfRing {
          0% {
            transform: translate(-50%, -50%) scale(0.6);
            opacity: 0.4;
          }
          80% {
            opacity: 0.2;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0;
          }
        }
        .lf-ring {
          animation: lfRing 2.2s ease-out forwards;
        }

        @keyframes lfPulseUrgent {
          0%, 100% { box-shadow: 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 26px rgba(239,68,68,.28); }
        }
        .lf-urgent {
          animation: lfPulseUrgent 1s ease-in-out infinite;
        }
      `}</style>

      <div className="h-6 md:h-8" />
    </main>
  )
}

