'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import ImagemComFallback from '@/components/ImagemComFallback'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STORAGE_BUCKET = 'imagens'
const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

type Aba =
  | 'criar'
  | 'importar'
  | 'ativos'
  | 'fila'
  | 'escuro'
  | 'ativos_escuro'
  | 'fila_escuro'

const norm = (s?: any) => (typeof s === 'string' ? s.trim() : s ?? '')

const formatMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

function getCardType(overall?: number) {
  const ovr = Number(overall || 0)

  if (ovr >= 80) return 'ouro-raro'
  if (ovr >= 75) return 'ouro'
  if (ovr >= 65) return 'prata'
  return 'bronze'
}

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

  const s = String(n)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/R\$/i, '')

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

export default function AdminLeilaoPage() {
  const router = useRouter()

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
  const [duracoesFila, setDuracoesFila] = useState<Record<string, number>>({})

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

  const [importando, setImportando] = useState(false)
  const [msg, setMsg] = useState('')
  const [aba, setAba] = useState<Aba>('criar')
  const [carregando, setCarregando] = useState(false)

  const imagemPreview = useMemo(() => {
    if (imagemFile) return URL.createObjectURL(imagemFile)
    return normalizeUrl(imagemUrl)
  }, [imagemFile, imagemUrl])

  const imagemEscuroPreview = useMemo(() => {
    if (escImagemFile) return URL.createObjectURL(escImagemFile)
    return normalizeUrl(escImagemUrl)
  }, [escImagemFile, escImagemUrl])

  useEffect(() => {
    buscarTudo()

    const intervalo = setInterval(() => {
      buscarLeiloesAtivos()
      buscarLeiloesEscurosAtivos()
    }, 5000)

    return () => clearInterval(intervalo)
  }, [])

  async function buscarTudo() {
    setCarregando(true)

    await Promise.all([
      buscarFila(),
      buscarLeiloesAtivos(),
      buscarFilaEscuro(),
      buscarLeiloesEscurosAtivos(),
    ])

    setCarregando(false)
  }

  async function buscarFila() {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'fila')
      .order('criado_em', { ascending: true })

    if (error) {
      console.error('Erro ao buscar fila:', error.message)
      return
    }

    setFila(data || [])

    const init: Record<string, number> = {}
    ;(data || []).forEach((j) => (init[j.id] = duracaoMin))
    setDuracoesFila((prev) => ({ ...init, ...prev }))
  }

  async function buscarLeiloesAtivos() {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: true })

    if (error) {
      console.error('Erro ao buscar ativos:', error.message)
      return
    }

    setLeiloesAtivos(data || [])
  }

  async function buscarFilaEscuro() {
    const { data, error } = await supabase
      .from('leiloes_escuros')
      .select('*')
      .eq('status', 'fila')
      .order('criado_em', { ascending: true })

    if (error) {
      console.error('Erro ao buscar fila escuro:', error.message)
      return
    }

    setFilaEscuro(data || [])

    const init: Record<string, number> = {}
    ;(data || []).forEach((j) => (init[j.id] = escDuracaoMin))
    setDuracoesFilaEscuro((prev) => ({ ...init, ...prev }))
  }

  async function buscarLeiloesEscurosAtivos() {
    const { data, error } = await supabase
      .from('leiloes_escuros')
      .select('*')
      .eq('status', 'ativo')
      .order('fim', { ascending: true })

    if (error) {
      console.error('Erro ao buscar ativos escuro:', error.message)
      return
    }

    setLeiloesEscurosAtivos(data || [])
  }

  async function uploadImagemParaStorage(file: File, nomeFallback?: string): Promise<string> {
    const nomeBase = slugify(nomeFallback || file.name.split('.').slice(0, -1).join('.'))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `leiloes/${nomeBase}-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'image/jpeg',
    })

    if (upErr) throw new Error(upErr.message)

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return data.publicUrl
  }

  function validarLeilaoSistema() {
    if (!jogador.trim()) return 'Informe o nome do jogador.'
    if (!POSICOES.includes(posicao)) return 'Informe uma posição válida.'
    if (overall < 1 || overall > 99) return 'Overall precisa estar entre 1 e 99.'
    if (valorInicial <= 0) return 'Valor inicial precisa ser maior que zero.'
    if (duracaoMin < 1) return 'Duração precisa ser no mínimo 1 minuto.'
    return ''
  }

  function validarLeilaoEscuro() {
    if (!POSICOES.includes(escPosicao)) return 'Informe uma posição válida.'
    if (escOverall < 1 || escOverall > 99) return 'Overall precisa estar entre 1 e 99.'
    if (escValorInicial <= 0) return 'Valor inicial precisa ser maior que zero.'
    if (escDuracaoMin < 1) return 'Duração precisa ser no mínimo 1 minuto.'
    return ''
  }

  async function criarLeilaoManual() {
    try {
      const erro = validarLeilaoSistema()
      if (erro) {
        setMsg(`❌ ${erro}`)
        return
      }

      let finalImageUrl = normalizeUrl(imagemUrl)

      if (imagemFile) {
        finalImageUrl = await uploadImagemParaStorage(imagemFile, jogador || 'leilao-sistema')
        setImagemUrl(finalImageUrl)
      }

      const agora = new Date()
      const fim = new Date(agora.getTime() + Math.max(1, duracaoMin) * 60000)

      const { error } = await supabase.from('leiloes_sistema').insert({
        nome: jogador.trim(),
        posicao,
        overall: Number(overall),
        valor_atual: Number(valorInicial) || 35_000_000,
        origem: norm(origem),
        nacionalidade: norm(nacionalidade),
        link_sofifa: normalizeUrl(linkSofifa) || null,
        imagem_url: finalImageUrl || null,
        id_time_vencedor: null,
        nome_time_vencedor: null,
        fim,
        criado_em: agora,
        status: 'ativo',
      })

      if (error) throw new Error(error.message)

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
      setMsg('✅ Leilão do sistema criado com sucesso!')

      await buscarLeiloesAtivos()
      setAba('ativos')
      router.refresh()
    } catch (e: any) {
      setMsg('❌ Erro ao criar leilão: ' + (e?.message || 'desconhecido'))
    }
  }

  async function criarLeilaoEscuroManual() {
    try {
      const erro = validarLeilaoEscuro()
      if (erro) {
        setMsg(`❌ ${erro}`)
        return
      }

      let finalImageUrl = normalizeUrl(escImagemUrl)

      if (escImagemFile) {
        finalImageUrl = await uploadImagemParaStorage(escImagemFile, 'leilao-escuro')
        setEscImagemUrl(finalImageUrl)
      }

      const agora = new Date()
      const fim = new Date(agora.getTime() + Math.max(1, escDuracaoMin) * 60000)
      const status = escIniciarAgora ? 'ativo' : 'fila'

      const { error } = await supabase.from('leiloes_escuros').insert({
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
        fim: escIniciarAgora ? fim : agora,
        criado_em: agora,
        status,
      })

      if (error) throw new Error(error.message)

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

      setMsg('✅ Leilão no escuro criado com sucesso!')

      await buscarLeiloesEscurosAtivos()
      await buscarFilaEscuro()
      setAba(status === 'ativo' ? 'ativos_escuro' : 'fila_escuro')
      router.refresh()
    } catch (e: any) {
      setMsg('❌ Erro ao criar leilão no escuro: ' + (e?.message || 'desconhecido'))
    }
  }

  async function iniciarLeilaoDaFila(jog: any) {
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
          nome_time_vencedor: null,
        })
        .eq('id', jog.id)

      if (error) throw new Error(error.message)

      setMsg(`✅ Leilão iniciado: ${jog.nome}`)
      await buscarFila()
      await buscarLeiloesAtivos()
      setAba('ativos')
    } catch (e: any) {
      setMsg('❌ Erro ao iniciar: ' + (e?.message || 'desconhecido'))
    }
  }

  async function iniciarLeilaoEscuroDaFila(item: any) {
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
          nome_time_vencedor: null,
        })
        .eq('id', item.id)

      if (error) throw new Error(error.message)

      setMsg('✅ Leilão no escuro iniciado.')
      await buscarFilaEscuro()
      await buscarLeiloesEscurosAtivos()
      setAba('ativos_escuro')
    } catch (e: any) {
      setMsg('❌ Erro ao iniciar: ' + (e?.message || 'desconhecido'))
    }
  }

  async function cancelarLeilaoSistema(id: string) {
    if (!confirm('Cancelar este leilão ativo?')) return

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'cancelado' })
      .eq('id', id)

    if (error) {
      setMsg(`❌ Erro ao cancelar: ${error.message}`)
      return
    }

    setMsg('✅ Leilão cancelado.')
    buscarLeiloesAtivos()
  }

  async function cancelarLeilaoEscuro(id: string) {
    if (!confirm('Cancelar este leilão no escuro?')) return

    const { error } = await supabase
      .from('leiloes_escuros')
      .update({ status: 'cancelado' })
      .eq('id', id)

    if (error) {
      setMsg(`❌ Erro ao cancelar: ${error.message}`)
      return
    }

    setMsg('✅ Leilão no escuro cancelado.')
    buscarLeiloesEscurosAtivos()
  }

  async function apagarFilaSistema(id: string) {
    if (!confirm('Apagar este jogador da fila?')) return

    const { error } = await supabase.from('leiloes_sistema').delete().eq('id', id)

    if (error) {
      setMsg(`❌ Erro ao apagar: ${error.message}`)
      return
    }

    setMsg('✅ Item removido da fila.')
    buscarFila()
  }

  async function apagarFilaEscuro(id: string) {
    if (!confirm('Apagar este item da fila no escuro?')) return

    const { error } = await supabase.from('leiloes_escuros').delete().eq('id', id)

    if (error) {
      setMsg(`❌ Erro ao apagar: ${error.message}`)
      return
    }

    setMsg('✅ Item removido da fila escura.')
    buscarFilaEscuro()
  }

  async function handleImportar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    setMsg('📥 Lendo planilha...')

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
          const pos = POSICOES.includes(posicaoRaw) ? posicaoRaw : 'MEI'
          const ovr = Number(item?.overall || 0) || 80
          const valor = parseMoeda(item?.valor, 35_000_000)
          const origem = pickStr(item, ['time_origem', 'origem', 'time origem'])
          const nacionalidade = pickStr(item, ['nacionalidade'])

          const imagemRaw = pickStr(item, [
            'imagem_url',
            'Imagem_url',
            'Imagem URL',
            'imagem URL',
            'imagemURL',
          ])

          const linkRaw = pickStr(item, [
            'link_sofifa',
            'Link_sofifa',
            'link Sofifa',
            'link',
            'link_soffia',
            'sofifa',
          ])

          const criado_em = new Date()
          const fim = new Date(criado_em.getTime() + 60_000)

          return {
            nome,
            posicao: pos,
            overall: ovr,
            valor_atual: valor,
            origem,
            nacionalidade,
            imagem_url: normalizeUrl(imagemRaw) || null,
            link_sofifa: normalizeUrl(linkRaw) || null,
            criado_em,
            fim,
            status: 'fila',
            id_time_vencedor: null,
            nome_time_vencedor: null,
          }
        })

        const validos = rows.filter((r) => r.nome && r.posicao)

        if (!validos.length) {
          setMsg('❌ Nenhum jogador válido encontrado na planilha.')
          return
        }

        const chunkSize = 500

        for (let i = 0; i < validos.length; i += chunkSize) {
          const chunk = validos.slice(i, i + chunkSize)
          const { error } = await supabase.from('leiloes_sistema').insert(chunk)

          if (error) {
            setMsg(`❌ Erro no lote ${i / chunkSize + 1}: ${error.message}`)
            return
          }

          setMsg(`✅ Importados ${Math.min(i + chunk.length, validos.length)} / ${validos.length}`)
        }

        setMsg(`✅ ${validos.length} jogadores enviados para a fila com sucesso!`)
        await buscarFila()
        setAba('fila')
      } catch (err: any) {
        setMsg('❌ Falha ao importar: ' + (err?.message || 'erro desconhecido'))
      } finally {
        setImportando(false)
        e.target.value = ''
      }
    }

    reader.readAsArrayBuffer(file)
  }

  function formatarTempo(fim: string) {
    const diff = new Date(fim).getTime() - Date.now()

    if (diff <= 0) return 'Finalizado'

    const minutos = Math.floor(diff / 60000)
    const segundos = Math.floor((diff % 60000) / 1000)

    return `${minutos}m ${segundos.toString().padStart(2, '0')}s`
  }

  const stats = [
    { label: 'Ativos sistema', value: leiloesAtivos.length },
    { label: 'Fila sistema', value: fila.length },
    { label: 'Ativos escuro', value: leiloesEscurosAtivos.length },
    { label: 'Fila escuro', value: filaEscuro.length },
  ]

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.20),transparent_30%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_32%),linear-gradient(180deg,#05070b,#090d14)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-6 rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
                Central Admin
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Leilões LigaFut
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                Crie, importe, organize fila e controle leilões ativos do sistema e do modo escuro.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[620px]">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">{s.label}</p>
                  <p className="mt-1 text-2xl font-black text-white">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <AbaButton aba={aba} setAba={setAba} id="criar" label="Criar Sistema" />
            <AbaButton aba={aba} setAba={setAba} id="importar" label="Importar Excel" />
            <AbaButton aba={aba} setAba={setAba} id="ativos" label="Ativos Sistema" count={leiloesAtivos.length} />
            <AbaButton aba={aba} setAba={setAba} id="fila" label="Fila Sistema" count={fila.length} />
            <AbaButton aba={aba} setAba={setAba} id="escuro" label="Criar Escuro" />
            <AbaButton aba={aba} setAba={setAba} id="ativos_escuro" label="Ativos Escuro" count={leiloesEscurosAtivos.length} />
            <AbaButton aba={aba} setAba={setAba} id="fila_escuro" label="Fila Escuro" count={filaEscuro.length} />

            <button onClick={buscarTudo} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/10">
              {carregando ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </header>

        {msg && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-sm font-bold text-slate-100">
            {msg}
          </div>
        )}

        {aba === 'criar' && (
          <Card title="Criar Leilão Manual" tag="Sistema">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_320px]">
              <FormSistema
                jogador={jogador}
                setJogador={setJogador}
                posicao={posicao}
                setPosicao={setPosicao}
                overall={overall}
                setOverall={setOverall}
                valorInicial={valorInicial}
                setValorInicial={setValorInicial}
                origem={origem}
                setOrigem={setOrigem}
                nacionalidade={nacionalidade}
                setNacionalidade={setNacionalidade}
                linkSofifa={linkSofifa}
                setLinkSofifa={setLinkSofifa}
                duracaoMin={duracaoMin}
                setDuracaoMin={setDuracaoMin}
                imagemUrl={imagemUrl}
                setImagemUrl={setImagemUrl}
                setImagemFile={setImagemFile}
              />

              <PreviewCard
                title="Prévia do Leilão"
                nome={jogador || 'Jogador'}
                posicao={posicao}
                overall={overall}
                valor={valorInicial}
                imagem={imagemPreview}
                origem={origem}
                nacionalidade={nacionalidade}
                duracao={duracaoMin}
                link={linkSofifa}
              />
            </div>

            <button onClick={criarLeilaoManual} className="mt-6 w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-emerald-400 px-5 py-4 text-sm font-black uppercase text-black shadow-xl">
              Criar Leilão Agora
            </button>
          </Card>
        )}

        {aba === 'importar' && (
          <Card title="Importar Jogadores por Excel" tag="Planilha para fila">
            <div className="rounded-3xl border border-dashed border-yellow-400/30 bg-yellow-400/5 p-6">
              <label className="block text-sm font-black uppercase tracking-wide text-yellow-300">
                Arquivo .xlsx
              </label>

              <input
                type="file"
                accept=".xlsx"
                onChange={handleImportar}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-slate-300"
              />

              {importando && (
                <div className="mt-4 rounded-2xl bg-black/35 p-4 text-sm font-bold text-yellow-300">
                  Importando jogadores...
                </div>
              )}

              <p className="mt-4 text-xs leading-6 text-slate-400">
                Colunas suportadas: <b>nome</b>, <b>posicao</b>, <b>overall</b>, <b>valor</b>,
                <b> time_origem</b>, <b>nacionalidade</b>, <b>imagem_url</b>, <b>link_sofifa</b>.
              </p>
            </div>
          </Card>
        )}

        {aba === 'ativos' && (
          <Card title="Leilões Ativos do Sistema" tag="Controle ao vivo">
            <GridEmpty empty={!leiloesAtivos.length} text="Nenhum leilão do sistema em andamento.">
              {leiloesAtivos.map((leilao) => (
                <AuctionCard
                  key={leilao.id}
                  item={leilao}
                  misterioso={false}
                  tempo={formatarTempo(leilao.fim)}
                  onCancel={() => cancelarLeilaoSistema(leilao.id)}
                />
              ))}
            </GridEmpty>
          </Card>
        )}

        {aba === 'fila' && (
          <Card title="Fila de Leilões do Sistema" tag="Prontos para iniciar">
            <GridEmpty empty={!fila.length} text="Nenhum jogador na fila.">
              {fila.map((jog) => (
                <QueueCard
                  key={jog.id}
                  item={jog}
                  duracao={duracoesFila[jog.id] ?? duracaoMin}
                  setDuracao={(v) => setDuracoesFila((prev) => ({ ...prev, [jog.id]: v }))}
                  onStart={() => iniciarLeilaoDaFila(jog)}
                  onDelete={() => apagarFilaSistema(jog.id)}
                  misterioso={false}
                />
              ))}
            </GridEmpty>
          </Card>
        )}

        {aba === 'escuro' && (
          <Card title="Criar Leilão no Escuro" tag="Jogador misterioso">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_320px]">
              <FormEscuro
                escNacionalidade={escNacionalidade}
                setEscNacionalidade={setEscNacionalidade}
                escPosicao={escPosicao}
                setEscPosicao={setEscPosicao}
                escOverall={escOverall}
                setEscOverall={setEscOverall}
                escVelocidade={escVelocidade}
                setEscVelocidade={setEscVelocidade}
                escFinalizacao={escFinalizacao}
                setEscFinalizacao={setEscFinalizacao}
                escCabeceio={escCabeceio}
                setEscCabeceio={setEscCabeceio}
                escValorInicial={escValorInicial}
                setEscValorInicial={setEscValorInicial}
                escDuracaoMin={escDuracaoMin}
                setEscDuracaoMin={setEscDuracaoMin}
                escImagemUrl={escImagemUrl}
                setEscImagemUrl={setEscImagemUrl}
                setEscImagemFile={setEscImagemFile}
                escIniciarAgora={escIniciarAgora}
                setEscIniciarAgora={setEscIniciarAgora}
              />

              <PreviewCard
                title="Prévia Misteriosa"
                nome="Jogador Misterioso"
                posicao={escPosicao}
                overall={escOverall}
                valor={escValorInicial}
                imagem={imagemEscuroPreview}
                origem="Oculto"
                nacionalidade={escNacionalidade}
                duracao={escDuracaoMin}
                escuro
              />
            </div>

            <button onClick={criarLeilaoEscuroManual} className="mt-6 w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 py-4 text-sm font-black uppercase text-black shadow-xl">
              Criar Leilão no Escuro
            </button>
          </Card>
        )}

        {aba === 'ativos_escuro' && (
          <Card title="Leilões no Escuro Ativos" tag="Controle ao vivo">
            <GridEmpty empty={!leiloesEscurosAtivos.length} text="Nenhum leilão no escuro em andamento.">
              {leiloesEscurosAtivos.map((leilao) => (
                <AuctionCard
                  key={leilao.id}
                  item={leilao}
                  misterioso
                  tempo={formatarTempo(leilao.fim)}
                  onCancel={() => cancelarLeilaoEscuro(leilao.id)}
                />
              ))}
            </GridEmpty>
          </Card>
        )}

        {aba === 'fila_escuro' && (
          <Card title="Fila de Leilões no Escuro" tag="Prontos para iniciar">
            <GridEmpty empty={!filaEscuro.length} text="Nenhum item na fila do leilão no escuro.">
              {filaEscuro.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  duracao={duracoesFilaEscuro[item.id] ?? escDuracaoMin}
                  setDuracao={(v) => setDuracoesFilaEscuro((prev) => ({ ...prev, [item.id]: v }))}
                  onStart={() => iniciarLeilaoEscuroDaFila(item)}
                  onDelete={() => apagarFilaEscuro(item.id)}
                  misterioso
                />
              ))}
            </GridEmpty>
          </Card>
        )}
      </div>
    </main>
  )
}

function Card({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl md:p-6">
      {tag && <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">{tag}</p>}
      <h2 className="mb-5 mt-1 text-2xl font-black md:text-3xl">{title}</h2>
      {children}
    </section>
  )
}

function AbaButton({
  id,
  label,
  count,
  aba,
  setAba,
}: {
  id: Aba
  label: string
  count?: number
  aba: Aba
  setAba: (a: Aba) => void
}) {
  const active = aba === id

  return (
    <button
      onClick={() => setAba(id)}
      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/20'
          : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
      }`}
    >
      {label}
      {typeof count === 'number' && (
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-black/15' : 'bg-black/40'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function InputBase(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-yellow-400"
    />
  )
}

