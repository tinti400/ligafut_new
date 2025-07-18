'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

export default function AdminLeilaoPage() {
  const router = useRouter()
  const [jogador, setJogador] = useState('')
  const [posicao, setPosicao] = useState('CA')
  const [overall, setOverall] = useState(80)
  const [valorInicial, setValorInicial] = useState(2000000)
  const [duracaoMin, setDuracaoMin] = useState(2)

  const [leilaoAtivo, setLeilaoAtivo] = useState<any>(null)
  const [tempoRestante, setTempoRestante] = useState('')
  const [fila, setFila] = useState<any[]>([])
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    buscarFila()
    buscarLeilaoAtual()
    const intervalo = setInterval(buscarLeilaoAtual, 5000)
    return () => clearInterval(intervalo)
  }, [])

  const buscarFila = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'fila')
      .order('criado_em', { ascending: true })

    if (!error) setFila(data || [])
    else console.error('Erro ao buscar fila:', error.message)
  }

  const buscarLeilaoAtual = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: false })
      .limit(1)

    if (!error) {
      if (data && data[0] && new Date(data[0].fim) > new Date()) setLeilaoAtivo(data[0])
      else setLeilaoAtivo(null)
    } else {
      console.error('Erro ao buscar leilão ativo:', error.message)
    }
  }

  useEffect(() => {
    if (!leilaoAtivo) return
    const intervalo = setInterval(() => {
      const agora = dayjs()
      const fim = dayjs(leilaoAtivo.fim)
      const diff = fim.diff(agora)
      setTempoRestante(diff <= 0 ? 'Finalizado' : `${dayjs.duration(diff).minutes()}m ${dayjs.duration(diff).seconds()}s`)
    }, 1000)
    return () => clearInterval(intervalo)
  }, [leilaoAtivo])

  const criarLeilaoManual = async () => {
    const agora = new Date()
    const fim = new Date(agora.getTime() + duracaoMin * 60000)

    const { error } = await supabase.from('leiloes_sistema').insert({
      nome: jogador,
      posicao,
      overall,
      valor_atual: valorInicial,
      id_time_vencedor: null,
      nome_time_vencedor: null,
      fim,
      criado_em: agora,
      status: 'ativo'
    })

    if (!error) {
      alert('✅ Leilão criado!')
      router.refresh()
    } else {
      console.error('Erro ao criar leilão manual:', error.message)
    }
  }

  const iniciarLeilaoDaFila = async (jogador: any) => {
    const agora = new Date()
    const fim = new Date(agora.getTime() + duracaoMin * 60000)

    const { error } = await supabase.from('leiloes_sistema')
      .update({
        status: 'ativo',
        criado_em: agora,
        fim,
        valor_atual: 2000000,
        id_time_vencedor: null,
        nome_time_vencedor: null
      })
      .eq('id', jogador.id)

    if (!error) {
      buscarFila()
      buscarLeilaoAtual()
    } else {
      console.error('Erro ao iniciar leilão da fila:', error.message)
    }
  }

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    setMsg('Lendo planilha...')

    const reader = new FileReader()
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet)

      for (const item of json as any[]) {
        const { nome, posicao, overall, origem, nacionalidade, imagem_url, link_sofifa, valor_inicial, valor } = item
        const criado_em = new Date()
        const fim = new Date(criado_em.getTime() + 2 * 60000)

        const valorInicial = valor_inicial ?? valor ?? 2000000

        const { error } = await supabase.from('leiloes_sistema').insert({
          nome,
          posicao,
          overall: Number(overall),
          valor_atual: Number(valorInicial),
          origem: origem || '',
          nacionalidade: nacionalidade || '',
          imagem_url: imagem_url || '',
          link_sofifa: link_sofifa || '',
          criado_em,
          fim,
          status: 'fila'
        })

        if (error) console.error('Erro ao inserir jogador:', error.message)
      }

      setMsg('✅ Jogadores importados com sucesso!')
      buscarFila()
      setImportando(false)
    }

    reader.readAsArrayBuffer(file)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-5xl mx-auto bg-gray-800 shadow-md rounded-lg p-6">
        <h1 className="text-3xl font-bold text-center mb-6">🎯 Admin - Leilão</h1>

        <div className="mb-6">
          <label className="block font-semibold mb-2">📥 Importar Jogadores (.xlsx)</label>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleImportar}
            className="w-full border rounded p-2 bg-gray-700 text-white"
          />
          {importando && <p className="text-yellow-300 mt-2">⏳ Importando...</p>}
          {msg && <p className="text-green-300 mt-2">{msg}</p>}
        </div>

        {leilaoAtivo ? (
          <div className="bg-yellow-800 border-l-4 border-yellow-400 p-4 rounded mb-6">
            <p><strong>🎬 Em Leilão:</strong> {leilaoAtivo.nome} ({leilaoAtivo.posicao})</p>
            <p><strong>⏱ Tempo restante:</strong> {tempoRestante}</p>
            <p><strong>💰 Lance atual:</strong> R$ {Number(leilaoAtivo.valor_atual).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 italic mb-6">Nenhum leilão em andamento.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <input type="text" placeholder="Nome" value={jogador} onChange={(e) => setJogador(e.target.value)} className="p-2 border rounded bg-gray-700 text-white" />
          <select value={posicao} onChange={(e) => setPosicao(e.target.value)} className="p-2 border rounded bg-gray-700 text-white">
            {POSICOES.map(p => <option key={p}>{p}</option>)}
          </select>
          <input type="number" placeholder="Overall" value={overall} onChange={(e) => setOverall(Number(e.target.value))} className="p-2 border rounded bg-gray-700 text-white" />
          <input type="number" placeholder="Valor (R$)" value={valorInicial} onChange={(e) => setValorInicial(Number(e.target.value))} className="p-2 border rounded bg-gray-700 text-white" />
          <input type="number" placeholder="Duração (min)" value={duracaoMin} onChange={(e) => setDuracaoMin(Number(e.target.value))} className="p-2 border rounded bg-gray-700 text-white" />
        </div>

        <button onClick={criarLeilaoManual} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded mb-6">
          🚀 Criar Leilão Manual
        </button>

        <h2 className="text-xl font-semibold mb-4">📋 Fila de Leilões</h2>
        {fila.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nenhum jogador na fila.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fila.map(jog => (
              <div key={jog.id} className="border rounded p-4 shadow bg-gray-700">
                <p><strong>{jog.nome}</strong> ({jog.posicao})</p>
                <p>Overall: {jog.overall}</p>
                <p>💰 R$ {Number(jog.valor_atual).toLocaleString()}</p>
                <button
                  onClick={() => iniciarLeilaoDaFila(jog)}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded w-full"
                >
                  🎬 Iniciar Leilão
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
