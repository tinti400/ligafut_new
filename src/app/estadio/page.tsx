// EstadioPage.tsx com mensagens dinâmicas em destaque

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const capacidadePorNivel = { 1: 10000, 2: 20000, 3: 35000, 4: 50000, 5: 80000 }
const precosPadrao = { geral: 30, arquibancada: 50, cadeira: 100, camarote: 500 }
const setoresBase = { geral: 0.4, arquibancada: 0.4, cadeira: 0.15, camarote: 0.05 }
const limitesPrecos = {
  1: { geral: 50, arquibancada: 100, cadeira: 200, camarote: 1000 },
  2: { geral: 75, arquibancada: 150, cadeira: 300, camarote: 2000 },
  3: { geral: 100, arquibancada: 200, cadeira: 500, camarote: 3000 },
  4: { geral: 150, arquibancada: 300, cadeira: 800, camarote: 5000 },
  5: { geral: 200, arquibancada: 500, cadeira: 1000, camarote: 10000 },
}

function calcularMelhoriaEstadio(nivel: number) {
  return 5000000 * nivel
}

function calcularPublicoSetor(lugares: number, preco: number, desempenho: number, posicao: number, vitorias: number, derrotas: number) {
  const fatorBase = 0.8 + desempenho * 0.007 + (20 - posicao) * 0.005 + vitorias * 0.01 - derrotas * 0.005
  let fatorPreco = preco <= 20 ? 1 : preco <= 50 ? 0.85 : preco <= 100 ? 0.65 : preco <= 200 ? 0.4 : preco <= 500 ? 0.2 : 0.05
  const publicoEstimado = Math.min(lugares, Math.floor(lugares * fatorBase * fatorPreco))
  return { publicoEstimado, renda: publicoEstimado * preco }
}

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<any>(null)
  const [precos, setPrecos] = useState<any>({})
  const [publicoTotal, setPublicoTotal] = useState(0)
  const [rendaTotal, setRendaTotal] = useState(0)
  const [saldo, setSaldo] = useState(0)
  const [desempenho, setDesempenho] = useState(70)
  const [posicao, setPosicao] = useState(10)
  const [vitorias, setVitorias] = useState(5)
  const [derrotas, setDerrotas] = useState(2)
  const [mensagem, setMensagem] = useState('')

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : ''

  useEffect(() => {
    if (!idTime) return
    buscarEstadio()
    buscarSaldo()
    buscarClassificacao()
  }, [idTime])

  const buscarEstadio = async () => {
    const { data } = await supabase.from('estadios').select('*').eq('id_time', idTime).single()
    if (!data) {
      const novo = { id_time: idTime, nome: `Estádio ${nomeTime}`, nivel: 1, capacidade: capacidadePorNivel[1], ...Object.fromEntries(Object.entries(precosPadrao).map(([k, v]) => [`preco_${k}`, v])) }
      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrecos(precosPadrao)
    } else {
      setEstadio(data)
      setPrecos(Object.fromEntries(Object.keys(setoresBase).map((s) => [s, data[`preco_${s}`] || precosPadrao[s]])))
    }
  }

  const buscarSaldo = async () => {
    const { data } = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (data) setSaldo(data.saldo)
  }

  const buscarClassificacao = async () => {
    const { data } = await supabase.from('classificacao').select('*').eq('id_time', idTime).single()
    if (data) {
      setDesempenho(data.overall || 70)
      setPosicao(data.posicao || 10)
      setVitorias(data.vitorias || 5)
      setDerrotas(data.derrotas || 2)
      definirMensagem(data.overall || 70, data.posicao || 10)
    }
  }

  const definirMensagem = (desempenho: number, posicao: number) => {
    if (desempenho > 75 || posicao <= 5) {
      setMensagem('✅ Seu time está em ótima fase! Público tende a ser maior.')
    } else if (desempenho < 60 || posicao >= 16) {
      setMensagem('⚠️ Seu time está em má fase. Público tende a ser menor. Ajuste o preço dos ingressos.')
    } else {
      setMensagem('ℹ️ Fase regular. Público depende bastante do preço dos ingressos.')
    }
  }

  const atualizarPreco = async (setor: string, novoPreco: number) => {
    const limite = limitesPrecos[estadio.nivel][setor]
    if (novoPreco > limite) novoPreco = limite
    if (novoPreco < 1) novoPreco = 1
    setPrecos((prev: any) => ({ ...prev, [setor]: novoPreco }))
    await supabase.from('estadios').update({ [`preco_${setor}`]: novoPreco }).eq('id_time', idTime)
  }

  const calcularTotais = () => {
    if (!estadio) return
    const capacidade = capacidadePorNivel[estadio.nivel]
    let totalPublico = 0, totalRenda = 0
    Object.entries(setoresBase).forEach(([setor, proporcao]) => {
      const lugares = Math.floor(capacidade * proporcao)
      const preco = precos[setor] || precosPadrao[setor]
      const { publicoEstimado, renda } = calcularPublicoSetor(lugares, preco, desempenho, posicao, vitorias, derrotas)
      totalPublico += publicoEstimado
      totalRenda += renda
    })
    setPublicoTotal(totalPublico)
    setRendaTotal(totalRenda)
  }

  useEffect(() => { calcularTotais() }, [precos, estadio, desempenho, posicao, vitorias, derrotas])

  const melhorarEstadio = async () => {
    const custo = calcularMelhoriaEstadio(estadio.nivel)
    if (saldo < custo) return alert('Saldo insuficiente!')
    await supabase.from('estadios').update({ nivel: estadio.nivel + 1, capacidade: capacidadePorNivel[estadio.nivel + 1] }).eq('id_time', idTime)
    await supabase.from('times').update({ saldo: saldo - custo }).eq('id', idTime)
    alert('Estádio melhorado!')
    buscarEstadio()
    buscarSaldo()
  }

  if (!estadio) return <div className="p-4 text-white">🔄 Carregando...</div>

  return (
    <div className="p-4 max-w-2xl mx-auto text-white">
      <div className="bg-gray-800 p-4 rounded mb-4">
        <h1 className="text-2xl font-bold text-center mb-2">🏟️ {estadio.nome}</h1>
        <p className="text-center text-gray-300">Nível: {estadio.nivel} | Capacidade: {estadio.capacidade.toLocaleString()}</p>
      </div>
      <div className="bg-yellow-500 p-4 rounded mb-4 border border-yellow-300 text-black font-semibold text-center">
        {mensagem}
      </div>
      <div className="bg-gray-800 p-4 rounded mb-4">
        <h2 className="text-lg font-bold mb-2 text-center">💵 Preços dos Setores</h2>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(setoresBase).map(([setor]) => (
            <div key={setor} className="flex flex-col border rounded p-2">
              <span className="font-semibold capitalize text-sm">{setor}</span>
              <input type="number" min={1} value={precos[setor]} onChange={(e) => atualizarPreco(setor, parseFloat(e.target.value))} className="p-1 mt-1 rounded text-sm bg-gray-800 text-white border" />
              <span className="text-xs text-gray-400 mt-1">Limite: R$ {limitesPrecos[estadio.nivel][setor]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 p-4 rounded mb-4">
        <h2 className="text-lg font-bold mb-2 text-center">📊 Estimativas</h2>
        <p>👥 Público total: {publicoTotal.toLocaleString()}</p>
        <p>💰 Renda estimada: R$ {rendaTotal.toLocaleString()}</p>
      </div>
      {estadio.nivel < 5 ? (
        <button onClick={melhorarEstadio} className="w-full bg-green-600 py-2 rounded">Melhorar Estádio (R$ {calcularMelhoriaEstadio(estadio.nivel).toLocaleString()})</button>
      ) : (
        <div className="text-center text-green-400 font-bold">🏆 Estádio no nível máximo!</div>
      )}
    </div>
  )
}