function SelectBase(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-yellow-400"
    />
  )
}

function FormSistema(props: any) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Nome">
        <InputBase value={props.jogador} onChange={(e) => props.setJogador(e.target.value)} placeholder="Ex.: Erling Haaland" />
      </Field>

      <Field label="Posição">
        <SelectBase value={props.posicao} onChange={(e) => props.setPosicao(e.target.value)}>
          {POSICOES.map((p) => <option key={p}>{p}</option>)}
        </SelectBase>
      </Field>

      <Field label="Overall">
        <InputBase type="number" value={props.overall} onChange={(e) => props.setOverall(Number(e.target.value))} />
      </Field>

      <Field label="Valor inicial">
        <InputBase type="number" value={props.valorInicial} onChange={(e) => props.setValorInicial(Number(e.target.value))} />
        <p className="mt-1 text-xs text-emerald-300">{formatMoeda(props.valorInicial)}</p>
      </Field>

      <Field label="Time origem">
        <InputBase value={props.origem} onChange={(e) => props.setOrigem(e.target.value)} />
      </Field>

      <Field label="Nacionalidade">
        <InputBase value={props.nacionalidade} onChange={(e) => props.setNacionalidade(e.target.value)} />
      </Field>

      <Field label="Link SoFIFA">
        <InputBase type="url" value={props.linkSofifa} onChange={(e) => props.setLinkSofifa(e.target.value)} placeholder="https://sofifa.com/player/..." />
      </Field>

      <Field label="Duração em minutos">
        <InputBase type="number" min={1} value={props.duracaoMin} onChange={(e) => props.setDuracaoMin(Number(e.target.value))} />
      </Field>

      <div className="md:col-span-2 grid gap-3">
        <Field label="Upload da imagem">
          <InputBase type="file" accept="image/*" onChange={(e) => props.setImagemFile(e.target.files?.[0] || null)} />
        </Field>

        <Field label="Ou URL da imagem">
          <InputBase type="url" value={props.imagemUrl} onChange={(e) => props.setImagemUrl(e.target.value)} placeholder="https://..." />
        </Field>
      </div>
    </div>
  )
}

