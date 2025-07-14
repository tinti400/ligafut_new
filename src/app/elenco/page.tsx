'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')
  const [corPrimaria, setCorPrimaria] = useState('#10b981')

  useEffect(() => {
    const fetchElenco = async () => {
      setLoading(true)

      const userStorage = localStorage.getItem('user')
      if (!userStorage) return

      const userData = JSON.parse(userStorage)
      const id_time = userData.id_time

      const { data: timeData } = await supabase
        .from('times')
        .select('nome')
        .eq('id', id_time)
        .single()

      const nome = timeData?.nome || ''
      setNomeTime(nome)
      setCorPrimaria(definirCorPorTime(nome))

      const { data: jogadores } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      setElenco(jogadores || [])
      setLoading(false)
    }

    fetchElenco()
  }, [])

  const definirCorPorTime = (nome: string) => {
    const mapaCores: { [key: string]: string } = {
      'Flamengo': '#d32f2f',
      'Palmeiras': '#1b5e20',
      'Corinthians': '#212121',
      'São Paulo': '#c62828',
      'Vasco': '#000000',
      'Santos': '#424242',
      'Grêmio': '#1976d2',
      'Internacional': '#c62828',
      'Botafogo': '#37474f',
      'Atlético-MG': '#424242'
    }
    return mapaCores[nome] || '#10b981'
  }

  const venderJogador = async (jogador: any) => {
    const confirmar = confirm(`💸 Deseja vender ${jogador.nome} por R$ ${Number(jogador.valor).toLocaleString('pt-BR')}?`)
    if (!confirmar) return

    try {
      await supabase.from('mercado_transferencias').insert({
        jogador_id: jogador.id,
        nome: jogador.nome,
        posicao: jogador.posicao,
        overall: jogador.overall,
        valor: jogador.valor,
        imagem_url: jogador.imagem_url || '',
        id_time_origem: jogador.id_time,
        status: 'disponivel',
        created_at: new Date().toISOString()
      })

      await supabase.from('elenco').delete().eq('id', jogador.id)
      setElenco((prev) => prev.filter((j) => j.id !== jogador.id))

      alert('✅ Jogador colocado no mercado com sucesso!')
    } catch (error) {
      console.error('Erro ao vender jogador:', error)
      alert('❌ Ocorreu um erro ao tentar vender o jogador.')
    }
  }

  const ordemPosicoes = ['GL', 'ZAG', 'LE', 'LD', 'VOL', 'MC', 'MEI', 'MD', 'ME', 'SA', 'PD', 'PE', 'CA']
  const elencoOrdenado = [...elenco].sort((a, b) => {
    const posA = ordemPosicoes.indexOf(a.posicao)
    const posB = ordemPosicoes.indexOf(b.posicao)
    return posA - posB
  })

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold text-center mb-6" style={{ color: corPrimaria }}>
        👥 Elenco do {nomeTime}
      </h1>

      {loading ? (
        <p className="text-center text-gray-400">Carregando elenco...</p>
      ) : elenco.length === 0 ? (
        <p className="text-center text-gray-400">Nenhum jogador encontrado.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {elencoOrdenado.map((jogador) => (
            <div key={jogador.id} className="border border-gray-700 rounded-lg p-4 shadow bg-gray-800 text-center flex flex-col items-center">
              <img
                src={jogador.imagem_url || 'https://upload.wikimedia.org/wikipedia/commons/9/99/Sample_User_Icon.png'}
                alt={jogador.nome}
                className="w-16 h-16 rounded-full object-cover mb-2 border"
              />
              <div className="font-semibold">{jogador.nome}</div>
              <div className="text-xs text-gray-300">{jogador.posicao} • Overall {jogador.overall}</div>
              <div className="text-green-400 font-bold text-sm mt-1">
                💰 R$ {Number(jogador.valor).toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-gray-400">Salário: R$ {Number(jogador.salario || 0).toLocaleString('pt-BR')}</div>
              <div className="text-xs text-gray-400">Jogos: {jogador.jogos || 0}</div>

              {jogador.link_sofifa ? (
                <a href={jogador.link_sofifa} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 mt-1 hover:underline">
                  🔗 Ver no SoFIFA
                </a>
              ) : (
                <span className="text-xs text-gray-500 mt-1">🔗 Sem link</span>
              )}

              <button
                onClick={() => venderJogador(jogador)}
                className="mt-3 bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-1 rounded"
              >
                💸 Vender
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
