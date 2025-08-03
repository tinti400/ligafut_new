'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    const patrociniosSelecionados = patrocinios.filter((p) =>
      [selecionado.master, selecionado.fornecedor, selecionado.secundario].includes(p.id)
    )

    const valorTotal = patrociniosSelecionados.reduce((acc, p) => acc + Number(p.valor_fixo), 0)

    const { error: updatePatrocinioError } = await supabase
      .from('times')
      .update({
        patrocinio_master_id: selecionado.master,
        patrocinio_fornecedor_id: selecionado.fornecedor,
        patrocinio_secundario_id: selecionado.secundario,
      })
      .eq('id', meuTime.id)

    if (updatePatrocinioError) {
      toast.error('Erro ao salvar patrocinadores')
      return
    }

    const { error: saldoError } = await supabase.rpc('atualizar_saldo', {
      id_time: meuTime.id,
      valor: valorTotal,
    })

    if (saldoError) {
      toast.error('Erro ao atualizar saldo do time')
      return
    }

    for (const p of patrociniosSelecionados) {
      const tipo = p.categoria.toUpperCase()
      const { error: bidError } = await supabase.from('bid').insert({
        tipo_evento: 'patrocinio',
        descricao: `🏷️ ${meuTime.nome} escolheu o patrocínio ${tipo} da ${p.nome} (R$ ${Number(p.valor_fixo).toLocaleString('pt-BR')})`,
        id_time1: meuTime.id,
      })

      if (bidError) {
        console.error('Erro ao registrar no BID:', bidError)
      }
    }

    toast.success(`✅ Patrocínios salvos e R$ ${valorTotal.toLocaleString('pt-BR')} adicionados ao caixa!`)
    carregarMeuTime()
  }

  const categorias = ['master', 'fornecedor', 'secundario']

  return (
    <div className="max-w-4xl mx-auto p-4 text-white">
      <h1 className="text-3xl font-bold text-center mb-6 text-yellow-400">
        💼 Escolha seus Patrocinadores
      </h1>

      {categorias.map((categoria) => (
        <div key={categoria} className="mb-8">
          <h2 className="text-2xl font-semibold capitalize mb-4 text-green-400">
            {categoria === 'master' ? 'Patrocínio Master' :
             categoria === 'fornecedor' ? 'Fornecedor de Material' : 'Patrocínio Secundário'}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {patrocinios
              .filter((p) => p.categoria === categoria && p.divisao === meuTime?.divisao)
              .map((p) => (
                <div
                  key={p.id}
                  className={`border rounded p-4 bg-zinc-800 hover:border-green-400 transition cursor-pointer ${
                    selecionado[categoria] === p.id ? 'border-green-400' : 'border-zinc-600'
                  }`}
                  onClick={() => setSelecionado((prev) => ({ ...prev, [categoria]: p.id }))}
                >
                  <h3 className="text-xl font-bold text-white">{p.nome}</h3>
                  <p className="text-sm text-gray-300 mt-1">Valor fixo: R$ {Number(p.valor_fixo).toLocaleString('pt-BR')}</p>
                  <p className="text-sm text-gray-400 mt-2">{p.descricao_beneficio}</p>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center mt-10">
        <button
          onClick={salvarEscolhas}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-semibold"
        >
          Salvar Patrocínios
        </button>
      </div>
    </div>
  )
}
