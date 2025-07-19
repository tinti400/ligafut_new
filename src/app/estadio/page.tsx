'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  capacidadePorNivel,
  setoresBase,
  precosPadrao,
  limitesPrecos,
  calcularPublicoSetor,
  calcularMelhoriaEstadio
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

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : ''

  useEffect(() => {
    if (!idTime) return
    buscarEstadio()
    buscarSaldo()
  }, [idTime])

  const buscarEstadio = async () => {
    const { data, error } = await supabase
      .from('estadios')
      .select('*')
      .eq('id_time', idTime)
      .single()

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
      const precosEstadio = Object.fromEntries(
        Object.keys(setoresBase).map((setor) => [setor, data[`preco_${setor}`] || precosPadrao[setor]])
      )
      setPrecos(precosEstadio)
    }
  }

  const buscarSaldo = async () => {
    const { data } = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (data) setSaldo(data.saldo)
  }

  const atualizarPreco = async (setor: string, novoPreco: number) => {
    setPrecos((prev) => ({ ...prev, [setor]: novoPreco }))
    await supabase
      .from('estadios')
      .update({ [`preco_${setor}`]: novoPreco })
      .eq('id_time', idTime)
  }

  const calcularTotais = () => {
    if (!estadio) return
    const capacidade = capacidadePorNivel[estadio.nivel]
    let totalPublico = 0
    let totalRenda = 0

    Object.entries(setoresBase).forEach(([setor, proporcao]) => {
      const lugares = Math.floor(capacidade * proporcao)
      const preco = precos[setor] || precosPadrao[setor]
      const { publicoEstimado, renda } = calcularPublicoSetor(lugares, preco, 10, 5, 2, 1)
      totalPublico += publicoEstimado
      totalRenda += renda
    })

    setPublicoTotal(totalPublico)
    setRendaTotal(totalRenda)
  }

  useEffect(() => {
    calcularTotais()
  }, [precos, estadio])

  const melhorarEstadio = async () => {
    const custo = calcularMelhoriaEstadio(estadio.nivel)
    if (saldo < custo) {
      alert('Saldo insuficiente!')
      return
    }
    await supabase
      .from('estadios')
      .update({ nivel: estadio.nivel + 1, capacidade: capacidadePorNivel[estadio.nivel + 1] })
      .eq('id_time', idTime)
    await supabase.from('times').update({ saldo: saldo - custo }).eq('id', idTime)
    alert('Estádio melhorado!')
    buscarEstadio()
    buscarSaldo()
  }

  if (!estadio) return <div className="p-4">Carregando estádio...</div>

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">🏟️ {estadio.nome}</h1>
      <p>Nível: {estadio.nivel} | Capacidade: {estadio.capacidade.toLocaleString()} lugares</p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {Object.entries(setoresBase).map(([setor, proporcao]) => {
          const limite = limitesPrecos[estadio.nivel][setor] || 5000
          return (
            <div key={setor} className="border rounded p-2">
              <h3 className="font-semibold capitalize">{setor}</h3>
              <input
                type="number"
                min={1}
                max={limite}
                value={precos[setor] || 0}
                onChange={(e) => atualizarPreco(setor, parseFloat(e.target.value))}
                className="border rounded w-full p-1 mt-1"
              />
              <p className="text-xs text-gray-500">Limite: R$ {limite}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        <h2 className="text-lg font-bold">📊 Estimativas</h2>
        <p>👥 Público total: {publicoTotal.toLocaleString()} pessoas</p>
        <p>💰 Renda estimada: R$ {rendaTotal.toLocaleString()}</p>
      </div>

      {estadio.nivel < 5 ? (
        <div className="mt-4">
          <button
            onClick={melhorarEstadio}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Melhorar Estádio (Custo: R$ {calcularMelhoriaEstadio(estadio.nivel).toLocaleString()})
          </button>
        </div>
      ) : (
        <div className="mt-4 text-green-600 font-bold">🏆 Estádio no nível máximo!</div>
      )}
    </div>
  )
}