function FormEscuro(props: any) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Nacionalidade">
        <InputBase value={props.escNacionalidade} onChange={(e) => props.setEscNacionalidade(e.target.value)} placeholder="Ex.: Brasil" />
      </Field>

      <Field label="Posição">
        <SelectBase value={props.escPosicao} onChange={(e) => props.setEscPosicao(e.target.value)}>
          {POSICOES.map((p) => <option key={p}>{p}</option>)}
        </SelectBase>
      </Field>

      <Field label="Overall">
        <InputBase type="number" value={props.escOverall} onChange={(e) => props.setEscOverall(Number(e.target.value))} />
      </Field>

      <Field label="Velocidade">
        <InputBase type="number" value={props.escVelocidade} onChange={(e) => props.setEscVelocidade(e.target.value === '' ? '' : Number(e.target.value))} />
      </Field>

      <Field label="Finalização">
        <InputBase type="number" value={props.escFinalizacao} onChange={(e) => props.setEscFinalizacao(e.target.value === '' ? '' : Number(e.target.value))} />
      </Field>

      <Field label="Cabeceio">
        <InputBase type="number" value={props.escCabeceio} onChange={(e) => props.setEscCabeceio(e.target.value === '' ? '' : Number(e.target.value))} />
      </Field>

      <Field label="Valor inicial">
        <InputBase type="number" value={props.escValorInicial} onChange={(e) => props.setEscValorInicial(Number(e.target.value))} />
        <p className="mt-1 text-xs text-emerald-300">{formatMoeda(props.escValorInicial)}</p>
      </Field>

      <Field label="Duração em minutos">
        <InputBase type="number" min={1} value={props.escDuracaoMin} onChange={(e) => props.setEscDuracaoMin(Number(e.target.value))} />
      </Field>

      <div className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
        <input
          id="iniciar-agora"
          type="checkbox"
          checked={props.escIniciarAgora}
          onChange={(e) => props.setEscIniciarAgora(e.target.checked)}
        />
        <label htmlFor="iniciar-agora" className="text-sm font-bold text-slate-300">
          Iniciar agora. Se desmarcar, vai para a fila.
        </label>
      </div>

      <div className="md:col-span-2 grid gap-3">
        <Field label="Upload da imagem">
          <InputBase type="file" accept="image/*" onChange={(e) => props.setEscImagemFile(e.target.files?.[0] || null)} />
        </Field>

        <Field label="Ou URL da imagem">
          <InputBase type="url" value={props.escImagemUrl} onChange={(e) => props.setEscImagemUrl(e.target.value)} placeholder="https://..." />
        </Field>
      </div>
    </div>
  )
}

