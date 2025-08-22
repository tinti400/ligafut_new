'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STORAGE_BUCKET = 'imagens' // <-- ajuste para o nome do seu bucket de Storage (público)
const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

// ---------------- helpers ----------------
const norm = (s?: any) => (typeof s === 'string' ? s.trim() : s ?? '')
const formatMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function pickStr(row: any, keys: string[]): string {
  for (const k of keys) {
    if (row?.[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim()
  }
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
  let url = u.replace(/^"(.*)"$/, '$1').trim()
  if (url.startsWith('//')) url = 'https:' + url
  if (url.startsWith('http://')) url = 'https://' + url.slice(7)
  if (!/^https?:\/\//i.test(url)) return ''
  return url
}

function slugify(str: string) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

// -----------------------------------------

export default function AdminLeilaoPage() {
  const router = useRouter()

  // Form - criação manual
  const [jogador, setJogador] = useState('')
  const [posicao, setPosicao] = useState('CA')
  const [overall, setOverall] = useState(80)
  const [valorInicial, setValorInicial] = useState(35_000_000)
  const [duracaoMin, setDuracaoMin] = useState(2) // duração padrão (global)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemUrl, setImagemUrl] = useState('')

  // Listagens
  const [leiloesAtivos, setLeiloesAtivos] = useState<any[]>([])
  const [fila, setFila] = useState<any[]>([])

  // Controle UI
  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState<'criar' | 'importar' | 'ativos' | 'fila'>('criar')

  // Duração individual por item da fila (min)
  const [duracoesFila, setDuracoesFila] = useState<Record<string, number>>({})

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

    if (!error) {
      setFila(data || [])
      // inicializa durações individuais com o global (sem travar)
      const init: Record<string, number> = {}
      ;(data || []).forEach((j) => (init[j.id] = duracaoMin))
      setDuracoesFila((prev) => ({ ...init, ...prev }))
    } else {
      console.error('Erro ao buscar fila:', error.message)
    }
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

  async function uploadImagemParaStorage(file: File): Promise<string> {
    const nomeBase = slugify(jogador || file.name.split('.').slice(0, -1).join('.'))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `leiloes/${nomeBase}-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'image/jpeg'
    })
    if (upErr) throw new Error(upErr.message)

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  const criarLeilaoManual = async () => {
    try {
      let finalImageUrl = imagemUrl
      if (imagemFile) {
        finalImageUrl = await uploadImagemParaStorage(imagemFile)
        setImagemUrl(finalImageUrl)
      }

      const agora = new Date()
      const fim = new Date(agora.getTime() + Math.max(1, duracaoMin) * 60000)

      const { error } = await supabase.from('leiloes_sistema').insert({
        nome: jogador,
        posicao,
        overall,
        valor_atual: valorInicial,
        id_time_vencedor: null,
        nome_time_vencedor: null,
        imagem_url: finalImageUrl || null,
        fim,
        criado_em: agora,
        status: 'ativo'
      })

      if (error) throw new Error(error.message)

      setJogador('')
      setOverall(80)
      setValorInicial(35_000_000)
      setImagemFile(null)
      setImagemUrl('')
      alert('✅ Leilão criado!')
      router.refresh()
      buscarLeiloesAtivos()
    } catch (e: any) {
      console.error('Erro ao criar leilão manual:', e?.message)
      alert('❌ Erro ao criar leilão: ' + (e?.message || 'desconhecido'))
    }
  }

  const iniciarLeilaoDaFila = async (jog: any) => {
    try {
      const minutos = Math.max(1, Number(duracoesFila[jog.id] || duracaoMin))
      const agora = new Date()
      const fim = new Date(agora.getTime() + minutos * 60000)

      const { error } = await supabase
        .from('leiloes_sistema')
        .update({
          status: 'ativo',
          criado_em: agora,
          fim,
          // respeita valor_atual da fila; se vazio, usa default
          valor_atual: Number(jog?.valor_atual) > 0 ? Number(jog.valor_atual) : 35_000_000,
          id_time_vencedor: null,
          nome_time_vencedor: null
        })
        .eq('id', jog.id)

      if (error) throw new Error(error.message)

      await buscarFila()
      await buscarLeiloesAtivos()
    } catch (e: any) {
      console.error('Erro ao iniciar leilão da fila:', e?.message)
      alert('❌ Erro ao iniciar: ' + (e?.message || 'desconhecido'))
    }
  }

  // ---------- IMPORTAÇÃO DO EXCEL ----------
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
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[]

        const rows = json.map((item) => {
          const nome = pickStr(item, ['nome'])
          const posicao = pickStr(item, ['posicao'])
          const overall = Number(item?.overall || 0) || 80
          const origem = pickStr(item, ['time_origem', 'origem'])
          const nacionalidade = pickStr(item, ['nacionalidade'])

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
            imagem_url: imagem_url || null,
            link_sofifa: link_sofifa || null,
            criado_em,
            fim,
            status: 'fila',
            id_time_vencedor: null,
            nome_time_vencedor: null
          }
        })

        const validos = rows.filter((r) => r.nome && r.posicao)
        setMsg(`Importando ${validos.length} registros...`)

        const chunkSize = 500
        for (let i = 0; i < validos.length; i += chunkSize) {
          const chunk = validos.slice(i, i + chunkSize)
          const { error } = await supabase.from('leiloes_sistema').insert(chunk)
          if (error) {
            console.error('Erro ao inserir chunk:', error.message)
            setMsg(`Erro no chunk ${i / chunkSize + 1}: ${error.message}`)
          } else {
            setMsg(`Importados ${Math.min(i + chunk.length, validos.length)} / ${validos.length}`)
          }
        }

        setMsg('✅ Jogadores importados com sucesso!')
        await buscarFila()
        setAba('fila')
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

  // ======== UI Helpers
  const AbaButton = ({ id, label }: { id: typeof aba; label: string }) => (
    <button
      onClick={() => setAba(id)}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition
        ${aba === id ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
    >
      {label}
    </button>
  )

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur border-b border-gray-800 mb-6">
          <div className="max-w-6xl mx-auto px-1 py-4 flex flex-wrap items-center gap-2 justify-between">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              🎯 Admin – Leilão do Sistema
            </h1>
            <div className="flex gap-2">
              <AbaButton id="criar" label="Criar Manual" />
              <AbaButton id="importar" label="Importar Excel" />
              <AbaButton id="ativos" label="Leilões Ativos" />
              <AbaButton id="fila" label="Fila" />
            </div>
          </div>
        </header>

        {/* Cartão principal */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-5">
          {/* ====== Criar Manual ====== */}
          {aba === 'criar' && (
            <section>
              <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
                {/* Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Nome do jogador</label>
                      <input
                        type="text"
                        placeholder="Ex.: Erling Haaland"
                        value={jogador}
                        onChange={(e) => setJogador(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300">Posição</label>
                      <select
                        value={posicao}
                        onChange={(e) => setPosicao(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      >
                        {POSICOES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300">Overall</label>
                      <input
                        type="number"
                        value={overall}
                        onChange={(e) => setOverall(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300">Valor inicial</label>
                      <input
                        type="number"
                        value={valorInicial}
                        onChange={(e) => setValorInicial(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">{formatMoeda(valorInicial)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300">Duração (min)</label>
                      <input
                        type="number"
                        min={1}
                        value={duracaoMin}
                        onChange={(e) => setDuracaoMin(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-300">Imagem do jogador</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null
                          setImagemFile(f)
                        }}
                        className="mt-1 w-full p-2 rounded-lg bg-gray-800 border border-gray-700"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        (Opcional) Se você já tiver uma URL pública, cole abaixo:
                      </p>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={imagemUrl}
                        onChange={(e) => setImagemUrl(e.target.value)}
                        className="mt-2 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={criarLeilaoManual}
                    className="w-full bg-yellow-500 hover:bg-yellow-400 text-black py-3 rounded-xl font-bold shadow-lg transition"
                  >
                    🚀 Criar Leilão Manual
                  </button>
                </div>

                {/* Preview */}
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                  <h3 className="font-semibold mb-3">Pré-visualização</h3>
                  <div className="rounded-xl overflow-hidden border border-gray-700">
                    {imagemFile ? (
                      <img
                        alt="preview"
                        src={URL.createObjectURL(imagemFile)}
                        className="w-full h-56 object-cover"
                      />
                    ) : imagemUrl ? (
                      <img
                        alt="preview"
                        src={imagemUrl}
                        className="w-full h-56 object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <div className="w-full h-56 grid place-items-center bg-gray-900 text-gray-500">
                        Sem imagem
                      </div>
                    )}
                  </div>

                  <ul className="mt-4 text-sm text-gray-300 space-y-1">
                    <li><b>Nome:</b> {jogador || '—'}</li>
                    <li><b>Posição:</b> {posicao}</li>
                    <li><b>Overall:</b> {overall}</li>
                    <li><b>Valor inicial:</b> {formatMoeda(valorInicial)}</li>
                    <li><b>Duração:</b> {duracaoMin} min</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ====== Importar Excel ====== */}
          {aba === 'importar' && (
            <section>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  📥 Importar Jogadores (.xlsx)
                </label>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleImportar}
                  className="w-full border rounded-lg p-3 bg-gray-800 border-gray-700"
                />
                {importando && <p className="text-yellow-300 mt-2">⏳ Importando...</p>}
                {msg && <p className="text-green-400 mt-2">{msg}</p>}
              </div>
              <p className="text-xs text-gray-400">
                Dicas: colunas aceitas (nome, posicao, overall, time_origem/origem, nacionalidade,
                imagem_url, link_sofifa). As não encontradas são ignoradas.
              </p>
            </section>
          )}

          {/* ====== Ativos ====== */}
          {aba === 'ativos' && (
            <section>
              {leiloesAtivos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {leiloesAtivos.map((leilao) => (
                    <div
                      key={leilao.id}
                      className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-2"
                    >
                      {leilao.imagem_url && (
                        <img
                          src={leilao.imagem_url}
                          alt={leilao.nome}
                          className="w-full h-40 object-cover rounded-lg border border-gray-700"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      )}
                      <p className="text-lg font-bold">{leilao.nome} <span className="text-sm font-medium text-gray-400">({leilao.posicao})</span></p>
                      <p className="text-sm"><b>⏱ Tempo restante:</b> {formatarTempo(leilao.fim)}</p>
                      <p className="text-sm"><b>💰 Lance atual:</b> {formatMoeda(Number(leilao.valor_atual) || 0)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400 italic">
                  Nenhum leilão em andamento.
                </p>
              )}
            </section>
          )}

          {/* ====== Fila ====== */}
          {aba === 'fila' && (
            <section>
              {fila.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum jogador na fila.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fila.map((jog) => (
                    <div key={jog.id} className="border border-gray-700 rounded-xl p-4 shadow bg-gray-800">
                      {jog.imagem_url && (
                        <img
                          src={jog.imagem_url}
                          alt={jog.nome}
                          className="w-full h-44 object-cover rounded mb-3 border border-gray-700"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">{jog.nome}</p>
                        <span className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600">
                          {jog.posicao}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">Overall: <b>{jog.overall}</b></p>
                      <p className="text-sm text-gray-300">
                        💰 {formatMoeda(Number(jog.valor_atual) || 35_000_000)}
                      </p>

                      <div className="mt-3 grid grid-cols-[1fr,auto] gap-2">
                        <input
                          type="number"
                          min={1}
                          value={duracoesFila[jog.id] ?? duracaoMin}
                          onChange={(e) =>
                            setDuracoesFila((prev) => ({ ...prev, [jog.id]: Number(e.target.value) }))
                          }
                          className="p-2 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          placeholder="Duração (min)"
                          title="Duração (min)"
                        />
                        <button
                          onClick={() => iniciarLeilaoDaFila(jog)}
                          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg font-semibold"
                        >
                          🎬 Iniciar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
