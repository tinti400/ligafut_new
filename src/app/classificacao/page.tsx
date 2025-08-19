'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAdmin } from '@/hooks/useAdmin'

interface Time { nome: string; logo_url: string | null }
interface ClassificacaoItem {
  id_time: string; pontos: number; vitorias: number; empates: number; derrotas: number;
  gols_pro: number; gols_contra: number; jogos: number; saldo_gols?: number; divisao: number; times: Time
}

export default function ClassificacaoPage() {
  const [classificacao, setClassificacao] = useState<ClassificacaoItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [temporadaSelecionada, setTemporadaSelecionada] = useState(1)
  const [divisaoSelecionada, setDivisaoSelecionada] = useState<number | null>(1)
  const { isAdmin, loading } = useAdmin()

  // ===== refs/medidas para sticky correto =====
  const headerRef = useRef<HTMLDivElement | null>(null)
  const theadRef  = useRef<HTMLTableSectionElement | null>(null)
  const [headerTopOffset, setHeaderTopOffset] = useState(0) // topo livre p/ o thead
  const [theadHeight, setTheadHeight] = useState(44)        // altura do cabeçalho da tabela
  const [theadStuck, setTheadStuck] = useState(false)

  useEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().height ?? 0
      setHeaderTopOffset(Math.ceil(h) + 8) // folga
      const th = theadRef.current?.getBoundingClientRect().height ?? 44
      setTheadHeight(Math.ceil(th))
    }
    measure()
    const onScroll = () => {
      if (!theadRef.current) return
      const top = theadRef.current.getBoundingClientRect().top
      // quando o topo do thead encosta na linha de sticky, consideramos "stuck"
      setTheadStuck(top <= (headerTopOffset + 1))
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', onScroll, { passive: true })
    // roda uma vez
    onScroll()
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll)
    }
  }, [headerTopOffset])

  // ===== Fetch =====
  const fetchDados = async (temporada: number) => {
    try {
      setCarregando(true); setErro(null)
      const res = await fetch(`/api/classificacao-liga?temporada=${temporada}`)
      if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`)
      const data = (await res.json()) as ClassificacaoItem[]
      setClassificacao(data || [])
    } catch (e: any) {
      setErro(`Erro ao buscar dados: ${e.message}`)
    } finally { setCarregando(false) }
  }
  useEffect(() => { fetchDados(temporadaSelecionada) }, [temporadaSelecionada])

  // ===== Agrupar/SORT =====
  const classificacaoPorDivisao = useMemo(() => {
    const map: Record<number, ClassificacaoItem[]> = {}
    classificacao.forEach(it => {
      const d = it.divisao ?? 99
      map[d] ??= []
      map[d].push({ ...it, saldo_gols: it.gols_pro - it.gols_contra })
    })
    return map
  }, [classificacao])

  const divisoesDisponiveis = useMemo(
    () => Object.keys(classificacaoPorDivisao).map(Number).sort((a,b)=>a-b),
    [classificacaoPorDivisao]
  )

  useEffect(() => {
    if (!divisoesDisponiveis.length) return
    if (!divisaoSelecionada || !divisoesDisponiveis.includes(divisaoSelecionada))
      setDivisaoSelecionada(divisoesDisponiveis[0])
  }, [divisoesDisponiveis, divisaoSelecionada])

  const timesDaDivisao = useMemo(() => {
    if (!divisaoSelecionada) return []
    const arr = classificacaoPorDivisao[divisaoSelecionada] || []
    return [...arr].sort(
      (a,b) => b.pontos - a.pontos || (b.saldo_gols ?? 0) - (a.saldo_gols ?? 0)
    )
  }, [classificacaoPorDivisao, divisaoSelecionada])

  // ===== Ações =====
  const iniciarNovaTemporada = async () => {
    if (!confirm('⚠️ Tem certeza que deseja iniciar a nova temporada?')) return
    const res = await fetch('/api/iniciar-temporada', { method: 'POST' })
    if (res.ok) {
      alert('✅ Temporada iniciada com sucesso!')
      fetchDados(temporadaSelecionada)
    } else {
      let msg = 'Erro desconhecido'
      try { const d = await res.json(); msg = d.erro || msg } catch {}
      alert(`❌ Erro ao iniciar temporada: ${msg}`)
    }
  }
  const editarClassificacao = (it: ClassificacaoItem) => {
    if (!isAdmin) return
    alert(`📝 Editar classificação do time: ${it.times.nome}`)
  }

  // ===== UI helpers =====
  const aproveitamentoPct = (it: ClassificacaoItem) =>
    it.jogos > 0 ? Math.round((it.pontos/(it.jogos*3))*100) : 0

  const posBadge = (pos:number) =>
    `inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ring-1 ring-white/10 ${
      pos <= 4 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'
    }`

  const rowTone = (idx:number, total:number) => {
    const last = total-1, pen = total-2, ante = total-3
    if (idx <= 3) return 'bg-green-950/40 hover:bg-green-900/40'
    if (idx === ante) return 'bg-yellow-950/40 hover:bg-yellow-900/40'
    if (idx === pen || idx === last) return 'bg-red-950/40 hover:bg-red-900/40'
    return 'hover:bg-gray-800/60'
  }
  const iconePos = (idx:number, total:number) => {
    const last = total-1, pen = total-2, ante = total-3
    if (idx===0) return '🏆'
    if (idx>0 && idx<=3) return '⬆️'
    if (idx===ante) return '⚠️'
    if (idx===pen || idx===last) return '🔻'
    return ''
  }

  const shareHref = useMemo(() => {
    if (!divisaoSelecionada || !timesDaDivisao.length) return '#'
    const texto = `📊 Classificação da Divisão ${divisaoSelecionada}:\n\n` +
      timesDaDivisao.map((it,i)=>
        `${i+1}º ${it.times.nome} - ${it.pontos} pts (${it.vitorias}V ${it.empates}E ${it.derrotas}D)`
      ).join('\n')
    return `https://wa.me/?text=${encodeURIComponent(texto)}`
  }, [divisaoSelecionada, timesDaDivisao])

  // ===== Render =====
  const colSpanTotal = isAdmin ? 12 : 11

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      {/* HEADER */}
      <header ref={headerRef} className="sticky top-0 z-20 backdrop-blur bg-black/60 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-yellow-400 via-emerald-400 to-lime-300 bg-clip-text text-transparent">
              🏆 Classificação da Liga
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {[1,2].map(temp=>(
              <button key={temp} onClick={()=>setTemporadaSelecionada(temp)}
                className={`px-3 py-1.5 rounded-full text-sm transition border ${
                  temporadaSelecionada===temp ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                  : 'bg-gray-800 border-white/10 text-gray-200 hover:bg-gray-700'}`}>
                Temporada {temp}
              </button>
            ))}
            {!loading && isAdmin && (
              <button onClick={iniciarNovaTemporada}
                className="px-3 py-1.5 rounded-full text-sm bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/50 shadow text-white">
                🚀 Nova Temporada
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CONTROLES */}
      <section className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {divisoesDisponiveis.map(div=>(
              <button key={div} onClick={()=>setDivisaoSelecionada(div)}
                className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                  divisaoSelecionada===div ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                  : 'bg-gray-800 border-white/10 text-gray-200 hover:bg-gray-700'}`}>
                Divisão {div}
              </button>
            ))}
          </div>
          <a href={shareHref} target="_blank" rel="noopener noreferrer"
             className="px-3 py-1.5 rounded-lg text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition">
            📤 Compartilhar
          </a>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span className="inline-flex items-center gap-2 bg-green-900/40 ring-1 ring-green-800/50 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> G-4
          </span>
          <span className="inline-flex items-center gap-2 bg-yellow-900/40 ring-1 ring-yellow-800/50 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Zona de atenção
          </span>
          <span className="inline-flex items-center gap-2 bg-red-900/40 ring-1 ring-red-800/50 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Z-2 (rebaixamento)
          </span>
        </div>
      </section>

      {/* TABELA */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        {erro && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 text-red-200 p-4">{erro}</div>}

        {carregando ? (
          <div className="space-y-2">{[...Array(8)].map((_,i)=><div key={i} className="h-10 w-full rounded bg-gray-800/60 animate-pulse" />)}</div>
        ) : !divisaoSelecionada || !timesDaDivisao.length ? (
          <div className="rounded-lg border border-white/10 bg-gray-900/60 p-8 text-center text-gray-300">
            Nenhuma classificação encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 shadow-2xl shadow-black/30">
            <table className="min-w-full text-sm bg-gray-950/40">
              {/* THEAD sticky + ref */}
              <thead
                ref={theadRef}
                className="sticky z-30 bg-black/75 backdrop-blur border-b border-white/10"
                style={{ top: headerTopOffset }}
              >
                <tr className="text-yellow-300">
                  <th className="py-3 px-4 text-left">Pos</th>
                  <th className="py-3 px-4 text-left">Time</th>
                  <th className="py-3 px-2 text-center">Pts</th>
                  <th className="py-3 px-2 text-center">Aprove.</th>
                  <th className="py-3 px-2 text-center">J</th>
                  <th className="py-3 px-2 text-center">V</th>
                  <th className="py-3 px-2 text-center">E</th>
                  <th className="py-3 px-2 text-center">D</th>
                  <th className="py-3 px-2 text-center">GP</th>
                  <th className="py-3 px-2 text-center">GC</th>
                  <th className="py-3 px-2 text-center">SG</th>
                  {isAdmin && <th className="py-3 px-2 text-center">✏️</th>}
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {/* Spacer: só aparece quando o thead está “stuck” para não cobrir a primeira linha */}
                {theadStuck && (
                  <tr aria-hidden className="pointer-events-none">
                    <td colSpan={colSpanTotal} style={{ height: theadHeight }} />
                  </tr>
                )}

                {timesDaDivisao.map((item, idx, arr) => {
                  const pos = idx + 1
                  const total = arr.length
                  const ap = aproveitamentoPct(item)
                  return (
                    <tr key={item.id_time} className={`${rowTone(idx, total)} transition-colors even:bg-white/5`}>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={posBadge(pos)}>{pos}</span>
                          <span className="text-lg">{iconePos(idx, total)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          <img src={item.times.logo_url || '/logo-fallback.png'} alt={item.times.nome}
                               className="w-7 h-7 rounded-full ring-1 ring-white/10 object-cover" />
                          <span className="font-medium">{item.times.nome}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-yellow-300">{item.pontos}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-24 md:w-32 h-2 rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-2 bg-emerald-500" style={{ width: `${ap}%` }} />
                          </div>
                          <span className="text-xs text-gray-300">{ap}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">{item.jogos}</td>
                      <td className="py-2.5 px-2 text-center">{item.vitorias}</td>
                      <td className="py-2.5 px-2 text-center">{item.empates}</td>
                      <td className="py-2.5 px-2 text-center">{item.derrotas}</td>
                      <td className="py-2.5 px-2 text-center">{item.gols_pro}</td>
                      <td className="py-2.5 px-2 text-center">{item.gols_contra}</td>
                      <td className="py-2.5 px-2 text-center">{item.saldo_gols}</td>
                      {isAdmin && (
                        <td className="py-2.5 px-2 text-center">
                          <button onClick={()=>editarClassificacao(item)}
                                  className="text-yellow-300 hover:text-yellow-200 text-xs underline underline-offset-4">
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
