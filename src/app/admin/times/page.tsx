'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { FaCoins, FaPlus, FaPen, FaFloppyDisk, FaCheck } from 'react-icons/fa6'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminSaldoPage() {
  const [times, setTimes] = useState<any[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<any>(null)
  const [valorAdicionar, setValorAdicionar] = useState<number>(1000000)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)

  useEffect(() => {
    buscarTimes()
  }, [])

  async function buscarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, saldo')
      .order('nome', { ascending: true })

    if (data) setTimes(data)
    if (error) console.log('Erro ao buscar times:', error)
  }

  async function registrarNoBID(tipo: string, descricao: string, id_time: string, valor: number) {
    await supabase.from('bid').insert({
      tipo_evento: tipo,
      descricao,
      id_time1: id_time,
      data_evento: new Date().toISOString(),
      valor
    })
  }

  async function adicionarSaldo() {
    if (!timeSelecionado) return

    if (!confirm(`Deseja adicionar R$ ${valorAdicionar.toLocaleString('pt-BR')} ao saldo de ${timeSelecionado.nome}?`)) {
      return
    }

    const saldoAtual = timeSelecionado.saldo || 0
    const novo = saldoAtual + valorAdicionar

    const { error } = await supabase
      .from('times')
      .update({ saldo: novo })
      .eq('id', timeSelecionado.id)

    if (error) {
      toast.error('Erro ao adicionar saldo')
      return
    }

    await registrarNoBID(
      'Crédito',
      `Saldo aumentado em R$ ${valorAdicionar.toLocaleString('pt-BR')} para o time ${timeSelecionado.nome}`,
      timeSelecionado.id,
      valorAdicionar
    )

    toast.success('Saldo adicionado com sucesso!')
    setTimeSelecionado({ ...timeSelecionado, saldo: novo })
    setNovoSaldo(novo)
  }

  async function atualizarSaldoManual() {
    if (!timeSelecionado) return

    if (!confirm(`Deseja atualizar o saldo de ${timeSelecionado.nome} para R$ ${novoSaldo.toLocaleString('pt-BR')}?`)) {
      return
    }

    const { error } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', timeSelecionado.id)

    if (error) {
      toast.error('Erro ao atualizar saldo')
      return
    }

    const diferenca = novoSaldo - (timeSelecionado.saldo || 0)
    await registrarNoBID(
      'Atualização',
      `Saldo alterado manualmente em R$ ${diferenca.toLocaleString('pt-BR')} para o time ${timeSelecionado.nome}`,
      timeSelecionado.id,
      novoSaldo
    )

    toast.success('Saldo atualizado com sucesso!')
    setTimeSelecionado({ ...timeSelecionado, saldo: novoSaldo })
  }

  return (
    <div className="p-6 bg-zinc-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <FaCoins className="text-yellow-400" /> Admin • Saldo dos Times
      </h1>

      <label className="block mb-2 text-white text-lg font-medium">
        <span className="mr-2">🟢 Selecione um time:</span>
      </label>
      <select
        value={timeSelecionado?.id || ''}
        onChange={(e) => {
          const time = times.find((t) => t.id === e.target.value)
          setTimeSelecionado(time || null)
          setNovoSaldo(time?.saldo || 0)
        }}
        className="w-full p-3 rounded bg-zinc-800 text-white text-lg"
      >
        <option value="" disabled>Selecione um time</option>
        {times.map((time) => (
          <option key={time.id} value={time.id}>
            {time.nome} — ID: {time.id}
          </option>
        ))}
      </select>

      {timeSelecionado && (
        <div className="mt-6 bg-zinc-800 p-6 rounded-lg shadow-md border border-zinc-700">
          <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
            🏷️ {timeSelecionado.nome}
          </h2>

          <p className="mt-2 text-lg">
            <span className="text-yellow-300 mr-2">🪙 Saldo atual:</span>
            <span className="text-green-400 font-semibold">
              R$ {Number(timeSelecionado.saldo || 0).toLocaleString('pt-BR')}
            </span>
          </p>

          <div className="mt-4">
            <label className="text-white flex items-center gap-2 mb-1">
              <FaPlus /> Adicionar saldo
            </label>
            <input
              type="number"
              value={valorAdicionar}
              onChange={(e) => setValorAdicionar(Number(e.target.value))}
              className="w-full p-2 rounded bg-zinc-700 text-white"
            />
            <button
              onClick={adicionarSaldo}
              className="mt-2 bg-green-600 hover:bg-green-700 w-full py-2 rounded text-white font-semibold flex items-center justify-center gap-2"
            >
              <FaCheck /> Adicionar R$ {valorAdicionar.toLocaleString('pt-BR')}
            </button>
          </div>

          <hr className="my-4 border-zinc-600" />

          <div className="mt-2">
            <label className="text-white flex items-center gap-2 mb-1">
              <FaPen /> Atualizar saldo manualmente
            </label>
            <input
              type="number"
              value={novoSaldo}
              onChange={(e) => setNovoSaldo(Number(e.target.value))}
              className="w-full p-2 rounded bg-zinc-700 text-white"
            />
            <button
              onClick={atualizarSaldoManual}
              className="mt-2 bg-blue-600 hover:bg-blue-700 w-full py-2 rounded text-white font-semibold flex items-center justify-center gap-2"
            >
              <FaFloppyDisk /> Atualizar para R$ {novoSaldo.toLocaleString('pt-BR')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
