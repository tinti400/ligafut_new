'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const bandeiras: Record<string, string> = {
  Brasil: 'br', Argentina: 'ar', Portugal: 'pt', Espanha: 'es', França: 'fr',
  Inglaterra: 'gb', Alemanha: 'de', Itália: 'it', Holanda: 'nl', Bélgica: 'be',
  Uruguai: 'uy', Chile: 'cl', Colômbia: 'co', México: 'mx', Estados_Unidos: 'us',
  Canadá: 'ca', Paraguai: 'py', Peru: 'pe', Equador: 'ec', Bolívia: 'bo',
  Venezuela: 've', Congo: 'cg', Guiana: 'gy', Suriname: 'sr', Honduras: 'hn',
  Nicarágua: 'ni', Guatemala: 'gt', Costa_Rica: 'cr', Panamá: 'pa', Jamaica: 'jm',
  Camarões: 'cm', Senegal: 'sn', Marrocos: 'ma', Egito: 'eg', Argélia: 'dz',
  Croácia: 'hr', Sérvia: 'rs', Suíça: 'ch', Polônia: 'pl', Rússia: 'ru',
  Japão: 'jp', Coreia_do_Sul: 'kr', Austrália: 'au'
}

const coresPorPosicao: Record<string, string> = {
  GL: 'bg-yellow-500', ZAG: 'bg-blue-500', LD: 'bg-indigo-400', LE: 'bg-indigo-500',
  VOL: 'bg-green-600', MC: 'bg-green-500', ME: 'bg-green-400', MD: 'bg-green-400',
  SA: 'bg-orange-500', CA: 'bg-red-600', PD: 'bg-pink-500', PE: 'bg-pink-600',
}
export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [nomeTime, setNomeTime] = useState('')
  const [loading, setLoading] = useState(true)

  const [filtroNacionalidade, setFiltroNacionalidade] = useState<string | null>(null)
  const [filtroPosicao, setFiltroPosicao] = useState<string | null>(null)
  const [filtroNome, setFiltroNome] = useState<string>('')
  const [filtroOverall, setFiltroOverall] = useState<number>(0)

  const [selecionados, setSelecionados] = useState<string[]>([])
  const [ordenacao, setOrdenacao] = useState<'valor' | 'overall' | 'salario' | 'jogos'>('valor')

  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = localStorage.getItem('id_time')
      if (!id_time) return setLoading(false)

      const [{ data: elencoData }, { data: timeData }] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single()
      ])

      setElenco(elencoData || [])
      setSaldo(timeData?.saldo || 0)
      setNomeTime(timeData?.nome || '')
      setSelecionados([])
    } catch {
      alert('Erro ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const valorTotal = elenco.reduce((acc, j) => acc + (j.valor || 0), 0)
  const salarioTotal = elenco.reduce((acc, j) => acc + (j.salario || 0), 0)
  const mediaOverall =
    elenco.length > 0 ? elenco.reduce((acc, j) => acc + (j.overall || 0), 0) / elenco.length : 0

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }
  const getFlagUrl = (pais: string) => {
    const key = Object.keys(bandeiras).find((nome) =>
      nome.toLowerCase().replace(/[^a-z]/g, '') === pais?.toLowerCase().replace(/[^a-z]/g, '')
    )
    return key ? `https://flagcdn.com/w40/${bandeiras[key]}.png` : ''
  }

  const contar = (campo: string) => {
    const contagem: Record<string, number> = {}
    elenco.forEach((j) => {
      const key = j[campo] || 'Outro'
      contagem[key] = (contagem[key] || 0) + 1
    })
    return contagem
  }

  const elencoFiltrado = elenco
    .filter((j) =>
      (!filtroNacionalidade || j.nacionalidade === filtroNacionalidade) &&
      (!filtroPosicao || j.posicao === filtroPosicao) &&
      (!filtroNome || j.nome.toLowerCase().includes(filtroNome.toLowerCase())) &&
      (!filtroOverall || (j.overall || 0) >= filtroOverall)
    )
    .sort((a, b) => {
      if (ordenacao === 'valor') return (b.valor || 0) - (a.valor || 0)
      if (ordenacao === 'overall') return (b.overall || 0) - (a.overall || 0)
      if (ordenacao === 'salario') return (b.salario || 0) - (a.salario || 0)
      if (ordenacao === 'jogos') return (b.jogos || 0) - (a.jogos || 0)
      return 0
    })
  if (loading) return <p className="text-center text-white">⏳ Carregando elenco...</p>

  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen bg-[url('/campo-fundo.jpg')] bg-cover bg-center bg-fixed bg-opacity-10">
      <div className="backdrop-blur bg-black/80 p-4 sm:p-6 rounded-xl shadow-xl">
        <h1 className="text-3xl font-bold text-center text-green-400 mb-1">
          👥 Elenco do {nomeTime} ({elenco.length} atletas)
        </h1>
        <p className="text-center text-sm text-gray-300 mb-1">
          💰 Caixa: <span className="text-green-400 font-semibold">R$ {saldo.toLocaleString()}</span>
        </p>
        <p className="text-center text-sm text-gray-300 mb-1">
          📦 Valor do elenco: <span className="text-yellow-400 font-semibold">R$ {valorTotal.toLocaleString()}</span>
        </p>
        <p className="text-center text-sm text-gray-300 mb-4">
          💸 Salários totais: <span className="text-red-400 font-semibold">R$ {salarioTotal.toLocaleString()}</span> •
          Média de Overall: <span className="text-blue-400 font-semibold">{mediaOverall.toFixed(1)}</span>
        </p>

        <div className="text-center mb-4">
          <button onClick={fetchElenco} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full">
            🔄 Atualizar elenco
          </button>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto px-1 sm:px-0 whitespace-nowrap scroll-smooth scroll-m-2">
          {Object.entries(contar('nacionalidade')).map(([nac, count]) => (
            <button key={nac} onClick={() => setFiltroNacionalidade(nac)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${filtroNacionalidade === nac ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
              {getFlagUrl(nac) && <img src={getFlagUrl(nac)} alt={nac} className="w-5 h-3" />} {nac} ({count})
            </button>
          ))}
          {filtroNacionalidade && <button onClick={() => setFiltroNacionalidade(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar</button>}
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto px-1 sm:px-0 whitespace-nowrap scroll-smooth scroll-m-2">
          {Object.entries(contar('posicao')).map(([pos, count]) => (
            <button key={pos} onClick={() => setFiltroPosicao(pos)} className={`px-3 py-1 rounded-full text-sm ${filtroPosicao === pos ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
              {pos} ({count})
            </button>
          ))}
          {filtroPosicao && <button onClick={() => setFiltroPosicao(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar</button>}
        </div>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-2 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="🔎 Filtrar por nome"
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            className="px-3 py-1 rounded text-black w-full sm:w-64"
          />
          <input
            type="number"
            placeholder="🔢 Overall mínimo"
            value={filtroOverall}
            onChange={(e) => setFiltroOverall(Number(e.target.value))}
            className="px-3 py-1 rounded text-black w-full sm:w-48"
          />
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as any)}
            className="px-3 py-1 rounded text-black w-full sm:w-48"
          >
            <option value="valor">💰 Ordenar por Valor</option>
            <option value="overall">⭐ Ordenar por Overall</option>
            <option value="salario">💸 Ordenar por Salário</option>
            <option value="jogos">🏟️ Ordenar por Jogos</option>
          </select>
          {(filtroNome || filtroOverall > 0) && (
            <button
              onClick={() => {
                setFiltroNome('')
                setFiltroOverall(0)
              }}
              className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm w-full sm:w-auto"
            >
              ❌ Limpar Busca
            </button>
          )}
        </div>

        {selecionados.length > 0 && (
          <button
            onClick={async () => await venderSelecionados()}
            className="fixed bottom-6 right-6 bg-green-600 hover:bg-green-700 px-6 py-3 text-white font-bold rounded-full shadow-lg z-50"
          >
            💸 Vender {selecionados.length} jogador(es)
          </button>
        )}
        {elencoFiltrado.length === 0 ? (
          <p className="text-center text-gray-400">Nenhum jogador encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {elencoFiltrado.map((jogador) => {
              const selecionado = selecionados.includes(jogador.id)
              const posClass = coresPorPosicao[jogador.posicao] || 'bg-gray-600'

              // exemplo fictício de status
              const protegido = jogador.protegido === true
              const lesionado = jogador.lesionado === true
              const emAlta = (jogador.jogos || 0) >= 7

              return (
                <div
                  key={jogador.id}
                  onClick={() => toggleSelecionado(jogador.id)}
                  className={`relative bg-gray-800 p-4 rounded-xl border-2 cursor-pointer transition transform hover:scale-105 ${
                    selecionado ? 'border-green-400' : 'border-gray-700'
                  }`}
                >
                  {/* Check de seleção */}
                  {selecionado && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                      ✔
                    </div>
                  )}

                  {/* Imagem */}
                  <ImagemComFallback
                    src={jogador.imagem_url}
                    alt={jogador.nome}
                    width={80}
                    height={80}
                    className="rounded-full mb-2 mx-auto"
                  />

                  {/* Nome */}
                  <h2 className="text-lg font-bold text-white text-center">{jogador.nome}</h2>

                  {/* Nacionalidade */}
                  <div className="flex justify-center items-center gap-2 text-sm text-gray-300 mb-1">
                    {getFlagUrl(jogador.nacionalidade) && (
                      <img
                        src={getFlagUrl(jogador.nacionalidade)}
                        alt={jogador.nacionalidade}
                        className="w-5 h-3"
                      />
                    )}
                    <span>{jogador.nacionalidade || 'Outro'}</span>
                  </div>

                  {/* Posição */}
                  <span
                    className={`inline-block ${posClass} text-xs text-white px-3 py-1 rounded-full mb-2`}
                  >
                    {jogador.posicao}
                  </span>

                  {/* Dados principais */}
                  <p className="text-sm text-gray-300">Overall: {jogador.overall ?? 'N/A'}</p>
                  <p className="text-green-400 font-semibold">
                    💰 R$ {jogador.valor.toLocaleString()}
                  </p>
                  <p className="text-gray-400 text-xs">Salário: R$ {(jogador.salario || 0).toLocaleString()}</p>
                  <p className="text-gray-400 text-xs">Jogos: {jogador.jogos ?? 0}</p>

                  {/* Status */}
                  <div className="mt-2 text-xs text-center space-x-2">
                    {protegido && <span className="text-yellow-400">🛡️ Protegido</span>}
                    {lesionado && <span className="text-red-400">⚠️ Lesionado</span>}
                    {emAlta && <span className="text-green-400">🔥 Em Alta</span>}
                  </div>

                  {/* Link externo */}
                  {jogador.link_sofifa && (
                    <a
                      href={jogador.link_sofifa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs underline block mt-2 text-center"
                    >
                      🔗 Ver no SoFIFA
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
