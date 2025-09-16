// Sidebar melhorado: visual dark + glass, colapso com tooltip, active highlight,
// persistência, contadores de propostas e CABEÇALHO fixo com Moedas, Saldo, Salários e Dívida.
//
// - Lê 'moedas', 'saldo', 'total_salarios' e 'divida_emprestimos' do localStorage.
// - Opcionalmente tenta somar a dívida no Supabase se houver NEXT_PUBLIC_SUPABASE_URL/ANON_KEY e id_time.
// - Cabeçalho fixo no topo (glass) + Sidebar com padding-top para não sobrepor.
// - Mantém toda a lógica anterior (grupos, colapso, badges, etc).

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

type GroupKey = 'elenco' | 'roubo' | 'leilao' | 'admin' | 'copa'

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtInt = (n: number) => n.toLocaleString('pt-BR')

const safeNumber = (v: string | null | undefined) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const clamp99 = (n: number) => (n > 99 ? '99+' : String(n))

// Altura do cabeçalho (use a mesma em paddings abaixo)
const HEADER_H = 76

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  // ====== UI State
  const [isOpen, setIsOpen] = useState(true)
  const [abrirElenco, setAbrirElenco] = useState(false)
  const [abrirRoubo, setAbrirRoubo] = useState(false)
  const [abrirLeilao, setAbrirLeilao] = useState(false)
  const [abrirAdmin, setAbrirAdmin] = useState(false)
  const [abrirCopa, setAbrirCopa] = useState(false)

  // ====== User state
  const [logado, setLogado] = useState(false)
  const [nomeTime, setNomeTime] = useState('')
  const [saldoTime, setSaldoTime] = useState('0')
  const [totalSalarios, setTotalSalarios] = useState('0')
  const [moedas, setMoedas] = useState('0')
  const [dividaEmprestimos, setDividaEmprestimos] = useState('0') // soma em aberto

  // ====== Propostas (contadores)
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

  // ====== Persist abre/fecha grupos e colapso
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const collapsed = localStorage.getItem('sb_open')
      if (collapsed !== null) setIsOpen(collapsed === '1')

      setAbrirElenco(localStorage.getItem('sb_g_elenco') === '1')
      setAbrirRoubo(localStorage.getItem('sb_g_roubo') === '1')
      setAbrirLeilao(localStorage.getItem('sb_g_leilao') === '1')
      setAbrirAdmin(localStorage.getItem('sb_g_admin') === '1')
      setAbrirCopa(localStorage.getItem('sb_g_copa') === '1')
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sb_open', isOpen ? '1' : '0')
  }, [isOpen])

  const persistGroup = (key: GroupKey, open: boolean) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`sb_g_${key}`, open ? '1' : '0')
  }

  // ====== Helpers de leitura localStorage
  const readLocalUser = () => {
    const usuarioId = localStorage.getItem('usuario_id')
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    setSaldoTime(localStorage.getItem('saldo') || '0')
    setTotalSalarios(localStorage.getItem('total_salarios') || '0')

    // moedas pode estar em 'moedas' ou dentro do objeto 'user'
    let m = localStorage.getItem('moedas') || '0'
    if (userStr && (!m || m === '0')) {
      try {
        const userData = JSON.parse(userStr)
        if (userData?.moedas != null) m = String(userData.moedas)
      } catch {}
    }
    setMoedas(m || '0')

    // dívida pode estar em várias chaves — verifique todas
    const EMP_KEYS = [
      'divida_emprestimos',
      'emprestimos_divida',
      'divida_banco',
      'emprestimo_saldo_devedor',
      'saldo_devedor',
      'divida_total',
    ]
    let d = '0'
    for (const k of EMP_KEYS) {
      const v = localStorage.getItem(k)
      if (v && Number(v) > 0) {
        d = v
        break
      }
    }
    setDividaEmprestimos(d || '0')

    if (usuarioId || userStr) {
      setLogado(true)
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          setNomeTime(userData?.nome_time || userData?.nome || '')
        } catch {
          setNomeTime('')
        }
      }
    } else {
      setLogado(false)
      setNomeTime('')
    }

    // contadores
    setCountRecebidas(safeNumber(localStorage.getItem('propostas_recebidas_count')))
    setCountEnviadas(safeNumber(localStorage.getItem('propostas_enviadas_count')))
  }

  // ====== Load user header + contadores
  useEffect(() => {
    if (typeof window === 'undefined') return
    readLocalUser()

    const handleStorage = () => readLocalUser()
    window.addEventListener('storage', handleStorage)

    // polling leve—captura atualizações que não disparam o evento
    const timer = setInterval(readLocalUser, 10_000)

    return () => {
      window.removeEventListener('storage', handleStorage)
      clearInterval(timer)
    }
  }, [])

  // ====== (Opcional) Buscar dívida no Supabase, se credenciais existirem
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const idTime = localStorage.getItem('id_time') || localStorage.getItem('time_id')

    if (!url || !key || !idTime) return

    ;(async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(url, key)

        // Tentativa genérica: buscar empréstimos "em aberto"
        // Ajuste o nome da tabela/colunas se necessário
        const { data, error } = await supabase
          .from('emprestimos')
          .select('*')
          .in('status', ['aberto', 'ativo', 'pendente'])
          .eq('id_time', idTime)

        if (error || !data) return

        // Procura campos comuns de saldo devedor
        const candCampos = [
          'saldo_devedor',
          'valor_devido',
          'saldo_atual',
          'valor_a_pagar',
          'restante',
          'devedor',
          'total_devido',
        ]

        const soma = data.reduce((acc: number, row: any) => {
          for (const c of candCampos) {
            if (row[c] != null && Number(row[c]) > 0) {
              return acc + Number(row[c])
            }
          }
          // fallback: valor - pago
          const possivel = Number(row.valor ?? 0) - Number(row.pago ?? 0)
          return acc + (possivel > 0 ? possivel : 0)
        }, 0)

        if (Number.isFinite(soma) && soma >= 0) {
          setDividaEmprestimos(String(soma))
          localStorage.setItem('divida_emprestimos', String(soma))
        }
      } catch {
        // silencioso
      }
    })()
  }, [])

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    router.push('/login')
  }

  // ====== Subcomponentes
  const ToggleBtn = ({
    open, onClick, label, icon,
  }: { open: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) => (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={[
        'w-full flex items-center justify-between text-left px-2 py-2 rounded-lg transition',
        open ? 'bg-white/5' : 'hover:bg-white/5',
        'ring-1 ring-inset ring-white/10'
      ].join(' ')}
      title={label}
    >
      <span className="flex items-center gap-2">
        {icon ?? null}
        <span>{label}</span>
      </span>
      <svg
        className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clipRule="evenodd" />
      </svg>
    </button>
  )

  const NavLink = ({
    href, children, badge,
  }: { href: string; children: React.ReactNode; badge?: React.ReactNode }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        title={typeof children === 'string' ? (children as string) : undefined}
        className={[
          'group flex items-center justify-between gap-2 px-2 py-2 rounded-lg transition ring-1 ring-inset',
          active
            ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]'
            : 'hover:bg-white/5 text-white/90 ring-white/10'
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
    href, label, emoji, badge,
  }: { href: string; label: string; emoji: string; badge?: React.ReactNode }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={[
          'group relative grid place-items-center h-10 w-10 rounded-lg transition ring-1 ring-inset',
          active
            ? 'bg-emerald-600/20 ring-emerald-400/30'
            : 'hover:bg-white/10 ring-white/10'
        ].join(' ')}
        aria-label={label}
      >
        <span className="text-lg">{emoji}</span>
        <TooltipShell label={label} />
        {badge ? <span className="absolute -top-1 -right-1">{badge}</span> : null}
      </Link>
    )
  }

  const DotBadge = ({ n, tone = 'emerald' }: { n: number; tone?: 'emerald' | 'amber' | 'rose' }) => {
    if (!n || n <= 0) return null
    const color =
      tone === 'amber' ? 'bg-amber-500' :
      tone === 'rose' ? 'bg-rose-500' :
      'bg-emerald-500'
    return (
      <span
        className={[
          'min-w-[1.5rem] px-1 h-6 grid place-items-center text-[10px] font-bold rounded-full text-white',
          color,
          'shadow-lg shadow-black/20 animate-[pulse_2s_ease-in-out_infinite]'
        ].join(' ')}
      >
        {clamp99(n)}
      </span>
    )
  }

  // ====== Derivados formatados
  const saldoFmt = useMemo(() => fmtBRL(safeNumber(saldoTime)), [saldoTime])
  const salariosFmt = useMemo(() => fmtBRL(safeNumber(totalSalarios)), [totalSalarios])
  const moedasFmt = useMemo(() => fmtInt(safeNumber(moedas)), [moedas])
  const dividaFmt = useMemo(() => fmtBRL(safeNumber(dividaEmprestimos)), [dividaEmprestimos])

  // ====== Cabeçalho fixo (top)
  const HeaderBar = () => (
    <div
      className={[
        'fixed top-0 left-0 right-0 z-50',
        'backdrop-blur bg-[#0B1220]/70 border-b border-white/10',
        'shadow-[0_10px_30px_rgba(0,0,0,0.25)]'
      ].join(' ')}
      style={{ height: HEADER_H }}
    >
      <div className="h-full max-w-[1400px] mx-auto px-3 flex items-center justify-between gap-3">
        {/* Marca + status login */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/15 to-sky-500/15 ring-1 ring-white/10 text-sm font-extrabold tracking-wide">
            ⚽ LigaFut
          </div>
          <div
            className={[
              'hidden sm:block px-2 py-1 rounded-md text-xs ring-1',
              logado
                ? 'bg-emerald-600/15 text-emerald-300 ring-emerald-400/30'
                : 'bg-rose-600/15 text-rose-300 ring-rose-400/30'
            ].join(' ')}
            title={logado ? (nomeTime || 'Usuário Logado') : 'Você não está logado'}
          >
            {logado ? `✅ ${nomeTime || 'Logado'}` : '❌ Deslogado'}
          </div>
        </div>

        {/* KPI cards do time */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[150px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🪙 Moedas</span>
              <span className="font-semibold text-sky-300 tabular-nums">{moedasFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[150px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">💰 Caixa</span>
              <span className="font-semibold text-emerald-300 tabular-nums">{saldoFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[150px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🧩 Salários</span>
              <span className="font-semibold text-amber-300 tabular-nums">{salariosFmt}</span>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs min-w-[170px]">
            <div className="flex items-center justify-between">
              <span className="text-white/70">🏦 Dívida (Emprést.)</span>
              <span className="font-semibold text-rose-300 tabular-nums">{dividaFmt}</span>
            </div>
          </div>
        </div>

        {/* Botão rápido de logout (se logado) */}
        <div className="hidden sm:block">
          {logado && (
            <button
              onClick={logout}
              className="text-xs py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 transition ring-1 ring-inset ring-white/10"
              title="Sair da conta"
            >
              🚪 Logout
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // ====== Render
  return (
    <>
      {/* Cabeçalho global fixo */}
      <HeaderBar />

      {/* Sidebar (com padding-top para não ficar sob o cabeçalho) */}
      <aside
        className={[
          'relative text-white h-screen flex flex-col justify-between border-r border-white/10 transition-all duration-300',
          'bg-[#0B1220]/90 backdrop-blur',
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
          isOpen ? 'w-72' : 'w-20',
          `pt-[${HEADER_H + 12}px]` // um espaçozinho extra além do header
        ].join(' ')}
        style={{ paddingTop: HEADER_H + 12 }}
      >
        {/* gradiente decorativo lateral */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

        {/* Topo do Sidebar */}
        <div className="px-3 pt-3">
          {/* Botão de colapsar + logo menor (logo principal já está no header) */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10 transition ring-1 ring-inset ring-white/10"
              aria-label={isOpen ? 'Recolher menu' : 'Expandir menu'}
              title={isOpen ? 'Recolher' : 'Expandir'}
            >
              {isOpen ? '←' : '☰'}
            </button>

            {isOpen && (
              <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/15 to-sky-500/15 ring-1 ring-white/10 text-xs font-bold tracking-wide">
                Menu
              </div>
            )}
          </div>

          {/* Badge login (redundante com header, mas útil em telas menores) */}
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

          {/* Navegação */}
          <nav className={`mt-4 ${isOpen ? 'space-y-2' : 'space-y-1'} overflow-y-auto pr-1`}>
            {/* Quando colapsado, render com ícones centralizados + tooltips + badges */}
            {!isOpen ? (
              <div className="grid grid-cols-1 gap-1">
                {!logado && <CollapsedItem href="/login" label="Login" emoji="🔑" />}

                <CollapsedItem href="/" label="Home" emoji="🏠" />
                <CollapsedItem href="/classificacao" label="Classificação" emoji="🏆" />
                <CollapsedItem href="/jogos" label="Jogos" emoji="📅" />
                <CollapsedItem href="/mercado" label="Mercado" emoji="💸" />
                <CollapsedItem href="/BID" label="BID" emoji="📰" />

                {/* Atalhos úteis (inclui propostas com badges) */}
                <CollapsedItem
                  href="/propostas_recebidas"
                  label="Propostas Recebidas"
                  emoji="📥"
                  badge={<DotBadge n={countRecebidas} tone="amber" />}
                />
                <CollapsedItem
                  href="/propostas_enviadas"
                  label="Propostas Enviadas"
                  emoji="📤"
                  badge={<DotBadge n={countEnviadas} tone="emerald" />}
                />
                <CollapsedItem href="/negociacoes" label="Negociações" emoji="🤝" />
                <CollapsedItem href="/copa/final" label="Final" emoji="🏅" />

                {/* Admin & Leilões (atalhos diretos) */}
                <CollapsedItem href="/admin/leilao_sistema" label="Leilão Sistema" emoji="⚙️" />
                <CollapsedItem href="/admin/leilao_escuro" label="Leilão Escuro" emoji="🕶️" />
                <CollapsedItem href="/admin" label="Administração" emoji="🗂️" />
              </div>
            ) : (
              <>
                {!logado && <NavLink href="/login">🔑 Login</NavLink>}
                <NavLink href="/">🏠 Home</NavLink>
                <NavLink href="/classificacao">🏆 Classificação</NavLink>
                <NavLink href="/jogos">📅 Jogos</NavLink>
                <NavLink href="/mercado">💸 Mercado</NavLink>
                <NavLink href="/BID">📰 BID</NavLink>

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
                      <NavLink href="/elenco/tatico">🎯 Painel Tático</NavLink>
                      <NavLink href="/elenco/patrocinios">💼 Patrocínios</NavLink>
                      <NavLink href="/negociacoes">🤝 Negociações</NavLink>

                      {/* Propostas com contadores */}
                      <NavLink
                        href="/propostas_recebidas"
                        badge={<DotBadge n={countRecebidas} tone="amber" />}
                      >
                        📥 Propostas Recebidas
                      </NavLink>
                      <NavLink
                        href="/propostas_enviadas"
                        badge={<DotBadge n={countEnviadas} tone="emerald" />}
                      >
                        📤 Propostas Enviadas
                      </NavLink>

                      <NavLink href="/estadio">🏟️ Estádio</NavLink>
                      <NavLink href="/banco">🏦 Banco</NavLink>
                      <NavLink href="/financeiro">📊 Financeiro</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Evento de Roubo ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirRoubo}
                    onClick={() => {
                      const v = !abrirRoubo
                      setAbrirRoubo(v)
                      persistGroup('roubo', v)
                    }}
                    label="Evento de Roubo"
                    icon={<span className="text-lg">🕵️</span>}
                  />
                  {abrirRoubo && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/evento_roubo/bloqueio">🔒 Bloqueio</NavLink>
                      <NavLink href="/evento_roubo/acao">⚔️ Ação</NavLink>
                      <NavLink href="/evento_roubo/relatorio">📋 Relatório</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Leilão ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirLeilao}
                    onClick={() => {
                      const v = !abrirLeilao
                      setAbrirLeilao(v)
                      persistGroup('leilao', v)
                    }}
                    label="Leilão"
                    icon={<span className="text-lg">📢</span>}
                  />
                  {abrirLeilao && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/admin/leilao_sistema">⚙️ Leilão Sistema</NavLink>
                      <NavLink href="/admin/leilao_escuro">🕶️ Leilão Escuro</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Copa ===== */}
                <div className="mt-2">
                  <ToggleBtn
                    open={abrirCopa}
                    onClick={() => {
                      const v = !abrirCopa
                      setAbrirCopa(v)
                      persistGroup('copa', v)
                    }}
                    label="Copa"
                    icon={<span className="text-lg">🏆</span>}
                  />
                  {abrirCopa && (
                    <div className="ml-3 mt-1 space-y-1 text-sm">
                      <NavLink href="/copa/fase_liga">📊 Fase Liga</NavLink>
                      <NavLink href="/copa/classificacao">📈 Classificação</NavLink>
                      <NavLink href="/copa/playoff">🎯 Playoff</NavLink>
                      <NavLink href="/copa/oitavas">🥇 Oitavas</NavLink>
                      <NavLink href="/copa/quartas">🥈 Quartas</NavLink>
                      <NavLink href="/copa/semi">🥉 Semifinal</NavLink>
                      <NavLink href="/copa/final">🏅 Final</NavLink>
                      <NavLink href="/copa/historico-campeoes">🏆 Histórico de Campeões</NavLink>
                      <NavLink href="/copa/admin">🛠️ Admin Copa</NavLink>
                    </div>
                  )}
                </div>

                {/* ===== Administração ===== */}
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
                      <NavLink href="/admin/leilao">🎯 Leilão</NavLink>
                      <NavLink href="/admin/leiloes_finalizados">📜 Leilões Finalizados</NavLink>
                      <NavLink href="/admin/painel_times">📋 Painel Times</NavLink>
                      <NavLink href="/admin/times">📝 Admin Times</NavLink>
                      <NavLink href="/admin/evento_roubo_admin">🕵️ Evento Roubo (Admin)</NavLink>
                      <NavLink href="/admin/punicoes">🚫 Painel de Punições</NavLink>
                      <NavLink href="/admin/emprestimos">🏦 Empréstimos</NavLink>
                      <NavLink href="/admin">🗂️ Administração Geral</NavLink>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* Rodapé */}
        <div className="px-3 pb-3">
          {logado && (
            <button
              onClick={logout}
              className="w-full text-xs py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 transition text-center ring-1 ring-inset ring-white/10"
              title="Sair da conta"
            >
              🚪 {isOpen && 'Logout'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
