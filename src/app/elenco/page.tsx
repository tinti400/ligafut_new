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
  GL: 'bg-yellow-500', Zagueiro: 'bg-blue-500', LD: 'bg-indigo-400', LE: 'bg-indigo-500',
  VOL: 'bg-green-600', MC: 'bg-green-500', ME: 'bg-green-400', MD: 'bg-green-400',
  SA: 'bg-orange-500', Centroavante: 'bg-red-600', PD: 'bg-pink-500', PE: 'bg-pink-600',
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
  const [ordenacao, setOrdenacao] = useState<'valor' | 'overall' | 'salario' | 'jogos'>('valor')
  const [selecionados, setSelecionados] = useState<string[]>([])

  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
      if (!id_time) {
        setElenco([])
        setSaldo(0)
        setNomeTime('')
        return
      }

      const [{ data: elencoData, error: e1 }, { data: timeData, error: e2 }] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single()
      ])

      if (e1) console.error('Erro elenco:', e1)
      if (e2) console.error('Erro time:', e2)

      setElenco(elencoData || [])
      setSaldo(timeData?.saldo || 0)
      setNomeTime(timeData?.nome || '')
      setSelecionados([])
    } catch (err) {
      console.error(err)
      alert('Erro ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const exibirMensagem = (mensagem: string, cor: string) => {
    const div = document.createElement('div')
    div.innerHTML = `<div style="background:${cor};color:white;padding:16px;border-radius:8px;text-align:center;position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999">${mensagem}</div>`
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 3500)
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

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }

  // Helpers: registra evento no BID
  async function registrarNoBID({
    tipo_evento,
    descricao,
    id_time1,
    valor
  }: {
    tipo_evento: string
    descricao: string
    id_time1: string
    valor?: number | null
  }) {
    const { error } = await supabase.from('bid').insert({
      tipo_evento,
      descricao,
      id_time1,
      valor: valor ?? null,
      data_evento: new Date().toISOString()
    })
    if (error) {
      console.error('Erro ao registrar no BID:', error)
      exibirMensagem('⚠️ Falha ao registrar no BID.', '#b45309')
    }
  }

  // 🚀 Vender selecionados com:
  // - Inserção no mercado
  // - Atualização do percentual/remover do elenco
  // - Crédito atômico (RPC retorna saldo novo)
  // - Registro no BID
  // - Mensagem com "Caixa atualizado para R$ X (antigo + venda)"
  const venderSelecionados = async () => {
    const jogadores = elenco.filter(j => selecionados.includes(j.id))
    if (jogadores.length === 0) return

    for (const jogador of jogadores) {
      try {
        if ((jogador.jogos || 0) < 3) {
          exibirMensagem(`🚫 ${jogador.nome} não completou 3 jogos.`, '#b91c1c')
          continue
        }

        const percentualStr = prompt(`Quantos % de ${jogador.nome} deseja vender?`, String(jogador.percentual ?? 100))
        if (percentualStr === null) continue // cancelado

        const percentualNum = Number(percentualStr)
        const percentualAtual = Number(jogador.percentual ?? 100)

        if (!Number.isFinite(percentualNum) || percentualNum <= 0 || percentualNum > percentualAtual) {
          exibirMensagem('❌ Percentual inválido.', '#b91c1c')
          continue
        }

        const baseValor = Number(jogador.valor || 0)
        const valorVenda = Math.round((baseValor * percentualNum / 100) * 0.7)

        // 1) Inserir no mercado
        {
          const { error } = await supabase.from('mercado_transferencias').insert({
            jogador_id: jogador.id,
            nome: jogador.nome,
            posicao: jogador.posicao,
            overall: jogador.overall,
            valor: baseValor,
            imagem_url: jogador.imagem_url || '',
            salario: jogador.salario || 0,
            link_sofifa: jogador.link_sofifa || '',
            id_time_origem: jogador.id_time,
            status: 'disponivel',
            percentual: percentualNum,
            created_at: new Date().toISOString()
          })
          if (error) {
            console.error('Erro ao inserir no mercado:', error)
            exibirMensagem(`❌ Falha ao anunciar ${jogador.nome} no mercado.`, '#b91c1c')
            continue
          }
        }

        // 2) Atualizar percentual no elenco (ou remover)
        const novoPercentual = percentualAtual - percentualNum
        if (novoPercentual <= 0) {
          const { error } = await supabase.from('elenco').delete().eq('id', jogador.id)
          if (error) {
            console.error('Erro ao remover do elenco:', error)
            exibirMensagem(`⚠️ Falha ao remover ${jogador.nome} do elenco.`, '#b45309')
          }
        } else {
          const { error } = await supabase.from('elenco').update({ percentual: novoPercentual }).eq('id', jogador.id)
          if (error) {
            console.error('Erro ao atualizar percentual:', error)
            exibirMensagem(`⚠️ Falha ao atualizar percentual de ${jogador.nome}.`, '#b45309')
          }
        }

        // 3) Crédito atômico + receber saldo NOVO já atualizado
        let saldoNovo: number | null = null
        {
          // saldo antigo (apenas para mostrar a conta no toast)
          let saldoAntigo = saldo
          // se quiser garantir um saldoAntigo real do banco para este time específico:
          const { data: timeRow } = await supabase
            .from('times')
            .select('saldo')
            .eq('id', jogador.id_time)
            .single()
          if (timeRow?.saldo != null) {
            saldoAntigo = Number(timeRow.saldo)
          }

          const { data, error } = await supabase.rpc('increment_saldo_return', {
            p_time_id: jogador.id_time,
            p_delta: valorVenda
          })
          if (error) {
            console.error('Erro ao incrementar saldo via RPC:', error)
            exibirMensagem(`❌ Falha ao creditar R$ ${valorVenda.toLocaleString()} para o time.`, '#b91c1c')
            continue
          }
          saldoNovo = Number(data)

          // Se o jogador pertencer ao time logado, atualiza o estado local do saldo
          const id_time_local = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
          if (id_time_local && id_time_local === jogador.id_time) {
            setSaldo(saldoNovo)
          }

          // 4) Registrar no BID
          await registrarNoBID({
            tipo_evento: 'venda_mercado',
            descricao: `Venda de ${percentualNum}% de ${jogador.nome} por R$ ${valorVenda.toLocaleString()}`,
            id_time1: jogador.id_time,
            valor: valorVenda
          })

          // 5) Mensagem com saldo novo
          exibirMensagem(
            `✅ ${jogador.nome}: venda de ${percentualNum}% registrada (+R$ ${valorVenda.toLocaleString()}). Caixa atualizado: R$ ${saldoAntigo.toLocaleString()} → R$ ${Number(saldoNovo).toLocaleString()}`,
            '#16a34a'
          )
        }
      } catch (err) {
        console.error('Erro na venda:', err)
        exibirMensagem('❌ Ocorreu um erro ao processar a venda.', '#b91c1c')
      }
    }

    await fetchElenco()
  }

  const valorTotal = elenco.reduce((acc, j) => acc + (j.valor || 0), 0)
  const salarioTotal = elenco.reduce((acc, j) => acc + (j.salario || 0), 0)
  const mediaOverall =
    elenco.length > 0 ? elenco.reduce((acc, j) => acc + (j.overall || 0), 0) / elenco.length : 0

  const elencoFiltrado = elenco
    .filter(j =>
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold text-center text-green-400 mb-1">
        👥 Elenco do {nomeTime} ({elenco.length} atletas)
      </h1>
      <p className="text-center text-sm text-gray-300 mb-1">💰 Caixa: <span className="text-green-400 font-semibold">R$ {saldo.toLocaleString()}</span></p>
      <p className="text-center text-sm text-gray-300 mb-1">📦 Valor do elenco: <span className="text-yellow-400 font-semibold">R$ {valorTotal.toLocaleString()}</span></p>
      <p className="text-center text-sm text-gray-300 mb-4">💸 Salários totais: <span className="text-red-400 font-semibold">R$ {salarioTotal.toLocaleString()}</span> • Média de Overall: <span className="text-blue-400 font-semibold">{mediaOverall.toFixed(1)}</span></p>

      <div className="text-center mb-4">
        <button onClick={fetchElenco} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full">🔄 Atualizar elenco</button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto">
        {Object.entries(contar('nacionalidade')).map(([nac, count]) => (
          <button key={nac} onClick={() => setFiltroNacionalidade(nac)} className={`px-3 py-1 rounded-full text-sm ${filtroNacionalidade === nac ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
            {getFlagUrl(nac) && <img src={getFlagUrl(nac)} className="inline-block w-5 h-3 mr-1" />} {nac} ({count})
          </button>
        ))}
        {filtroNacionalidade && <button onClick={() => setFiltroNacionalidade(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar</button>}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto">
        {Object.entries(contar('posicao')).map(([pos, count]) => (
          <button key={pos} onClick={() => setFiltroPosicao(pos)} className={`px-3 py-1 rounded-full text-sm ${filtroPosicao === pos ? 'bg-green-600' : 'bg-gray-700'} hover:bg-green-700`}>
            {pos} ({count})
          </button>
        ))}
        {filtroPosicao && <button onClick={() => setFiltroPosicao(null)} className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-sm">❌ Limpar</button>}
      </div>

      <div className="flex flex-wrap justify-center items-center gap-2 mb-6">
        <input type="text" placeholder="🔎 Nome" value={filtroNome} onChange={(e) => setFiltroNome(e.target.value)} className="px-3 py-1 rounded text-black" />
        <input type="number" placeholder="⭐ Overall mínimo" value={filtroOverall} onChange={(e) => setFiltroOverall(Number(e.target.value))} className="px-3 py-1 rounded text-black w-32" />
        <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as any)} className="px-3 py-1 rounded text-black">
          <option value="valor">💰 Valor</option>
          <option value="overall">⭐ Overall</option>
          <option value="salario">💸 Salário</option>
          <option value="jogos">🏟️ Jogos</option>
        </select>
      </div>

      {selecionados.length > 0 && (
        <button onClick={venderSelecionados} className="fixed bottom-6 right-6 bg-green-600 hover:bg-green-700 px-6 py-3 text-white font-bold rounded-full shadow-lg z-50">
          💸 Vender {selecionados.length} jogador(es)
        </button>
      )}

      {/* Lista de jogadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {elencoFiltrado.map(jogador => {
          const selecionado = selecionados.includes(jogador.id)
          const status = []
          if (jogador.protegido) status.push('🛡️ Protegido')
          if (jogador.lesionado) status.push('⚠️ Lesionado')
          if ((jogador.jogos || 0) >= 7) status.push('🔥 Em Alta')

          return (
            <div
              key={jogador.id}
              onClick={() => toggleSelecionado(jogador.id)}
              className={`relative bg-gray-800 p-4 rounded-xl text-center border-2 cursor-pointer transition transform hover:scale-105 ${selecionado ? 'border-green-400' : 'border-gray-700'}`}
            >
              {selecionado && (
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">✔</div>
              )}
              <ImagemComFallback src={jogador.imagem_url} alt={jogador.nome} width={80} height={80} className="rounded-full mb-2 mx-auto" />
              <h2 className="text-lg font-bold">{jogador.nome}</h2>
              <div className="flex justify-center items-center gap-2 text-sm text-gray-300 mb-1">
                {getFlagUrl(jogador.nacionalidade) && <img src={getFlagUrl(jogador.nacionalidade)} alt={jogador.nacionalidade} className="w-5 h-3" />}
                <span>{jogador.nacionalidade || 'Outro'}</span>
              </div>
              <span className={`inline-block ${coresPorPosicao[jogador.posicao] || 'bg-gray-600'} text-xs text-white px-3 py-1 rounded-full mb-2`}>
                {jogador.posicao}
              </span>
              <p className="text-sm text-gray-300">Overall: {jogador.overall}</p>
              <p className="text-green-400 font-semibold">💰 R$ {Number(jogador.valor || 0).toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Salário: R$ {Number(jogador.salario || 0).toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Jogos: {jogador.jogos ?? 0}</p>
              <p className="text-gray-400 text-xs">Percentual: {jogador.percentual ?? 100}%</p>
              {jogador.link_sofifa && (
                <a href={jogador.link_sofifa} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs underline block mt-1">🔗 Ver no SoFIFA</a>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
