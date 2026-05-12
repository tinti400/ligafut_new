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

      const nome = localStorage.getItem('nome_time') || ''
      const saldoLS = Number(localStorage.getItem('saldo')) || 0
      const moedasLS = Number(localStorage.getItem('moedas')) || 0

      setNomeTime(nome)
      setSaldo(saldoLS)
      setMoedas(moedasLS)
      setLogado(!!nome)
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
      return pathname === href || pathname.startsWith(href + '/')
    },
    [pathname]
  )

  const NavLink = ({ href, children }: NavLinkProps) => {
    const active = isActive(href)

    return (
      <Link
        href={href}
        className={[
          'flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-3 py-2 transition ring-1 ring-inset lg:justify-start',
          active
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30'
            : 'text-white/85 ring-white/10 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        {children}
      </Link>
    )
  }

  const saldoFmt = useMemo(() => fmtBRL(saldo), [saldo])

  return (
    <>
      <div
        className="fixed left-0 right-0 z-50 border-b border-white/10 bg-[#07111f]/80 backdrop-blur-xl"
        style={{
          height: HEADER_H,
          transform: headerVisible
            ? 'translateY(0)'
            : `translateY(-${HEADER_H}px)`,
        }}
      >
        <div className="mx-auto flex h-full items-center justify-between px-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/20 font-black text-white">
              LF
            </div>

            <div className="hidden sm:block">
              <div className="text-sm font-black text-white">
                LigaFut
              </div>

              <div className="text-[11px] text-white/50">
                Central do Clube
              </div>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-3">
            <div className="rounded-xl bg-white/5 px-3 py-2 text-xs ring-1 ring-white/10 text-sky-300 font-black">
              🪙 {moedas}
            </div>

            <div className="rounded-xl bg-white/5 px-3 py-2 text-xs ring-1 ring-white/10 text-emerald-300 font-black">
              {saldoFmt}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setHeaderVisible(!headerVisible)}
            className="grid h-10 w-10 place-items-center rounded-xl ring-1 ring-white/10 hover:bg-white/10 text-white"
          >
            {headerVisible ? '▲' : '▼'}
          </button>
        </div>
      </div>

      <aside
        className={[
          'relative flex h-screen flex-col justify-between border-r border-white/10 text-white transition-all duration-300',
          'bg-[#07111f]/95 backdrop-blur-xl',
          isOpen ? 'w-24 lg:w-72' : 'w-24',
        ].join(' ')}
        style={{
          paddingTop: (headerVisible ? HEADER_H : 0) + 12,
        }}
      >
        <div className="overflow-hidden px-3 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="grid h-10 w-10 place-items-center rounded-xl ring-1 ring-white/10 hover:bg-white/10"
            >
              ☰
            </button>

            {isOpen && (
              <div className="hidden lg:block rounded-xl bg-white/5 px-3 py-2 text-xs font-black ring-1 ring-white/10">
                Menu Principal
              </div>
            )}
          </div>

          <nav className="space-y-2">
            {!logado && (
              <NavLink href="/login">
                <span className="text-xl">🔑</span>
                <span className="hidden lg:inline">Login</span>
              </NavLink>
            )}

            <NavLink href="/">
              <span className="text-xl">🏠</span>
              <span className="hidden lg:inline">Home</span>
            </NavLink>

            <button
              type="button"
              onClick={() => setAbrirCompeticoes(!abrirCompeticoes)}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 ring-1 ring-white/10 hover:bg-white/10 lg:justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <span className="hidden lg:inline">Competições</span>
              </span>

              <span className="hidden lg:inline">
                {abrirCompeticoes ? '▾' : '▸'}
              </span>
            </button>

            {abrirCompeticoes && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/copa">
                  <span className="text-xl">🏆</span>
                  <span className="hidden lg:inline">
                    Copa Champions
                  </span>
                </NavLink>

                <NavLink href="/copa/artilharia">
                  <span className="text-xl">⚽</span>
                  <span className="hidden lg:inline">
                    Artilharia
                  </span>
                </NavLink>

                <NavLink href="/copa/assistencias">
                  <span className="text-xl">🎯</span>
                  <span className="hidden lg:inline">
                    Assistências
                  </span>
                </NavLink>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAbrirClube(!abrirClube)}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 ring-1 ring-white/10 hover:bg-white/10 lg:justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">👥</span>
                <span className="hidden lg:inline">
                  Meu Clube
                </span>
              </span>

              <span className="hidden lg:inline">
                {abrirClube ? '▾' : '▸'}
              </span>
            </button>

            {abrirClube && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/elenco">
                  <span className="text-xl">👥</span>
                  <span className="hidden lg:inline">Elenco</span>
                </NavLink>

                <NavLink href="/financas">
                  <span className="text-xl">💰</span>
                  <span className="hidden lg:inline">
                    Finanças
                  </span>
                </NavLink>

                <NavLink href="/estadio">
                  <span className="text-xl">🏟️</span>
                  <span className="hidden lg:inline">Estádio</span>
                </NavLink>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAbrirMercado(!abrirMercado)}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl px-3 py-2 ring-1 ring-white/10 hover:bg-white/10 lg:justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">💸</span>
                <span className="hidden lg:inline">Mercado</span>
              </span>

              <span className="hidden lg:inline">
                {abrirMercado ? '▾' : '▸'}
              </span>
            </button>

            {abrirMercado && (
              <div className="space-y-2 pl-0 lg:pl-2">
                <NavLink href="/mercado">
                  <span className="text-xl">💸</span>
                  <span className="hidden lg:inline">Mercado</span>
                </NavLink>

                <NavLink href="/negociacoes">
                  <span className="text-xl">🤝</span>
                  <span className="hidden lg:inline">
                    Negociações
                  </span>
                </NavLink>

                <NavLink href="/propostas_recebidas">
                  <span className="text-xl">📥</span>
                  <span className="hidden lg:inline">
                    Propostas
                  </span>
                </NavLink>

                <NavLink href="/propostas_enviadas">
                  <span className="text-xl">📤</span>
                  <span className="hidden lg:inline">
                    Enviadas
                  </span>
                </NavLink>

                <NavLink href="/leilao">
                  <span className="text-xl">🎯</span>
                  <span className="hidden lg:inline">Leilão</span>
                </NavLink>
              </div>
            )}

            <NavLink href="/BID">
              <span className="text-xl">📰</span>
              <span className="hidden lg:inline">BID</span>
            </NavLink>
          </nav>
        </div>

        <div className="border-t border-white/10 p-3">
          {isOpen && (
            <div className="hidden lg:block space-y-2">
              <div className="rounded-2xl bg-white/5 p-3 text-xs ring-1 ring-white/10">
                <div className="text-white/50">
                  Caixa do clube
                </div>

                <div className="mt-1 font-black text-emerald-300">
                  {saldoFmt}
                </div>
              </div>

              {logado && (
                <button
                  type="button"
                  onClick={logout}
                  className="w-full rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold hover:bg-rose-700"
                >
                  🚪 Sair
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}