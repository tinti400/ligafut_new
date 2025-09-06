'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STORAGE_BUCKET = 'imagens'
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
      keys.length &&
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

function parseMoeda(n: any, fallback = 0): number {
  if (n == null || n === '') return fallback
  const s = String(n).replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/R\$/i, '')
  const v = Number(s)
  return Number.isFinite(v) ? v : fallback
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

  // ==================== Leilão do Sistema (seu fluxo atual) ====================
  const [jogador, setJogador] = useState('')
  const [posicao, setPosicao] = useState('CA')
  const [overall, setOverall] = useState(80)
  const [valorInicial, setValorInicial] = useState(35_000_000)
  const [origem, setOrigem] = useState('')
  const [nacionalidade, setNacionalidade] = useState('')
  const [linkSofifa, setLinkSofifa] = useState('')
  const [duracaoMin, setDuracaoMin] = useState(2)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemUrl, setImagemUrl] = useState('')

  const [leiloesAtivos, setLeiloesAtivos] = useState<any[]>([])
  const [fila, setFila] = useState<any[]>([])

  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState<
    'criar' | 'importar' | 'ativos' | 'fila' |
    'escuro' | 'ativos_escuro' | 'fila_escuro'
  >('criar')

  const [duracoesFila, setDuracoesFila] = useState<Record<string, number>>({})

  // ==================== Leilão no Escuro (novo) ====================
  const [escNacionalidade, setEscNacionalidade] = useState('')
  const [escPosicao, setEscPosicao] = useState('CA')
  const [escOverall, setEscOverall] = useState(80)
  const [escVelocidade, setEscVelocidade] = useState<number | ''>('')
  const [escFinalizacao, setEscFinalizacao] = useState<number | ''>('')
  const [escCabeceio, setEscCabeceio] = useState<number | ''>('')

  const [escValorInicial, setEscValorInicial] = useState(35_000_000)
  const [escDuracaoMin, setEscDuracaoMin] = useState(2)
  const [escImagemFile, setEscImagemFile] = useState<File | null>(null)
  const [escImagemUrl, setEscImagemUrl] = useState('')
  const [escIniciarAgora, setEscIniciarAgora] = useState(true)

  const [leiloesEscurosAtivos, setLeiloesEscurosAtivos] = useState<any[]>([])
  const [filaEscuro, setFilaEscuro] = useState<any[]>([])
  const [duracoesFilaEscuro, setDuracoesFilaEscuro] = useState<Record<string, number>>({})

  useEffect(() => {
    buscarFila()
    buscarLeiloesAtivos()
    buscarFilaEscuro()
    buscarLeiloesEscurosAtivos()
    const intervalo = setInterval(() => {
      buscarLeiloesAtivos()
      buscarLeiloesEscurosAtivos()
    }, 5000)
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
      const init: Record<string, number> = {}
      ;(data || []).forEach((j) => (init[j.id] = duracaoMin))
      setDuracoesFila((prev) => ({ ...init, ...prev }))
    } else {
      console.error('Erro ao buscar fila (sistema):', error.message)
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
    else console.error('Erro ao buscar ativos (sistema):', error.message)
  }

  const buscarFilaEscuro = async () => {
    const { data, error } = await supabase
      .from('leiloes_escuros')
      .select('*')
      .eq('status', 'fila')
      .order('criado_em', { ascending: true })

    if (!error) {
      setFilaEscuro(data || [])
      const init: Record<string, number> = {}
      ;(data || []).forEach((j) => (init[j.id] = escDuracaoMin))
      setDuracoesFilaEscuro((prev) => ({ ...init, ...prev }))
    } else {
      console.error('Erro ao buscar fila (escuro):', error.message)
    }
  }

  const buscarLeiloesEscurosAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_escuros')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: true })
      .limit(3)

    if (!error) setLeiloesEscurosAtivos(data || [])
    else console.error('Erro ao buscar ativos (escuro):', error.message)
  }

  async function uploadImagemParaStorage(file: File, nomeFallback?: string): Promise<string> {
    const nomeBase = slugify(nomeFallback || file.name.split('.').slice(0, -1).join('.'))
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

  // ==================== Criar Manual (Sistema) ====================
  const criarLeilaoManual = async () => {
    try {
      let finalImageUrl = normalizeUrl(imagemUrl)
      if (imagemFile) {
        finalImageUrl = await uploadImagemParaStorage(imagemFile, jogador || 'leilao-sistema')
        setImagemUrl(finalImageUrl)
      }

      const agora = new Date()
      const fim = new Date(agora.getTime() + Math.max(1, duracaoMin) * 60000)

      const { error } = await supabase.from('leiloes_sistema').insert({
        nome: jogador,
        posicao,
        overall,
        valor_atual: Number(valorInicial) || 35_000_000,
        origem: norm(origem),
        nacionalidade: norm(nacionalidade),
        link_sofifa: normalizeUrl(linkSofifa) || null,
        imagem_url: finalImageUrl || null,
        id_time_vencedor: null,
        nome_time_vencedor: null,
        fim,
        criado_em: agora,
        status: 'ativo'
      })

      if (error) throw new Error(error.message)

      // reset
      setJogador('')
      setPosicao('CA')
      setOverall(80)
      setValorInicial(35_000_000)
      setOrigem('')
      setNacionalidade('')
      setLinkSofifa('')
      setDuracaoMin(2)
      setImagemFile(null)
      setImagemUrl('')

      alert('✅ Leilão (sistema) criado!')
      router.refresh()
      buscarLeiloesAtivos()
    } catch (e: any) {
      console.error('Erro ao criar leilão (sistema):', e?.message)
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
          valor_atual: Number(jog?.valor_atual) > 0 ? Number(jog.valor_atual) : 35_000_000,
          id_time_vencedor: null,
          nome_time_vencedor: null
        })
        .eq('id', jog.id)

      if (error) throw new Error(error.message)

      await buscarFila()
      await buscarLeiloesAtivos()
    } catch (e: any) {
      console.error('Erro ao iniciar leilão (sistema):', e?.message)
      alert('❌ Erro ao iniciar: ' + (e?.message || 'desconhecido'))
    }
  }

  // ==================== Criar Manual (Escuro) ====================
  const criarLeilaoEscuroManual = async () => {
    try {
      let finalImageUrl = normalizeUrl(escImagemUrl)
      if (escImagemFile) {
        finalImageUrl = await uploadImagemParaStorage(escImagemFile, 'leilao-escuro')
        setEscImagemUrl(finalImageUrl)
      }

      const agora = new Date()
      const minutos = Math.max(1, escDuracaoMin)
      const fim = new Date(agora.getTime() + minutos * 60000)

      const status = escIniciarAgora ? 'ativo' : 'fila'

      const payload: any = {
        nacionalidade: norm(escNacionalidade) || null,
        posicao: escPosicao || null,
        overall: Number(escOverall) || null,
        velocidade: escVelocidade === '' ? null : Number(escVelocidade),
        finalizacao: escFinalizacao === '' ? null : Number(escFinalizacao),
        cabeceio: escCabeceio === '' ? null : Number(escCabeceio),
        valor_atual: Number(escValorInicial) || 35_000_000,
        id_time_vencedor: null,
        nome_time_vencedor: null,
        imagem_url: finalImageUrl || null,
        fim: escIniciarAgora ? fim : agora, // placeholder até iniciar
        criado_em: agora,
        status
      }

      const { error } = await supabase.from('leiloes_escuros').insert(payload)
      if (error) throw new Error(error.message)

      // reset
      setEscNacionalidade('')
      setEscPosicao('CA')
      setEscOverall(80)
      setEscVelocidade('')
      setEscFinalizacao('')
      setEscCabeceio('')
      setEscValorInicial(35_000_000)
      setEscDuracaoMin(2)
      setEscImagemFile(null)
      setEscImagemUrl('')
      setEscIniciarAgora(true)

      alert('✅ Leilão no Escuro criado!')
      router.refresh()
      buscarLeiloesEscurosAtivos()
      buscarFilaEscuro()
    } catch (e: any) {
      console.error('Erro ao criar leilão (escuro):', e?.message)
      alert('❌ Erro ao criar leilão no escuro: ' + (e?.message || 'desconhecido'))
    }
  }

  const iniciarLeilaoEscuroDaFila = async (item: any) => {
    try {
      const minutos = Math.max(1, Number(duracoesFilaEscuro[item.id] || escDuracaoMin))
      const agora = new Date()
      const fim = new Date(agora.getTime() + minutos * 60000)

      const { error } = await supabase
        .from('leiloes_escuros')
        .update({
          status: 'ativo',
          criado_em: agora,
          fim,
          id_time_vencedor: null,
          nome_time_vencedor: null
        })
        .eq('id', item.id)

      if (error) throw new Error(error.message)

      await buscarFilaEscuro()
      await buscarLeiloesEscurosAtivos()
    } catch (e: any) {
      console.error('Erro ao iniciar leilão (escuro):', e?.message)
      alert('❌ Erro ao iniciar: ' + (e?.message || 'desconhecido'))
    }
  }

  // ---------- IMPORTAÇÃO DO EXCEL (Sistema – mantém seu fluxo) ----------
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
          const posicaoRaw = pickStr(item, ['posicao'])
          const posicao = POSICOES.includes(posicaoRaw) ? posicaoRaw : 'MEI'
          const overall = Number(item?.overall || 0) || 80
          const valor = parseMoeda(item?.valor, 35_000_000)
          const origem = pickStr(item, ['time_origem', 'origem', 'time origem'])
          const nacionalidade = pickStr(item, ['nacionalidade'])

          const imagemRaw = pickStr(item, [
            'imagem_url',
            'Imagem_url',
            'Imagem URL',
            'imagem URL',
            'imagemURL'
          ])
          const linkRaw = pickStr(item, [
            'link_sofifa',
            'Link_sofifa',
            'link Sofifa',
            'link',
            'link_soffia',
            'sofifa'
          ])

          const imagem_url = normalizeUrl(imagemRaw)
          const link_sofifa = normalizeUrl(linkRaw)

          const criado_em = new Date()
          const fim = new Date(criado_em.getTime() + 1 * 60000)

          return {
            nome,
            posicao,
            overall,
            valor_atual: valor,
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
            setMsg(`Erro ao inserir (chunk ${i / chunkSize + 1}): ${error.message}`)
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
        <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur border-b border-gray-800 mb-6">
          <div className="max-w-6xl mx-auto px-1 py-4 flex flex-wrap items-center gap-2 justify-between">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              🎯 Admin – Leilão do Sistema & Leilão no Escuro
            </h1>
            <div className="flex flex-wrap gap-2">
              <AbaButton id="criar" label="Criar Manual (Sistema)" />
              <AbaButton id="importar" label="Importar Excel" />
              <AbaButton id="ativos" label="Ativos (Sistema)" />
              <AbaButton id="fila" label="Fila (Sistema)" />
              <AbaButton id="escuro" label="Leilão no Escuro" />
              <AbaButton id="ativos_escuro" label="Ativos (Escuro)" />
              <AbaButton id="fila_escuro" label="Fila (Escuro)" />
            </div>
          </div>
        </header>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-5">
          {/* ====== Criar Manual (Sistema) ====== */}
          {aba === 'criar' && (
            <section>
              <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
                {/* Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Nome</label>
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
                      <label className="text-sm font-medium text-gray-300">Valor (inicial)</label>
                      <input
                        type="number"
                        value={valorInicial}
                        onChange={(e) => setValorInicial(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">{formatMoeda(valorInicial)}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">time_origem</label>
                      <input
                        type="text"
                        value={origem}
                        onChange={(e) => setOrigem(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">nacionalidade</label>
                      <input
                        type="text"
                        value={nacionalidade}
                        onChange={(e) => setNacionalidade(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">link_sofifa</label>
                      <input
                        type="url"
                        placeholder="https://sofifa.com/player/..."
                        value={linkSofifa}
                        onChange={(e) => setLinkSofifa(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
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

                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-300">imagem_url (upload ou URL)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setImagemFile(e.target.files?.[0] || null)}
                        className="mt-1 w-full p-2 rounded-lg bg-gray-800 border border-gray-700"
                      />
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
                    <li><b>Valor:</b> {formatMoeda(valorInicial)}</li>
                    <li><b>Origem:</b> {origem || '—'}</li>
                    <li><b>Nacionalidade:</b> {nacionalidade || '—'}</li>
                    <li><b>link_sofifa:</b> {linkSofifa || '—'}</li>
                    <li><b>Duração:</b> {duracaoMin} min</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ====== Importar Excel (Sistema) ====== */}
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
                Colunas suportadas: <b>nome</b>, <b>posicao</b>, <b>overall</b>, <b>valor</b>,
                <b> time_origem</b>, <b>nacionalidade</b>, <b>imagem_url</b>, <b>link_sofifa</b>.
              </p>
            </section>
          )}

          {/* ====== Ativos (Sistema) ====== */}
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
                      <p className="text-lg font-bold">
                        {leilao.nome}{' '}
                        <span className="text-sm font-medium text-gray-400">({leilao.posicao})</span>
                      </p>
                      <p className="text-sm"><b>⏱ Tempo:</b> {formatarTempo(leilao.fim)}</p>
                      <p className="text-sm"><b>💰 Lance atual:</b> {formatMoeda(Number(leilao.valor_atual) || 0)}</p>
                      {leilao.origem && <p className="text-xs text-gray-300"><b>Origem:</b> {leilao.origem}</p>}
                      {leilao.nacionalidade && <p className="text-xs text-gray-300"><b>Nacionalidade:</b> {leilao.nacionalidade}</p>}
                      {leilao.link_sofifa && (
                        <a href={leilao.link_sofifa} target="_blank" rel="noreferrer" className="text-xs text-yellow-400 underline">
                          Ver no SoFIFA
                        </a>
                      )}
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

          {/* ====== Fila (Sistema) ====== */}
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
                      <p className="text-sm text-gray-300">💰 {formatMoeda(Number(jog.valor_atual) || 35_000_000)}</p>
                      {jog.origem && <p className="text-xs text-gray-300 mt-1"><b>Origem:</b> {jog.origem}</p>}
                      {jog.nacionalidade && <p className="text-xs text-gray-300"><b>Nacionalidade:</b> {jog.nacionalidade}</p>}
                      {jog.link_sofifa && (
                        <a href={jog.link_sofifa} target="_blank" rel="noreferrer" className="text-xs text-yellow-400 underline">
                          Ver no SoFIFA
                        </a>
                      )}

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

          {/* ====== Leilão no Escuro – Criar Manual ====== */}
          {aba === 'escuro' && (
            <section>
              <div className="grid md:grid-cols-[1.1fr,0.9fr] gap-6">
                {/* Form */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-300">Nacionalidade</label>
                      <input
                        type="text"
                        value={escNacionalidade}
                        onChange={(e) => setEscNacionalidade(e.target.value)}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="Ex.: Brasil"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Posição</label>
                      <select
                        value={escPosicao}
                        onChange={(e) => setEscPosicao(e.target.value)}
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
                        value={escOverall}
                        onChange={(e) => setEscOverall(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Velocidade</label>
                      <input
                        type="number"
                        value={escVelocidade as number | undefined}
                        onChange={(e) => setEscVelocidade(e.target.value === '' ? '' : Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="(opcional)"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Finalização</label>
                      <input
                        type="number"
                        value={escFinalizacao as number | undefined}
                        onChange={(e) => setEscFinalizacao(e.target.value === '' ? '' : Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="(opcional)"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Cabeceio</label>
                      <input
                        type="number"
                        value={escCabeceio as number | undefined}
                        onChange={(e) => setEscCabeceio(e.target.value === '' ? '' : Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        placeholder="(opcional)"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Valor (inicial)</label>
                      <input
                        type="number"
                        value={escValorInicial}
                        onChange={(e) => setEscValorInicial(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                      <p className="mt-1 text-xs text-gray-400">{formatMoeda(escValorInicial)}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-300">Duração (min)</label>
                      <input
                        type="number"
                        min={1}
                        value={escDuracaoMin}
                        onChange={(e) => setEscDuracaoMin(Number(e.target.value))}
                        className="mt-1 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-3 mt-1">
                      <input
                        id="iniciar-agora"
                        type="checkbox"
                        checked={escIniciarAgora}
                        onChange={(e) => setEscIniciarAgora(e.target.checked)}
                      />
                      <label htmlFor="iniciar-agora" className="text-sm text-gray-300">
                        Iniciar agora (se desmarcar, vai para a <b>Fila (Escuro)</b>)
                      </label>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-gray-300">Imagem (upload ou URL)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEscImagemFile(e.target.files?.[0] || null)}
                        className="mt-1 w-full p-2 rounded-lg bg-gray-800 border border-gray-700"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={escImagemUrl}
                        onChange={(e) => setEscImagemUrl(e.target.value)}
                        className="mt-2 w-full p-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={criarLeilaoEscuroManual}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-bold shadow-lg transition"
                  >
                    🕵️ Criar Leilão no Escuro
                  </button>
                </div>

                {/* Preview */}
                <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                  <h3 className="font-semibold mb-3">Pré-visualização (Escuro)</h3>
                  <div className="rounded-xl overflow-hidden border border-gray-700">
                    {escImagemFile ? (
                      <img
                        alt="preview"
                        src={URL.createObjectURL(escImagemFile)}
                        className="w-full h-56 object-cover"
                      />
                    ) : escImagemUrl ? (
                      <img
                        alt="preview"
                        src={escImagemUrl}
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
                    <li><b>Nacionalidade:</b> {escNacionalidade || '—'}</li>
                    <li><b>Posição:</b> {escPosicao}</li>
                    <li><b>Overall:</b> {escOverall}</li>
                    <li><b>Velocidade:</b> {escVelocidade || '—'}</li>
                    <li><b>Finalização:</b> {escFinalizacao || '—'}</li>
                    <li><b>Cabeceio:</b> {escCabeceio || '—'}</li>
                    <li><b>Valor:</b> {formatMoeda(escValorInicial)}</li>
                    <li><b>Duração:</b> {escDuracaoMin} min</li>
                    <li><b>Status inicial:</b> {escIniciarAgora ? 'ativo' : 'fila'}</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ====== Ativos (Escuro) ====== */}
          {aba === 'ativos_escuro' && (
            <section>
              {leiloesEscurosAtivos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {leiloesEscurosAtivos.map((leilao) => (
                    <div
                      key={leilao.id}
                      className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-2"
                    >
                      {leilao.imagem_url && (
                        <img
                          src={leilao.imagem_url}
                          alt="Jogador Misterioso"
                          className="w-full h-40 object-cover rounded-lg border border-gray-700"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      )}
                      <p className="text-lg font-bold">Jogador Misterioso</p>
                      <p className="text-sm"><b>⏱ Tempo:</b> {formatarTempo(leilao.fim)}</p>
                      <p className="text-sm"><b>💰 Lance atual:</b> {formatMoeda(Number(leilao.valor_atual) || 0)}</p>

                      <div className="text-xs text-gray-300 space-y-1">
                        {leilao.nacionalidade && <p><b>Nacionalidade:</b> {leilao.nacionalidade}</p>}
                        {leilao.posicao && <p><b>Posição:</b> {leilao.posicao}</p>}
                        {leilao.overall != null && <p><b>Overall:</b> {leilao.overall}</p>}
                        {leilao.velocidade != null && <p><b>Velocidade:</b> {leilao.velocidade}</p>}
                        {leilao.finalizacao != null && <p><b>Finalização:</b> {leilao.finalizacao}</p>}
                        {leilao.cabeceio != null && <p><b>Cabeceio:</b> {leilao.cabeceio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-sm text-gray-400 italic">
                  Nenhum leilão no escuro em andamento.
                </p>
              )}
            </section>
          )}

          {/* ====== Fila (Escuro) ====== */}
          {aba === 'fila_escuro' && (
            <section>
              {filaEscuro.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum item na fila do leilão no escuro.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filaEscuro.map((item) => (
                    <div key={item.id} className="border border-gray-700 rounded-xl p-4 shadow bg-gray-800">
                      {item.imagem_url && (
                        <img
                          src={item.imagem_url}
                          alt="Jogador Misterioso"
                          className="w-full h-44 object-cover rounded mb-3 border border-gray-700"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                        />
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">Jogador Misterioso</p>
                        <span className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600">
                          {item.posicao || '—'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-300">Overall: <b>{item.overall ?? '—'}</b></p>
                      <p className="text-sm text-gray-300">💰 {formatMoeda(Number(item.valor_atual) || 35_000_000)}</p>

                      <div className="mt-3 grid grid-cols-[1fr,auto] gap-2">
                        <input
                          type="number"
                          min={1}
                          value={duracoesFilaEscuro[item.id] ?? escDuracaoMin}
                          onChange={(e) =>
                            setDuracoesFilaEscuro((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
                          }
                          className="p-2 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          placeholder="Duração (min)"
                          title="Duração (min)"
                        />
                        <button
                          onClick={() => iniciarLeilaoEscuroDaFila(item)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg font-semibold"
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
