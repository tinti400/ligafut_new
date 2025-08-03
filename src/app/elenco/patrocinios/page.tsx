'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Categoria = 'master' | 'fornecedor' | 'secundario'

interface Patrocinio {
  id: string
  nome: string
  categoria: Categoria
  valor_fixo: number
  descricao_patrocinio: string
  divisao: number
}

export default function PatrociniosPage() {
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [patrocinioSelecionado, setPatrocinioSelecionado] = useState<Record<Categoria, string>>({
    master: '',
    fornecedor: '',
    secundario: ''
  })
  const [jaEscolheu, setJaEscolheu] = useState(false)

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    async function buscarPatrocinios() {
      if (!user?.id_time) return

      const { data: time, error: erroTime } = await supabase
        .from('times')
        .select('divisao')
        .eq('id', user.id_time)
        .single()

      if (erroTime || !time) return

      const { data, error } = await supabase
        .from('patrocinios')
        .select('*')
        .eq('divisao', time.divisao)

      if (!error && data) setPatrocinios(data)
    }

    async function verificarSeJaEscolheu() {
      if (!user?.id_time) return

      const { data, error } = await supabase
        .from('patrocinios_escolhidos')
        .select('*')
        .eq('id_time', user.id_time)
        .maybeSingle()

      if (data) setJaEscolheu(true)
    }

    buscarPatrocinios()
    verificarSeJaEscolheu()
  }, [])

  const handleSelecionar = (categoria: Categoria, id: string) => {
    if (jaEscolheu) return
    setPatrocinioSelecionado((prev) => ({ ...prev, [categoria]: id }))
  }

  const formatarValor = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0
    })
  }

  const salvarPatrocinios = async () => {
    if (!user?.id_time) return

    const master = patrocinios.find(p => p.id === patrocinioSelecionado.master)
    const fornecedor = patrocinios.find(p => p.id === patrocinioSelecionado.fornecedor)
    const secundario = patrocinios.find(p => p.id === patrocinioSelecionado.secundario)

    const total = (master?.valor_fixo || 0) + (fornecedor?.valor_fixo || 0) + (secundario?.valor_fixo || 0)

    const { error: erroUpsert } = await supabase
      .from('patrocinios_escolhidos')
      .insert({
        id_time: user.id_time,
        id_patrocinio_master: patrocinioSelecionado.master,
        id_patrocinio_fornecedor: patrocinioSelecionado.fornecedor,
        id_patrocinio_secundario: patrocinioSelecionado.secundario,
      })

    if (erroUpsert) {
      toast.error('Erro ao salvar patrocínios.')
      return
    }

    const { error: erroSaldo } = await supabase.rpc('incrementar_saldo', {
      id_time_param: user.id_time,
      valor_param: total
    })

    if (erroSaldo) {
      toast.error('Erro ao atualizar saldo.')
      return
    }

    const { error: erroBid } = await supabase.from('bid').insert({
      tipo_evento: 'patrocinio',
      descricao: `Recebeu ${formatarValor(total)} em patrocínios`,
      id_time1: user.id_time,
      valor: total,
      data_evento: new Date().toISOString(),
    })

    if (erroBid) {
      toast.error('Erro ao registrar no BID.')
      return
    }

    setJaEscolheu(true)
    toast.success('Patrocínios salvos e saldo atualizado!')
  }

  const categorias: Categoria[] = ['master', 'fornecedor', 'secundario']

  return (
    <div className="p-4 text-white min-h-screen bg-gradient-to-br from-zinc-900 to-zinc-800">
      <h1 className="text-3xl font-extrabold text-center mb-8 text-yellow-400 drop-shadow">
        💼 Escolha seus Patrocinadores
      </h1>

      {jaEscolheu ? (
        <p className="text-center text-green-400 text-xl font-semibold">
          ✅ Você já escolheu seus patrocinadores. Obrigado!
        </p>
      ) : (
        categorias.map((categoria) => (
          <div key={categoria} className="mb-10">
            <h2 className="text-green-400 text-2xl font-bold mb-4 capitalize">
              {categoria === 'master' && '🏆 Patrocínio Master'}
              {categoria === 'fornecedor' && '🛍️ Fornecedor de Material'}
              {categoria === 'secundario' && '📢 Patrocínio Secundário'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {patrocinios
                .filter(p => p.categoria === categoria)
                .map(p => (
                  <div
                    key={p.id}
                    className={`rounded-lg border-2 p-4 shadow transition-all cursor-pointer hover:scale-105 hover:border-green-400 ${
                      patrocinioSelecionado[categoria] === p.id
                        ? 'border-green-500 bg-zinc-800'
                        : 'border-zinc-700 bg-zinc-900'
                    }`}
                    onClick={() => handleSelecionar(categoria, p.id)}
                  >
                    <h3 className="text-xl font-semibold mb-2 text-white">{p.nome}</h3>
                    <p className="text-sm text-gray-300 mb-1">
                      💰 Valor Fixo: <strong className="text-white">{formatarValor(p.valor_fixo)}</strong>
                    </p>
                    <p className="text-sm text-yellow-300 whitespace-pre-line">
                      🎁 {p.descricao_patrocinio}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}

      {!jaEscolheu && (
        <div className="text-center mt-10">
          <button
            onClick={salvarPatrocinios}
            className="bg-green-600 hover:bg-green-700 px-8 py-3 rounded-lg text-white text-lg font-bold shadow-lg"
          >
            ✅ Salvar Patrocínios
          </button>
        </div>
      )}
    </div>
  )
}

