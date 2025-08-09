'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

// ---------------- helpers ----------------
const norm = (s?: any) => (typeof s === 'string' ? s.trim() : s ?? '')

function pickStr(row: any, keys: string[]): string {
  // tenta exatamente essas chaves
  for (const k of keys) {
    if (row?.[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim()
  }
  // tolera variações com espaços / caixa
  for (const k in row) {
    if (
      k &&
      k.replace(/\s+/g, '').toLowerCase() === keys[0].replace(/\s+/g, '').toLowerCase() &&
      String(row[k]).trim() !== ''
    ) {
      return String(row[k]).trim()
    }
  }
  return ''
}

function normalizeUrl(u: string): string {
  if (!u) return ''
  let url = u.replace(/^"(.*)"$/, '$1').trim() // remove aspas ao redor, se tiver
  if (url.startsWith('//')) url = 'https:' + url
  if (url.startsWith('http://')) url = 'https://' + url.slice(7)
  if (!/^https?:\/\//i.test(url)) return '' // garante que é http(s)
  return url
}

// -----------------------------------------

export default function AdminLeilaoPage() {
  const router = useRouter()

  const [jogador, setJogador] = useState('')
  const [posicao, setPosicao] = useState('CA')
  const [overall, setOverall] = useState(80)
  const [valorInicial, setValorInicial] = useState(35_000_000)
  const [duracaoMin, setDuracaoMin] = useState(1)

  const [leiloesAtivos, setLeiloesAtivos] = useState<any[]>([])
  const [fila, setFila] = useState<any[]>([])
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    buscarFila()
    buscarLeiloesAtivos()
    const intervalo = setInterval(buscarLeiloesAtivos, 5000)
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

  const buscarLeiloesAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: true })
      .limit(3)

    if (!error) setLeiloesAtivos(data || [])
    else console.error('Erro ao buscar leilões ativos:', error.message)
  }

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

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({
        status: 'ativo',
        criado_em: agora,
        fim,
        valor_atual: 35_000_000,
        id_time_vencedor: null,
        nome_time_vencedor: null
      })
      .eq('id', jogador.id)

    if (!error) {
      buscarFila()
      buscarLeiloesAtivos()
    } else {
      console.error('Erro ao iniciar leilão da fila:', error.message)
    }
  }

  // ---------- IMPORTAÇÃO DO EXCEL (ATUALIZADO) ----------
  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    setMsg('Lendo planilha...')

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]

        // defval: preenche vazio com '' para evitar undefined
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]

        const rows = json.map((item) => {
          const nome = pickStr(item, ['nome'])
          const posicao = pickStr(item, ['posicao'])
          const overall = Number(item?.overall || 0) || 80
          const origem = pickStr(item, ['time_origem', 'origem'])
          const nacionalidade = pickStr(item, ['nacionalidade'])

          // Lê exatamente a URL do Excel (aceita Imagem_url / Imagem URL / imagemURL etc.)
          const imagemRaw = pickStr(item, [
            'imagem_url',
            'Imagem_url',
            'Imagem URL',
            'imagem URL',
            'imagemURL'
          ])
          const linkRaw = pickStr(item, ['link_sofifa', 'Link_sofifa', 'link Sofifa', 'link'])

          const imagem_url = normalizeUrl(imagemRaw)
          const link_sofifa = normalizeUrl(linkRaw)

          const criado_em = new Date()
          const fim = new Date(criado_em.getTime() + 1 * 60000) // placeholder enquanto na fila

          return {
            nome,
            posicao,
            overall,
            valor_atual: 35_000_000,
            origem,
            nacionalidade,
            imagem_url,   // <- vai pro banco como veio do Excel (normalizado)
            link_sofifa,
            criado_em,
            fim,
            status: 'fila',
            id_time_vencedor: null,
            nome_time_vencedor: null
          }
        })

        // filtra linhas sem nome/posição
        const validos = rows.filter((r) => r.nome && r.posicao)

        setMsg(`Importando ${validos.length} registros...`)

        // insert em lote pra performance
        const chunkSize = 500
        for (let i = 0; i < validos.length; i += chunkSize) {
          const chunk = validos.slice(i, i + chunkSize)
          const { error } = await supabase.from('leiloes_sistema').insert(chunk)
          if (error) {
            console.error('Erro ao inserir chunk:', error.message)
            setMsg(`Erro ao inserir (chunk ${i / chunkSize + 1}): ${error.message}`)
          } else {
            setMsg(`Importados ${Math.min(i + chunk.length, validos.length)} / ${validos.length}`)
          }
        }

        setMsg('✅ Jogadores importados com sucesso!')
        await buscarFila()
      } catch (err: any) {
        console.error(err)
        setMsg('❌ Falha ao importar: ' + (err?.message || 'erro desconhecido'))
      } finally {
        setImportando(false)
      }
    }

    reader.readAsArrayBuffer(file)
  }
  // ------------------------------------------------------

  const formatarTempo = (fim: string) => {
    const tempoFinal = new Date(fim).getTime()
    const agora = Date.now()
    const diff = tempoFinal - agora
    if (diff <= 0) return 'Finalizado'
    const minutos = Math.floor(diff / 60000)
    const segundos = Math.floor((diff % 60000) / 1000)
    return `${minutos}m ${segundos}s`
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

        {leiloesAtivos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {leiloesAtivos.map((leilao) => (
              <div key={leilao.id} className="bg-yellow-800 border-l-4 border-yellow-400 p-4 rounded">
                <p><strong>🎬 Em Leilão:</strong> {leilao.nome} ({leilao.posicao})</p>
                <p><strong>⏱ Tempo restante:</strong> {formatarTempo(leilao.fim)}</p>
                <p><strong>💰 Lance atual:</strong> R$ {Number(leilao.valor_atual).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 italic mb-6">Nenhum leilão em andamento.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <input
            type="text"
            placeholder="Nome"
            value={jogador}
            onChange={(e) => setJogador(e.target.value)}
            className="p-2 border rounded bg-gray-700 text-white"
          />
          <select
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            className="p-2 border rounded bg-gray-700 text-white"
          >
            {POSICOES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Overall"
            value={overall}
            onChange={(e) => setOverall(Number(e.target.value))}
            className="p-2 border rounded bg-gray-700 text-white"
          />
          <input
            type="number"
            placeholder="Valor (R$)"
            value={valorInicial}
            onChange={(e) => setValorInicial(Number(e.target.value))}
            className="p-2 border rounded bg-gray-700 text-white"
          />
          <input
            type="number"
            placeholder="Duração (min)"
            value={duracaoMin}
            onChange={(e) => setDuracaoMin(Number(e.target.value))}
            className="p-2 border rounded bg-gray-700 text-white"
          />
        </div>

        <button
          onClick={criarLeilaoManual}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded mb-6"
        >
          🚀 Criar Leilão Manual
        </button>

        <h2 className="text-xl font-semibold mb-4">📋 Fila de Leilões</h2>
        {fila.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nenhum jogador na fila.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fila.map((jog) => (
              <div key={jog.id} className="border rounded p-4 shadow bg-gray-700">
                {/* mini preview da imagem, se existir */}
                {jog.imagem_url && (
                  <img
                    src={jog.imagem_url}
                    alt={jog.nome}
                    className="w-full h-40 object-cover rounded mb-2 border"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                  />
                )}
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