function PreviewCard({
  title,
  nome,
  posicao,
  overall,
  valor,
  imagem,
  origem,
  nacionalidade,
  duracao,
  link,
  escuro,
}: any) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-black/35 p-5">
      <h3 className="mb-4 text-lg font-black">{title}</h3>

      <div className="flex justify-center">
        <ImagemComFallback
          variant="elenco-card"
          src={imagem}
          alt={nome}
          playerName={nome}
          position={posicao}
          overall={overall}
          cardType={escuro ? 'normal' : getCardType(overall)}
          width={155}
          height={180}
        />
      </div>

      <div className="mt-5 space-y-2 text-sm text-slate-300">
        <KV k="Valor" v={formatMoeda(valor)} />
        <KV k="Origem" v={origem || '—'} />
        <KV k="Nacionalidade" v={nacionalidade || '—'} />
        <KV k="Duração" v={`${duracao} min`} />
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="block rounded-2xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-center text-sm font-black text-yellow-300">
            Ver no SoFIFA
          </a>
        )}
      </div>
    </aside>
  )
}

function GridEmpty({
  empty,
  text,
  children,
}: {
  empty: boolean
  text: string
  children: React.ReactNode
}) {
  if (empty) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-10 text-center text-sm font-bold text-slate-400">
        {text}
      </div>
    )
  }

  return <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

