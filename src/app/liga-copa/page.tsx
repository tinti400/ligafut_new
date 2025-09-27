'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

/** === Supabase (client) === */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** === Tipos === */
type UUID = string

type TimeRow = {
  id: UUID
  nome: string
  logo_url?: string | null
  divisao?: number | null
  saldo?: number | null
}

type Jogo = {
  mandante_id: UUID
  visitante_id: UUID
  mandante: string
  visitante: string
  gols_mandante: number | null
  gols_visitante: number | null
  data_iso?: string | null
  bonus_pago?: boolean
  participacoes_contabilizadas?: boolean
}

type RodadaRow = {
  id: UUID
  numero: number
  jogos: Jogo[] | null
  created_at?: string
}

/** === Utils === */
const fmtBRL0 = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** === Classificação (por times) === */
type RowClass = {
  id_time: UUID
  nome: string
  jogos: number
  v: number
  e: number
  d: number
  gp: number
  gc: number
  sg: number
  pontos: number
  logo_url?: string | null
  divisao?: number | null
}

function computeClassificacao(rodadas: RodadaRow[], times: TimeRow[]): RowClass[] {
  const map = new Map<UUID, RowClass>()
  for (const t of times) {
    map.set(t.id, {
      id_time: t.id,
      nome: t.nome,
      logo_url: t.logo_url,
      divisao: t.divisao,
      jogos: 0,
      v: 0,
      e: 0,
      d: 0,
      gp: 0,
      gc: 0,
      sg: 0,
      pontos: 0,
    })
  }
  for (const r of rodadas) {
    for (const j of r.jogos ?? []) {
      if (j.gols_mandante == null || j.gols_visitante == null) continue
      const m = map.get(j.mandante_id)
      const v = map.get(j.visitante_id)
      if (!m || !v) continue

      m.jogos += 1
      v.jogos += 1
      m.gp += j.gols_mandante
      m.gc += j.gols_visitante
      v.gp += j.gols_visitante
      v.gc += j.gols_mandante

      if (j.gols_mandante > j.gols_visitante) {
        m.v += 1; m.pontos += 3; v.d += 1
      } else if (j.gols_mandante < j.gols_visitante) {
        v.v += 1; v.pontos += 3; m.d += 1
      } else {
        m.e += 1; v.e += 1; m.pontos += 1; v.pontos += 1
      }
    }
  }
  for (const r of map.values()) r.sg = r.gp - r.gc

  return Array.from(map.values()).sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.v !== a.v) return b.v - a.v
    if (b.sg !== a.sg) return b.sg - a.sg
    if (b.gp !== a.gp) return b.gp - a.gp
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/** === Premiação / Bônus === */
const PREMIO_VITORIA = 10_000_000
const PREMIO_EMPATE  = 5_000_000
const PREMIO_DERROTA = 2_500_000
const BONUS_POR_GOL  = 600_000

function calcularPremios(gm: number, gv: number) {
  let baseMandante = PREMIO_EMPATE
  let baseVisitante = PREMIO_EMPATE
  if (gm > gv) { baseMandante = PREMIO_VITORIA; baseVisitante = PREMIO_DERROTA }
  else if (gm < gv) { baseMandante = PREMIO_DERROTA; baseVisitante = PREMIO_VITORIA }

  const bonusGolsMandante = gm * BONUS_POR_GOL
  const bonusGolsVisitante = gv * BONUS_POR_GOL

  return {
    mandante: baseMandante + bonusGolsMandante,
    visitante: baseVisitante + bonusGolsVisitante,
    detalhado: { baseMandante, baseVisitante, bonusGolsMandante, bonusGolsVisitante }
  }
}

