'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  capacidadePorNivel,
  setoresBase,
  precosPadrao,
  limitesPrecos,
  calcularPublicoSetor,
  calcularMelhoriaEstadio,
  mensagemDesempenho,
  calcularMoralTecnico
} from '@/utils/estadioUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<any>(null)
  const [precos, setPrecos] = useState<Record<string, number>>({})
  const [publicoTotal, setPublicoTotal] = useState(0)
  const [rendaTotal, setRendaTotal] = useState(0)
  const [saldo, setSaldo] = useState(0)
  const [desempenho, setDesempenho] = useState(0)
  const [moralTecnico, setMoralTecnico] = useState(10)
  const [moralTorcida, setMoralTorcida] = useState(50)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : ''

  useEffect(() => {
    if (!idTime) return
    buscarEstadio()
    buscarSaldo()
    buscarDesempenhoEMoral()
  }, [idTime])

  const buscarEstadio = async () => {
    const { data } = await supabase.from('estadios').select('*').eq('id_time', idTime).single()
    if (!data) {
      const novo = {
        id_time: idTime,
        nome: `Estádio ${nomeTime}`,
        nivel: 1,
        capacidade: capacidadePorNivel[1],
        ...Object.fromEntries(Object.entries(precosPadrao).map(([k, v]) => [`preco_${k}`, v]))
      }
      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrecos(precosPadrao)
    } else {
      setEstadio(data)
      setPrecos(Object.fromEntries(
        Object.keys(setoresBase).map((s) => [s, data[`preco_${s}`] || precosPadrao[s as keyof typeof precosPadrao]])
      ))
    }
  }

  const buscarSaldo = async () => {
    const { data } = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (data) setSaldo(data.saldo)
  }

  const buscarDesempenhoEMoral = async () => {
    const { data: classData } = await supabase
      .from('classificacao')
      .select('pontos')
      .eq('id_time', idTime)
      .single()

    if (classData) {
      const pontos = classData.pontos || 0
      setDesempenho(pontos)

      const novaMoral = calcularMoralTecnico(pontos)
      setMoralTecnico(novaMoral)

      await supabase.from('times').update({ moral_tecnico: novaMoral }).eq('id', idTime)
    }

    const { data: moralData } = await supabase
      .from('times')
      .select('moral_torcida')
      .eq('id', idTime)
      .single()

    if (moralData) {
      setMoralTorcida(moralData.moral_torcida || 50)
    }
  }

  const atualizarPreco = async (setor: string, novoPreco: number) => {
    setPrecos((prev) => ({ ...prev, [setor]: novoPreco }))
    await supabase.from('estadios').update({ [`preco_${setor}`]: novoPreco }).eq('id_time', idTime)
  }

  const calcularTotais = () => {
    if (!estadio) return
    const capacidade = capacidadePorNivel[estadio.nivel]
    let totalPublico = 0
    let totalRenda = 0

    Object.entries(setoresBase).forEach(([setor, proporcao]) => {
      const lugares = Math.floor(capacidade * proporcao)
      const preco = precos[setor] || precosPadrao[setor as keyof typeof precosPadrao]
      const { publicoEstimado, renda } = calcularPublicoSetor(
        lugares,
        preco,
        desempenho,
        5, // posição fictícia
        2, // vitórias fictícias
        1, // derrotas fictícias
        estadio.nivel,
        moralTecnico,
        moralTorcida
      )
      totalPublico += publicoEstimado
      totalRenda += renda
    })

    setPublicoTotal(totalPublico)
    setRendaTotal(totalRenda)
  }

  useEffect(() => {
    calcularTotais()
  }, [precos, estadio, desempenho, moralTecnico, moralTorcida])

  const melhorarEstadio = async () => {
    const custo = calcularMelhoriaEstadio(estadio.nivel)
    if (saldo < custo) {
      alert('💸 Saldo insuficiente para melhorar o estádio!')
      return
    }
    await supabase.from('estadios').update({ nivel: estadio.nivel + 1, capacidade: capacidadePorNivel[estadio.nivel + 1] }).eq('id_time', idTime)
    await supabase.from('times').update({ saldo: saldo - custo }).eq('id', idTime)
    alert('✅ Estádio melhorado com sucesso!')
    buscarEstadio()
    buscarSaldo()
  }

  if (!estadio) return <div className="p-4 text-white">🔄 Carregando informações do estádio...</div>

  return (
    <div className="p-4 max-w-2xl mx-auto text-white">
      <div className="bg-gray-800 rounded-xl shadow p-4 mb-4 border border-gray-700">
        <h1 className="text-2xl font-bold text-center mb-2">🏟️ {estadio.nome}</h1>
        <p className="text-center text-gray-300">
          <strong>Nível:</strong> {estadio.nivel} | <strong>Capacidade:</strong> {estadio.capacidade.toLocaleString()} lugares
        </p>
      </div>

      <div className="bg-gray-900 rounded p-4 text-center mb-4 border border-yellow-400">
        <h2 className="text-lg font-bold mb-2 text-yellow-300">📣 Aviso Importante</h2>
        <p>{mensagemDesempenho(desempenho)}</p>
      </div>

      <div className="bg-gray-800 rounded-xl shadow p-4 mb-4 border border-gray-700">
        <h2 className="text-lg font-bold mb-2 text-center text-green-300">🔥 Moral do Clube</h2>

        <div className="mb-3">
          <p className="text-sm text-gray-300 mb-1">🎯 Técnico</p>
          <div className="w-full h-5 bg-gray-700 rounded">
            <div
              className="h-5 bg-green-600 rounded transition-all duration-300"
              style={{ width: `${(moralTecnico / 10) * 100}%` }}
            ></div>
          </div>
          <p className="text-xs text-right text-gray-400 mt-1">{moralTecnico.toFixed(1)}/10</p>
        </div>

        <div>
          <p className="text-sm text-gray-300 mb-1">🙌 Torcida</p>
          <div className="w-full h-5 bg-gray-700 rounded">
            <div
              className="h-5 bg-green-400 rounded transition-all duration-300"
              style={{ width: `${moralTorcida}%` }}
            ></div>
          </div>
          <p className="text-xs text-right text-gray-400 mt-1">{moralTorcida.toFixed(0)}%</p>
        </div>
      </div>

      <div className="bg-gray-800 rounded p-4 text-center mb-4 border border-gray-700">
        <h2 className="text-lg font-bold mb-2">🏟️ Visualização da Lotação</h2>
        <div className="grid grid-cols-10 gap-1 justify-center">
          {[...Array(100)].map((_, idx) => {
            const ocupado = idx < Math.round((publicoTotal / estadio.capacidade) * 100)
            return (
              <div key={idx} className={`w-4 h-4 rounded ${ocupado ? 'bg-red-500' : 'bg-gray-500'}`}></div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {publicoTotal.toLocaleString()} / {estadio.capacidade.toLocaleString()} lugares ocupados
        </p>
      </div>

      <div className="bg-gray-800 rounded-xl shadow p-4 mb-4 border border-gray-700">
        <h2 className="text-lg font-bold mb-2 text-center">💵 Preços dos Setores</h2>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(setoresBase).map(([setor, _]) => {
            const limite = limitesPrecos[estadio.nivel][setor] || 5000
            return (
              <div key={setor} className="flex flex-col border border-gray-700 rounded p-2 bg-gray-900">
                <span className="font-semibold capitalize text-sm">{setor}</span>
                <input
                  type="number"
                  min={1}
                  max={limite}
                  value={precos[setor] || 0}
                  onChange={(e) => atualizarPreco(setor, parseFloat(e.target.value))}
                  className="border border-gray-700 rounded p-1 mt-1 text-sm bg-gray-800 text-white"
                />
                <span className="text-xs text-gray-400 mt-1">Limite: R$ {limite}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl shadow p-4 mb-4 border border-gray-700">
        <h2 className="text-lg font-bold mb-2 text-center">📊 Estimativas</h2>
        <p>👥 <strong>Público total:</strong> {publicoTotal.toLocaleString()} pessoas</p>
        <p>💰 <strong>Renda estimada:</strong> R$ {rendaTotal.toLocaleString()}</p>
      </div>

      {estadio.nivel < 5 ? (
        <button onClick={melhorarEstadio} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
          Melhorar Estádio (Custo: R$ {calcularMelhoriaEstadio(estadio.nivel).toLocaleString()})
        </button>
      ) : (
        <div className="text-center text-green-400 font-bold">🏆 Estádio já está no nível máximo!</div>
      )}
    </div>
  )
}

