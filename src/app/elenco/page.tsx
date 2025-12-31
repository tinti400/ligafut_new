'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import toast from 'react-hot-toast'

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= TIPOS ================= */
type Ordenacao = 'valor' | 'overall' | 'salario' | 'jogos' | 'nome' | 'posicao'

interface Jogador {
  id: string
  id_time: string
  nome: string
  posicao: string
  overall: number | null
  valor: number | null
  salario: number | null
  jogos: number | null
  nacionalidade?: string | null
  imagem_url?: string | null
  link_sofifa?: string | null
  protegido?: boolean | null
  lesionado?: boolean | null
  percentual?: number | null
}

/* ================= REGRAS ================= */
const SALARIO_PERCENTUAL = 0.0075
const calcularSalario = (valor: number | null | undefined) =>
  Math.round(Number(valor || 0) * SALARIO_PERCENTUAL)

const formatBRL = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(n || 0))

const FALLBACK_SRC =
  'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='

/* ================= CORES ================= */
const coresPorPosicao: Record<string, string> = {
  GL: 'bg-yellow-500',
  ZAG: 'bg-blue-600',
  LD: 'bg-indigo-500',
  LE: 'bg-indigo-500',
  VOL: 'bg-green-700',
  MC: 'bg-green-600',
  MEI: 'bg-green-500',
  ATA: 'bg-red-600',
  CA: 'bg-red-600',
}

/* ================= PAGE ================= */
export default function ElencoPage() {
  const [elenco, setElenco] = useState<Jogador[]>([])
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')
  const [saldo, setSaldo] = useState(0)

  const [filtroNome, setFiltroNome] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [titulares, setTitulares] = useState<string[]>([])
  const [escalaFixada, setEscalaFixada] = useState(false)

  /* ================= FETCH ================= */
  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = localStorage.getItem('id_time')
      if (!id_time) return

      const [{ data: elencoData }, { data: timeData }] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single()
      ])

      setElenco(elencoData || [])
      setNomeTime(timeData?.nome || '')
      setSaldo(Number(timeData?.saldo || 0))
    } catch {
      toast.error('Erro ao carregar elenco')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  /* ================= FILTROS ================= */
  const elencoFiltrado = useMemo(() => {
    let arr = elenco.filter(j =>
      j.nome.toLowerCase().includes(filtroNome.toLowerCase())
    )

    arr.sort((a, b) => {
      if (ordenacao === 'valor') return Number(b.valor) - Number(a.valor)
      if (ordenacao === 'overall') return Number(b.overall) - Number(a.overall)
      if (ordenacao === 'salario')
        return calcularSalario(b.valor) - calcularSalario(a.valor)
      if (ordenacao === 'jogos') return Number(b.jogos) - Number(a.jogos)
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome)
      return 0
    })

    return arr
  }, [elenco, filtroNome, ordenacao])

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleTitular = (id: string) => {
    if (escalaFixada) return
    setTitulares(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev].slice(0, 11)
    )
  }

  /* ================= UI ================= */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-300">
        Carregando elenco...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-4 max-w-7xl mx-auto">
      {/* HEADER */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">
            👥 Elenco do <span className="text-green-400">{nomeTime}</span>
          </h1>
          <p className="text-sm text-gray-400">
            {elenco.length} jogadores cadastrados
          </p>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm">
          💳 Caixa:{' '}
          <b className="text-emerald-400 ml-1">{formatBRL(saldo)}</b>
        </div>
      </header>

      {/* FILTROS */}
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar jogador"
          value={filtroNome}
          onChange={e => setFiltroNome(e.target.value)}
          className="px-3 py-2 rounded-lg text-black w-full sm:w-64"
        />

        <select
          value={ordenacao}
          onChange={e => setOrdenacao(e.target.value as Ordenacao)}
          className="px-3 py-2 rounded-lg text-black"
        >
          <option value="valor">💰 Valor</option>
          <option value="overall">⭐ Overall</option>
          <option value="salario">💸 Salário</option>
          <option value="jogos">🏟️ Jogos</option>
          <option value="nome">🔤 Nome</option>
        </select>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {elencoFiltrado.map(j => {
          const selecionado = selecionados.includes(j.id)
          const titular = titulares.includes(j.id)

          return (
            <div
              key={j.id}
              className={`relative rounded-2xl border p-3 transition shadow-lg
                ${selecionado
                  ? 'border-emerald-500 ring-1 ring-emerald-400/40'
                  : 'border-white/10 hover:border-white/20'}
                bg-white/[0.04]`}
            >
              {/* AÇÕES SUPERIORES */}
              <div className="absolute top-2 left-2">
                <input
                  type="checkbox"
                  checked={selecionado}
                  onChange={() => toggleSelecionado(j.id)}
                  className="h-5 w-5 accent-emerald-500"
                />
              </div>

              <button
                onClick={() => toggleTitular(j.id)}
                disabled={escalaFixada}
                className={`absolute top-2 right-2 text-lg
                  ${titular ? 'text-yellow-400' : 'text-gray-400'}`}
                title="Marcar titular"
              >
                {titular ? '⭐' : '☆'}
              </button>

              {/* AVATAR */}
              <ImagemComFallback
                src={j.imagem_url || FALLBACK_SRC}
                alt={j.nome}
                width={96}
                height={96}
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-full mx-auto mb-2 object-cover ring-2 ring-white/10"
              />

              {/* INFO */}
              <h2 className="text-sm sm:text-base font-bold text-center truncate">
                {j.nome}
              </h2>

              <div className="mt-1 flex justify-center gap-2">
                <span
                  className={`text-[11px] px-3 py-1 rounded-full text-white
                    ${coresPorPosicao[j.posicao] || 'bg-gray-600'}`}
                >
                  {j.posicao}
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full bg-gray-800">
                  OVR {j.overall ?? 0}
                </span>
              </div>

              <div className="mt-2 text-center">
                <p className="text-emerald-400 font-semibold text-sm">
                  💰 {formatBRL(j.valor)}
                </p>
                <p className="text-[11px] text-gray-400">
                  Salário {formatBRL(calcularSalario(j.valor))} • Jogos {j.jogos ?? 0}
                </p>
              </div>

              {j.link_sofifa && (
                <a
                  href={j.link_sofifa}
                  target="_blank"
                  className="block text-center text-xs text-blue-400 underline mt-1"
                >
                  SoFIFA
                </a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
