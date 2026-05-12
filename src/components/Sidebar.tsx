'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const HEADER_H = 74

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

type NavLinkProps = {
  href: string
  children: ReactNode
}

type MenuButtonProps = {
  icon: string
  label: string
  open: boolean
  onClick: () => void
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()

  const [isOpen, setIsOpen] = useState(true)
  const [headerVisible, setHeaderVisible] = useState(true)

  const [abrirCompeticoes, setAbrirCompeticoes] = useState(true)
  const [abrirClube, setAbrirClube] = useState(true)
  const [abrirMercado, setAbrirMercado] = useState(true)
  const [abrirAdmin, setAbrirAdmin] = useState(false)

  const [logado, setLogado] = useState(false)
  const [nomeTime, setNomeTime] = useState('')
  const [saldo, setSaldo] = useState(0)
  const [moedas, setMoedas] = useState(0)

  useEffect(() => {
    try {
      const open = localStorage.getItem('sidebar_open')
      if (open !== null) {
        setIsOpen(open === '1')
      }

      const nome =
        localStorage.getItem('nome_time') ||
        localStorage.getItem('time_nome') ||
        ''

      const saldoLS = Number(localStorage.getItem('saldo')) || 0
      const moedasLS = Number(localStorage.getItem('moedas')) || 0

      setNomeTime(nome)
      setSaldo(saldoLS)
      setMoedas(moedasLS)
      setLogado(!!nome || !!localStorage.getItem('id_time') || !!localStorage.getItem('time_id'))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_open', isOpen ? '1' : '0')
    } catch {}
  }, [isOpen])

  const logout = () => {
    try {
      localStorage.clear()
    } catch {}

    router.push('/login')
  }

  const isActive = useCallback(
    (href: string) => {
      if (!pathname) return false
      if (href === '/') return pathname === '/'
      return pathname === href || pathname.startsWith(href + '/')
    },
    [pathname]
  )

  const saldoFmt = useMemo(() => fmtBRL(saldo), [saldo])

  const NavLink = ({ href, children }: NavLinkProps) => {
    const active = isActive(href)

    return (
      <Link
        href={href}
        title={typeof children === 'string' ? children : undefined}
        className={[
          'flex min-h-[54px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ring-1 ring-inset lg:justify-start',
          active
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30 shadow-[inset_0_0_18px_rgba(16,185,129,0.08)]'
            : 'text-white/85 ring-white/10 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        {children}
      </Link>
    )
  }

  const MenuButton = ({ icon, label, open, onClick }: MenuButtonProps) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-white/90 ring-1 ring-white/10 transition hover:bg-white/10 lg:justify-between"
    >
      <span className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="hidden lg:inline">{label}</span>
      </span>

      <span className="hidden text-white/60 lg:inline">
        {open ? '▾' : '▸'}
      </span>
    </button>
  )

  const Item = ({ emoji, label }: { emoji: string; label: string }) => (
    <>
      <span className="text-xl">{emoji}</span>
      <span className="hidden truncate lg:inline">{label}</span>
    </>
  )

  return (
    <>
      <div
        className="fixed left-0 right-0 z-50 border-b border-white/10 bg-[#07111f]/85 shadow-[0_14px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-transform duration-300"
        style={{
          height: HEADER_H,
          transform: headerVisible ? 'translateY(0)' : `translateY(-${HEADER_H}px)`,
        }}
      >
        <div className="mx-auto flex h-full max-w-[1500px] items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/25 to-sky-400/20 font-black text-white ring-1 ring-white/15">
              LF
            </div>

            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-black tracking-wide text-white">LigaFut</div>
              <div className="text-[11px] text-white/50">Central do Clube</div>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-3">
            <div className="rounded-xl bg-white/5 px-3 py-2 text-xs font-black text-sky-300 ring-1 ring-white/10">
              🪙 {moedas}
            </div>

            <div className="rounded-xl bg-white/5 px-3 py-2 text-xs font-black text-emerald-300 ring-1 ring-white/10">
              {saldoFmt}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setHeaderVisible(!headerVisible)}
            className="grid h-10 w-10 place-items-center rounded-xl text-white ring-1 ring-white/10 transition hover:bg-white/10"
            title={headerVisible ? 'Ocultar topo' : 'Mostrar topo'}
          >
            {headerVisible ? '▲' : '▼'}
          </button>
        </div>
      </div>

      <aside
        className={[
          'relative flex h-screen flex-col justify-between border-r border-white/10 text-white transition-all duration-300',
          'bg-[#07111f]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl',
          isOpen ? 'w-24 lg:w-72' : 'w-24',
        ].join(' ')}
        style={{
          paddingTop: (headerVisible ? HEADER_H : 0) + 12,
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.13),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]" />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3">
          <div className="mb-3 flex shrink-0 items-center justify-center lg:justify-between">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="grid h-10 w-10 place-items-center rounded-xl text-white ring-1 ring-white/10 transition hover:bg-white/10"
              title={isOpen ? 'Recolher menu' : 'Expandir menu'}
            >
              <span className="hidden lg:inline">{isOpen ? '←' : '☰'}</span>
              <span className="lg:hidden">☰</span>
            </button>

            {isOpen && (
              <div className="hidden rounded-xl bg-white/5 px-3 py-2 text-xs font-black ring-1 ring-white/10 lg:block">
                Menu Principal
              </div>
            )}
          </div>

          {isOpen && (
            <div className="mb-3 hidden shrink-0 rounded-2xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/25 lg:block">
              <div className="text-[11px] text-white/50">Time logado</div>
              <div className="truncate text-sm font-black">
                {logado ? nomeTime || 'Usuário Logado' : 'Não logado'}
              </div>
            </div>
          )}

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1 pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20">
            {!logado && (
              <NavLink href="/login">
                <Item emoji="🔑" label="Login" />
              </NavLink>
            )}

            <NavLink href="/">
              <Item emoji="🏠" label="Home" />
            </NavLink>

            <MenuButton
              icon="🏆"
              label="Competições"
              open={abrirCompeticoes}
              onClick={() => setAbrirCompeticoes(!abrirCompeticoes)}
            />
            
            <NavLink href="/liga">
  <Item emoji="🏆" label="Liga Brasileirão" />
</NavLink>
             
            {abrirCompeticoes && (
  <div className="space-y-2 pl-0 lg:pl-2">

    {/* LIGA */}

    <NavLink href="/liga">
      <Item emoji="🏆" label="Liga Brasileirão" />
    </NavLink>

    <NavLink href="/liga/artilharia">
      <Item emoji="⚽" label="Artilharia Liga" />
    </NavLink>

    <NavLink href="/liga/assistencias">
      <Item emoji="🎯" label="Assistências Liga" />
    </NavLink>

    {/* COPA */}

    <NavLink href="/copa">
      <Item emoji="🏆" label="Copa Champions" />
    </NavLink>

    <NavLink href="/copa/artilharia">
      <Item emoji="⚽" label="Artilharia Copa" />
    </NavLink>

    <NavLink href="/copa/assistencias">
      <Item emoji="🎯" label="Assistências Copa" />
    </NavLink>

  </div>
)}

            <MenuButton
              icon="👑"
              label="Meu Clube"
              open={abrirClube}
              onClick={() => setAbrirClube(!abrirClube)}
            />

            {abrirClube && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/elenco">
                  <Item emoji="👥" label="Elenco" />
                </NavLink>

                <NavLink href="/financeiro">
                  <Item emoji="📊" label="Financeiro" />
                </NavLink>

                <NavLink href="/financas">
                  <Item emoji="💰" label="Finanças" />
                </NavLink>

                <NavLink href="/banco">
                  <Item emoji="🏦" label="Banco" />
                </NavLink>

                <NavLink href="/patrocinios">
                  <Item emoji="🤝" label="Patrocínios" />
                </NavLink>

                <NavLink href="/estadio">
                  <Item emoji="🏟️" label="Estádio" />
                </NavLink>
              </div>
            )}

            <MenuButton
              icon="💸"
              label="Mercado"
              open={abrirMercado}
              onClick={() => setAbrirMercado(!abrirMercado)}
            />

            {abrirMercado && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/mercado">
                  <Item emoji="💸" label="Mercado" />
                </NavLink>

                <NavLink href="/negociacoes">
                  <Item emoji="🤝" label="Negociações" />
                </NavLink>

                <NavLink href="/propostas_recebidas">
                  <Item emoji="📥" label="Propostas Recebidas" />
                </NavLink>

                <NavLink href="/propostas_enviadas">
                  <Item emoji="📤" label="Propostas Enviadas" />
                </NavLink>

                <NavLink href="/leilao">
                  <Item emoji="🎯" label="Leilão do Sistema" />
                </NavLink>

                <NavLink href="/leiloar-jogador">
                  <Item emoji="📢" label="Leiloar Jogador" />
                </NavLink>
              </div>
            )}

            <NavLink href="/BID">
              <Item emoji="📰" label="BID" />
            </NavLink>

            <MenuButton
              icon="🛠️"
              label="Admin"
              open={abrirAdmin}
              onClick={() => setAbrirAdmin(!abrirAdmin)}
            />

            {abrirAdmin && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/admin">
                  <Item emoji="🗂️" label="Administração Geral" />
                </NavLink>

                <NavLink href="/admin/times">
                  <Item emoji="📝" label="Times" />
                </NavLink>

                <NavLink href="/admin/painel_times">
                  <Item emoji="📋" label="Painel Times" />
                </NavLink>

                <NavLink href="/admin/base-jogadores">
                  <Item emoji="🗃️" label="Jogadores Base" />
                </NavLink>

                <NavLink href="/admin/leilao">
                  <Item emoji="🎯" label="Admin Leilão" />
                </NavLink>

                <NavLink href="/admin/leiloes_finalizados">
                  <Item emoji="📜" label="Leilões Finalizados" />
                </NavLink>

                <NavLink href="/admin/mercado">
                  <Item emoji="💼" label="Admin Mercado" />
                </NavLink>
              </div>
            )}
          </nav>
        </div>

        <div className="relative shrink-0 border-t border-white/10 p-3">
          {isOpen ? (
            <div className="hidden space-y-2 lg:block">
              <div className="rounded-2xl bg-white/5 p-3 text-xs ring-1 ring-white/10">
                <div className="text-white/50">Caixa do clube</div>
                <div className="mt-1 font-black text-emerald-300">{saldoFmt}</div>
              </div>

              {logado && (
                <button
                  type="button"
                  onClick={logout}
                  className="w-full rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold transition hover:bg-rose-700"
                >
                  🚪 Sair
                </button>
              )}
            </div>
          ) : null}

          <div className="grid place-items-center lg:hidden">
            {logado ? (
              <button
                type="button"
                onClick={logout}
                title="Sair"
                className="grid h-11 w-11 place-items-center rounded-xl bg-rose-600 text-sm ring-1 ring-white/10 transition hover:bg-rose-700"
              >
                🚪
              </button>
            ) : (
              <Link
                href="/login"
                title="Login"
                className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-sm ring-1 ring-white/10 transition hover:bg-emerald-700"
              >
                🔑
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
