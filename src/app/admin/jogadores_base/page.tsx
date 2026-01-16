'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

type Time = { id: string; nome: string }
type JogadorBase = {
  id: string
  nome: string
  posicao: string
  overall: number
  valor: number
  nacionalidade?: string | null
  foto?: string | null
  link_sofifa: string
  destino: 'banco' | 'mercado' | 'leilao' | 'time'
  id_time_destino?: string | null
  created_at?: string
}

type ExcelRow = {
  nome?: any
  posicao?: any
  overall?: any
  valor?: any
  nacionalidade?: any
  foto?: any
  link_sofifa?: any
  linkSofifa?: any
  link?: any
  sofifa?: any
}

const fmtBRL0 = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '')

const safeNum = (v: any) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const normStr = (v: any) => String(v ?? '').trim()

const normLinkKey = (row: ExcelRow) => {
  // aceita várias possibilidades de coluna
  return (
    normStr(row.link_sofifa) ||
    normStr(row.linkSofifa) ||
    normStr(row.link) ||
    normStr(row.sofifa)
  )
}

export default function AdminCadastroJogadoresPage() {
  // ===== form
  const [nome, setNome] = useState('')
  const [posicao, setPosicao] = useState('')
  const [overall, setOverall] = useState<number>(70)
  const [valorTxt, setValorTxt] = useState('1000000')
  const [nacionalidade, setNacionalidade] = useState('')
  const [foto, setFoto] = useState('')
  const [linkSofifa, setLinkSofifa] = useState('')

  // ===== excel import
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([])
  const [excelPreview, setExcelPreview] = useState<
    Array<{
      nome: string
      posicao: string
      overall: number
      valor: number
      nacionalidade: string | null
      foto: string | null
      link_sofifa: string
      ok: boolean
      err?: string
    }>
  >([])
  const [excelInfo, setExcelInfo] = useState<string>('')

  // ===== lists
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false) // ✅ default: só banco

  const [jogadores, setJogadores] = useState<JogadorBase[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const valor = useMemo(() => Number(onlyDigits(valorTxt) || '0'), [valorTxt])

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    window.setTimeout(() => setMsg(null), 4500)
  }

  const carregarTimes = async () => {
    const { data, error } = await supabase.from('times').select('id,nome').order('nome')
    if (error) return
    setTimes((data || []) as Time[])
    if (!timeSelecionado && data?.[0]?.id) setTimeSelecionado(data[0].id)
  }

  // ✅ carrega só banco por padrão
  const carregarJogadores = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('jogadores_base')
        .select(
          'id,nome,posicao,overall,valor,nacionalidade,foto,link_sofifa,destino,id_time_destino,created_at'
        )
        .order('created_at', { ascending: false })
        .limit(500)

      if (!showAll) query = query.eq('destino', 'banco')

      const { data, error } = await query
      if (error) throw error
      setJogadores((data || []) as JogadorBase[])
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao carregar jogadores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarTimes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    carregarJogadores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll])

  const limparForm = () => {
    setNome('')
    setPosicao('')
    setOverall(70)
    setValorTxt('1000000')
    setNacionalidade('')
    setFoto('')
    setLinkSofifa('')
  }

  // ===== cadastrar (unitário)
  const cadastrar = async () => {
    setMsg(null)

    const n = nome.trim()
    const p = posicao.trim().toUpperCase()
    const link = linkSofifa.trim()

    if (!n || !p || !link) return showMsg('err', 'Preencha: Nome, Posição e Link SoFIFA.')
    if (!Number.isFinite(overall) || overall < 1 || overall > 99)
      return showMsg('err', 'Overall inválido (1 a 99).')
    if (!Number.isFinite(valor) || valor < 0) return showMsg('err', 'Valor inválido.')

    setLoading(true)
    try {
      const { error } = await supabase.from('jogadores_base').insert({
        nome: n,
        posicao: p,
        overall,
        valor,
        nacionalidade: nacionalidade.trim() || null,
        foto: foto.trim() || null,
        link_sofifa: link,
        destino: 'banco',
      })

      if (error) {
        if ((error as any).code === '23505')
          return showMsg('err', 'Esse jogador já foi cadastrado (link_sofifa duplicado).')
        throw error
      }

      showMsg('ok', 'Jogador cadastrado no Banco.')
      limparForm()
      await carregarJogadores()
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao cadastrar jogador')
    } finally {
      setLoading(false)
    }
  }

  // ===== Excel: ler arquivo e montar preview
  const parseExcelFile = async (file: File) => {
    setExcelInfo('')
    setExcelRows([])
    setExcelPreview([])

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(ab, { type: 'array' })
    const sheetName = wb.SheetNames?.[0]
    if (!sheetName) {
      showMsg('err', 'Planilha sem abas.')
      return
    }

    const ws = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: '' }) || []
    setExcelRows(raw)

    // montar preview + validação
    const seen = new Set<string>()
    const prev = raw.slice(0, 2000).map((r) => {
      const nome = normStr((r as any).nome)
      const posicao = normStr((r as any).posicao).toUpperCase()
      const overall = Math.round(safeNum((r as any).overall))
      const valor = Math.round(safeNum((r as any).valor))
      const nacionalidade = normStr((r as any).nacionalidade) || null
      const foto = normStr((r as any).foto) || null
      const link_sofifa = normLinkKey(r)

      let ok = true
      let err = ''

      if (!nome) {
        ok = false
        err = 'Sem nome'
      } else if (!posicao) {
        ok = false
        err = 'Sem posição'
      } else if (!link_sofifa) {
        ok = false
        err = 'Sem link_sofifa'
      } else if (!Number.isFinite(overall) || overall < 1 || overall > 99) {
        ok = false
        err = 'Overall inválido'
      } else if (!Number.isFinite(valor) || valor < 0) {
        ok = false
        err = 'Valor inválido'
      }

      // duplicidade dentro do arquivo
      const key = link_sofifa.toLowerCase()
      if (ok) {
        if (seen.has(key)) {
          ok = false
          err = 'Duplicado na planilha'
        } else {
          seen.add(key)
        }
      }

      return { nome, posicao, overall, valor, nacionalidade, foto, link_sofifa, ok, err }
    })

    const okCount = prev.filter((p) => p.ok).length
    const badCount = prev.length - okCount
    setExcelPreview(prev)
    setExcelInfo(
      `Arquivo: ${file.name} • Linhas lidas: ${raw.length} • Válidas (no preview): ${okCount} • Inválidas: ${badCount}`
    )
  }

  // ===== Excel: importar em lote (upsert ignorando duplicados)
  const importarExcel = async () => {
    if (!excelRows.length) return showMsg('err', 'Selecione um arquivo Excel primeiro.')

    setLoading(true)
    setMsg(null)
    try {
      // normaliza + valida tudo (não só preview)
      const seen = new Set<string>()
      const valid: Array<{
        nome: string
        posicao: string
        overall: number
        valor: number
        nacionalidade: string | null
        foto: string | null
        link_sofifa: string
        destino: 'banco'
      }> = []

      let invalid = 0
      for (const r of excelRows) {
        const nome = normStr((r as any).nome)
        const posicao = normStr((r as any).posicao).toUpperCase()
        const overall = Math.round(safeNum((r as any).overall))
        const valor = Math.round(safeNum((r as any).valor))
        const nacionalidade = normStr((r as any).nacionalidade) || null
        const foto = normStr((r as any).foto) || null
        const link_sofifa = normLinkKey(r)

        const key = link_sofifa.toLowerCase()

        const ok =
          !!nome &&
          !!posicao &&
          !!link_sofifa &&
          Number.isFinite(overall) &&
          overall >= 1 &&
          overall <= 99 &&
          Number.isFinite(valor) &&
          valor >= 0 &&
          !seen.has(key)

        if (!ok) {
          invalid++
          continue
        }

        seen.add(key)
        valid.push({ nome, posicao, overall, valor, nacionalidade, foto, link_sofifa, destino: 'banco' })
      }

      if (!valid.length) {
        return showMsg('err', 'Nenhuma linha válida para importar.')
      }

      // IMPORTANTE:
      // Isso pressupõe que existe UNIQUE em jogadores_base(link_sofifa).
      // Com isso, ignoreDuplicates funciona e não quebra por duplicados.
      let insertedApprox = 0

      const chunkSize = 200
      for (let i = 0; i < valid.length; i += chunkSize) {
        const chunk = valid.slice(i, i + chunkSize)
        const { error } = await supabase
          .from('jogadores_base')
          .upsert(chunk as any, { onConflict: 'link_sofifa', ignoreDuplicates: true })

        if (error) throw error
        insertedApprox += chunk.length
      }

      showMsg(
        'ok',
        `Importação concluída. Processadas: ${valid.length} • Ignoradas/Inválidas: ${invalid} • (Duplicados no banco foram ignorados)`
      )

      // limpa import
      setExcelRows([])
      setExcelPreview([])
      setExcelInfo('')

      await carregarJogadores()
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao importar Excel')
    } finally {
      setLoading(false)
    }
  }

  // ===== ações de destino
  const enviarParaMercado = async (j: JogadorBase) => {
    if (j.destino !== 'banco') return
    setLoading(true)
    setMsg(null)
    try {
      const { error: e1 } = await supabase.from('mercado_transferencias').insert({
        nome: j.nome,
        posicao: j.posicao,
        overall: j.overall,
        valor: j.valor,
        nacionalidade: j.nacionalidade || null,
        imagem_url: j.foto || null,
        link_sofifa: j.link_sofifa,
        origem: 'admin',
        created_at: new Date().toISOString(),
      })
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('jogadores_base')
        .update({ destino: 'mercado', id_time_destino: null })
        .eq('id', j.id)
        .eq('destino', 'banco')
      if (e2) throw e2

      showMsg('ok', `Enviado para o Mercado: ${j.nome}`)
      await carregarJogadores()
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao enviar para o Mercado')
    } finally {
      setLoading(false)
    }
  }

  const enviarParaLeilao = async (j: JogadorBase) => {
    if (j.destino !== 'banco') return
    setLoading(true)
    setMsg(null)
    try {
      const agora = new Date()
      const fim = new Date(agora.getTime() + 2 * 60 * 1000)

      const { error: e1 } = await supabase.from('leiloes').insert({
        nome: j.nome,
        posicao: j.posicao,
        overall: j.overall,
        valor_inicial: j.valor,
        valor_atual: j.valor,
        nacionalidade: j.nacionalidade || null,
        imagem_url: j.foto || null,
        link_sofifa: j.link_sofifa,
        status: 'ativo',
        inicio: agora.toISOString(),
        fim: fim.toISOString(),
        created_at: agora.toISOString(),
      })
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('jogadores_base')
        .update({ destino: 'leilao', id_time_destino: null })
        .eq('id', j.id)
        .eq('destino', 'banco')
      if (e2) throw e2

      showMsg('ok', `Enviado para o Leilão: ${j.nome}`)
      await carregarJogadores()
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao enviar para o Leilão')
    } finally {
      setLoading(false)
    }
  }

  const enviarParaTime = async (j: JogadorBase, idTime: string) => {
    if (j.destino !== 'banco') return
    if (!idTime) return showMsg('err', 'Selecione um time.')

    setLoading(true)
    setMsg(null)
    try {
      const { error: e1 } = await supabase.from('elenco').insert({
        id_time: idTime,
        nome: j.nome,
        posicao: j.posicao,
        overall: j.overall,
        valor: j.valor,
        nacionalidade: j.nacionalidade || null,
        imagem_url: j.foto || null,
        link_sofifa: j.link_sofifa,
        origem: 'admin',
        created_at: new Date().toISOString(),
      })
      if (e1) throw e1

      const { error: e2 } = await supabase
        .from('jogadores_base')
        .update({ destino: 'time', id_time_destino: idTime })
        .eq('id', j.id)
        .eq('destino', 'banco')
      if (e2) throw e2

      const nomeTime = times.find((t) => t.id === idTime)?.nome || 'time'
      showMsg('ok', `Enviado para o time ${nomeTime}: ${j.nome}`)
      await carregarJogadores()
    } catch (e: any) {
      showMsg('err', e?.message || 'Falha ao enviar para o time')
    } finally {
      setLoading(false)
    }
  }

  // ===== filtros client-side
  const filtrados = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return jogadores.filter((j) => {
      if (!qq) return true
      return (
        j.nome.toLowerCase().includes(qq) ||
        j.posicao.toLowerCase().includes(qq) ||
        j.link_sofifa.toLowerCase().includes(qq)
      )
    })
  }, [jogadores, q])

  return (
    <div className="min-h-screen bg-[#0B1220] text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-extrabold tracking-wide">Admin • Banco de Jogadores</h1>
            <p className="text-white/70 text-sm">
              {showAll ? 'Mostrando TODOS (banco + enviados).' : 'Mostrando SOMENTE jogadores no BANCO.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/15 px-3 py-2 text-sm"
            >
              {showAll ? '📦 Ver só Banco' : '🧾 Ver todos'}
            </button>

            <button
              onClick={carregarJogadores}
              className="rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/15 px-3 py-2 text-sm"
            >
              🔄 Atualizar
            </button>
          </div>
        </div>

        {msg && (
          <div
            className={[
              'mt-4 rounded-lg px-4 py-3 text-sm ring-1',
              msg.type === 'ok'
                ? 'bg-emerald-600/15 text-emerald-200 ring-emerald-400/25'
                : 'bg-rose-600/15 text-rose-200 ring-rose-400/25',
            ].join(' ')}
          >
            {msg.text}
          </div>
        )}

        {/* ✅ Importar Excel */}
        <div className="mt-6 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold">Importar planilha (Excel)</h2>
              <p className="text-sm text-white/70 mt-1">
                Colunas esperadas: <span className="text-white">nome, posicao, overall, valor, nacionalidade, foto, link_sofifa</span>
                <span className="text-white/60">
                  {' '}
                  (aceita também <b>linkSofifa</b> / <b>link</b> / <b>sofifa</b>)
                </span>
              </p>
            </div>

            <div className="text-xs text-white/60">
              Dica: mantenha <b>link_sofifa</b> único (ideal ter UNIQUE no banco).
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                parseExcelFile(f).catch((err) => showMsg('err', err?.message || 'Falha ao ler Excel'))
              }}
              className="text-sm"
            />

            <button
              onClick={importarExcel}
              disabled={loading || !excelRows.length}
              className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-4 py-2 text-sm font-bold ring-1 ring-white/10"
              title="Importa todas as linhas válidas para o Banco (destino=banco) e ignora duplicados por link_sofifa"
            >
              ⬆️ Importar para o Banco
            </button>

            {excelInfo && <span className="text-sm text-white/70">{excelInfo}</span>}
          </div>

          {!!excelPreview.length && (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-white/10">
              <table className="w-full text-sm">
                <thead className="text-white/70 bg-white/5">
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2 px-3">Nome</th>
                    <th className="text-left py-2 px-3">Pos</th>
                    <th className="text-left py-2 px-3">OVR</th>
                    <th className="text-left py-2 px-3">Valor</th>
                    <th className="text-left py-2 px-3">SoFIFA</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {excelPreview.slice(0, 20).map((r, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="py-2 px-3 text-white/60">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold">{r.nome || '-'}</td>
                      <td className="py-2 px-3">{r.posicao || '-'}</td>
                      <td className="py-2 px-3 tabular-nums">{r.overall || 0}</td>
                      <td className="py-2 px-3 tabular-nums">{fmtBRL0(r.valor || 0)}</td>
                      <td className="py-2 px-3">
                        {r.link_sofifa ? (
                          <a
                            href={r.link_sofifa}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 hover:underline"
                          >
                            Link
                          </a>
                        ) : (
                          <span className="text-white/50">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {r.ok ? (
                          <span className="px-2 py-1 rounded-lg text-xs bg-emerald-600/15 text-emerald-200 ring-1 ring-emerald-400/25">
                            OK
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg text-xs bg-rose-600/15 text-rose-200 ring-1 ring-rose-400/25">
                            {r.err || 'Inválido'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-3 py-2 text-xs text-white/60">
                Preview mostra as primeiras 20 linhas (validação completa ocorre na importação).
              </div>
            </div>
          )}
        </div>

        {/* Cadastro unitário */}
        <div className="mt-6 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
          <h2 className="font-bold">Cadastrar novo jogador</h2>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="text-white/70">Nome *</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
              />
            </label>

            <label className="text-sm">
              <span className="text-white/70">Posição *</span>
              <input
                value={posicao}
                onChange={(e) => setPosicao(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
                placeholder="PE, CA, ZAG..."
              />
            </label>

            <label className="text-sm">
              <span className="text-white/70">Overall *</span>
              <input
                type="number"
                value={overall}
                onChange={(e) => setOverall(Number(e.target.value))}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
                min={1}
                max={99}
              />
            </label>

            <label className="text-sm">
              <span className="text-white/70">Valor (somente números) *</span>
              <input
                value={valorTxt}
                onChange={(e) => setValorTxt(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
                placeholder="1000000"
              />
              <div className="mt-1 text-xs text-white/60">Preview: {fmtBRL0(valor)}</div>
            </label>

            <label className="text-sm">
              <span className="text-white/70">Nacionalidade</span>
              <input
                value={nacionalidade}
                onChange={(e) => setNacionalidade(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
              />
            </label>

            <label className="text-sm">
              <span className="text-white/70">Foto (URL)</span>
              <input
                value={foto}
                onChange={(e) => setFoto(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
                placeholder="https://..."
              />
            </label>

            <label className="text-sm md:col-span-3">
              <span className="text-white/70">Link SoFIFA *</span>
              <input
                value={linkSofifa}
                onChange={(e) => setLinkSofifa(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 outline-none"
                placeholder="https://sofifa.com/player/190871"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={cadastrar}
              disabled={loading}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-4 py-2 text-sm font-bold ring-1 ring-white/10"
            >
              ✅ Cadastrar no Banco
            </button>

            <button
              onClick={limparForm}
              disabled={loading}
              className="rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-60 px-4 py-2 text-sm ring-1 ring-white/10"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="mt-6 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold">Jogadores</h2>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                placeholder="Buscar por nome / posição / link..."
              />

              <select
                value={timeSelecionado}
                onChange={(e) => setTimeSelecionado(e.target.value)}
                className="rounded-lg bg-[#0F1A2D] ring-1 ring-white/10 px-3 py-2 text-sm outline-none"
                title="Time destino (para botão Enviar para Time)"
              >
                {times.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/70">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-2">Jogador</th>
                  <th className="text-left py-2 pr-2">Pos</th>
                  <th className="text-left py-2 pr-2">OVR</th>
                  <th className="text-left py-2 pr-2">Valor</th>
                  {showAll && <th className="text-left py-2 pr-2">Destino</th>}
                  <th className="text-left py-2 pr-2">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((j) => {
                  const pode = j.destino === 'banco'
                  return (
                    <tr key={j.id} className="border-b border-white/5">
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-3">
                          {j.foto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={j.foto}
                              alt=""
                              className="h-10 w-10 rounded-lg object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-white/10 ring-1 ring-white/10 grid place-items-center">
                              ⚽
                            </div>
                          )}
                          <div className="min-w-[220px]">
                            <div className="font-semibold">{j.nome}</div>
                            <a
                              href={j.link_sofifa}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-sky-300 hover:underline"
                            >
                              SoFIFA
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-2">{j.posicao}</td>
                      <td className="py-3 pr-2 tabular-nums">{j.overall}</td>
                      <td className="py-3 pr-2 tabular-nums">{fmtBRL0(j.valor)}</td>

                      {showAll && (
                        <td className="py-3 pr-2">
                          <span className="px-2 py-1 rounded-lg text-xs bg-white/10 ring-1 ring-white/10">
                            {j.destino}
                          </span>
                        </td>
                      )}

                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => enviarParaMercado(j)}
                            disabled={loading || !pode}
                            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 ring-1 ring-white/10"
                            title={!pode ? 'Esse jogador já saiu do banco.' : 'Enviar para Mercado'}
                          >
                            💸 Mercado
                          </button>

                          <button
                            onClick={() => enviarParaLeilao(j)}
                            disabled={loading || !pode}
                            className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 ring-1 ring-white/10"
                            title={!pode ? 'Esse jogador já saiu do banco.' : 'Enviar para Leilão'}
                          >
                            📢 Leilão
                          </button>

                          <button
                            onClick={() => enviarParaTime(j, timeSelecionado)}
                            disabled={loading || !pode}
                            className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-40 ring-1 ring-white/10"
                            title={!pode ? 'Esse jogador já saiu do banco.' : 'Enviar para Time'}
                          >
                            👥 Enviar p/ Time
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {!loading && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={showAll ? 6 : 5} className="py-6 text-center text-white/60">
                      Nenhum jogador encontrado.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={showAll ? 6 : 5} className="py-6 text-center text-white/60">
                      Carregando...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-white/50">
            ✅ Quando você envia para um destino, ele é atualizado no banco e sai automaticamente da lista padrão.
          </div>
        </div>
      </div>
    </div>
  )
}

