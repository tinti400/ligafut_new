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
  const [moralTorcida, setMoralTorcida] = useState(100)

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

      const novaMoralTecnico = calcularMoralTecnico(pontos)
      setMoralTecnico(novaMoralTecnico)
      await supabase.from('times').update({ moral_tecnico: novaMoralTecnico }).eq('id', idTime)

      let novaMoralTorcida = 100
      if (pontos < 80) novaMoralTorcida -= 10
      if (pontos < 60) novaMoralTorcida -= 15
      if (pontos < 40) novaMoralTorcida -= 20
      if (pontos < 25) novaMoralTorcida -= 25
      if (pontos < 10) novaMoralTorcida -= 30

      novaMoralTorcida = Math.max(0, Math.min(100, novaMoralTorcida))
      setMoralTorcida(novaMoralTorcida)
      await supabase.from('times').update({ moral_torcida: novaMoralTorcida }).eq('id', idTime)
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
        5,
        2,
        1,
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
      {/* ... UI renderização omitida por brevidade ... */}
    </div>
  )
}

