'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

type GroupKey = 'elenco' | 'roubo' | 'leilao' | 'admin' | 'copa'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const fmtBRL0 = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const safe = (v: any) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const clamp99 = (n: number) => (n > 99 ? '99+' : String(n))

const HEADER_H = 76

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())

/**
 * ✅ Admin real via RPC do Supabase (is_admin)
 * - tenta com email (preferencial)
 * - se não tiver email, tenta com "usuario" (ex: 'adm') somente se você permitir no seu SQL
 */
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
  const rawEmail = localStorage.getItem('email') || localStorage.getItem('user_email') || ''
  const rawUsuario = localStorage.getItem('usuario_nome') || localStorage.getItem('username') || ''

  const email =
    String(u1?.email || u2?.email || u3?.email || rawEmail || u1?.usuario || u2?.usuario || '').trim()
  const usuario =
    String(u1?.usuario || u2?.usuario || rawUsuario || u1?.login || u2?.login || '').trim()

  return { email, usuario }
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  // ===== UI
  const [isOpen, setIsOpen] = useState(true)
  const [abrirElenco, setAbrirElenco] = useState(false)
  const [abrirRoubo, setAbrirRoubo] = useState(false)
  const [abrirLeilao, setAbrirLeilao] = useState(false)
  const [abrirAdmin, setAbrirAdmin] = useState(false)
  const [abrirCopa, setAbrirCopa] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)

  // ===== Admin
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)

  // ===== User / KPIs
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

  // ===== Propostas
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

  // ========= Persistências
  useEffect(() => {
    try {
      const collapsed = localStorage.getItem('sb_open')
      if (collapsed !== null) setIsOpen(collapsed === '1')
      setAbrirElenco(localStorage.getItem('sb_g_elenco') === '1')
      setAbrirRoubo(localStorage.getItem('sb_g_roubo') === '1')
      setAbrirLeilao(localStorage.getItem('sb_g_leilao') === '1')
      setAbrirAdmin(localStorage.getItem('sb_g_admin') === '1')
      setAbrirCopa(localStorage.getItem('sb_g_copa') === '1')

      const hv = localStorage.getItem('sb_header_visible')
      if (hv !== null) setHeaderVisible(hv === '1')
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

  // ========= Descobrir idTime + contadores + ADMIN
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

    const mLS =
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
    setMoedas(safe(mLS))

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

  // ========= Helpers
  const getFirstNumber = (row: any, keys: string[]) => {
    for (const k of keys) {
      if (row?.[k] != null && Number(row[k]) >= 0) return safe(row[k])
    }
    return 0
  }

  // ========= Carregar do Supabase: time, elenco, emprestimos
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

      if (!timeRow && nomeTime) {
        const r3 = await supabase
          .from('times')
          .select('id, nome, tecnico, saldo, logo, logo_url, moedas')
          .eq('nome', nomeTime)
          .limit(1)
          .maybeSingle()
        if (!r3.error && r3.data) timeRow = r3.data
      }

      if (timeRow) {
        setNomeTime(timeRow.nome ?? nomeTime)
        setSaldoTime(Number(timeRow.saldo) || 0)
        if (timeRow.moedas != null) setMoedas(Number(timeRow.moedas) || 0)
        setLogoUrl(timeRow.logo || timeRow.logo_url || null)
        if (!idTime || idTime !== timeRow.id) setIdTime(timeRow.id)

        const targetId = timeRow.id
        const { data: elenc } = await supabase.from('elenco').select('*').eq('id_time', targetId)

        if (elenc) {
          const soma = elenc.reduce((acc: number, r: any) => {
            const v = getFirstNumber(r, ['salario', 'salario_mensal', 'salario_total', 'salários'])
            return acc + v
          }, 0)
          setTotalSalarios(soma)
        }

        const { data: emp } = await supabase
          .from('emprestimos')
          .select('*')
          .eq('id_time', targetId)
          .in('status', ['aberto', 'ativo', 'pendente'])
          .limit(1)
          .maybeSingle()

        if (emp) {
          const total = getFirstNumber(emp, ['valor_total', 'valor', 'montante', 'principal', 'total'])
          const totParcelas =
            getFirstNumber(emp, ['parcelas_totais', 'total_parcelas', 'qtd_parcelas', 'numero_parcelas']) || 1

          const pagas = getFirstNumber(emp, ['parcelas_pagas'])
          const atual = getFirstNumber(emp, ['parcela_atual'])
          let restantes = getFirstNumber(emp, ['restantes', 'parcelas_restantes'])
          if (!restantes) {
            if (pagas) restantes = Math.max(totParcelas - pagas, 0)
            else if (atual) restantes = Math.max(totParcelas - (atual - 1), 0)
            else restantes = totParcelas
          }

          let vParcela = getFirstNumber(emp, ['valor_parcela', 'parcela_valor', 'valor_por_turno', 'por_turno'])
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
      } else {
        setSaldoTime(0)
        setTotalSalarios(0)
        setDividaEmprestimos(0)
        setValorParcela(0)
        setParcelasRestantes(0)
      }
    })()
  }, [idTime, nomeTime])

  // ========= Realtime
  useEffect(() => {
    if (!idTime) return
    const ch = supabase
      .channel('sidebar-kpis')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'times', filter: `id=eq.${idTime}` },
        (p: any) => {
          setSaldoTime(Number(p.new?.saldo) || 0)
          if (p.new?.moedas != null) setMoedas(Number(p.new.moedas) || 0)
          if (p.new?.nome) setNomeTime(p.new.nome)
          if (p.new?.logo || p.new?.logo_url) setLogoUrl(p.new.logo || p.new.logo_url)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [idTime])

  // ========= Logout
  const logout = () => {
    try {
      localStorage.clear()
    } catch {}
    router.push('/login')
  }

  // ========= Derivados
  const saldoFmt = useMemo(() => fmtBRL0(safe(saldoTime)), [saldoTime])
  const salariosFmt = useMemo(() => fmtBRL0(safe(totalSalarios)), [totalSalarios])
  const moedasFmt = useMemo(() => fmtInt(safe(moedas)), [moedas])
  const dividaFmt = useMemo(() => fmtBRL0(safe(dividaEmprestimos)), [dividaEmprestimos])
  const parcelaFmt = useMemo(() => fmtBRL0(safe(valorParcela)), [valorParcela])

  // ========= UI helpers
  const ToggleBtn = ({
    open,
    onClick,
    label,
    icon,
  }: {
    open: boolean
    onClick: () => void
    label: string
    icon?: ReactNode
  }) => (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={[
        'w-full flex items-center justify-between text-left px-2 py-2 rounded-lg transition',
        open ? 'bg-white/5' : 'hover:bg-white/5',
        'ring-1 ring-inset ring-white/10',
      ].join(' ')}
      title={label}
      type="button"
    >
      <span className="flex items-center gap-2">
        {icon ?? null}
        <span>{label}</span>
      </span>
      <svg
        className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )

  const NavLink = ({ href, children, badge }: { href: string; children: ReactNode; badge?: ReactNode }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={[
          'group flex items-center justify-between gap-2 px-2 py-2 rounded-lg transition ring-1 ring-inset',
          active
            ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]'
            : 'hover:bg-white/5 text-white/90 ring-white/10',
        ].join(' ')}
      >
        <span className="flex items-center gap-2">{children}</span>
        {badge ? <span className="ml-2">{badge}</span> : null}
      </Link>
    )
  }

  const TooltipShell = ({ label }: { label: string }) => (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-12 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-white/10 px-2 py-1 text-xs text-white/90 ring-1 ring-white/15 opacity-0 group-hover:opacity-100 transition"
    >
      {label}
    </span>
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
        className={[
          'group relative grid place-items-center h-10 w-10 rounded-lg transition ring-1 ring-inset',
          active ? 'bg-emerald-600/20 ring-emerald-400/30' : 'hover:bg-white/10 ring-white/10',
        ].join(' ')}
        aria-label={label}
        title={label}
      >
        <span className="text-lg">{emoji}</span>
        <TooltipShell label={label} />
        {badge ? <span className="absolute -top-1 -right-1">{badge}</span> : null}
      </Link>
    )
  }

  const DotBadge = ({ n, tone = 'emerald' }: { n: number; tone?: 'emerald' | 'amber' | 'rose' }) => {
    if (!n || n <= 0) return null
    const color = tone === 'amber' ? 'bg-amber-500' : tone === 'rose' ? 'bg-rose-500' : 'bg-emerald-500'
    return (
      <span
        className={[
          'min-w-[1.5rem] px-1 h-6 grid place-items-center text-[10px] font-bold rounded-full text-white',
          color,
          'shadow-lg shadow-black/20 animate-[pulse_2s_ease-in-out_infinite]',
        ].join(' ')}
      >
        {clamp99(n)}
      </span>
    )
  }

  // ====== Header
  const HeaderBar = () => (
    <div
      className={[
        'fixed left-0 right-0 z-50 transition-transform duration-300',
        'backdrop-blur bg-[#0B1220]/70 border-b border-white/10',
        'shadow-[0_10px_30px_rgba(0,0,0,0.25)]',
      ].join(' ')}
      style={{
        height: HEADER_H,
        top: 0,
        transform: headerVisible ? 'translateY(0)' : `translateY(-${HEADER_H}px)`,
      }}
    >
      <div className="h-full max-w-[1400px] mx-auto px-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/15 to-sky-500/15 ring-1 ring-white/10 text-sm font-extrabold tracking-wide">
            ⚽ LigaFut
          </div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Escudo" className="h-7 w-7 rounded-md ring-1 ring-white/10 object-cover" />
          ) : null}
          <div
            className={[
              'hidden sm:block px-2 py-1 rounded-md text-xs ring-1',
              logado
                ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30'
                : 'bg-rose-600/15 text-rose-300 ring-rose-400/30',
            ].join(' ')}
            title={logado ? (nomeTime || 'Usuário Logado') : 'Você não está logado'}
          >
            {logado ? `✅ ${nomeTime || 'Logado'}` : '❌ Deslogado'}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full sm:w-auto">
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[120px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🪙 Moedas</span>
              <span className="font-semibold text-sky-300 tabular-nums">{moedasFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">💰 Caixa</span>
              <span className="font-semibold text-emerald-300 tabular-nums">{saldoFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🧩 Salários</span>
              <span className="font-semibold text-amber-300 tabular-nums">{salariosFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[160px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🏦 Dívida</span>
              <span className="font-semibold text-rose-300 tabular-nums">{dividaFmt}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-[220px]">
            <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Parcela</span>
                <span className="font-semibold text-sky-200 tabular-nums">{parcelaFmt}</span>
              </div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Restantes</span>
                <span className="font-semibold text-white tabular-nums">{parcelasRestantes ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {logado && (
            <button
              onClick={logout}
              className="hidden sm:inline-block text-xs py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 transition ring-1 ring-inset ring-white/10"
              title="Sair da conta"
              type="button"
            >
              🚪 Logout
            </button>
          )}

          {/* ✅ seta toggle abre/fecha header */}
          <button
            onClick={() => setHeaderPersist(!headerVisible)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10 transition ring-1 ring-inset ring-white/10"
            title={headerVisible ? 'Ocultar barra do topo' : 'Mostrar barra do topo'}
            aria-label={headerVisible ? 'Ocultar barra do topo' : 'Mostrar barra do topo'}
            type="button"
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
        onClick={() => setHeaderPersist(true)}
        className="fixed top-2 right-3 z-50 h-10 w-10 grid place-items-center rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/15 text-white/90 backdrop-blur shadow-lg"
        title="Mostrar barra do topo"
        aria-label="Mostrar barra do topo"
        type="button"
      >
        ▼
      </button>
    )

  const logoutBtn = logado ? (
    <button
      onClick={logout}
      className="w-full text-xs py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 transition text-center ring-1 ring-inset ring-white/10"
      title="Sair da conta"
      type="button"
    >
      🚪 {isOpen && 'Logout'}
    </button>
  ) : null

  return (
    <>
      <HeaderBar />
      <HeaderReveal />

      <aside
        className={[
          'relative text-white h-screen flex flex-col justify-between border-r border-white/10 transition-all duration-300',
          'bg-[#0B1220]/90 backdrop-blur',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
          isOpen ? 'w-72' : 'w-20',
        ].join(' ')}
        style={{ paddingTop: (headerVisible ? HEADER_H : 0) + 12 }}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        <div className="px-3 pt-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10 transition ring-1 ring-inset ring-white/10"
              aria-label={isOpen ? 'Recolher menu' : 'Expandir menu'}
              title={isOpen ? 'Recolher' : 'Expandir'}
              type="button"
            >
              {isOpen ? '←' : '☰'}
            </button>

            {isOpen && (
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/15 to-sky-500/15 ring-1 ring-white/10 text-xs font-bold tracking-wide">
                Menu
              </div>
            )}
          </div>

          {isOpen ? (
            <div
              className={`mt-3 mb-2 px-3 py-2 rounded-lg font-semibold text-xs text-center ring-1 ${
                logado
                  ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30'
                  : 'bg-rose-600/15 text-rose-300 ring-rose-400/30'
              }`}
            >
              {logado ? `✅ ${nomeTime || 'Usuário Logado'}` : '❌ Você não está logado'}
            </div>
          ) : (
            <div
              className={`mt-3 mb-2 grid place-items-center h-8 w-full rounded-lg ring-1 ${
                logado
                  ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30'
                  : 'bg-rose-600/15 text-rose-300 ring-rose-400/30'
              }`}
              title={logado ? (nomeTime || 'Usuário Logado') : 'Você não está logado'}
            >
              {logado ? '✅' : '❌'}
            </div>
          )}

          <nav className={`mt-4 ${isOpen ? 'space-y-2' : 'space-y-1'} overflow-y-auto pr-1`}>
            {!isOpen ? (
              <div className="grid grid-cols-1 gap-1">
                {!logado && <CollapsedItem href="/login" label="Login" emoji="🔑" />}
                <CollapsedItem href="/" label="Home" emoji="🏠" />
                <CollapsedItem href="/classificacao" label="Classificação" emoji="🏆" />
                <CollapsedItem href="/jogos" label="Jogos" emoji="📅" />
                <CollapsedItem href="/mercado" label="Mercado" emoji="💸" />
                <CollapsedItem href="/BID" label="BID" emoji="📰" />
                <CollapsedItem href="/leilao" label="Leilão do Sistema" emoji="🎯" />
                <CollapsedItem href="/copa/fase_grupos" label="Copa (Grupos)" emoji="🏟️" />
                <CollapsedItem href="/copa/mata-mata" label="Copa (Mata-mata)" emoji="🥊" />

                {isAdmin && (
                  <CollapsedItem href="/admin/jogadores_base" label="Jogadores (Banco)" emoji="🗃️" />
                )}
                {isAdmin && (
                  <CollapsedItem href="/admin/leiloes_finalizados" label="Leilões Finalizados" emoji="📜" />
                )}
              </div>
            ) : (
              <>
                {!logado && <NavLink href="/login">🔑 Login</NavLink>}
                <NavLink href="/">🏠 Home</NavLink>
                <NavLink href="/classificacao">🏆 Classificação</NavLink>
                <NavLink href="/jogos">📅 Jogos</NavLink>
                <NavLink href="/mercado">💸 Mercado</NavLink>
                <NavLink href="/BID">📰 BID</NavLink>

                <NavLink href="/leilao">🎯 Leilão do Sistema</NavLink>

                {/* ===== Elenco ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirElenco}
                    onClick={() => {
                      const v = !abrirElenco
                      setAbrirElenco(v)
                      persistGroup('elenco', v)
                    }}
                    label="Elenco"
                    icon={<span className="text-lg">👥</span>}
                  />
                  {abrirElenco && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/elenco">👥 Meu Elenco</NavLink>
                      <NavLink href="/negociacoes">🤝 Negociações</NavLink>
                      <NavLink href="/banco">🏦 Banco</NavLink>
                      <NavLink href="/financeiro">📊 Financeiro</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Copa (todos) ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirCopa}
                    onClick={() => {
                      const v = !abrirCopa
                      setAbrirCopa(v)
                      persistGroup('copa', v)
                    }}
                    label="Copa"
                    icon={<span className="text-lg">🏟️</span>}
                  />
                  {abrirCopa && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/copa/fase_grupos">🏟️ Fase de Grupos</NavLink>
                      <NavLink href="/copa/mata-mata">🥊 Mata-mata</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Leilão (grupo) ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirLeilao}
                    onClick={() => {
                      const v = !abrirLeilao
                      setAbrirLeilao(v)
                      persistGroup('leilao', v)
                    }}
                    label="Leilão"
                    icon={<span className="text-lg">🎯</span>}
                  />
                  {abrirLeilao && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/leilao">🎯 Leilão do Sistema</NavLink>
                      {isAdmin && <NavLink href="/admin/leiloes_finalizados">📜 Leilões Finalizados</NavLink>}
                    </div>
                  )}
                </div>

                {/* ===== Admin (só admin) ===== */}
                {isAdmin && (
                  <div className="mt-2 mb-1">
                    <ToggleBtn
                      open={abrirAdmin}
                      onClick={() => {
                        const v = !abrirAdmin
                        setAbrirAdmin(v)
                        persistGroup('admin', v)
                      }}
                      label="Admin"
                      icon={<span className="text-lg">🛠️</span>}
                    />
                    {abrirAdmin && (
                      <div className="ml-3 mt-1 space-y-1 text-sm">
                        <NavLink href="/admin/jogadores_base">🗃️ Jogadores (Banco)</NavLink>
                        <NavLink href="/admin/leilao">🎯 Leilão</NavLink>
                        <NavLink href="/admin/leiloes_finalizados">📜 Leilões Finalizados</NavLink>
                        <NavLink href="/admin/painel_times">📋 Painel Times</NavLink>
                        <NavLink href="/admin/times">📝 Admin Times</NavLink>
                        <NavLink href="/admin">🗂️ Administração Geral</NavLink>
                      </div>
                    )}
                  </div>
                )}

                {checkingAdmin && (
                  <div className="mt-2 text-[11px] text-white/50 px-2">Verificando permissões...</div>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="px-3 pb-3">{logoutBtn}</div>
      </aside>
    </>
  )
}

