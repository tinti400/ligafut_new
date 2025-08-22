// Sidebar melhorado: colapso com tooltip, active highlight, persistência e visual dark

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

type GroupKey = 'elenco' | 'roubo' | 'leilao' | 'admin' | 'copa'

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

  // ====== Helpers
  const safeNumber = (v: string | null) => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const brl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  const isActive = useCallback(
    (href: string) => {
      if (!pathname) return false
      // rotas principais (usa startsWith para seções)
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

      const gElenco = localStorage.getItem('sb_g_elenco') === '1'
      const gRoubo = localStorage.getItem('sb_g_roubo') === '1'
      const gLeilao = localStorage.getItem('sb_g_leilao') === '1'
      const gAdmin = localStorage.getItem('sb_g_admin') === '1'
      const gCopa = localStorage.getItem('sb_g_copa') === '1'

      setAbrirElenco(gElenco)
      setAbrirRoubo(gRoubo)
      setAbrirLeilao(gLeilao)
      setAbrirAdmin(gAdmin)
      setAbrirCopa(gCopa)
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

  // ====== Load user header
  useEffect(() => {
    if (typeof window === 'undefined') return
    const usuarioId = localStorage.getItem('usuario_id')
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')

    setSaldoTime(localStorage.getItem('saldo') || '0')
    setTotalSalarios(localStorage.getItem('total_salarios') || '0')

    if (usuarioId || userStr) {
      setLogado(true)
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          setNomeTime(userData?.nome_time || userData?.nome || '')
        } catch {
          setNomeTime('')
        }
      } else {
        setNomeTime('')
      }
    } else {
      setLogado(false)
      setNomeTime('')
    }

    const handleStorage = () => {
      setSaldoTime(localStorage.getItem('saldo') || '0')
      setTotalSalarios(localStorage.getItem('total_salarios') || '0')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.clear()
    }
    router.push('/login')
  }

  // ====== Subcomponentes
  const ToggleBtn = ({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      aria-expanded={open}
      className="w-full flex items-center justify-between text-left px-2 py-2 rounded-lg hover:bg-white/5 transition"
      title={label}
    >
      <span className="flex items-center gap-2">{label}</span>
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

  const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        title={typeof children === 'string' ? (children as string) : undefined}
        className={[
          'block px-2 py-2 rounded-lg transition',
          active
            ? 'bg-emerald-600/15 text-emerald-300 ring-1 ring-emerald-400/30'
            : 'hover:bg-white/5 text-white/90'
        ].join(' ')}
      >
        {children}
      </Link>
    )
  }

  const CollapsedItem = ({ href, label, emoji }: { href: string; label: string; emoji: string }) => (
    <Link
      href={href}
      className={[
        'group relative grid place-items-center h-10 w-10 rounded-lg hover:bg-white/10 transition',
        isActive(href) ? 'bg-emerald-600/20 ring-1 ring-emerald-400/30' : ''
      ].join(' ')}
      aria-label={label}
      title={label}
    >
      <span className="text-lg">{emoji}</span>
    </Link>
  )

  // ====== Render
  const saldo = useMemo(() => brl(safeNumber(saldoTime)), [saldoTime])
  const salarios = useMemo(() => brl(safeNumber(totalSalarios)), [totalSalarios])

  return (
    <aside
      className={`bg-[#0B1220] text-white h-screen flex flex-col justify-between border-r border-white/10 transition-all duration-300 ${
        isOpen ? 'w-72' : 'w-20'
      }`}
    >
      {/* Topo */}
      <div className="px-3 pt-3">
        {/* Botão de colapsar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10 transition"
            aria-label={isOpen ? 'Recolher menu' : 'Expandir menu'}
            title={isOpen ? 'Recolher' : 'Expandir'}
          >
            {isOpen ? '←' : '☰'}
          </button>

          {isOpen && (
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/20 to-sky-500/20 ring-1 ring-white/10 text-sm font-extrabold tracking-wide">
              ⚽ LigaFut
            </div>
          )}
        </div>

        {/* Badge login */}
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

        {/* Cartões saldo / salários */}
        {logado &&
          (isOpen ? (
            <div className="grid gap-2">
              <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">💰 Caixa</span>
                  <span className="font-semibold text-emerald-300">{saldo}</span>
                </div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">🧩 Salários</span>
                  <span className="font-semibold text-amber-300">{salarios}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid place-items-center h-10 rounded-lg bg-white/5 ring-1 ring-white/10" title={`Caixa: ${saldo}`}>
                💰
              </div>
              <div className="grid place-items-center h-10 rounded-lg bg-white/5 ring-1 ring-white/10" title={`Salários: ${salarios}`}>
                🧩
              </div>
            </div>
          ))}

        {/* Navegação */}
        <nav className={`mt-4 ${isOpen ? 'space-y-2' : 'space-y-1'} overflow-y-auto pr-1`}>

          {/* Quando colapsado, render com ícones centralizados */}
          {!isOpen ? (
            <div className="grid grid-cols-1 gap-1">
              {!logado && <CollapsedItem href="/login" label="Login" emoji="🔑" />}

              <CollapsedItem href="/" label="Home" emoji="🏠" />
              <CollapsedItem href="/classificacao" label="Classificação" emoji="🏆" />
              <CollapsedItem href="/jogos" label="Jogos" emoji="📅" />
              <CollapsedItem href="/mercado" label="Mercado" emoji="💸" />
              <CollapsedItem href="/BID" label="BID" emoji="📰" />

              {/* Seções rápidas principais (atalhos) */}
              <CollapsedItem href="/elenco" label="Meu Elenco" emoji="👥" />
              <CollapsedItem href="/negociacoes" label="Negociações" emoji="🤝" />
              <CollapsedItem href="/copa/final" label="Final" emoji="🏅" />
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
                  label="👥 Elenco"
                />
                {abrirElenco && (
                  <div className="ml-3 mt-1 space-y-1 text-sm">
                    <NavLink href="/elenco">👥 Meu Elenco</NavLink>
                    <NavLink href="/elenco/tatico">🎯 Painel Tático</NavLink>
                    <NavLink href="/elenco/patrocinios">💼 Patrocínios</NavLink>
                    <NavLink href="/negociacoes">🤝 Negociações</NavLink>
                    <NavLink href="/propostas_recebidas">📥 Propostas Recebidas</NavLink>
                    <NavLink href="/propostas_enviadas">📤 Propostas Enviadas</NavLink>
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
                  label="🕵️ Evento de Roubo"
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
                  label="📢 Leilão"
                />
                {abrirLeilao && (
                  <div className="ml-3 mt-1 space-y-1 text-sm">
                    <NavLink href="/admin/leilao_sistema">⚙️ Leilão Sistema</NavLink>
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
                  label="🏆 Copa"
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
                  label="🛠️ Admin"
                />
                {abrirAdmin && (
                  <div className="ml-3 mt-1 space-y-1 text-sm">
                    <NavLink href="/admin/leilao">🎯 Leilão</NavLink>
                    <NavLink href="/admin/leiloes_finalizados">📜 Leilões Finalizados</NavLink>
                    <NavLink href="/admin/painel_times">📋 Painel Times</NavLink>
                    <NavLink href="/admin/times">📝 Admin Times</NavLink>
                    <NavLink href="/admin/evento_roubo_admin">🕵️ Evento Roubo (Admin)</NavLink>
                    <NavLink href="/admin/punicoes">🚫 Painel de Punições</NavLink>
                    {/* Novo: Empréstimos (Admin) */}
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
            className="w-full text-xs py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 transition text-center"
            title="Sair da conta"
          >
            🚪 {isOpen && 'Logout'}
          </button>
        )}
      </div>
    </aside>
  )
}
