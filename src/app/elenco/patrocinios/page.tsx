'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Categoria = 'master' | 'fornecedor' | 'secundario'

export default function PatrociniosPage() {
  const [patrocinios, setPatrocinios] = useState<any[]>([])
  const [meuTime, setMeuTime] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const [selecionado, setSelecionado] = useState<{
    master: string
    fornecedor: string
    secundario: string
  }>({ master: '', fornecedor: '', secundario: '' })

  useEffect(() => {
    carregarPatrocinios()
    carregarMeuTime()
  }, [])

  async function carregarPatrocinios() {
    const { data, error } = await supabase
      .from('patrocinios')
      .select('*')
      .order('categoria')
      .order('valor_fixo', { ascending: false })

    if (error) toast.error('Erro ao carregar patrocínios')
    else setPatrocinios(data || [])
  }

  async function carregarMeuTime() {
    const userStr = localStorage.getItem('user')
    if (!userStr) return

    const user = JSON.parse(userStr)
    const { data, error } = await supabase
      .from('times')
      .select('*')
      .eq('id', user.time_id)
      .single()

    if (data) {
      setMeuTime(data)
      setSelecionado({
        master: data.patrocinio_master_id || '',
        fornecedor: data.patrocinio_fornecedor_id || '',
        secundario: data.patrocinio_secundario_id || '',
      })
    }
  }

  async function salvarEscolhas() {
    if (!meuTime) return

    const selecionados = [selecionado.master, selecionado.fornecedor, selecionado.secundario]
    const patrosSelecionados = patrocinios.filter(p => selecionados.includes(p.id))

    const valorTotal = patrosSelecionados.reduce((acc, p) => acc + (p.valor_fixo || 0), 0)

    const { error: erroUpdate } = await supabase
      .from('times')
      .update({
        patrocinio_master_id: selecionado.master,
        patrocinio_fornecedor_id: selecionado.fornecedor,
        patrocinio_secundario_id: selecionado.secundario,
      })
      .eq('id', meuTime.id)

    if (erroUpdate) {
      toast.error('Erro ao salvar escolhas')
      return
    }

    const { error: erroSaldo } = await supabase.rpc('atualizar_saldo', {
      id_time: meuTime.id,
      valor: valorTotal,
    })

    if (erroSaldo) {
      toast.error('Erro ao atualizar saldo')
      return
    }

    const nomes = patrosSelecionados.map(p => p.nome).join(', ')
    const { error: erroBid } = await supabase.from('bid').insert({
      tipo_evento: 'Patrocínio',
      descricao: `Time ${meuTime.nome} fechou com: ${nomes}`,
      id_time1: meuTime.id,
      valor: valorTotal,
    })

    if (erroBid) {
      toast.error('Erro ao registrar no BID')
    }

    toast.success('✅ Patrocínios salvos com sucesso!')
  }

  const categorias: Categoria[] = ['master', 'fornecedor', 'secundario']

  return (
    <div className="p-4 text-white min-h-screen bg-zinc-900">
      <h1 className="text-2xl font-bold text-center mb-6 text-yellow-400">
        💼 Escolha seus Patrocinadores
      </h1>

      {categorias.map((categoria) => (
        <div key={categoria} className="mb-10">
          <h2 className="text-xl font-semibold capitalize mb-3 text-green-400">
            {categoria === 'master'
              ? 'Patrocínio Master'
              : categoria === 'fornecedor'
              ? 'Fornecedor de Material'
              : 'Patrocínio Secundário'}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {patrocinios
              .filter((p) => p.categoria === categoria && p.divisao === meuTime?.divisao)
              .map((p) => (
                <div
                  key={p.id}
                  className={`border rounded-lg p-4 bg-zinc-800 shadow-md hover:border-green-500 transition cursor-pointer ${
                    selecionado[categoria] === p.id ? 'border-green-400' : 'border-zinc-700'
                  }`}
                  onClick={() =>
                    setSelecionado((prev) => ({
                      ...prev,
                      [categoria]: p.id,
                    }))
                  }
                >
                  <h3 className="text-lg font-bold">{p.nome}</h3>
                  <p className="text-sm text-gray-300 mt-1">
                    💰 Valor fixo: R$ {Number(p.valor_fixo).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-sm text-gray-400 mt-2 italic">{p.descricao_beneficio}</p>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center mt-10">
        <button
          onClick={salvarEscolhas}
          className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded text-white font-semibold"
        >
          Salvar Patrocínios
        </button>
      </div>
    </div>
  )
}

