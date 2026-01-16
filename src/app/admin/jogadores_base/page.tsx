'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

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

const fmtBRL0 = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '')

export default function AdminCadastroJogadoresPage() {
  // ===== form
  const [nome, setNome] = useState('')
  const [posicao, setPosicao] = useState('')
  const [overall, setOverall] = useState<number>(70)
  const [valorTxt, setValorTxt] = useState('1000000')
  const [nacionalidade, setNacionalidade] = useState('')
  const [foto, setFoto] = useState('')
  const [linkSofifa, setLinkSofifa] = useState('')

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
        .select('id,nome,posicao,overall,valor,nacionalidade,foto,link_sofifa,destino,id_time_destino,created_at')
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

  // ===== cadastrar
  const cadastrar = async () => {
    setMsg(null)

    const n = nome.trim()
    const p = posicao.trim().toUpperCase()
    const link = linkSofifa.trim()

    if (!n || !p || !link) return showMsg('err', 'Preencha: Nome, Posição e Link SoFIFA.')
    if (!Number.isFinite(overall) || overall < 1 || overall > 99) return showMsg('err', 'Overall inválido (1 a 99).')
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
        if ((error as any).code === '23505') return showMsg('err', 'Esse jogador já foi cadastrado (link_sofifa duplicado).')
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
        .eq('destino', 'banco') // ✅ trava corrida
      if (e2) throw e2

      showMsg('ok', `Enviado para o Mercado: ${j.nome}`)
      await carregarJogadores() // ✅ some do banco
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
      await carregarJogadores() // ✅ some do banco
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
      await carregarJogadores() // ✅ some do banco
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

        {/* Cadastro */}
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
