'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const formacoes: Record<string, string[][]> = {
  '4-4-2': [
    ['ATA1', 'ATA2'],
    ['MEI1', 'MEI2', 'MEI3', 'MEI4'],
    ['LAT1', 'ZAG1', 'ZAG2', 'LAT2'],
    ['GOL'],
  ],
  '4-3-3': [
    ['ATA1', 'ATA2', 'ATA3'],
    ['MEI1', 'MEI2', 'MEI3'],
    ['LAT1', 'ZAG1', 'ZAG2', 'LAT2'],
    ['GOL'],
  ],
  '3-5-2': [
    ['ATA1', 'ATA2'],
    ['MEI1', 'MEI2', 'MEI3', 'MEI4', 'MEI5'],
    ['ZAG1', 'ZAG2', 'ZAG3'],
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

    const jogadorJaEscalado = Object.values(escala).some(
      (j: any) => j.id === jogadorSelecionado.id
    )

    if (jogadorJaEscalado) {
      alert('🚫 Esse jogador já está escalado em outra posição!')
      return
    }

    setEscala((prev) => ({ ...prev, [posicao]: jogadorSelecionado }))
    setJogadorSelecionado(null)
  }

  const removerJogador = (posicao: string) => {
    const confirmar = confirm(`❌ Remover ${escala[posicao]?.nome} da posição ${posicao}?`)
    if (!confirmar) return

    const novoEscala = { ...escala }
    delete novoEscala[posicao]
    setEscala(novoEscala)
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

  return (
    <div className="flex flex-col md:flex-row p-6 text-white bg-gray-900 min-h-screen">
      {/* Campo */}
      <div className="flex-1 flex flex-col items-center">
        <h1 className="text-2xl font-bold text-green-400 mb-4">🎯 Painel Tático</h1>

        <select
          value={formacaoSelecionada}
          onChange={(e) => {
            setFormacaoSelecionada(e.target.value)
            setEscala({})
          }}
          className="mb-4 bg-gray-800 text-white border px-3 py-2 rounded"
        >
          {Object.keys(formacoes).map((form) => (
            <option key={form} value={form}>{form}</option>
          ))}
        </select>

        <div className="relative w-full max-w-md bg-green-700 rounded-lg py-6 px-2 border-4 border-green-900">
          {formacoes[formacaoSelecionada].map((linha, idx) => (
            <div key={idx} className="flex justify-center gap-4 my-4">
              {linha.map((pos) => (
                <div
                  key={pos + idx}
                  onClick={() => escala[pos] ? removerJogador(pos) : handleEscalar(pos)}
                  className="flex flex-col items-center cursor-pointer hover:scale-105 transition"
                >
                  <div className="w-16 h-16 rounded-full bg-white overflow-hidden border-2 border-gray-300">
                    {escala[pos]?.imagem_url ? (
                      <Image
                        src={escala[pos].imagem_url}
                        alt={escala[pos].nome}
                        width={64}
                        height={64}
                        className="object-cover"
                      />
                    ) : (
                      <Image
                        src="/mnt/data/561798cf-0613-4808-992a-ce334bd02ac9.png"
                        alt="Sem imagem"
                        width={64}
                        height={64}
                        className="object-cover"
                      />
                    )}
                  </div>
                  <span className="text-xs text-white mt-1 text-center">
                    {escala[pos]?.nome || pos.replace(/\d+/g, '')}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <button
          onClick={salvarEscalacao}
          disabled={salvando}
          className="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 text-white font-bold px-4 py-2 rounded"
        >
          💾 {salvando ? 'Salvando...' : 'Salvar Escalação'}
        </button>
      </div>

      {/* Jogadores Laterais */}
      <div className="md:w-1/3 p-4">
        <h2 className="text-lg font-bold text-center mb-2">🎯 Jogadores Disponíveis</h2>
        <div className="flex flex-wrap gap-2 justify-center">
          {jogadoresDisponiveis.map((jogador: any) => (
            <button
              key={jogador.id}
              onClick={() => setJogadorSelecionado(jogador)}
              className={`bg-green-600 hover:bg-green-700 px-3 py-1 rounded-full text-white text-xs font-semibold transition ${
                Object.values(escala).some((j: any) => j.id === jogador.id) && 'bg-gray-500 cursor-not-allowed'
              }`}
              disabled={Object.values(escala).some((j: any) => j.id === jogador.id)}
            >
              {jogador.nome} ({jogador.posicao})
            </button>
          ))}
        </div>

        {jogadorSelecionado && (
          <p className="text-center text-yellow-300 mt-4">
            Jogador Selecionado: <strong>{jogadorSelecionado.nome}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

