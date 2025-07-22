'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { FaCoins, FaPlus, FaPen, FaFloppyDisk, FaCheck } from 'react-icons/fa'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
  saldo: number
}

export default function AdminTimesPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<Time | null>(null)
  const [valorAdicional, setValorAdicional] = useState<number>(1000000)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)

  useEffect(() => {
    buscarTimes()
  }, [])

  async function buscarTimes() {
    const { data, error } = await supabase.from('times').select('*').order('nome', { ascending: true })
    if (error) {
      toast.error('Erro ao buscar times.')
    } else {
      setTimes(data || [])
    }
  }

  const formatar = (valor: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor)

  async function adicionarSaldo() {
    if (!timeSelecionado) return

    const confirm = window.confirm(`Tem certeza que deseja adicionar ${formatar(valorAdicional)} ao time ${timeSelecionado.nome}?`)
    if (!confirm) return

    const novo = timeSelecionado.saldo + valorAdicional

    const { error } = await supabase
      .from('times')
      .update({ saldo: novo })
      .eq('id', timeSelecionado.id)

    if (error) {
      toast.error('Erro ao adicionar saldo.')
    } else {
      await registrarBID('adicao', valorAdicional, novo)
      toast.success('Saldo adicionado com sucesso!')
      buscarTimes()
    }
  }

  async function atualizarSaldo() {
    if (!timeSelecionado) return

    const confirm = window.confirm(`Tem certeza que deseja definir o saldo de ${timeSelecionado.nome} para ${formatar(novoSaldo)}?`)
    if (!confirm) return

    const { error } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', timeSelecionado.id)

    if (error) {
      toast.error('Erro ao atualizar saldo.')
    } else {
      const diferenca = novoSaldo - timeSelecionado.saldo
      await registrarBID('atualizacao', diferenca, novoSaldo)
      toast.success('Saldo atualizado com sucesso!')
      buscarTimes()
    }
  }

  async function registrarBID(tipo_evento: string, valor: number, saldoFinal: number) {
    if (!timeSelecionado) return

    await supabase.from('bid').insert({
      tipo_evento,
      descricao: `Saldo do time ${timeSelecionado.nome} ${tipo_evento === 'adicao' ? 'aumentado' : 'atualizado'} para ${formatar(saldoFinal)}`,
      id_time1: timeSelecionado.id,
      valor: valor,
      data_evento: new Date().toISOString()
    })
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <FaCoins /> Gerenciar Saldo dos Times
      </h1>

      <label className="block mb-2">🔄 Selecione um time:</label>
      <select
        className="w-full bg-zinc-800 text-white p-2 rounded border"
        onChange={(e) => {
          const time = times.find(t => t.id === e.target.value)
          setTimeSelecionado(time || null)
          setNovoSaldo(time?.saldo || 0)
        }}
      >
        <option value="">Selecione...</option>
        {times.map(time => (
          <option key={time.id} value={time.id}>
            {time.nome} — ID: {time.id}
          </option>
        ))}
      </select>

      {timeSelecionado && (
        <div className="bg-zinc-800 p-5 mt-6 rounded shadow-md space-y-5">
          <h2 className="text-xl font-semibold text-yellow-400 flex items-center gap-2">
            <FaCoins /> {timeSelecionado.nome}
          </h2>

          <p className="text-lg">
            💰 Saldo atual: <span className="text-green-400">{formatar(timeSelecionado.saldo)}</span>
          </p>

          <div>
            <label className="block mb-1 flex items-center gap-2"><FaPlus /> Adicionar saldo</label>
            <input
              type="number"
              className="w-full bg-zinc-700 text-white p-2 rounded mb-2"
              value={valorAdicional}
              onChange={(e) => setValorAdicional(Number(e.target.value))}
            />
            <button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
              onClick={adicionarSaldo}
            >
              <FaCheck /> Adicionar {formatar(valorAdicional)}
            </button>
          </div>

          <hr className="border-zinc-600" />

          <div>
            <label className="block mb-1 flex items-center gap-2"><FaPen /> Atualizar saldo manualmente</label>
            <input
              type="number"
              className="w-full bg-zinc-700 text-white p-2 rounded mb-2"
              value={novoSaldo}
              onChange={(e) => setNovoSaldo(Number(e.target.value))}
            />
            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
              onClick={atualizarSaldo}
            >
              <FaFloppyDisk /> Atualizar para {formatar(novoSaldo)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
