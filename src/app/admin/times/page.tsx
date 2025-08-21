'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { FaCoins, FaFloppyDisk } from 'react-icons/fa6'

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
  const [saldosEditados, setSaldosEditados] = useState<Record<string, number>>({})

  useEffect(() => {
    buscarTimes()
  }, [])

  async function buscarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, saldo')
      .order('nome', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar times')
      return
    }

    setTimes(data || [])
  }

  function formatar(valor: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)
  }

  function handleSaldoChange(id: string, valor: number) {
    setSaldosEditados((prev) => ({ ...prev, [id]: valor }))
  }

  async function atualizarSaldo(id_time: string, saldoAtual: number, novoSaldo: number) {
    if (saldoAtual === novoSaldo) return

    const confirmar = confirm(`Deseja atualizar o saldo para ${formatar(novoSaldo)}?`)
    if (!confirmar) return

    const { error } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', id_time)

    if (error) {
      toast.error('Erro ao atualizar saldo')
      return
    }

    // Registra no BID
    await supabase.from('bid').insert({
      tipo_evento: 'Atualização de Saldo',
      descricao: `Saldo alterado para ${formatar(novoSaldo)}`,
      id_time1: id_time,
      valor: novoSaldo,
      data_evento: new Date().toISOString()
    })

    toast.success('Saldo atualizado com sucesso!')
    buscarTimes()
  }

  return (
    <div className="p-4 bg-neutral-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-4">💼 Administração de Saldos</h1>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {times.map((time) => {
          const novoSaldo = saldosEditados[time.id] ?? time.saldo
          const alterado = novoSaldo !== time.saldo

          return (
            <div key={time.id} className="bg-neutral-800 p-4 rounded shadow">
              <h2 className="text-lg font-semibold mb-1">{time.nome}</h2>
              <div className="flex items-center gap-2 mb-2 text-yellow-400">
                <FaCoins />
                <span>Saldo: <strong>{formatar(time.saldo)}</strong></span>
              </div>
              <input
                type="number"
                className="w-full mb-2 p-2 rounded bg-neutral-700 text-white"
                value={novoSaldo}
                onChange={(e) => handleSaldoChange(time.id, Number(e.target.value))}
              />
              <button
                disabled={!alterado}
                className={`w-full flex items-center justify-center gap-2 p-2 rounded text-white font-semibold transition ${
                  alterado
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-600 cursor-not-allowed'
                }`}
                onClick={() => atualizarSaldo(time.id, time.saldo, novoSaldo)}
              >
                <FaFloppyDisk />
                Atualizar para {formatar(novoSaldo)}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
