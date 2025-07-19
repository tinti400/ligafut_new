'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import CampoTatico from '@/components/CampoTatico'
import ListaJogadores from '@/components/ListaJogadores'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const formacao442 = [
  ['ATA', 'ATA'],
  ['MEI', 'MEI', 'MEI', 'MEI'],
  ['LAT', 'ZAG', 'ZAG', 'LAT'],
  ['GOL'],
]

export default function PainelTaticoPage() {
  const [escala, setEscala] = useState<Record<string, any>>({})
  const [jogadorSelecionado, setJogadorSelecionado] = useState<any>(null)
  const [jogadoresDisponiveis, setJogadoresDisponiveis] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const fetchElenco = async () => {
      const id_time = localStorage.getItem('id_time') || ''
      if (!id_time) return

      const { data, error } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      if (error) {
        alert('❌ Erro ao buscar elenco: ' + error.message)
        return
      }

      setJogadoresDisponiveis(data || [])
    }

    fetchElenco()
  }, [])

  const handleEscalar = (posicao: string) => {
    if (!jogadorSelecionado) {
      alert('⚠️ Selecione um jogador primeiro!')
      return
    }

    setEscala((prev) => ({ ...prev, [posicao]: jogadorSelecionado }))
    setJogadorSelecionado(null)
  }

  const salvarEscalacao = async () => {
    try {
      setSalvando(true)
      const id_time = localStorage.getItem('id_time') || ''
      if (!id_time) throw new Error('ID do time não encontrado!')

      const { error } = await supabase
        .from('taticos')
        .upsert({
          id_time,
          formacao: '4-4-2',
          escalação: escala,
          created_at: new Date().toISOString(),
        }, { onConflict: 'id_time' })

      if (error) throw error

      alert('✅ Escalação salva com sucesso!')
    } catch (err: any) {
      alert('❌ Erro ao salvar escalação: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-center text-green-400 mb-4">🎯 Painel Tático - 4-4-2</h1>

      <ListaJogadores jogadores={jogadoresDisponiveis} onSelecionar={setJogadorSelecionado} />

      {jogadorSelecionado && (
        <p className="text-center text-yellow-300 mt-4">
          Jogador Selecionado: <strong>{jogadorSelecionado.nome}</strong>
        </p>
      )}

      <div className="mt-6">
        <CampoTatico formacao={formacao442} escalação={escala} onEscalar={handleEscalar} />
      </div>

      <div className="text-center mt-6">
        <button
          onClick={salvarEscalacao}
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold px-4 py-2 rounded"
        >
          💾 {salvando ? 'Salvando...' : 'Salvar Escalação'}
        </button>
      </div>
    </div>
  )
}
