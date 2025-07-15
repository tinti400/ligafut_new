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
  const [logoUrl, setLogoUrl] = useState('')
  const [saldo, setSaldo] = useState(0)
  const [folhaSalarial, setFolhaSalarial] = useState(0)
  const [corPrimaria, setCorPrimaria] = useState('#10b981')

  useEffect(() => {
    const fetchElenco = async () => {
      setLoading(true)

      const userStorage = localStorage.getItem('user')
      if (!userStorage) return setLoading(false)

      const userData = JSON.parse(userStorage)
      const id_time = userData.id_time
      if (!id_time) return setLoading(false)

      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo, logo_url')
        .eq('id', id_time)
        .single()

      setNomeTime(timeData?.nome || '')
      setLogoUrl(timeData?.logo_url || '')
      setSaldo(timeData?.saldo || 0)
      setCorPrimaria(definirCorPorTime(timeData?.nome || ''))

      const { data: jogadores } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      const folha = (jogadores || []).reduce((acc, jogador) => acc + (jogador.salario || 0), 0)
      setElenco(jogadores || [])
      setFolhaSalarial(folha)

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
    const confirmar = confirm(`💸 Deseja vender ${jogador.nome} por R$ ${Number(jogador.valor).toLocaleString('pt-BR')}?\nO clube receberá 70% deste valor.`)
    if (!confirmar) return

    try {
      const { error: errorInsert } = await supabase
        .from('mercado_transferencias')
        .insert({
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

      if (errorInsert) {
        console.error('❌ Erro ao inserir no mercado:', errorInsert)
        alert('❌ Erro ao inserir o jogador no mercado.')
        return
      }

      const { error: errorDelete } = await supabase
        .from('elenco')
        .delete()
        .eq('id', jogador.id)

      if (errorDelete) {
        console.error('❌ Erro ao remover do elenco:', errorDelete)
        alert('❌ Erro ao remover o jogador do elenco.')
        return
      }

      const valorRecebido = Math.round(jogador.valor * 0.7)
      const { error: errorSaldo } = await supabase
        .from('times')
        .update({ saldo: saldo + valorRecebido })
        .eq('id', jogador.id_time)

      if (errorSaldo) {
        console.error('❌ Erro ao atualizar saldo:', errorSaldo)
        alert('❌ Erro ao atualizar o saldo do time.')
        return
      }

      setElenco((prev) => prev.filter((j) => j.id !== jogador.id))
      setSaldo((prev) => prev + valorRecebido)
      setFolhaSalarial((prev) => prev - (jogador.salario || 0))

      alert(`✅ Jogador vendido! R$ ${valorRecebido.toLocaleString('pt-BR')} creditado.`)

    } catch (error) {
      console.error('❌ Erro inesperado:', error)
      alert('❌ Ocorreu um erro inesperado.')
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
      <div className="flex items-center justify-center gap-4 mb-4">
        {logoUrl && <img src={logoUrl} alt="Logo Time" className="w-12 h-12 rounded-full border" />}
        <h1 className="text-2xl font-bold" style={{ color: corPrimaria }}>
          👥 Elenco do {nomeTime}
        </h1>
      </div>

      <div className="text-center text-sm text-gray-300 mb-6">
        💰 Caixa: <span className="text-green-400 font-bold">R$ {saldo.toLocaleString('pt-BR')}</span> •
        👥 Jogadores: <span className="text-green-400 font-bold">{elenco.length}</span> •
        📝 Folha Salarial: <span className="text-green-400 font-bold">R$ {folhaSalarial.toLocaleString('pt-BR')}</span>
      </div>

      {loading ? (
        <p className="text-center text-gray-400">⏳ Carregando elenco...</p>
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
