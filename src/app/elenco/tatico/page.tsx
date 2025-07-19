'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'
import ListaJogadores from '@/components/ListaJogadores'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const formacoes: Record<string, string[][]> = {
  '4-4-2': [
    ['ATA', 'ATA'],
    ['MEI', 'MEI', 'MEI', 'MEI'],
    ['LAT', 'ZAG', 'ZAG', 'LAT'],
    ['GOL'],
  ],
  '4-3-3': [
    ['ATA', 'ATA', 'ATA'],
    ['MEI', 'MEI', 'MEI'],
    ['LAT', 'ZAG', 'ZAG', 'LAT'],
    ['GOL'],
  ],
  '3-5-2': [
    ['ATA', 'ATA'],
    ['MEI', 'MEI', 'MEI', 'MEI', 'MEI'],
    ['ZAG', 'ZAG', 'ZAG'],
    ['GOL'],
  ],
}

export default function PainelTaticoPage() {
  const [escala, setEscala] = useState<Record<string, any>>({})
  const [jogadorSelecionado, setJogadorSelecionado] = useState<any>(null)
  const [jogadoresDisponiveis, setJogadoresDisponiveis] = useState<any[]>([])
  const [salvando, setSalvando] = useState(false)
  const [formacaoSelecionada, setFormacaoSelecionada] = useState<string>('4-4-2')

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
          formacao: formacaoSelecionada,
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

  const renderCampo = () => (
    <div className="relative w-full max-w-md mx-auto bg-green-700 rounded-lg py-6 px-2 border-4 border-green-900">
      {formacoes[formacaoSelecionada].map((linha, linhaIdx) => (
        <div key={linhaIdx} className="flex justify-center gap-4 my-4">
          {linha.map((pos, posIdx) => {
            const jogador = escala[pos]
            return (
              <div
                key={posIdx}
                onClick={() => handleEscalar(pos)}
                className="flex flex-col items-center cursor-pointer hover:scale-105 transition"
              >
                <div className="w-16 h-16 rounded-full bg-white overflow-hidden border-2 border-gray-300">
                  {jogador?.imagem_url ? (
                    <Image
                      src={jogador.imagem_url}
                      alt={jogador.nome}
                      width={64}
                      height={64}
                      className="object-cover"
                    />
                  ) : (
                    <Image
                      src="/mnt/data/fccf7495-b787-4e64-a0c9-d6f2d95b86c4.png"
                      alt="Sem imagem"
                      width={64}
                      height={64}
                      className="object-cover"
                    />
                  )}
                </div>
                <span className="text-xs text-white mt-1 text-center">{jogador?.nome || pos}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )

  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-center text-green-400 mb-4">🎯 Painel Tático</h1>

      <div className="text-center mb-4">
        <select
          value={formacaoSelecionada}
          onChange={(e) => {
            setFormacaoSelecionada(e.target.value)
            setEscala({})
          }}
          className="bg-gray-800 text-white border px-3 py-2 rounded"
        >
          {Object.keys(formacoes).map((form) => (
            <option key={form} value={form}>
              {form}
            </option>
          ))}
        </select>
      </div>

      <ListaJogadores jogadores={jogadoresDisponiveis} onSelecionar={setJogadorSelecionado} />

      {jogadorSelecionado && (
        <p className="text-center text-yellow-300 mt-4">
          Jogador Selecionado: <strong>{jogadorSelecionado.nome}</strong>
        </p>
      )}

      <div className="mt-6">{renderCampo()}</div>

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

