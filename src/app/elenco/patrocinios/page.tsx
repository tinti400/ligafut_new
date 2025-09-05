'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= TIPOS ================= */
type Categoria = 'master' | 'fornecedor' | 'secundario'

type RegraDesempenho = {
  por_vitoria?: number
  por_gol?: number
  por_clean_sheet?: number
  [k: string]: any
}

interface Patrocinio {
  id: string
  nome: string
  categoria: Categoria
  divisao: number
  valor_fixo: number
  beneficio: string
  descricao_beneficio?: string | null
  tipo_pagamento?: string | null
  regra?: RegraDesempenho | null
  ativo?: boolean
  created_at?: string
}

type Escolhas = Record<Categoria, string>

/* ================= CONSTANTES ================= */
const NOVOS_NOMES = new Set([
  'GlobalBank', 'Titan Energy', 'PrimeTel',
  'SportMax', 'VictoryWear', 'ProGear',
  'FastDelivery', 'MediaPlus', 'EcoFoods'
])

/* ================= UTILS ================= */
const formatarBRL = (v?: number | null) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

const CATEGORIAS: { key: Categoria; titulo: string; icone: string; desc: string; grad: string }[] = [
  { key: 'master',     titulo: 'Patrocínio Master',      icone: '🏆', desc: 'Contrato principal com maior valor.', grad: 'from-amber-500/20 to-amber-300/10' },
  { key: 'fornecedor', titulo: 'Material Desportivo',    icone: '👟', desc: 'Fornecimento de material com bônus.', grad: 'from-sky-500/20 to-sky-300/10' },
  { key: 'secundario', titulo: 'Patrocínio Secundário',  icone: '📢', desc: 'Exposição adicional e incentivos.',   grad: 'from-emerald-500/20 to-emerald-300/10' },
]

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 animate-pulse">
      <div className="h-6 w-40 bg-zinc-700/40 rounded mb-3"/>
      <div className="h-4 w-56 bg-zinc-700/30 rounded mb-2"/>
      <div className="h-4 w-24 bg-zinc-700/30 rounded mb-5"/>
      <div className="h-9 w-full bg-zinc-700/20 rounded"/>
    </div>
  )
}

