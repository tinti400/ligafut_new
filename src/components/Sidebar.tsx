'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

type GroupKey = 'clube' | 'competicoes' | 'mercado' | 'admin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const HEADER_H = 74

const safe = (v: any) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const fmtBRL0 = (n: number) =>
  n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

const fmtInt = (n: number) => n.toLocaleString('pt-BR')

const clamp99 = (n: number) => (n > 99 ? '99+' : String(n))

const isEmail = (s: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

async function checarAdmin(pIdent: string) {
  const ident = String(pIdent || '').trim().toLowerCase()
  if (!ident) return false

  const { data, error } = await supabase.rpc('is_admin', { p_email: ident })
  if (error) return false

  return data === true
}

function pegarIdentidadeLocalStorage(): { email: string; usuario: string } {
  const tryParse = (k: string) => {
    const s = localStorage.getItem(k)
    if (!s) return null
    try {
      return JSON.parse(s)
    } catch {
      return null
    }
  }

  const u1 = tryParse('user')
  const u2 = tryParse('usuario')
  const u3 = tryParse('auth')

  const rawEmail =
    localStorage.getItem('email') ||
    localStorage.getItem('user_email') ||
    ''

  const rawUsuario =
    localStorage.getItem('usuario_nome') ||
    localStorage.getItem('username') ||
    ''

  const email = String(
    u1?.email ||
      u2?.email ||
      u3?.email ||
      rawEmail ||
      u1?.usuario ||
      u2?.usuario ||
      ''
  ).trim()

  const usuario = String(
    u1?.usuario ||
      u2?.usuario ||
      rawUsuario ||
      u1?.login ||
      u2?.login ||
      ''
  ).trim()

  return { email, usuario }
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(true)
  const [headerVisible, setHeaderVisible] = useState(true)

  const [abrirClube, setAbrirClube] = useState(true)
  const [abrirCompeticoes, setAbrirCompeticoes] = useState(true)
  const [abrirMercado, setAbrirMercado] = useState(true)
  const [abrirAdmin, setAbrirAdmin] = useState(false)

  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [logado, setLogado] = useState(false)
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [saldoTime, setSaldoTime] = useState(0)
  const [moedas, setMoedas] = useState(0)
  const [totalSalarios, setTotalSalarios] = useState(0)
  const [dividaEmprestimos, setDividaEmprestimos] = useState(0)
  const [valorParcela, setValorParcela] = useState(0)
  const [parcelasRestantes, setParcelasRestantes] = useState<number | null>(null)

  const [countRecebidas, setCountRecebidas] = useState(0)
  const [countEnviadas, setCountEnviadas] = useState(0)

  const isActive = useCallback(
    (href: string) => {
      if (!pathname) return false
      if (href === '/') return pathname === '/'
      return pathname === href || pathname.startsWith(href + '/')
    },
    [pathname]
  )

  useEffect(() => {
    try {
      const open = localStorage.getItem('sb_open')
      if (open !== null) setIsOpen(open === '1')

      const hv = localStorage.getItem('sb_header_visible')
      if (hv !== null) setHeaderVisible(hv === '1')

      setAbrirClube(localStorage.getItem('sb_g_clube') !== '0')
      setAbrirCompeticoes(localStorage.getItem('sb_g_competicoes') !== '0')
      setAbrirMercado(localStorage.getItem('sb_g_mercado') !== '0')
      setAbrirAdmin(localStorage.getItem('sb_g_admin') === '1')
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('sb_open', isOpen ? '1' : '0')
    } catch {}
  }, [isOpen])

  const persistGroup = (key: GroupKey, open: boolean) => {
    try {
      localStorage.setItem(`sb_g_${key}`, open ? '1' : '0')
    } catch {}
  }

  const setHeaderPersist = (v: boolean) => {
    setHeaderVisible(v)
    try {
      localStorage.setItem('sb_header_visible', v ? '1' : '0')
    } catch {}
  }

  useEffect(() => {
    const getIdTime = (): string | null => {
      const direct = localStorage.getItem('id_time') || localStorage.getItem('time_id')
      if (direct) return direct

      const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')

      if (userStr) {
        try {
          const u = JSON.parse(userStr)
          return u?.id_time || u?.time_id || u?.time?.id || null
        } catch {}
      }

      return null
    }

    const id = getIdTime()
    setIdTime(id)
    setLogado(!!id || !!localStorage.getItem('usuario_id'))

    setCountRecebidas(safe(localStorage.getItem('propostas_recebidas_count')))
    setCountEnviadas(safe(localStorage.getItem('propostas_enviadas_count')))

    const moedasLS =
      Number(localStorage.getItem('moedas')) ||
      (() => {
        const s = localStorage.getItem('user') || localStorage.getItem('usuario')
        if (!s) return 0
        try {
          const j = JSON.parse(s)
          return Number(j?.moedas || 0)
        } catch {
          return 0
        }
      })()

    setMoedas(safe(moedasLS))

    ;(async () => {
      setCheckingAdmin(true)

      try {
        const { email, usuario } = pegarIdentidadeLocalStorage()
        const identPreferido = isEmail(email) ? email : usuario || email
        const ok = await checarAdmin(identPreferido)

        setIsAdmin(ok)

        if (!ok) {
          setAbrirAdmin(false)
          persistGroup('admin', false)
        }
      } catch {
        setIsAdmin(false)
        setAbrirAdmin(false)
        persistGroup('admin', false)
      } finally {
        setCheckingAdmin(false)
      }
    })()
  }, [])

  const getFirstNumber = (row: any, keys: string[]) => {
    for (const k of keys) {
      if (row?.[k] != null && Number(row[k]) >= 0) return safe(row[k])
    }
    return 0
  }

  useEffect(() => {
    ;(async () => {
      let timeRow: any = null

      if (idTime) {
        const r1 = await supabase
          .from('times')
          .select('id, nome, tecnico, saldo, logo, logo_url, moedas')
          .eq('id', idTime)
          .maybeSingle()

        if (!r1.error && r1.data) timeRow = r1.data
      }

      if (!timeRow) {
        let tecnicoLS: string | null = null

        try {
          const s = localStorage.getItem('user') || localStorage.getItem('usuario')
          if (s) {
            const j = JSON.parse(s)
            tecnicoLS = j?.tecnico || j?.nome || null
          }
        } catch {}

        if (tecnicoLS) {
          const r2 = await supabase
            .from('times')
            .select('id, nome, tecnico, saldo, logo, logo_url, moedas')
            .eq('tecnico', tecnicoLS)
            .limit(1)
            .maybeSingle()

          if (!r2.error && r2.data) timeRow = r2.data
        }
      }

      if (timeRow) {
        setNomeTime(timeRow.nome || '')
        setSaldoTime(Number(timeRow.saldo) || 0)
        setLogoUrl(timeRow.logo || timeRow.logo_url || null)

        if (timeRow.moedas != null) setMoedas(Number(timeRow.moedas) || 0)
        if (!idTime || idTime !== timeRow.id) setIdTime(timeRow.id)

        const { data: elenco } = await supabase
          .from('elenco')
          .select('*')
          .eq('id_time', timeRow.id)

        if (elenco) {
          const soma = elenco.reduce((acc: number, r: any) => {
            const v = getFirstNumber(r, [
              'salario',
              'salario_mensal',
              'salario_total',
              'salários',
            ])

            return acc + v
          }, 0)

          setTotalSalarios(soma)
        }

        const { data: emp } = await supabase
          .from('emprestimos')
          .select('*')
          .eq('id_time', timeRow.id)
          .in('status', ['aberto', 'ativo', 'pendente'])
          .limit(1)
          .maybeSingle()

        if (emp) {
          const total = getFirstNumber(emp, [
            'valor_total',
            'valor',
            'montante',
            'principal',
            'total',
          ])

          const totParcelas =
            getFirstNumber(emp, [
              'parcelas_totais',
              'total_parcelas',
              'qtd_parcelas',
              'numero_parcelas',
            ]) || 1

          const pagas = getFirstNumber(emp, ['parcelas_pagas'])
          const atual = getFirstNumber(emp, ['parcela_atual'])

          let restantes = getFirstNumber(emp, ['restantes', 'parcelas_restantes'])

          if (!restantes) {
            if (pagas) restantes = Math.max(totParcelas - pagas, 0)
            else if (atual) restantes = Math.max(totParcelas - (atual - 1), 0)
            else restantes = totParcelas
          }

          let vParcela = getFirstNumber(emp, [
            'valor_parcela',
            'parcela_valor',
            'valor_por_turno',
            'por_turno',
          ])

          if (!vParcela) vParcela = Math.ceil(total / Math.max(totParcelas, 1))

          const devedor =
            getFirstNumber(emp, [
              'saldo_devedor',
              'valor_devido',
              'saldo_atual',
              'valor_a_pagar',
              'restante',
              'total_devido',
            ]) || vParcela * restantes

          setDividaEmprestimos(devedor)
          setValorParcela(vParcela)
          setParcelasRestantes(restantes)
        } else {
          setDividaEmprestimos(0)
          setValorParcela(0)
          setParcelasRestantes(0)
        }
      }
    })()
  }, [idTime])

  useEffect(() => {
    if (!idTime) return

    const ch = supabase
      .channel('sidebar-kpis')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'times',
          filter: `id=eq.${idTime}`,
        },
        (p: any) => {
          setSaldoTime(Number(p.new?.saldo) || 0)

          if (p.new?.moedas != null) setMoedas(Number(p.new.moedas) || 0)
          if (p.new?.nome) setNomeTime(p.new.nome)
          if (p.new?.logo || p.new?.logo_url) {
            setLogoUrl(p.new.logo || p.new.logo_url)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [idTime])

  const logout = () => {
    try {
      localStorage.clear()
    } catch {}

    router.push('/login')
  }

  const saldoFmt = useMemo(() => fmtBRL0(safe(saldoTime)), [saldoTime])
  const salariosFmt = useMemo(() => fmtBRL0(safe(totalSalarios)), [totalSalarios])
  const moedasFmt = useMemo(() => fmtInt(safe(moedas)), [moedas])
  const dividaFmt = useMemo(() => fmtBRL0(safe(dividaEmprestimos)), [dividaEmprestimos])
  const parcelaFmt = useMemo(() => fmtBRL0(safe(valorParcela)), [valorParcela])

  const Badge = ({ n, tone = 'emerald' }: { n: number; tone?: 'emerald' | 'amber' | 'rose' }) => {
    if (!n || n <= 0) return null

    const color =
      tone === 'amber'
        ? 'bg-amber-500'
        : tone === 'rose'
          ? 'bg-rose-500'
          : 'bg-emerald-500'

    return (
      <span className={`${color} min-w-[22px] h-[22px] px-1 rounded-full grid place-items-center text-[10px] font-black text-white shadow`}>
        {clamp99(n)}
      </span>
    )
  }

  const NavLink = ({
    href,
    children,
    badge,
  }: {
    href: string
    children: ReactNode
    badge?: ReactNode
  }) => {
    const active = isActive(href)

    return (
      <Link
        href={href}
        className={[
          'group flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition ring-1 ring-inset',
          active
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 shadow-[inset_0_0_18px_rgba(16,185,129,0.08)]'
            : 'text-white/85 hover:text-white hover:bg-white/7 ring-white/10',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 truncate">{children}</span>
        {badge}
      </Link>
    )
  }

  const ToggleGroup = ({
    open,
    setOpen,
    storageKey,
    label,
    icon,
  }: {
    open: boolean
    setOpen: (v: boolean) => void
    storageKey: GroupKey
    label: string
    icon: ReactNode
  }) => (
    <button
      type="button"
      onClick={() => {
        const v = !open
        setOpen(v)
        persistGroup(storageKey, v)
      }}
      className={[
        'w-full flex items-center justify-between px-3 py-2 rounded-xl transition ring-1 ring-inset',
        open ? 'bg-white/7 ring-white/12' : 'hover:bg-white/7 ring-white/10',
      ].join(' ')}
    >
      <span className="flex items-center gap-2 font-bold text-sm">
        {icon}
        {label}
      </span>

      <span className={`transition-transform text-white/70 ${open ? 'rotate-180' : ''}`}>
        ▾
      </span>
    </button>
  )

  const CollapsedItem = ({
    href,
    label,
    emoji,
    badge,
  }: {
    href: string
    label: string
    emoji: string
    badge?: ReactNode
  }) => {
    const active = isActive(href)

    return (
      <Link
        href={href}
        title={label}
        aria-label={label}
        className={[
          'relative h-11 w-11 rounded-xl grid place-items-center transition ring-1 ring-inset',
          active
            ? 'bg-emerald-500/20 ring-emerald-400/30'
            : 'hover:bg-white/10 ring-white/10',
        ].join(' ')}
      >
        <span className="text-lg">{emoji}</span>
        {badge ? <span className="absolute -top-1 -right-1">{badge}</span> : null}
      </Link>
    )
  }

  const HeaderBar = () => (
    <div
      className="fixed left-0 right-0 z-50 transition-transform duration-300 bg-[#07111f]/80 backdrop-blur-xl border-b border-white/10 shadow-[0_14px_40px_rgba(0,0,0,0.28)]"
      style={{
        height: HEADER_H,
        top: 0,
        transform: headerVisible ? 'translateY(0)' : `translateY(-${HEADER_H}px)`,
      }}
    >
      <div className="h-full max-w-[1500px] mx-auto px-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-[210px]">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-400/25 to-sky-400/20 ring-1 ring-white/15 grid place-items-center font-black">
            LF
          </div>

          <div className="leading-tight">
            <div className="text-sm font-black tracking-wide text-white">LigaFut</div>
            <div className="text-[11px] text-white/50">Central do Clube</div>
          </div>

          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Escudo"
              className="h-8 w-8 rounded-xl object-cover ring-1 ring-white/15"
            />
          ) : null}
        </div>

        <div className="hidden lg:grid grid-cols-5 gap-2 flex-1 max-w-[920px]">
          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
            <div className="text-white/50">Moedas</div>
            <div className="font-black text-sky-300 tabular-nums">🪙 {moedasFmt}</div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
            <div className="text-white/50">Caixa</div>
            <div className="font-black text-emerald-300 tabular-nums">{saldoFmt}</div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
            <div className="text-white/50">Salários</div>
            <div className="font-black text-amber-300 tabular-nums">{salariosFmt}</div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
            <div className="text-white/50">Dívida</div>
            <div className="font-black text-rose-300 tabular-nums">{dividaFmt}</div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs">
            <div className="text-white/50">Parcela</div>
            <div className="font-black text-white tabular-nums">
              {parcelaFmt} · {parcelasRestantes ?? 0}x
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={[
              'hidden sm:block px-3 py-2 rounded-xl text-xs font-bold ring-1',
              logado
                ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
                : 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
            ].join(' ')}
          >
            {logado ? `✅ ${nomeTime || 'Logado'}` : '❌ Deslogado'}
          </div>

          {logado && (
            <button
              type="button"
              onClick={logout}
              className="hidden sm:inline-flex items-center gap-2 text-xs font-bold py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 transition ring-1 ring-white/10"
            >
              🚪 Sair
            </button>
          )}

          <button
            type="button"
            onClick={() => setHeaderPersist(!headerVisible)}
            className="h-10 w-10 rounded-xl grid place-items-center hover:bg-white/10 transition ring-1 ring-white/10"
            title={headerVisible ? 'Ocultar topo' : 'Mostrar topo'}
          >
            {headerVisible ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  )

  const HeaderReveal = () =>
    headerVisible ? null : (
      <button
        type="button"
        onClick={() => setHeaderPersist(true)}
        className="fixed top-2 right-3 z-50 h-10 w-10 rounded-xl grid place-items-center bg-[#07111f]/80 hover:bg-white/15 ring-1 ring-white/15 text-white backdrop-blur shadow-lg"
      >
        ▼
      </button>
    )

  return (
    <>
      <HeaderBar />
      <HeaderReveal />

      <aside
        className={[
          'relative h-screen text-white flex flex-col justify-between transition-all duration-300 border-r border-white/10',
          'bg-[#07111f]/95 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
          isOpen ? 'w-72' : 'w-20',
        ].join(' ')}
        style={{
          paddingTop: (headerVisible ? HEADER_H : 0) + 12,
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.13),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]" />

        <div className="relative px-3 pt-3 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="h-10 w-10 rounded-xl grid place-items-center hover:bg-white/10 transition ring-1 ring-white/10"
              title={isOpen ? 'Recolher menu' : 'Expandir menu'}
            >
              {isOpen ? '←' : '☰'}
            </button>

            {isOpen && (
              <div className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-xs font-black">
                Menu Principal
              </div>
            )}
          </div>

          {isOpen ? (
            <div
              className={[
                'mb-3 p-3 rounded-2xl ring-1',
                logado
                  ? 'bg-emerald-500/10 ring-emerald-400/25'
                  : 'bg-rose-500/10 ring-rose-400/25',
              ].join(' ')}
            >
              <div className="text-[11px] text-white/50">Time logado</div>
              <div className="font-black text-sm truncate">
                {logado ? nomeTime || 'Usuário Logado' : 'Você não está logado'}
              </div>
            </div>
          ) : (
            <div
              className={[
                'mb-3 h-10 rounded-xl grid place-items-center ring-1',
                logado
                  ? 'bg-emerald-500/10 ring-emerald-400/25'
                  : 'bg-rose-500/10 ring-rose-400/25',
              ].join(' ')}
              title={logado ? nomeTime || 'Usuário Logado' : 'Você não está logado'}
            >
              {logado ? '✅' : '❌'}
            </div>
          )}

          <nav className={`${isOpen ? 'space-y-2' : 'grid gap-2 justify-center'} overflow-y-auto pr-1 max-h-[calc(100vh-190px)]`}>
            {!isOpen ? (
              <>
                {!logado && <CollapsedItem href="/login" label="Login" emoji="🔑" />}

                <CollapsedItem href="/" label="Home" emoji="🏠" />
                <CollapsedItem href="/copa" label="Copa Champions" emoji="🏆" />
                <CollapsedItem href="/elenco" label="Elenco" emoji="👥" />
                <CollapsedItem href="/mercado" label="Mercado" emoji="💸" />
                <CollapsedItem href="/negociacoes" label="Negociações" emoji="🤝" />
                <CollapsedItem href="/propostas-recebidas" label="Propostas Recebidas" emoji="📥" badge={<Badge n={countRecebidas} />} />
                <CollapsedItem href="/propostas-enviadas" label="Propostas Enviadas" emoji="📤" badge={<Badge n={countEnviadas} tone="amber" />} />
                <CollapsedItem href="/leilao" label="Leilão" emoji="🎯" />
                <CollapsedItem href="/BID" label="BID" emoji="📰" />

                {isAdmin && <CollapsedItem href="/admin" label="Admin" emoji="🛠️" />}
              </>
            ) : (
              <>
                {!logado && <NavLink href="/login">🔑 Login</NavLink>}

                <NavLink href="/">🏠 Home</NavLink>
                <NavLink href="/copa">
                  <span className="flex items-center gap-2">
                    🏆 Copa Champions
                    <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-black text-yellow-300 ring-1 ring-yellow-400/25">
                      NOVA
                    </span>
                  </span>
                </NavLink>
                <NavLink href="/BID">📰 BID</NavLink>

                <div className="pt-2">
                  <ToggleGroup
                    open={abrirClube}
                    setOpen={setAbrirClube}
                    storageKey="clube"
                    label="Meu Clube"
                    icon="👑"
                  />

                  {abrirClube && (
                    <div className="ml-3 mt-2 space-y-1 text-sm">
                      <NavLink href="/elenco">👥 Elenco</NavLink>
                      <NavLink href="/financeiro">📊 Financeiro</NavLink>
                      <NavLink href="/banco">🏦 Banco</NavLink>
                      <NavLink href="/patrocinios">🤝 Patrocínios</NavLink>
                      <NavLink href="/estadio">🏟️ Estádio</NavLink>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <ToggleGroup
                    open={abrirCompeticoes}
                    setOpen={setAbrirCompeticoes}
                    storageKey="competicoes"
                    label="Competições"
                    icon="🏆"
                  />

                  {abrirCompeticoes && (
                    <div className="ml-3 mt-2 space-y-1 text-sm">
                      <NavLink href="/copa">
                        <span className="flex items-center gap-2">
                          🏆 Copa Champions
                          <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-black text-yellow-300 ring-1 ring-yellow-400/25">
                            NOVA
                          </span>
                        </span>
                      </NavLink>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <ToggleGroup
                    open={abrirMercado}
                    setOpen={setAbrirMercado}
                    storageKey="mercado"
                    label="Mercado"
                    icon="💸"
                  />

                  {abrirMercado && (
                    <div className="ml-3 mt-2 space-y-1 text-sm">
                      <NavLink href="/mercado">💸 Mercado</NavLink>
                      <NavLink href="/negociacoes">🤝 Negociações</NavLink>
                      <NavLink href="/propostas-recebidas" badge={<Badge n={countRecebidas} />}>
                        📥 Propostas Recebidas
                      </NavLink>
                      <NavLink href="/propostas-enviadas" badge={<Badge n={countEnviadas} tone="amber" />}>
                        📤 Propostas Enviadas
                      </NavLink>
                      <NavLink href="/leilao">🎯 Leilão do Sistema</NavLink>
                      <NavLink href="/leiloar-jogador">📢 Leiloar Jogador</NavLink>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="pt-2">
                    <ToggleGroup
                      open={abrirAdmin}
                      setOpen={setAbrirAdmin}
                      storageKey="admin"
                      label="Admin"
                      icon="🛠️"
                    />

                    {abrirAdmin && (
                      <div className="ml-3 mt-2 space-y-1 text-sm">
                        <NavLink href="/admin">🗂️ Administração Geral</NavLink>
                        <NavLink href="/admin/times">📝 Times</NavLink>
                        <NavLink href="/admin/painel_times">📋 Painel Times</NavLink>
                        <NavLink href="/admin/jogadores_base">🗃️ Jogadores Base</NavLink>
                        <NavLink href="/admin/leilao">🎯 Admin Leilão</NavLink>
                        <NavLink href="/admin/leiloes_finalizados">📜 Leilões Finalizados</NavLink>
                        <NavLink href="/admin/mercado">💼 Admin Mercado</NavLink>
                      </div>
                    )}
                  </div>
                )}

                {checkingAdmin && (
                  <div className="px-3 pt-2 text-[11px] text-white/45">
                    Verificando permissões...
                  </div>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="relative px-3 pb-4">
          {isOpen ? (
            <div className="space-y-2">
              <div className="lg:hidden p-3 rounded-2xl bg-white/5 ring-1 ring-white/10 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-white/50">Caixa</span>
                  <strong className="text-emerald-300">{saldoFmt}</strong>
                </div>

                <div className="flex justify-between">
                  <span className="text-white/50">Moedas</span>
                  <strong className="text-sky-300">{moedasFmt}</strong>
                </div>
              </div>

              {logado && (
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 transition text-sm font-black ring-1 ring-white/10"
                >
                  🚪 Logout
                </button>
              )}
            </div>
          ) : (
            logado && (
              <button
                type="button"
                onClick={logout}
                className="h-11 w-11 rounded-xl grid place-items-center bg-rose-600 hover:bg-rose-700 transition ring-1 ring-white/10"
                title="Logout"
              >
                🚪
              </button>
            )
          )}
        </div>
      </aside>
    </>
  )
}

