'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const bandeiras: Record<string, string> = {
  Argentina: 'ar', Bolívia: 'bo', Brasil: 'br', Chile: 'cl', Colômbia: 'co',
  Equador: 'ec', Guiana: 'gy', Paraguai: 'py', Peru: 'pe', Suriname: 'sr',
  Uruguai: 'uy', Venezuela: 've', México: 'mx', Canadá: 'ca', Estados_Unidos: 'us',
  Guatemala: 'gt', Honduras: 'hn', El_Salvador: 'sv', Nicarágua: 'ni',
  Costa_Rica: 'cr', Panamá: 'pa', Cuba: 'cu', República_Dominicana: 'do',
  Jamaica: 'jm', Haiti: 'ht', Alemanha: 'de', França: 'fr', Itália: 'it',
  Espanha: 'es', Inglaterra: 'gb', Portugal: 'pt', Bélgica: 'be',
  Países_Baixos: 'nl', Suíça: 'ch', Áustria: 'at', Dinamarca: 'dk', Suécia: 'se',
  Noruega: 'no', Finlândia: 'fi', Islândia: 'is', Croácia: 'hr', Polônia: 'pl',
  República_Tcheca: 'cz', Hungria: 'hu', Rússia: 'ru', Escócia: 'gb-sct',
  Irlanda: 'ie', Sérvia: 'rs', Eslovênia: 'si', Eslováquia: 'sk', Romênia: 'ro',
  Ucrânia: 'ua', Grécia: 'gr', Turquia: 'tr', Geórgia: 'ge', Armênia: 'am',
  Azerbaijão: 'az', Bulgária: 'bg', África_do_Sul: 'za', Argélia: 'dz',
  Angola: 'ao', Camarões: 'cm', Costa_do_Marfim: 'ci', Egito: 'eg', Gana: 'gh',
  Marrocos: 'ma', Nigéria: 'ng', Senegal: 'sn', Tunísia: 'tn', Moçambique: 'mz',
  República_Democrática_do_Congo: 'cd', Japão: 'jp', China: 'cn', Coreia_do_Sul: 'kr',
  Irã: 'ir', Iraque: 'iq', Arábia_Saudita: 'sa', Catar: 'qa',
  Emirados_Árabes_Unidos: 'ae', Índia: 'in', Indonésia: 'id', Austrália: 'au',
  Nova_Zelândia: 'nz', Uzbequistão: 'uz', Cazaquistão: 'kz', Nova_Caledônia: 'nc',
  Taiti: 'pf',
}