function AuctionCard({
  item,
  tempo,
  onCancel,
  misterioso,
}: {
  item: any
  tempo: string
  onCancel: () => void
  misterioso: boolean
}) {
  const nome = misterioso ? 'Jogador Misterioso' : item.nome

  return (
    <div className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-2xl">
      <div className="flex justify-center">
        <ImagemComFallback
          variant="elenco-card"
          src={item.imagem_url}
          alt={nome}
          playerName={nome}
          position={item.posicao}
          overall={item.overall}
          cardType={misterioso ? 'normal' : getCardType(item.overall)}
          width={155}
          height={180}
        />
      </div>

      <div className="mt-5 space-y-2">
        <KV k="Tempo" v={tempo} />
        <KV k="Lance atual" v={formatMoeda(Number(item.valor_atual) || 0)} />
        {item.nome_time_vencedor && <KV k="Líder" v={item.nome_time_vencedor} />}
        {item.nacionalidade && <KV k="Nacionalidade" v={item.nacionalidade} />}
        {item.origem && <KV k="Origem" v={item.origem} />}
      </div>

      <button onClick={onCancel} className="mt-4 w-full rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-200 hover:bg-red-400/20">
        Cancelar leilão
      </button>
    </div>
  )
}

function QueueCard({
  item,
  duracao,
  setDuracao,
  onStart,
  onDelete,
  misterioso,
}: {
  item: any
  duracao: number
  setDuracao: (n: number) => void
  onStart: () => void
  onDelete: () => void
  misterioso: boolean
}) {
  const nome = misterioso ? 'Jogador Misterioso' : item.nome

  return (
    <div className="rounded-3xl border border-white/10 bg-black/35 p-5 shadow-2xl">
      <div className="flex justify-center">
        <ImagemComFallback
          variant="elenco-card"
          src={item.imagem_url}
          alt={nome}
          playerName={nome}
          position={item.posicao}
          overall={item.overall}
          cardType={misterioso ? 'normal' : getCardType(item.overall)}
          width={155}
          height={180}
        />
      </div>

      <div className="mt-5 space-y-2">
        <KV k="Valor" v={formatMoeda(Number(item.valor_atual) || 35_000_000)} />
        {item.nacionalidade && <KV k="Nacionalidade" v={item.nacionalidade} />}
        {item.origem && <KV k="Origem" v={item.origem} />}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <InputBase
          type="number"
          min={1}
          value={duracao}
          onChange={(e) => setDuracao(Number(e.target.value))}
          title="Duração em minutos"
        />

        <button onClick={onStart} className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black text-black hover:bg-yellow-300">
          Iniciar
        </button>
      </div>

      <button onClick={onDelete} className="mt-3 w-full rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-black text-red-200 hover:bg-red-400/20">
        Apagar da fila
      </button>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <span className="text-xs font-bold uppercase text-slate-500">{k}</span>
      <span className="text-sm font-black text-white">{v}</span>
    </div>
  )
}