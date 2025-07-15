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

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    const fetchElenco = async () => {
      if (!user?.id_time) return

      setLoading(true)

      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo, logo_url')
        .eq('id', user.id_time)
        .single()

      if (timeData) {
        setNomeTime(timeData.nome)
        setLogoUrl(timeData.logo_url)
        setSaldo(timeData.saldo)
        setCorPrimaria(definirCorPorTime(timeData.nome))
      }

      const { data: jogadores } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', user.id_time)

      setElenco(jogadores || [])

      const folha = (jogadores || []).reduce((total, j) => total + (j.salario || 0), 0)
      setFolhaSalarial(folha)

      setLoading(false)
    }

    fetchElenco()
  }, [])

  const definirCorPorTime = (nome: string) => {
    const cores: any = {
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
    return cores[nome] || '#10b981'
  }

  const venderJogador = async (jogador: any) => {
    if (!confirm(`💸 Vender ${jogador.nome} por R$ ${jogador.valor.toLocaleString()}?\nVocê receberá 70% do valor.`)) return

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

      await supabase.rpc('atualizar_saldo_time', {
        p_id_time: jogador.id_time,
        p_valor: Math.round(jogador.valor * 0.7)
      })

      setElenco((prev) => prev.filter((j) => j.id !== jogador.id))
      setSaldo((prev) => prev + Math.round(jogador.valor * 0.7))
      setFolhaSalarial((prev) => prev - (jogador.salario || 0))

      alert('✅ Jogador vendido e saldo atualizado!')
    } catch (err) {
      console.error('Erro ao vender jogador:', err)
      alert('❌ Erro ao vender jogador.')
    }
  }

  const ordem = ['GL', 'ZAG', 'LE', 'LD', 'VOL', 'MC', 'MEI', 'MD', 'ME', 'SA', 'PD', 'PE', 'CA']
  const elencoOrdenado = [...elenco].sort((a, b) => ordem.indexOf(a.posicao) - ordem.indexOf(b.posicao))

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="flex items-center justify-center gap-4 mb-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-full border" />
        ) : (
          <div className="w-12 h-12 rounded-full border flex items-center justify-center bg-gray-700 text-xs">
            Sem Logo
          </div>
        )}
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
          {elencoOrdenado.map((j) => (
            <div key={j.id} className="border border-gray-700 rounded-lg p-4 shadow bg-gray-800 text-center flex flex-col items-center">
              <img
                src={j.imagem_url || 'https://upload.wikimedia.org/wikipedia/commons/9/99/Sample_User_Icon.png'}
                alt={j.nome}
                className="w-16 h-16 rounded-full object-cover mb-2 border"
              />
              <div className="font-semibold">{j.nome}</div>
              <div className="text-xs text-gray-300">{j.posicao} • Overall {j.overall}</div>
              <div className="text-green-400 font-bold text-sm mt-1">
                💰 R$ {j.valor.toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-gray-400">Salário: R$ {(j.salario || 0).toLocaleString('pt-BR')}</div>
              <div className="text-xs text-gray-400">Jogos: {j.jogos || 0}</div>

              {j.link_sofifa ? (
                <a href={j.link_sofifa} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 mt-1 hover:underline">
                  🔗 Ver no SoFIFA
                </a>
              ) : (
                <span className="text-xs text-gray-500 mt-1">🔗 Sem link</span>
              )}

              <button
                onClick={() => venderJogador(j)}
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
