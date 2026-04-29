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
  status: 'ativo' | 'leiloado' | 'concluido' | 'cancelado'
  anterior?: string | null

  // ✅ tolerar colunas vindas do banco/planilha
  foto?: string | null
  imagem?: string | null
  url_foto?: string | null
  foto_url?: string | null
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
  const [autoFinalizados, setAutoFinalizados] = useState<Record<string, boolean>>({})
  const [somLigado, setSomLigado] = useState(true)
  const [vitoriaLeilao, setVitoriaLeilao] = useState<Leilao | null>(null)

  // filtros
  const [busca, setBusca] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [overallMin, setOverallMin] = useState<number | ''>('')
  const [valorMax, setValorMax] = useState<number | ''>('')

  // efeitos por leilão
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

  // ✅ transforma link do SoFIFA em URL direta de imagem (quando possível)
  const sofifaToCdnImage = (link?: string | null) => {
    const s = String(link || '').trim()
    if (!s) return ''

    // já é imagem?
    if (/\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(s) && /^https?:\/\//i.test(s)) return normalizeUrl(s)

    // pega id do jogador: /player/272505/...
    const m = s.match(/\/player\/(\d+)/i)
    if (!m) return ''
    const id = m[1]

    // padrão que costuma funcionar
    return `https://cdn.sofifa.net/players/${id}/${id}_120.png`
  }

  // ✅ pega imagem em ordem de prioridade:
  // 1) imagem_url (banco)
  // 2) foto (planilha) e variações
  // 3) link_sofifa (gera uma URL CDN)
  const pickImagemUrl = (row: any) => {
    const keys = [
      // antigo
      'imagem_url',
      'Imagem_url',
      'Imagem URL',
      'imagem URL',
      'imagemURL',
      'url_imagem',
      'URL_Imagem',

      // ✅ planilha
      'foto',
      'Foto',
      'foto_url',
      'Foto_url',
      'url_foto',
      'URL_Foto',
      'imagem',
      'Imagem',
    ]

    for (const k of keys) {
      if (row?.[k]) {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }

    // tolerar nome com espaços/variação
    for (const k in row || {}) {
      const kk = String(k || '').replace(/\s+/g, '').toLowerCase()
      if (kk === 'imagem_url' || kk === 'foto' || kk === 'foto_url' || kk === 'url_foto') {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }

    // fallback por sofifa
    const fromSofifa = sofifaToCdnImage(row?.link_sofifa)
    if (fromSofifa) return fromSofifa

    return ''
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

  async function registrarBidLeilao({
    leilao,
    tipo_evento,
    descricao,
    id_time1,
    valor,
  }: {
    leilao: Partial<Leilao>
    tipo_evento: string
    descricao: string
    id_time1?: string | null
    valor?: number | null
  }) {
    try {
      const { error } = await supabase.from('bid').insert({
        tipo_evento,
        descricao,
        id_time1: id_time1 || null,
        valor: valor ?? null,
        id_jogador: leilao.id || null,
        nome_jogador: leilao.nome || null,
        foto_jogador_url: leilao.imagem_url || leilao.foto || null,
        data_evento: new Date().toISOString(),
      })

      if (error) console.warn('⚠️ BID não registrado:', error)
    } catch (e) {
      console.warn('⚠️ Erro inesperado ao registrar BID:', e)
    }
  }

  async function registrarMovimentacaoLeilao({
    id_time,
    valor,
    descricao,
  }: {
    id_time: string
    valor: number
    descricao: string
  }) {
    try {
      const { error } = await supabase.from('movimentacoes').insert({
        id_time,
        tipo: 'saida',
        valor,
        descricao,
        data: new Date().toISOString(),
      })

      if (error) console.warn('⚠️ Movimentação não registrada:', error)
    } catch (e) {
      console.warn('⚠️ Erro inesperado em movimentações:', e)
    }
  }

  async function registrarHistoricoLance({
    leilaoId,
    valor,
    idTimeLance,
    nomeTimeLance,
  }: {
    leilaoId: string
    valor: number
    idTimeLance?: string | null
    nomeTimeLance?: string | null
  }) {
    // Opcional: só funciona se existir a tabela lances_leilao.
    try {
      const { error } = await supabase.from('lances_leilao').insert({
        id_leilao: leilaoId,
        id_time: idTimeLance || null,
        nome_time: nomeTimeLance || null,
        valor,
        criado_em: new Date().toISOString(),
      })

      if (error) console.warn('⚠️ Histórico de lance não registrado:', error.message)
    } catch (e) {
      console.warn('⚠️ Histórico de lance indisponível:', e)
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
      let arr = (data as any[]).map((l: any) => {
        const img = pickImagemUrl(l)
        return { ...l, imagem_url: img || null }
      }) as Leilao[]

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
          if (somLigado) audioRef.current?.play().catch(() => {})
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


  // finalização automática: quando zerar, envia jogador ao elenco, debita saldo e publica no BID
  useEffect(() => {
    if (!leiloes.length) return

    const expirados = leiloes.filter((l) => {
      const tempoRestante = Math.floor((toMs(l.fim) - nowServerMs()) / 1000)
      return tempoRestante <= 0 && l.status === 'ativo' && !autoFinalizados[l.id]
    })

    expirados.forEach((l) => {
      finalizarLeilao(l.id, true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leiloes, serverOffsetMs, autoFinalizados, idTime])

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

  async function finalizarLeilao(leilaoId: string, automatico = false) {
    if (!automatico && !isAdmin) return

    if (finalizando[leilaoId] || autoFinalizados[leilaoId]) return

    setFinalizando((p) => ({ ...p, [leilaoId]: true }))
    setAutoFinalizados((p) => ({ ...p, [leilaoId]: true }))

    try {
      const leilaoLocal = leiloes.find((l) => l.id === leilaoId) || null

      const { data, error } = await supabase.rpc('finalizar_leilao_sistema', {
        p_leilao_id: String(leilaoId),
      })

      if (error) {
        console.error('Erro RPC finalizar_leilao_sistema:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          raw: JSON.stringify(error),
        })
        throw new Error(error.message || error.details || 'Erro ao finalizar leilão no banco.')
      }

      const resp = data as any

      if (!resp?.ok) {
        if (!automatico) {
          toast.error(resp?.erro || 'Leilão não finalizado.')
        }

        setAutoFinalizados((p) => {
          const next = { ...p }
          delete next[leilaoId]
          return next
        })

        return
      }

      if (resp?.cancelado) {
        toast('Leilão expirado sem lances.', { icon: '⏱️' })
        await buscarLeiloesAtivos()
        return
      }

      if (resp?.ja_finalizado) {
        await buscarLeiloesAtivos()
        return
      }

      if (resp?.leiloado || resp?.concluido) {
        const leilaoVitoria =
          leilaoLocal ||
          ({
            id: leilaoId,
            nome: resp.nome_jogador || 'Jogador',
            posicao: '',
            overall: 0,
            valor_atual: Number(resp.valor_final || 0),
            id_time_vencedor: resp.id_time_vencedor,
            nome_time_vencedor: resp.nome_time_vencedor,
            fim: new Date().toISOString(),
            criado_em: new Date().toISOString(),
            status: 'concluido',
          } as Leilao)

        if (resp.id_time_vencedor === idTime) {
          setVitoriaLeilao(leilaoVitoria)
          setTimeout(() => setVitoriaLeilao(null), 3200)
        }

        toast.success(
          `Leilão finalizado: ${resp.nome_jogador || leilaoVitoria.nome} foi para ${resp.nome_time_vencedor || 'o vencedor'}.`
        )

        await Promise.all([buscarLeiloesAtivos(), buscarSaldo()])
      }
    } catch (e: any) {
      console.error('Erro ao finalizar leilão:', e)

      if (!automatico) toast.error(e?.message || 'Erro ao finalizar.')

      setAutoFinalizados((p) => {
        const next = { ...p }
        delete next[leilaoId]
        return next
      })
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
      await registrarHistoricoLance({ leilaoId, valor: novoValor, idTimeLance: idTime, nomeTimeLance: nomeTime })
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
      await registrarHistoricoLance({ leilaoId, valor: novoValor, idTimeLance: idTime, nomeTimeLance: nomeTime })
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


  const leiloesFiltrados = useMemo(() => {
    return leiloes.filter((l) => {
      const texto = `${l.nome || ''} ${l.posicao || ''} ${l.nacionalidade || ''}`.toLowerCase()
      const buscaOk = !busca || texto.includes(busca.toLowerCase())
      const posOk = !filtroPosicao || l.posicao === filtroPosicao
      const overallOk = overallMin === '' || Number(l.overall || 0) >= Number(overallMin)
      const valorOk = valorMax === '' || Number(l.valor_atual || 0) <= Number(valorMax)
      return buscaOk && posOk && overallOk && valorOk
    })
  }, [leiloes, busca, filtroPosicao, overallMin, valorMax])

  const posicoesDisponiveis = useMemo(() => {
    return Array.from(new Set(leiloes.map((l) => l.posicao).filter(Boolean))).sort()
  }, [leiloes])

  const leilaoMaisCaro = useMemo(() => {
    if (!leiloes.length) return null
    return leiloes.reduce((a, b) => (Number(b.valor_atual || 0) > Number(a.valor_atual || 0) ? b : a), leiloes[0])
  }, [leiloes])

  const leilaoAcabando = useMemo(() => {
    const ativos = leiloes
      .map((l) => ({ ...l, restante: Math.max(0, Math.floor((toMs(l.fim) - nowServerMs()) / 1000)) }))
      .filter((l) => l.restante > 0)
      .sort((a, b) => a.restante - b.restante)

    return ativos[0] || null
  }, [leiloes, serverOffsetMs])

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
                Leilão do Sistema{' '}
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

              <button
                type="button"
                onClick={() => setSomLigado((v) => !v)}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                title="Ligar/desligar som"
              >
                {somLigado ? '🔊 Som ligado' : '🔇 Som desligado'}
              </button>

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


      <section className="mx-auto w-full max-w-6xl px-4 pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Ativos</p>
            <h3 className="mt-1 text-2xl font-black">{leiloes.length}</h3>
          </div>

          <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300/60">Mais caro</p>
            <h3 className="mt-1 truncate text-2xl font-black text-emerald-200">{leilaoMaisCaro ? brl(leilaoMaisCaro.valor_atual) : '—'}</h3>
            <p className="mt-1 truncate text-xs text-emerald-100/50">{leilaoMaisCaro?.nome || 'Sem leilões'}</p>
          </div>

          <div className="rounded-2xl border border-yellow-900/40 bg-yellow-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-yellow-300/60">Acabando</p>
            <h3 className="mt-1 truncate text-2xl font-black text-yellow-200">{leilaoAcabando ? `${leilaoAcabando.restante}s` : '—'}</h3>
            <p className="mt-1 truncate text-xs text-yellow-100/50">{leilaoAcabando?.nome || 'Sem contagem'}</p>
          </div>

          <div className="rounded-2xl border border-cyan-900/40 bg-cyan-950/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/60">Exibindo</p>
            <h3 className="mt-1 text-2xl font-black text-cyan-200">{leiloesFiltrados.length}</h3>
            <p className="mt-1 text-xs text-cyan-100/50">Após filtros</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar jogador..."
              className="rounded-xl border border-zinc-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />

            <select
              value={filtroPosicao}
              onChange={(e) => setFiltroPosicao(e.target.value)}
              className="rounded-xl border border-zinc-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Todas posições</option>
              {posicoesDisponiveis.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={overallMin}
              onChange={(e) => setOverallMin(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="OVR mínimo"
              className="rounded-xl border border-zinc-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />

            <input
              type="number"
              value={valorMax}
              onChange={(e) => setValorMax(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Valor máximo"
              className="rounded-xl border border-zinc-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
          </div>

          {(busca || filtroPosicao || overallMin !== '' || valorMax !== '') && (
            <button
              type="button"
              onClick={() => {
                setBusca('')
                setFiltroPosicao('')
                setOverallMin('')
                setValorMax('')
              }}
              className="mt-3 rounded-xl border border-zinc-800 bg-neutral-950 px-4 py-2 text-sm hover:bg-zinc-900"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4">
        {carregando ? (
          <div className="grid grid-cols-1 gap-4 [@media(min-width:520px)]:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5" />
            ))}
          </div>
        ) : leiloesFiltrados.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
            <h3 className="text-base font-semibold">Nenhum leilão ativo</h3>
            <p className="mt-1 text-sm text-zinc-400">Volte em instantes ou verifique com o administrador.</p>
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
              const pctRestante = totalMs > 0 ? Math.min(100, Math.max(0, (remMs / totalMs) * 100)) : 0

              const minimoPermitido = (leilao.valor_atual ?? 0) + INCREMENTO_MINIMO

              const vencedor = leilao.nome_time_vencedor || ''
              const logoVencedor = vencedor ? logos[vencedor] : undefined

              const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]

              return (
                <CardJogadorLeilao
                  key={leilao.id}
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
                  valorProposto={String(propostas[leilao.id] ?? minimoPermitido)}
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
                  onFinalizar={isAdmin ? () => finalizarLeilao(leilao.id, false) : undefined}
                  finalizando={!!finalizando[leilao.id]}
                />
              )
            })}
          </div>
        )}
      </section>


      {vitoriaLeilao && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-md">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_42%)] animate-pulse" />

          <div className="relative animate-[lfWinReveal_0.8s_ease-out]">
            <div className="absolute -inset-10 rounded-full bg-emerald-400/20 blur-3xl animate-pulse" />

            <div className="relative rounded-[2.4rem] bg-gradient-to-br from-emerald-200 via-cyan-400 to-emerald-900 p-[3px] shadow-[0_0_95px_rgba(16,185,129,0.45)]">
              <div className="relative overflow-hidden rounded-[2.25rem] bg-[#07111f] p-6 text-center">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-emerald-200">
                  Leilão vencido
                </p>

                <div className="mx-auto mt-5 h-44 w-44 overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-inner">
                  {vitoriaLeilao.imagem_url ? (
                    <img
                      src={vitoriaLeilao.imagem_url}
                      alt={vitoriaLeilao.nome}
                      className="h-full w-full object-cover animate-[lfCardFloat_1.3s_ease-in-out_infinite]"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-6xl">👤</div>
                  )}
                </div>

                <h2 className="mt-5 text-3xl font-black text-white">{vitoriaLeilao.nome}</h2>
                <p className="mt-1 text-emerald-300 font-bold">entrou no seu elenco</p>

                <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                  💰 Valor final: {brl(vitoriaLeilao.valor_atual)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* keyframes */}
      <style jsx>{`
        @keyframes lfWinReveal {
          0% {
            transform: scale(0.45) rotate(-8deg);
            opacity: 0;
            filter: blur(8px);
          }
          55% {
            transform: scale(1.12) rotate(2deg);
            opacity: 1;
            filter: blur(0);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes lfCardFloat {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-8px) scale(1.04);
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
      `}</style>

      <div className="h-6 md:h-8" />
    </main>
  )
}
