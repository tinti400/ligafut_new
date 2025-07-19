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
  Taiti: 'pf', Filipinas: 'ph', Malásia: 'my', Tailândia: 'th', Vietnã: 'vn',
  Singapura: 'sg', Hong_Kong: 'hk', Bangladesh: 'bd', Paquistão: 'pk', Qatar: 'qa',
  Bahrein: 'bh', Omã: 'om', Kuwait: 'kw'
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
    } catch (error) {
      alert('Erro inesperado: ' + error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const venderJogador = async (jogador: any) => {
    try {
      if ((jogador.jogos || 0) < 3) {
        exibirMensagem('🚫 O seu jogador não completou 3 jogos.', '#ff9800')
        return
      }

      const confirmar = confirm(`💸 Deseja vender ${jogador.nome} por R$ ${jogador.valor.toLocaleString()}?`)
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

      await fetchElenco()
      alert(`✅ Jogador vendido! R$ ${valorRecebido.toLocaleString()} creditado.`)
    } catch (error) {
      alert('❌ Ocorreu um erro inesperado: ' + error)
    }
  }

  const exibirMensagem = (mensagem: string, cor: string) => {
    const div = document.createElement('div')
    div.innerHTML = `
      <div style="
        background-color: ${cor};
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
      ">
        ${mensagem}
      </div>
    `
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 3000)
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

  if (loading) return <p className="text-center text-white">⏳ Carregando elenco...</p>

  const nacionalidades = contarNacionalidades()

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold text-center text-green-400 mb-2">
        👥 Elenco do {nomeTime} ({elenco.length} atletas)
      </h1>

      <div className="text-center mb-6">
        <button onClick={fetchElenco} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full">
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