/** === Descobrir Admin (igual ao page Jogos) === */
async function descobrirAdminLikeJogos(): Promise<boolean> {
  try {
    const ls = (k: string) => (typeof window !== 'undefined' ? localStorage.getItem(k) : null)

    const direto = [
      ls('is_admin'), ls('admin'), ls('isAdmin'),
      ls('usuario_admin'), ls('usuario_is_admin'),
      ls('moderador'), ls('is_moderator'), ls('staff'),
    ]
    if (direto.some(v => v === '1' || v === 'true')) return true

    const role = (ls('role') || '').toLowerCase()
    if (['admin', 'super', 'owner', 'moderador', 'staff'].includes(role)) return true

    const perfil = (ls('perfil') || '').toLowerCase()
    if (perfil.includes('admin') || perfil.includes('moderador') || perfil.includes('staff')) return true

    let usuarioId: string | null = ls('usuario_id') || null
    const userStr = ls('user') || ls('usuario')
    if (userStr) {
      try {
        const u = JSON.parse(userStr)
        if (u?.admin === true || u?.is_admin === true || u?.isAdmin === true) return true
        const r = (u?.role || u?.papel || '').toLowerCase()
        if (['admin', 'super', 'owner', 'moderador', 'staff'].includes(r)) return true
        const perms: any[] = Array.isArray(u?.permissoes) ? u.permissoes : Array.isArray(u?.permissions) ? u.permissions : []
        if (perms.some(p => String(p).toLowerCase().includes('admin'))) return true
        const grupos: any[] = Array.isArray(u?.grupos) ? u.grupos : []
        if (grupos.some(g => String(g).toLowerCase().includes('admin'))) return true
        if (!usuarioId) usuarioId = u?.id || u?.usuario_id || u?.user_id || null
      } catch {}
    }

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('is_admin')
      if (!rpcErr && (rpcData === true || rpcData === 'true' || rpcData === 1)) return true
    } catch {}

    if (usuarioId) {
      try {
        const { data: adm, error } = await supabase
          .from('admins')
          .select('id, ativo')
          .eq('usuario_id', usuarioId)
          .limit(1)
          .maybeSingle()
        if (!error && adm && (adm.ativo === true || adm.ativo === 1)) return true
      } catch {}

      try {
        const { data: usr, error } = await supabase
          .from('usuarios')
          .select('id, admin, is_admin, role, perfil')
          .eq('id', usuarioId)
          .limit(1)
          .maybeSingle()
        if (!error && usr) {
          if (usr.admin === true || usr.is_admin === true) return true
          const r = String(usr.role || usr.perfil || '').toLowerCase()
          if (['admin', 'super', 'owner', 'moderador', 'staff'].includes(r)) return true
        }
      } catch {}
    }
  } catch {}
  return false
}