/* ================= COMPONENTE ================= */
export default function PatrociniosPage() {
  const [carregando, setCarregando] = useState(true)
  const [divisao, setDivisao] = useState<number | null>(null)
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [jaEscolheu, setJaEscolheu] = useState(false)
  const [modoTroca, setModoTroca] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [escolhas, setEscolhas] = useState<Escolhas>({ master: '', fornecedor: '', secundario: '' })

  const user = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('user') || '{}')
    : {}

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id_time) {
          toast.error('Faça login para escolher seus patrocínios.')
          return
        }

        // 1) Divisão do time
        const { data: time, error: erroTime } = await supabase
          .from('times')
          .select('divisao')
          .eq('id', user.id_time)
          .single()
        if (erroTime || !time) {
          toast.error(`Não foi possível carregar a divisão do time. ${erroTime?.message ?? ''}`)
          return
        }
        setDivisao(time.divisao)

        // 2) Patrocínios ativos da divisão (sem temporada)
        const { data: patsRaw, error: erroPats } = await supabase
          .from('patrocinios')
          .select('id, nome, categoria, divisao, valor_fixo, beneficio, descricao_beneficio, tipo_pagamento, regra, ativo, created_at')
          .eq('divisao', time.divisao)
          .eq('ativo', true)
          .order('valor_fixo', { ascending: false })
        if (erroPats) {
          toast.error(`Erro ao carregar patrocínios: ${erroPats.message}`)
          return
        }

        // Filtro por nomes novos, com fallback
        let pats = (patsRaw || []).filter(p => NOVOS_NOMES.has(p.nome))
        if (pats.length === 0) pats = patsRaw || []
        setPatrocinios(pats as Patrocinio[])

        // 3) Já escolheu? (sem temporada)
        const { data: escolhido, error: errEscolhido } = await supabase
          .from('patrocinios_escolhidos')
          .select('id_patrocinio_master, id_patrocinio_fornecedor, id_patrocinio_secundario')
          .eq('id_time', user.id_time)
          .maybeSingle()
        if (errEscolhido) toast.error(`Erro ao ler escolhas: ${errEscolhido.message}`)

        // Pré-seleção automática (top por categoria) se não houver escolha salva
        const prefillMaisCaro = () => {
          const byCat: Partial<Record<Categoria, string>> = {}
          for (const cat of ['master','fornecedor','secundario'] as Categoria[]) {
            const top = [...pats].filter(p => p.categoria === cat).sort((a,b) => (b.valor_fixo ?? 0) - (a.valor_fixo ?? 0))[0]
            if (top) byCat[cat] = top.id
          }
          return byCat
        }

        if (escolhido) {
          setJaEscolheu(true)
          setEscolhas({
            master: escolhido.id_patrocinio_master || '',
            fornecedor: escolhido.id_patrocinio_fornecedor || '',
            secundario: escolhido.id_patrocinio_secundario || ''
          })
        } else {
          setEscolhas(prev => ({ ...prev, ...prefillMaisCaro() }))
        }
      } finally {
        setCarregando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selecionados = useMemo(() => {
    const ids = Object.values(escolhas).filter(Boolean)
    return patrocinios.filter(p => ids.includes(p.id))
  }, [escolhas, patrocinios])

  const totalFixoSelecionado = useMemo(
    () => selecionados.reduce((acc, p) => acc + (p.valor_fixo || 0), 0),
    [selecionados]
  )

  function selecionar(categoria: Categoria, id: string) {
    if (jaEscolheu && !modoTroca) return
    setEscolhas(prev => ({ ...prev, [categoria]: id }))
  }

  /** Lê e atualiza public.times.saldo diretamente */
  async function aplicarDeltaCaixaDireto(id_time: string, delta: number) {
    if (!delta) return { ok: true, saldoNovo: undefined }

    // Lê saldo atual
    const { data: atual, error: eSel } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', id_time)
      .single()
    if (eSel) {
      toast.error(`Erro lendo saldo do time: ${eSel.message}`)
      return { ok: false, error: eSel.message }
    }

    const saldoAtual = Number(atual?.saldo || 0)
    const saldoNovo = saldoAtual + Number(delta)

    // Atualiza saldo
    const { data: upd, error: eUpd } = await supabase
      .from('times')
      .update({ saldo: saldoNovo })
      .eq('id', id_time)
      .select('saldo')
      .single()
    if (eUpd) {
      toast.error(`Erro atualizando saldo: ${eUpd.message}`)
      return { ok: false, error: eUpd.message }
    }

    return { ok: true, saldoNovo: upd?.saldo }
  }

  /** Busca linha existente e soma antiga (sem temporada) */
  async function buscarLinhaEAntigo(id_time: string) {
    const { data: row, error } = await supabase
      .from('patrocinios_escolhidos')
      .select('id_patrocinio_master, id_patrocinio_fornecedor, id_patrocinio_secundario')
      .eq('id_time', id_time)
      .maybeSingle()
    if (error) toast.error(`Erro lendo linha existente: ${error.message}`)

    const idsAntigos = [
      row?.id_patrocinio_master,
      row?.id_patrocinio_fornecedor,
      row?.id_patrocinio_secundario,
    ].filter(Boolean) as string[]

    let totalAntigo = 0
    if (idsAntigos.length) {
      const { data: patsAnt, error: eAnt } = await supabase
        .from('patrocinios')
        .select('id, valor_fixo')
        .in('id', idsAntigos)
      if (eAnt) toast.error(`Erro lendo valores antigos: ${eAnt.message}`)
      totalAntigo = (patsAnt ?? []).reduce((a, b) => a + (Number(b?.valor_fixo) || 0), 0)
    }

    return { totalAntigo }
  }

  async function salvar() {
    if (!user?.id_time) {
      toast.error('Usuário não identificado.')
      return
    }

    // Garante 1 por categoria
    for (const cat of ['master','fornecedor','secundario'] as Categoria[]) {
      if (!escolhas[cat]) {
        const top = [...patrocinios].filter(p => p.categoria === cat).sort((a,b) => (b.valor_fixo ?? 0) - (a.valor_fixo ?? 0))[0]
        if (top) escolhas[cat] = top.id
        else {
          toast.error(`Sem opções disponíveis para "${cat}".`)
          return
        }
      }
    }

    setIsSaving(true)
    try {
      // 1) total antigo
      const { totalAntigo } = await buscarLinhaEAntigo(user.id_time)

      // 2) total novo
      const idsNovos = [escolhas.master, escolhas.fornecedor, escolhas.secundario]
      const { data: patsNov, error: eNov } = await supabase
        .from('patrocinios')
        .select('id, nome, categoria, valor_fixo, regra')
        .in('id', idsNovos)
      if (eNov) {
        toast.error(`Erro lendo seleções: ${eNov.message}`)
        return
      }

      const totalNovo = (patsNov ?? []).reduce((a, b) => a + (Number(b?.valor_fixo) || 0), 0)
      const delta = (totalNovo - totalAntigo) || 0

      // 3) confirmação
      const linhasResumo = (patsNov ?? []).map(p => `• ${p.nome} (${p.categoria}) — Fixo ${formatarBRL(p.valor_fixo)}`).join('\n')
      const ok = typeof window !== 'undefined'
        ? window.confirm(`Confirmar estes patrocínios?\n\n${linhasResumo}\n\nFixo total novo: ${formatarBRL(totalNovo)}\nΔ no caixa: ${formatarBRL(delta)}`)
        : true
      if (!ok) {
        toast('Operação cancelada. Nada foi salvo.', { icon: '🛑' })
        setIsSaving(false)
        return
      }

      toast.success('✅ Patrocínios salvos! Aplicando ajustes de caixa…', { duration: 3000 })

      // 4) UPDATE -> INSERT (sem on_conflict)
      const payload = {
        id_time: user.id_time,
        id_patrocinio_master: escolhas.master,
        id_patrocinio_fornecedor: escolhas.fornecedor,
        id_patrocinio_secundario: escolhas.secundario,
        updated_at: new Date().toISOString(),
      }

      // UPDATE
      const { data: updData, error: updErr } = await supabase
        .from('patrocinios_escolhidos')
        .update(payload as any)
        .eq('id_time', user.id_time)
        .select('id')
      if (updErr) {
        toast.error(`Erro atualizando escolhas: ${updErr.message}`)
        setIsSaving(false)
        return
      }

      // INSERT (se não havia linha)
      if (!updData || updData.length === 0) {
        const { error: insErr } = await supabase
          .from('patrocinios_escolhidos')
          .insert(payload as any)
          .select('id')
        if (insErr) {
          toast.error(`Erro inserindo escolhas: ${insErr.message}`)
          setIsSaving(false)
          return
        }
      }

      // 5) aplica delta no caixa (public.times.saldo)
      const deltaResp = await aplicarDeltaCaixaDireto(user.id_time, delta)
      if (!deltaResp.ok) {
        toast(`Patrocinadores salvos, mas delta do caixa falhou: ${deltaResp.error}`, { icon: '⚠️' })
      } else {
        toast.success(`💰 Caixa atualizado: ${formatarBRL(delta)} (saldo: ${formatarBRL(deltaResp.saldoNovo)})`, { duration: 6000 })
      }

      // 6) logs (movimentações e BID) — mostram erro se RLS/constraints bloquearem
      {
        const { error: movErr } = await supabase.from('movimentacoes').insert({
          id_time: user.id_time,
          tipo: 'troca_patrocinio',
          valor: delta,
          descricao: `Troca/definição de patrocinadores. Delta: ${formatarBRL(delta)}`,
          data: new Date().toISOString(),
        })
        if (movErr) toast.error(`Log (movimentações) falhou: ${movErr.message}`)
      }
      {
        const { error: bidErr } = await supabase.from('bid').insert({
          tipo_evento: 'patrocinio_troca',
          descricao: `Troca/definição de patrocinadores. Delta: ${formatarBRL(delta)}`,
          id_time1: user.id_time,
          valor: delta,
          data_evento: new Date().toISOString(),
        })
        if (bidErr) toast.error(`Log (BID) falhou: ${bidErr.message}`)
      }

      // 7) sucesso + UI
      setJaEscolheu(true)
      setModoTroca(false)

      const linhas = (patsNov ?? []).map((p: any) => {
        const r = (p.regra || {}) as RegraDesempenho
        const partes: string[] = []
        if (r.por_vitoria) partes.push(`Vitória ${formatarBRL(r.por_vitoria)}`)
        if (r.por_gol) partes.push(`Gol ${formatarBRL(r.por_gol)}`)
        if (r.por_clean_sheet) partes.push(`CS ${formatarBRL(r.por_clean_sheet)}`)
        const bonusTxt = partes.length ? ` | Bônus: ${partes.join(' + ')}` : ''
        return `${p.nome} (${p.categoria}) — Fixo ${formatarBRL(p.valor_fixo)}${bonusTxt}`
      }).join('\n')

      toast.success(`✅ Tudo pronto!\n${linhas}\nΔ no caixa: ${formatarBRL(delta)}`, { duration: 9000 })
    } catch (e: any) {
      console.error(e)
      toast.error(`Falha ao salvar: ${e?.message || e || 'erro desconhecido'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-zinc-950">
      {/* BG decorativo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-300/10 blur-3xl"/>
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-300/10 blur-3xl"/>
      </div>

      <header className="relative z-10 px-4 pt-10 pb-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                💼 Patrocínios
              </h1>
              <p className="mt-1 text-zinc-300">
                Selecione <b className="text-white">1 Master</b>, <b className="text-white">1 Material</b> e <b className="text-white">1 Secundário</b>.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-zinc-200">
                <span className="text-zinc-400">Divisão</span>
                <div className="text-xl font-semibold text-white">{divisao ?? '—'}</div>
              </div>
              {jaEscolheu && !modoTroca && (
                <button
                  onClick={() => setModoTroca(true)}
                  className="rounded-xl px-4 py-2 font-semibold bg-amber-600 hover:bg-amber-500 text-black shadow"
                >
                  🔁 Trocar patrocinadores
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Resumo fixo */}
      <div className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 bg-zinc-950/80 border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm sm:text-base text-zinc-300">
            Fixo selecionado: <span className="font-bold text-emerald-400">{formatarBRL(totalFixoSelecionado)}</span>
          </div>
          <div className="flex gap-2">
            {jaEscolheu && !modoTroca ? (
              <button
                onClick={() => setModoTroca(true)}
                className="rounded-xl px-5 py-2 font-semibold bg-amber-600 hover:bg-amber-500 text-black shadow"
              >
                🔁 Trocar
              </button>
            ) : (
              <button
                onClick={salvar}
                disabled={isSaving}
                className={`rounded-xl px-5 py-2 font-semibold shadow ${isSaving ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                title="Salvar patrocinadores selecionados"
              >
                {isSaving ? 'Salvando...' : '✅ Salvar'}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="relative z-10 px-4 pb-16">
        <div className="mx-auto max-w-6xl space-y-10">
          {jaEscolheu && !modoTroca && (
            <div className="rounded-2xl border border-emerald-800/40 bg-emerald-900/10 p-5">
              <p className="text-emerald-300 font-medium">✅ Seu time já possui patrocinadores.</p>
              <p className="text-zinc-400 text-sm">Clique em <b>“Trocar”</b> para substituí-los. O ajuste de caixa será feito pelo <i>delta</i> automaticamente.</p>
            </div>
          )}

          {CATEGORIAS.map(({ key, titulo, icone, desc, grad }) => (
            <section key={key} className="space-y-4">
              <div className={`rounded-2xl border border-zinc-800 bg-gradient-to-br ${grad} p-5` }>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                      <span className="text-2xl">{icone}</span> {titulo}
                    </h2>
                    <p className="text-zinc-300 text-sm mt-1">{desc}</p>
                  </div>
                  <div className="hidden sm:block text-zinc-400 text-sm">Escolha 1</div>
                </div>
              </div>

              {carregando ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {patrocinios
                    .filter(p => p.categoria === key)
                    .sort((a, b) => (b.valor_fixo ?? 0) - (a.valor_fixo ?? 0))
                    .slice(0, 3)
                    .map((p) => {
                      const selecionado = escolhas[key] === p.id
                      const r = (p.regra || {}) as RegraDesempenho
                      const podeClicar = !jaEscolheu || modoTroca

                      return (
                        <button
                          key={p.id}
                          onClick={() => podeClicar && selecionar(key, p.id)}
                          className={`group relative text-left rounded-2xl border p-5 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/60
                            ${selecionado
                              ? 'border-emerald-500/70 bg-emerald-950/30 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                              : podeClicar
                                ? 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/70 hover:border-zinc-700'
                                : 'border-zinc-800 bg-zinc-900/40 opacity-60 cursor-not-allowed'}
                          `}
                          disabled={!podeClicar}
                        >
                          <div className={`absolute right-4 top-4 h-6 w-6 rounded-full border flex items-center justify-center text-xs
                            ${selecionado ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-zinc-700 text-zinc-500'}`}
                          >
                            {selecionado ? '✓' : ''}
                          </div>

                          <h3 className="text-lg font-semibold text-white pr-10">{p.nome}</h3>
                          <p className="mt-1 text-sm text-zinc-300 line-clamp-2">
                            {p.beneficio || p.descricao_beneficio || '—'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                              <div className="text-xs text-zinc-400">Fixo</div>
                              <div className="text-base font-bold text-emerald-400">{formatarBRL(p.valor_fixo)}</div>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                              <div className="text-xs text-zinc-400">Tipo</div>
                              <div className="text-sm font-semibold text-amber-300">MISTO</div>
                            </div>
                          </div>

                          {(r.por_vitoria || r.por_gol || r.por_clean_sheet) && (
                            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                              <div className="text-xs text-zinc-400 mb-1">Bônus por desempenho</div>
                              <ul className="text-sm text-sky-300 space-y-1">
                                {r.por_vitoria ? <li>• {formatarBRL(r.por_vitoria)} por vitória</li> : null}
                                {r.por_gol ? <li>• {formatarBRL(r.por_gol)} por gol</li> : null}
                                {r.por_clean_sheet ? <li>• {formatarBRL(r.por_clean_sheet)} por clean sheet</li> : null}
                              </ul>
                            </div>
                          )}
                        </button>
                      )
                    })}
                </div>
              )}
            </section>
          ))}

          {!carregando && patrocinios.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-zinc-300">
              Nenhum patrocínio ativo para esta divisão.
              <div className="text-zinc-400 text-sm mt-1">
                Verifique se os registros têm <b>ativo = true</b>.
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rodapé de ação (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur px-4 py-3 sm:hidden">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="text-sm text-zinc-300">
            Fixo total: <span className="font-bold text-emerald-400">{formatarBRL(totalFixoSelecionado)}</span>
          </div>
          {jaEscolheu && !modoTroca ? (
            <button
              onClick={() => setModoTroca(true)}
              className="rounded-xl px-4 py-2 font-semibold bg-amber-600 text-black"
            >
              Trocar
            </button>
          ) : (
            <button
              onClick={salvar}
              disabled={isSaving}
              className={`rounded-xl px-4 py-2 font-semibold ${isSaving ? 'bg-zinc-700 text-zinc-400' : 'bg-emerald-600 text-white'}`}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
