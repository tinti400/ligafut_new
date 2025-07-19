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

export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')

  const [filtroNacionalidade, setFiltroNacionalidade] = useState<string | null>(null)
  const [filtroPosicao, setFiltroPosicao] = useState<string | null>(null)
  const [filtroNome, setFiltroNome] = useState<string>('')
  const [filtroOverall, setFiltroOverall] = useState<number>(0)

  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = localStorage.getItem('id_time')
      if (!id_time) return setLoading(false)

      const { data: elencoData } = await supabase.from('elenco').select('*').eq('id_time', id_time)
      const { data: timeData } = await supabase.from('times').select('nome, saldo').eq('id', id_time).single()

      setElenco(elencoData || [])
      setSaldo(timeData?.saldo || 0)
      setNomeTime(timeData?.nome || '')
    } catch {
      alert('Erro inesperado ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const venderJogador = async (jogador: any) => {
    if ((jogador.jogos || 0) < 3) return exibirMensagem('🚫 O jogador não completou 3 jogos.', '#ff9800')
    if (!confirm(`💸 Vender ${jogador.nome} por R$ ${jogador.valor.toLocaleString()}?`)) return

    await supabase.from('mercado_transferencias').insert({
      jogador_id: jogador.id,
      nome: jogador.nome,
      posicao: jogador.posicao,
      overall: jogador.overall,
      valor: jogador.valor,
      imagem_url: jogador.imagem_url || '',
      salario: jogador.salario || 0,
      link_sofifa: jogador.link_sofifa || '',
      id_time_origem: jogador.id_time,
      status: 'disponivel',
      created_at: new Date().toISOString(),
    })

    await supabase.from('elenco').delete().eq('id_time', jogador.id_time).eq('id', jogador.id)
    await supabase.from('times').update({ saldo: saldo + Math.round(jogador.valor * 0.7) }).eq('id', jogador.id_time)

    await fetchElenco()
    alert(`✅ Jogador vendido!`)
  }

  const exibirMensagem = (mensagem: string, cor: string) => {
    const div = document.createElement('div')
    div.innerHTML = `<div style="background:${cor};color:white;padding:16px;border-radius:8px;text-align:center;position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999">${mensagem}</div>`
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 3000)
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

  const elencoFiltrado = elenco.filter((j) =>
    (!filtroNacionalidade || j.nacionalidade === filtroNacionalidade) &&
    (!filtroPosicao || j.posicao === filtroPosicao) &&
    (!filtroNome || j.nome.toLowerCase().includes(filtroNome.toLowerCase())) &&
    (!filtroOverall || (j.overall || 0) >= filtroOverall)
  )

  if (loading) return <p className="text-center text-white">⏳ Carregando elenco...</p>

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold text-center text-green-400 mb-2">
        👥 Elenco do {nomeTime} ({elenco.length} atletas)
      </h1>

      <div className="text-center mb-4">
        <button onClick={fetchElenco} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full">
          🔄 Atualizar elenco
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {Object.entries(contar('nacionalidade')).map(([nac, count]) => (
          <button key={nac} onClick={() => setFiltroNacionalidade(nac)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${filtroNacionalidade === nac ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
            {getFlagUrl(nac) && <img src={getFlagUrl(nac)} alt={nac} className="w-5 h-3" />} {nac} ({count})
          </button>
        ))}
        {filtroNacionalidade && <button onClick={() => setFiltroNacionalidade(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar Nacionalidade</button>}
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {Object.entries(contar('posicao')).map(([pos, count]) => (
          <button key={pos} onClick={() => setFiltroPosicao(pos)} className={`px-3 py-1 rounded-full text-sm ${filtroPosicao === pos ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
            {pos} ({count})
          </button>
        ))}
        {filtroPosicao && <button onClick={() => setFiltroPosicao(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar Posição</button>}
      </div>

      <div className="flex justify-center items-center gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="🔎 Filtrar por nome" value={filtroNome} onChange={(e) => setFiltroNome(e.target.value)} className="px-3 py-1 rounded text-black" />
        <input type="number" placeholder="🔢 Overall mínimo" value={filtroOverall} onChange={(e) => setFiltroOverall(Number(e.target.value))} className="px-3 py-1 rounded text-black w-32" />
        {(filtroNome || filtroOverall > 0) && <button onClick={() => { setFiltroNome(''); setFiltroOverall(0); }} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar Busca</button>}
      </div>

      {elencoFiltrado.length === 0 ? <p className="text-center text-gray-400">Nenhum jogador encontrado.</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {elencoFiltrado.map((jogador) => (
            <div key={jogador.id} className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700">
              <ImagemComFallback src={jogador.imagem_url} alt={jogador.nome} width={80} height={80} className="rounded-full mb-2 mx-auto" />
              <h2 className="text-lg font-bold">{jogador.nome}</h2>

              <div className="flex justify-center items-center gap-2 text-sm text-gray-300 mb-1">
                {getFlagUrl(jogador.nacionalidade) && (
                  <img src={getFlagUrl(jogador.nacionalidade)} alt={jogador.nacionalidade} className="w-5 h-3" />
                )}
                <span>{jogador.nacionalidade || 'Outro'}</span>
              </div>

              <p className="text-gray-300 text-sm">{jogador.posicao} • Overall {jogador.overall ?? 'N/A'}</p>
              <p className="text-green-400 font-semibold">💰 R$ {jogador.valor.toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Salário: R$ {(jogador.salario || 0).toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Jogos: {jogador.jogos ?? 0}</p>

              <button onClick={() => venderJogador(jogador)} className="mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full text-sm w-full">
                💸 Vender
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