/** === Page === */
export default function LigaCopaPage() {
  const [times, setTimes] = useState<TimeRow[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})
  const [rodadas, setRodadas] = useState<RodadaRow[]>([])
  const [loading, setLoading] = useState(false)

  // preferências UI
  const [showClass, setShowClass] = useState<boolean>(true)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [filtroRodada, setFiltroRodada] = useState<number | 'all'>('all')
  const [filtroTime, setFiltroTime] = useState<'all' | UUID>('all')

  // estados de edição (por JOGO)
  const [editRodadaId, setEditRodadaId] = useState<UUID | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [gM, setGM] = useState<number>(0)
  const [gV, setGV] = useState<number>(0)
  const [salvandoJogo, setSalvandoJogo] = useState(false)

  // carregar SOMENTE divisões 1 a 3
  const loadTimes = async () => {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url, divisao, saldo')
      .in('divisao', [1, 2, 3])
      .order('divisao', { ascending: true })
      .order('nome', { ascending: true })

    if (error) {
      toast.error('Erro ao carregar times das divisões 1 a 3')
      console.error(error)
      setTimes([])
      setTimesMap({})
      return
    }
    const arr = (data as TimeRow[]) || []
    const map: Record<string, TimeRow> = {}
    for (const t of arr) map[t.id] = t
    setTimes(arr)
    setTimesMap(map)
  }

  const loadRodadas = async () => {
    const { data, error } = await supabase
      .from('liga_copa_rodadas')
      .select('id, numero, jogos, created_at')
      .order('numero', { ascending: true })
    if (error) {
      console.warn('liga_copa_rodadas não encontrada ou erro ao buscar', error)
      setRodadas([])
      return
    }
    setRodadas(((data as RodadaRow[]) || []).map(r => ({ ...r, jogos: r.jogos ?? [] })))
  }

  // init
  useEffect(() => {
    ;(async () => {
      try {
        const pref = localStorage.getItem('lc_show_class')
        if (pref !== null) setShowClass(pref === '1')
      } catch {}

      const admin = await descobrirAdminLikeJogos()
      setIsAdmin(admin)

      await Promise.all([loadTimes(), loadRodadas()])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persistir toggle classificação
  useEffect(() => {
    try {
      localStorage.setItem('lc_show_class', showClass ? '1' : '0')
    } catch {}
  }, [showClass])

  const classificacao = useMemo(() => computeClassificacao(rodadas, times), [rodadas, times])

  // lista de rodadas para filtro
  const numerosRodadas = useMemo(
    () => Array.from(new Set(rodadas.map(r => r.numero))).sort((a, b) => a - b),
    [rodadas]
  )

  // === filtro combinado (rodada + time) sobre as rodadas e os jogos ===
  const rodadasFiltradas = useMemo(() => {
    const base = filtroRodada === 'all' ? rodadas : rodadas.filter(r => r.numero === filtroRodada)
    if (filtroTime === 'all') return base
    return base
      .map(r => ({
        ...r,
        jogos: (r.jogos || []).filter(
          j => j.mandante_id === filtroTime || j.visitante_id === filtroTime
        ),
      }))
      .filter(r => (r.jogos || []).length > 0)
  }, [rodadas, filtroRodada, filtroTime])

  /** === FINANCEIRO: usa SOMENTE public.times.saldo === */

  async function getSaldoTime(id_time: UUID): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('times')
        .select('saldo')
        .eq('id', id_time)
        .maybeSingle()
      if (error) throw error
      return Number(data?.saldo ?? 0)
    } catch {
      return 0
    }
  }

  async function setSaldoTime(id_time: UUID, novoSaldo: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', id_time)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('Falha ao atualizar public.times.saldo:', e)
      return false
    }
  }

  async function registrarMovimentacao(id_time: UUID, valor: number, descricao: string) {
    try {
      await supabase.from('movimentacoes').insert([{
        id_time,
        valor,
        tipo: 'premiacao',
        descricao,
        data_evento: new Date().toISOString()
      } as any])
    } catch (e) {
      console.warn('Tabela movimentacoes ausente (ok ignorar):', e)
    }
  }

  async function creditarPremio(id_time: UUID, valor: number, descricao: string) {
    if (valor <= 0) return
    const saldoAtual = await getSaldoTime(id_time)
    const ok = await setSaldoTime(id_time, saldoAtual + valor)
    if (!ok) {
      toast.error('Não foi possível atualizar o saldo do time.')
      return
    }
    await registrarMovimentacao(id_time, valor, descricao)
  }

  /** === JOGADORES (contabilizar participações do ELENCO inteiro) === */

  async function fetchElencoIdsByTeam(timeId: UUID, tmap: Record<string, TimeRow>): Promise<UUID[]> {
    const tableCandidates = ['elenco', 'public_elenco']
    const colCandidates = ['id_time', 'time_id', 'time', 'time_origem']
    for (const table of tableCandidates) {
      for (const col of colCandidates) {
        try {
          const { data, error } = await supabase
            .from(table)
            .select('id')
            .eq(col, timeId)
          if (!error && Array.isArray(data) && data.length > 0) {
            return (data as Array<{ id: string }>).map(r => r.id as UUID)
          }
        } catch {}
      }
    }
    try {
      const nome = tmap[timeId]?.nome
      if (nome) {
        const { data, error } = await supabase
          .from('elenco')
          .select('id, time_origem')
          .ilike('time_origem', nome)
        if (!error && Array.isArray(data) && data.length > 0) {
          return (data as Array<{ id: string }>).map(r => r.id as UUID)
        }
      }
    } catch {}
    return []
  }

  async function tryRPCAjustarJogosJogadores(ids: UUID[], delta: number) {
    try {
      const { error } = await supabase.rpc('ajustar_jogos_jogadores', {
        p_ids: ids,
        p_delta: delta
      } as any)
      if (error) throw error
      return true
    } catch (e) {
      console.warn('RPC ajustar_jogos_jogadores indisponível/falhou; usando fallback.', e)
      return false
    }
  }

  async function fallbackAjustarJogosJogadores(ids: UUID[], delta: number) {
    if (!ids || ids.length === 0) return true
    try {
      const { data, error } = await supabase
        .from('jogadores')
        .select('id, jogos')
        .in('id', ids)
      if (error) throw error
      const byId: Record<string, number> = {}
      for (const r of data as Array<{id: string; jogos: number | null}>) {
        byId[r.id] = r.jogos ?? 0
      }
      for (const id of ids) {
        const novo = Math.max(0, (byId[id] ?? 0) + delta)
        const { error: uErr } = await supabase
          .from('jogadores')
          .update({ jogos: novo })
          .eq('id', id)
        if (uErr) throw uErr
      }
      return true
    } catch (e) {
      console.error('fallbackAjustarJogosJogadores falhou:', e)
      return false
    }
  }

  async function ajustarJogosElencoDoTime(timeId: UUID, delta: number, tmap: Record<string, TimeRow>) {
    const ids = await fetchElencoIdsByTeam(timeId, tmap)
    if (ids.length === 0) {
      console.warn('Nenhum jogador encontrado para o time', timeId)
      return
    }
    const okRPC = await tryRPCAjustarJogosJogadores(ids, delta)
    if (!okRPC) {
      const ok = await fallbackAjustarJogosJogadores(ids, delta)
      if (!ok) toast.error('Falha ao atualizar jogos dos jogadores.')
    }
  }

  /** === GERAR/RESETAR CONFRONTOS (via API) === */
  const gerarLigaCopa = async () => {
    if (times.length < 2) {
      toast.error('Cadastre ao menos 2 times (divisões 1 a 3).')
      return
    }
    setLoading(true)
    const idLoading = 'gera-lc-api'
    try {
      toast.loading('Gerando confrontos da Liga-Copa…', { id: idLoading })

      const res = await fetch('/api/liga-copa/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()

      if (!res.ok || !json?.ok) {
        console.error(json)
        toast.error(json?.error || 'Erro ao gerar rodadas.', { id: idLoading })
        return
      }

      await loadRodadas()
      toast.success(`✅ Liga-Copa gerada: ${json.rodadas} rodadas`, { id: idLoading })
    } catch (e) {
      console.error(e)
      toast.error('Erro inesperado ao chamar a API.', { id: idLoading })
    } finally {
      setLoading(false)
    }
  }

  /** === Salvar por JOGO (PRIMEIRO LANÇAMENTO) === */
  const salvarPrimeiroLancamento = async (rodadaId: UUID, index: number, gm: number, gv: number) => {
    if (!isAdmin || salvandoJogo) return
    setSalvandoJogo(true)
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()
      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: Jogo[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }

      const golsM = Number.isFinite(gm) ? Math.max(0, Math.floor(gm)) : 0
      const golsV = Number.isFinite(gv) ? Math.max(0, Math.floor(gv)) : 0

      jogo.gols_mandante = golsM
      jogo.gols_visitante = golsV
      jogo.bonus_pago = true
      jogo.participacoes_contabilizadas = true
      lista[index] = jogo

      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)
      if (updErr) throw updErr

      const mId = jogo.mandante_id
      const vId = jogo.visitante_id
      const mNome = timesMap[mId]?.nome || jogo.mandante || 'Mandante'
      const vNome = timesMap[vId]?.nome || jogo.visitante || 'Visitante'

      const { mandante, visitante, detalhado } = calcularPremios(golsM, golsV)

      const descM =
        `Liga-Copa • Rodada: prêmio ${fmtBRL0(detalhado.baseMandante)} + ` +
        `${golsM} gol(s) x ${fmtBRL0(BONUS_POR_GOL)} = ${fmtBRL0(detalhado.bonusGolsMandante)} • ${mNome} ${golsM}x${golsV} ${vNome}`

      const descV =
        `Liga-Copa • Rodada: prêmio ${fmtBRL0(detalhado.baseVisitante)} + ` +
        `${golsV} gol(s) x ${fmtBRL0(BONUS_POR_GOL)} = ${fmtBRL0(detalhado.bonusGolsVisitante)} • ${mNome} ${golsM}x${golsV} ${vNome}`

      await Promise.all([
        creditarPremio(mId, mandante, descM),
        creditarPremio(vId, visitante, descV),
      ])

      await Promise.all([
        ajustarJogosElencoDoTime(mId, +1, timesMap),
        ajustarJogosElencoDoTime(vId, +1, timesMap),
      ])

      setRodadas(prev => prev.map(r => (r.id === rodadaId ? { ...r, jogos: lista } : r)))

      toast.success(
        `✅ Placar salvo, premiações pagas e jogos dos elencos contabilizados!\n` +
        `${mNome}: ${fmtBRL0(mandante)} • ${vNome}: ${fmtBRL0(visitante)}`
      )
      setEditRodadaId(null); setEditIndex(null)
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao salvar placar')
    } finally {
      setSalvandoJogo(false)
    }
  }

  /** === Salvar por JOGO (AJUSTE • não paga/conta novamente) === */
  const salvarAjuste = async (rodadaId: UUID, index: number, gm: number, gv: number) => {
    if (!isAdmin || salvandoJogo) return
    setSalvandoJogo(true)
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()
      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: Jogo[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }
      jogo.gols_mandante = Number.isFinite(gm) ? Math.max(0, Math.floor(gm)) : 0
      jogo.gols_visitante = Number.isFinite(gv) ? Math.max(0, Math.floor(gv)) : 0
      jogo.bonus_pago = true
      jogo.participacoes_contabilizadas = true

      lista[index] = jogo
      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)
      if (updErr) throw updErr

      setRodadas(prev => prev.map(r => (r.id === rodadaId ? { ...r, jogos: lista } : r)))
      toast.success('✏️ Resultado ajustado! (sem repetir premiação/participações)')
      setEditRodadaId(null); setEditIndex(null)
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao ajustar placar')
    } finally {
      setSalvandoJogo(false)
    }
  }

  const excluirResultado = async (rodadaId: UUID, index: number) => {
    if (!isAdmin) return
    if (!confirm('Deseja excluir o resultado deste jogo?')) return
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()
      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: Jogo[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }

      const tinhaPlacar = jogo.gols_mandante != null && jogo.gols_visitante != null
      const tinhaParticipacoes = jogo.participacoes_contabilizadas === true

      jogo.gols_mandante = null
      jogo.gols_visitante = null
      jogo.bonus_pago = false
      jogo.participacoes_contabilizadas = false
      lista[index] = jogo

      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)
      if (updErr) throw updErr

      if (tinhaPlacar && tinhaParticipacoes) {
        await Promise.all([
          ajustarJogosElencoDoTime(jogo.mandante_id, -1, timesMap),
          ajustarJogosElencoDoTime(jogo.visitante_id, -1, timesMap),
        ])
      }

      setRodadas(prev => prev.map(r => (r.id === rodadaId ? { ...r, jogos: lista } : r)))
      toast.success('🗑️ Resultado removido e participações revertidas (se existiam).')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao remover resultado')
    }
  }

  /** === UI helpers === */
  const aproveitamento = (row: RowClass) =>
    row.jogos > 0 ? Math.round((row.pontos / (row.jogos * 3)) * 100) : 0

  const faixaPorPosicao = (pos: number) => {
    if (pos >= 1 && pos <= 10) return { rotulo: '1ª Divisão', cor: 'bg-emerald-500 text-black', chip: 'bg-emerald-600/20 ring-emerald-500/40' }
    if (pos >= 11 && pos <= 20) return { rotulo: '2ª Divisão', cor: 'bg-sky-400 text-black', chip: 'bg-sky-600/20 ring-sky-400/40' }
    return { rotulo: '3ª Divisão', cor: 'bg-amber-400 text-black', chip: 'bg-amber-600/20 ring-amber-400/40' }
  }

  const nomeLogo = (id: UUID) => {
    const t = timesMap[id]
    return { nome: t?.nome, logo: t?.logo_url }
  }

  /** === Render === */
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      {/* Título */}
      <div className="max-w-6xl mx-auto px-4 pt-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center mb-6">
          <span className="bg-gradient-to-r from-yellow-400 via-emerald-400 to-lime-300 bg-clip-text text-transparent">
            🏟️ Liga-Copa (D1–D3) • Turno Único
          </span>
        </h1>
      </div>

      {/* Barra de Ações */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex items-center justify-center">
            <button
              onClick={gerarLigaCopa}
              disabled={loading || times.length < 2}
              className={`px-4 py-2 rounded-full text-sm border transition ${
                loading
                  ? 'bg-gray-700 text-gray-300 cursor-not-allowed border-white/10'
                  : 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500/50'
              }`}
              title="Gera/Reseta todas as rodadas da Liga-Copa via API"
            >
              {loading ? 'Gerando…' : '🚀 Gerar/Resetar Rodadas'}
            </button>
          </div>

          {/* Filtro por rodada */}
          <div className="flex items-center justify-center gap-2">
            <label className="text-sm text-gray-300">Rodada:</label>
            <select
              value={filtroRodada === 'all' ? 'all' : String(filtroRodada)}
              onChange={(e) =>
                setFiltroRodada(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-lg bg-gray-800 text-white text-sm px-3 py-2 border border-white/10"
              title="Filtrar por rodada"
            >
              <option value="all">Todas</option>
              {numerosRodadas.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Filtro por time */}
          <div className="flex items-center justify-center gap-2">
            <label className="text-sm text-gray-300">Time:</label>
            <select
              value={filtroTime === 'all' ? 'all' : filtroTime}
              onChange={(e) => setFiltroTime(e.target.value === 'all' ? 'all' : (e.target.value as UUID))}
              className="rounded-lg bg-gray-800 text-white text-sm px-3 py-2 border border-white/10"
              title="Filtrar jogos por time"
            >
              <option value="all">Todos os times</option>
              {times.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}{typeof t.divisao === 'number' ? ` • D${t.divisao}` : ''}
                </option>
              ))}
            </select>
            {filtroTime !== 'all' && (
              <button
                onClick={() => setFiltroTime('all')}
                className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/10"
                title="Limpar filtro de time"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Toggle classificação */}
          <div className="flex items-center justify-center gap-3">
            <span className="text-sm text-gray-300">Classificação</span>
            <button
              onClick={() => setShowClass(v => !v)}
              className={[
                'relative inline-flex h-8 w-16 items-center rounded-full border transition',
                showClass ? 'bg-emerald-600 border-emerald-500' : 'bg-gray-700 border-white/10'
              ].join(' ')}
              aria-pressed={showClass}
              title={showClass ? 'Ocultar classificação' : 'Mostrar classificação'}
            >
              <span
                className={[
                  'inline-block h-6 w-6 transform rounded-full bg-white transition',
                  showClass ? 'translate-x-9' : 'translate-x-1'
                ].join(' ')}
              />
            </button>
          </div>
        </div>

        <div className="mb-1 text-center text-xs text-emerald-300">
          Participantes (D1–D3): <b>{times.length}</b>
          {!isAdmin && (
            <span className="ml-2 text-amber-300">• edição de resultados bloqueada (somente admin)</span>
          )}
        </div>
      </div>

      {/* Legenda (faixas por posição) */}
      <div className="max-w-6xl mx-auto px-4 mt-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 bg-emerald-600/20 ring-1 ring-emerald-500/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 1º – 10º • 1ª Divisão
          </span>
          <span className="inline-flex items-center gap-2 bg-sky-600/20 ring-1 ring-sky-400/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> 11º – 20º • 2ª Divisão
          </span>
          <span className="inline-flex items-center gap-2 bg-amber-600/20 ring-1 ring-amber-400/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 21º – Último • 3ª Divisão
          </span>
        </div>
      </div>

      {/* Classificação (ocultável) */}
      {showClass && (
        <div className="max-w-6xl mx-auto px-4 pb-10">
          <div className="mb-3 flex justify-end">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `📊 Liga-Copa (Turno Único • D1–D3):\n\n` +
                  classificacao
                    .map(
                      (item, i) =>
                        `${i + 1}º ${item.nome} - ${item.pontos} pts (${item.v}V ${item.e}E ${item.d}D)`
                    )
                    .join('\n')
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm px-3 py-1.5 rounded-lg font-semibold"
            >
              📤 Compartilhar
            </a>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-900/60 shadow-2xl shadow-black/30">
            <table className="min-w-full text-sm">
              <thead className="bg-black/70 text-yellow-300 border-b border-white/10">
                <tr>
                  <th className="py-3 px-4 text-left">Pos</th>
                  <th className="py-3 px-4 text-left">Time</th>
                  <th className="py-3 px-2 text-center">Faixa</th>
                  <th className="py-3 px-2 text-center">Pts</th>
                  <th className="py-3 px-2 text-center">Aprove.</th>
                  <th className="py-3 px-2 text-center">J</th>
                  <th className="py-3 px-2 text-center">V</th>
                  <th className="py-3 px-2 text-center">E</th>
                  <th className="py-3 px-2 text-center">D</th>
                  <th className="py-3 px-2 text-center">GP</th>
                  <th className="py-3 px-2 text-center">GC</th>
                  <th className="py-3 px-2 text-center">SG</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {classificacao.map((item, index) => {
                  const pos = index + 1
                  const ap = aproveitamento(item)
                  const faixa = faixaPorPosicao(pos)

                  const linhaCor =
                    pos <= 10
                      ? 'bg-emerald-950/30 hover:bg-emerald-900/30'
                      : pos <= 20
                      ? 'bg-sky-950/30 hover:bg-sky-900/30'
                      : 'bg-amber-950/30 hover:bg-amber-900/30'

                  return (
                    <tr key={item.id_time} className={`${linhaCor} transition-colors`}>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ring-1 ring-white/10 bg-gray-700 text-gray-200">
                          {pos}
                        </span>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                          {item.logo_url ? (
                            <img
                              src={item.logo_url}
                              alt={item.nome}
                              className="w-7 h-7 rounded-full ring-1 ring-white/10 object-cover"
                            />
                          ) : (
                            <span className="w-7 h-7 grid place-items-center rounded-full bg-gray-700 text-[10px] text-gray-200 ring-1 ring-white/10">
                              {item.nome.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="font-medium">{item.nome}</span>
                          {typeof item.divisao === 'number' && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-800 ring-1 ring-white/10 text-gray-300">
                              D{item.divisao}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${faixa.chip}`}>
                          <span className={`inline-block w-2 h-2 rounded-full ${faixa.cor.replace(' text-black', '')}`}></span>
                          {faixa.rotulo}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 text-center font-bold text-yellow-300">{item.pontos}</td>

                      <td className="py-2.5 px-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-24 md:w-32 h-2 rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-2 bg-emerald-500" style={{ width: `${ap}%` }} />
                          </div>
                          <span className="text-xs text-gray-300">{ap}%</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-center">{item.jogos}</td>
                      <td className="py-2.5 px-2 text-center">{item.v}</td>
                      <td className="py-2.5 px-2 text-center">{item.e}</td>
                      <td className="py-2.5 px-2 text-center">{item.d}</td>
                      <td className="py-2.5 px-2 text-center">{item.gp}</td>
                      <td className="py-2.5 px-2 text-center">{item.gc}</td>
                      <td className="py-2.5 px-2 text-center">{item.sg}</td>
                    </tr>
                  )
                })}
                {classificacao.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-gray-400">
                      Sem jogos finalizados ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rodadas — edição por JOGO */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <h2 className="text-base font-semibold text-gray-200 mb-3">Rodadas</h2>

        {rodadasFiltradas.map(r => {
          const feitos = (r.jogos || []).filter(j => j.gols_mandante != null && j.gols_visitante != null).length
          const total = (r.jogos || []).length
          return (
            <section key={r.id ?? r.numero} className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">🏁 Rodada {r.numero}</h3>
                <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/70">
                  {feitos}/{total} com placar
                </span>
              </div>

              <div className="space-y-2">
                {(r.jogos || []).map((jogo, idx) => {
                  const { nome: nM, logo: lM } = nomeLogo(jogo.mandante_id)
                  const { nome: nV, logo: lV } = nomeLogo(jogo.visitante_id)
                  const temPlacar = jogo.gols_mandante != null && jogo.gols_visitante != null
                  const editando = editRodadaId === r.id && editIndex === idx
                  const gm = jogo.gols_mandante ?? 0
                  const gv = jogo.gols_visitante ?? 0

                  return (
                    <article
                      key={idx}
                      className={`rounded-2xl border px-4 py-3 transition
                        ${temPlacar ? 'border-emerald-700/40 bg-emerald-500/[0.06]'
                                     : 'border-white/10 bg-white/5 hover:bg-white/7'}
                      `}
                    >
                      <div className="grid grid-cols-12 items-center gap-2">
                        {/* Mandante */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-end gap-2">
                          {lM ? (
                            <img src={lM} alt="" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                          ) : (
                            <span className="h-6 w-6 grid place-items-center rounded-full bg-gray-700 text-[10px] ring-1 ring-white/10">
                              {(nM || jogo.mandante || '').slice(0,2).toUpperCase()}
                            </span>
                          )}
                          <span className="font-medium text-right truncate">{nM || jogo.mandante}</span>
                        </div>

                        {/* Placar (edição por jogo) */}
                        <div className="col-span-2 md:col-span-4 text-center">
                          {editando ? (
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="number"
                                defaultValue={gm}
                                onChange={(e) => setGM(Number(e.target.value))}
                                className="w-12 text-black text-center rounded-lg px-2 py-1"
                                placeholder="0" min={0}
                              />
                              <span className="text-white/70 font-semibold">x</span>
                              <input
                                type="number"
                                defaultValue={gv}
                                onChange={(e) => setGV(Number(e.target.value))}
                                className="w-12 text-black text-center rounded-lg px-2 py-1"
                                placeholder="0" min={0}
                              />
                            </div>
                          ) : temPlacar ? (
                            <span className="text-lg md:text-xl font-extrabold tracking-tight text-white">
                              {gm} <span className="text-white/60">x</span> {gv}
                            </span>
                          ) : (
                            <span className="text-white/50">🆚</span>
                          )}
                        </div>

                        {/* Visitante + ações */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-start gap-2">
                          <span className="font-medium text-left truncate">{nV || jogo.visitante}</span>
                          {lV ? (
                            <img src={lV} alt="" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                          ) : (
                            <span className="h-6 w-6 grid place-items-center rounded-full bg-gray-700 text-[10px] ring-1 ring-white/10">
                              {(nV || jogo.visitante || '').slice(0,2).toUpperCase()}
                            </span>
                          )}

                          {/* Ações (somente admin) */}
                          {isAdmin && !editando && (
                            <div className="flex gap-2 ml-2">
                              <button
                                onClick={() => {
                                  setEditRodadaId(r.id)
                                  setEditIndex(idx)
                                  setGM(gm); setGV(gv)
                                  if (jogo.bonus_pago) {
                                    toast('Modo ajuste: edite e salve sem repetir premiação/participações.', { icon: '✏️' })
                                  }
                                }}
                                className="text-sm text-yellow-300 hover:text-yellow-200"
                                title={jogo.bonus_pago ? 'Editar (ajuste, sem repetir premiação/participações)' : 'Editar (primeiro lançamento)'}
                              >
                                📝
                              </button>

                              {temPlacar && (
                                <button
                                  onClick={() => excluirResultado(r.id, idx)}
                                  className="text-sm text-red-400 hover:text-red-300"
                                  title="Remover resultado"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}

                          {isAdmin && editando && (
                            <div className="flex gap-2 ml-2">
                              {!jogo.bonus_pago ? (
                                <button
                                  onClick={() => salvarPrimeiroLancamento(r.id, idx, Number(gM), Number(gV))}
                                  disabled={salvandoJogo}
                                  className="text-sm text-green-400 font-semibold hover:text-green-300"
                                  title="Salvar (primeiro lançamento)"
                                >
                                  💾
                                </button>
                              ) : (
                                <button
                                  onClick={() => salvarAjuste(r.id, idx, Number(gM), Number(gV))}
                                  disabled={salvandoJogo}
                                  className="text-sm text-green-400 font-semibold hover:text-green-300"
                                  title="Salvar ajuste (sem repetir premiação/participações)"
                                >
                                  ✅
                                </button>
                              )}
                              <button
                                onClick={() => { setEditRodadaId(null); setEditIndex(null) }}
                                className="text-sm text-red-400 font-semibold hover:text-red-300"
                                title="Cancelar edição"
                              >
                                ❌
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {jogo?.data_iso && (
                        <div className="mt-1 text-right text-[11px] text-white/60">
                          {new Date(jogo.data_iso).toLocaleString('pt-BR', {
                            weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

        {rodadasFiltradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 px-4 md:px-6 py-10 text-center text-gray-400">
            Nenhuma rodada para o filtro selecionado.
          </div>
        )}
      </div>
    </div>
  )
}