export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')

  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = localStorage.getItem('id_time')
      if (!id_time) {
        alert('ID do time não encontrado no localStorage.')
        setLoading(false)
        return
      }

      const { data: elencoData } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      setElenco(elencoData || [])
      setSaldo(timeData?.saldo || 0)
      setNomeTime(timeData?.nome || '')

      localStorage.setItem('saldo', (timeData?.saldo || 0).toString())
      const totalSalariosElenco = (elencoData || []).reduce(
        (total, j) => total + (j.salario || 0), 0
      )
      localStorage.setItem('total_salarios', totalSalariosElenco.toString())
    } catch (error) {
      alert('Erro inesperado: ' + error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const valorTotalElenco = elenco.reduce((total, j) => total + (j.valor || 0), 0)
  const totalSalarios = elenco.reduce((total, j) => total + (j.salario || 0), 0)

  const venderJogador = async (jogador: any) => {
    try {
      const { data: config, error: errorConfig } = await supabase
        .from('configuracoes')
        .select('mercado_aberto')
        .single()

      if (errorConfig) {
        alert('❌ Erro ao verificar o status do mercado.')
        return
      }

      if (!config?.mercado_aberto) {
        const div = document.createElement('div')
        div.innerHTML = `
          <div style="
            background-color: #ff4d4f;
            color: white;
            padding: 16px;
            border-radius: 8px;
            font-weight: bold;
            text-align: center;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          ">
            🚫 O mercado de transferências está fechado. Não é possível vender jogadores agora.
          </div>
        `
        document.body.appendChild(div)
        setTimeout(() => div.remove(), 3000)
        return
      }

      if ((jogador.jogos || 0) < 3) {
        const div = document.createElement('div')
        div.innerHTML = `
          <div style="
            background-color: #ff9800;
            color: white;
            padding: 16px;
            border-radius: 8px;
            font-weight: bold;
            text-align: center;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          ">
            🚫 O seu jogador não completou 3 jogos e não pode ser vendido.
          </div>
        `
        document.body.appendChild(div)
        setTimeout(() => div.remove(), 3000)
        return
      }

      const confirmar = confirm(
        `💸 Deseja vender ${jogador.nome} por R$ ${Number(jogador.valor).toLocaleString('pt-BR')}?\nO clube receberá 70% deste valor.`
      )
      if (!confirmar) return

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

      const valorRecebido = Math.round(jogador.valor * 0.7)
      await supabase.from('times').update({ saldo: saldo + valorRecebido }).eq('id', jogador.id_time)

      await supabase.from('bid').insert({
        tipo_evento: 'venda',
        descricao: `O ${nomeTime} vendeu ${jogador.nome} para o Mercado de Transferências por R$ ${jogador.valor.toLocaleString('pt-BR')}.`,
        id_time1: jogador.id_time,
        valor: jogador.valor,
        data_evento: new Date().toISOString(),
      })

      await fetchElenco()
      alert(`✅ Jogador vendido! R$ ${valorRecebido.toLocaleString('pt-BR')} creditado.`)
    } catch (error) {
      alert('❌ Ocorreu um erro inesperado: ' + error)
    }
  }

  const getFlagUrl = (pais: string) => {
    const codigo = bandeiras[pais]
    return codigo ? `https://flagcdn.com/w40/${codigo}.png` : ''
  }

  const contarNacionalidades = () => {
    const contagem: Record<string, number> = {}
    elenco.forEach((j) => {
      const key = j.nacionalidade || 'Resto do Mundo'
      contagem[key] = (contagem[key] || 0) + 1
    })
    return contagem
  }

  if (loading) return <p className="text-center mt-10 text-white">⏳ Carregando elenco...</p>

  const nacionalidades = contarNacionalidades()

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-2 text-center text-green-400">
        👥 Elenco do {nomeTime} ({elenco.length} atletas)
      </h1>
      <p className="text-center text-gray-300 mb-2">
        💰 Saldo: <strong>R$ {saldo.toLocaleString('pt-BR')}</strong> | 🧩 Valor Total do Elenco: <strong>R$ {valorTotalElenco.toLocaleString('pt-BR')}</strong> | 💵 Salários Totais: <strong>R$ {totalSalarios.toLocaleString('pt-BR')}</strong>
      </p>

      <div className="flex flex-wrap justify-center gap-2 text-sm mb-4">
        {Object.entries(nacionalidades).map(([pais, qtd]) => (
          <div key={pais} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded-full">
            {pais === 'Resto do Mundo' ? (
              <span>🌎</span>
            ) : (
              <img src={getFlagUrl(pais)} alt={pais} width={16} height={12} />
            )}
            <span>{pais} ({qtd})</span>
          </div>
        ))}
      </div>

      <div className="text-center mb-6">
        <button onClick={fetchElenco} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-full text-sm">
          🔄 Atualizar elenco
        </button>
      </div>

      {elenco.length === 0 ? (
        <p className="text-center text-gray-400">Nenhum jogador no elenco.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {elenco.map((jogador) => (
            <div key={jogador.id} className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700">
              <ImagemComFallback src={jogador.imagem_url} alt={jogador.nome} width={80} height={80} className="rounded-full mb-2 mx-auto" />
              <h2 className="text-lg font-bold">{jogador.nome}</h2>
              <p className="text-gray-300 text-sm">{jogador.posicao} • Overall {jogador.overall ?? 'N/A'}</p>

              {jogador.nacionalidade && (
                <div className="flex items-center justify-center gap-2 mt-1 mb-1">
                  {getFlagUrl(jogador.nacionalidade) && (
                    <img src={getFlagUrl(jogador.nacionalidade)} alt={jogador.nacionalidade} width={24} height={16} className="inline-block rounded-sm" />
                  )}
                  <span className="text-xs text-gray-300">{jogador.nacionalidade}</span>
                </div>
              )}

              <p className="text-green-400 font-semibold">💰 R$ {jogador.valor.toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Salário: R$ {(jogador.salario || 0).toLocaleString()}</p>

              <button onClick={() => venderJogador(jogador)} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-full text-sm w-full">
                💸 Vender
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
