'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'
import classNames from 'classnames'

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= CONFIG ================= */
// +20mi por clique
const INCREMENTO_MINIMO = 20_000_000
// a cada +70mi libera 1 atributo
const DESBLOQUEIO_POR_FAIXA = 70_000_000

// ORDEM de liberação:
const ATRIBUTOS_ORDEM = ['overall', 'posicao', 'nacionalidade', 'velocidade'] as const
// extras liberados após os 4:
const ATRIBUTOS_EXTRAS = ['finalizacao', 'cabeceio'] as const

// foto real quando chegar no 4º atributo liberado
const LIMIAR_IMAGEM = ATRIBUTOS_ORDEM.length // 4
const BUCKET_PRIVADO = 'imagens-privadas'

type CampoAtributoBase = typeof ATRIBUTOS_ORDEM[number]
type CampoAtributoExtra = typeof ATRIBUTOS_EXTRAS[number]

/* ================= TIPOS ================= */
type LeilaoEscuro = {
  id: string
  nacionalidade?: string | null
  posicao?: string | null
  overall?: number | null
  velocidade?: number | null
  finalizacao?: number | null
  cabeceio?: number | null

  valor_atual: number
  id_time_vencedor?: string | null
  nome_time_vencedor?: string | null
  fim: string // ISO
  criado_em: string // ISO
  status: 'fila' | 'ativo' | 'leiloado' | 'cancelado'

  silhueta_url?: string | null
  imagem_path_privada?: string | null
}

type Lance = {
  id: string
  leilao_id: string
  id_time: string
  nome_time: string
  valor: number
  criado_em: string
}

/* ================= UTILS ================= */
const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function atributosLiberados(valorAtual: number): number {
  const n = Math.floor(valorAtual / DESBLOQUEIO_POR_FAIXA)
  return Math.max(0, Math.min(n, ATRIBUTOS_ORDEM.length)) // 0..4
}
function segundosRestantes(iso: string) {
  const fim = new Date(iso).getTime()
  const agora = Date.now()
  return Math.max(0, Math.floor((fim - agora) / 1000))
}
function formatCountdown(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// helpers admin (mesma linha do leilao_sistema)
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const isTrue = (v: any) =>
  v === true || v === 1 || v === '1' ||
  (typeof v === 'string' && ['true', 't', 'yes', 'on'].includes(v.toLowerCase()))
const normalizaEmail = (s?: string | null) => (s || '').trim().toLowerCase()

/* ================= PAGE ================= */
export default function LeilaoNoEscuroPage() {
  const [leilao, setLeilao] = useState<LeilaoEscuro | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tempo, setTempo] = useState(0)
  const [dandoLance, setDandoLance] = useState(false)

  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [imgReveladaUrl, setImgReveladaUrl] = useState<string | null>(null)
  const [timesComLance, setTimesComLance] = useState<Map<string, string>>(new Map())

  const autoFinalizando = useRef(false)

  // Identidade do time (pega várias chaves possíveis)
  useEffect(() => {
    const ids = ['id_time','idTime','time_id','usuario_id','user_id']
    const nomes = ['nome_time','nomeTime','time_nome','usuario_nome','user_team']

    let id: string | null = null
    for (const k of ids) { const v = localStorage.getItem(k); if (v && v !== 'null' && v !== 'undefined') { id = v; break } }
    setIdTime(id)

    let nome: string | null = null
    for (const k of nomes) { const v = localStorage.getItem(k); if (v && v !== 'null' && v !== 'undefined') { nome = v; break } }
    setNomeTime(nome)
  }, [])

  // Admin (igual leilao_sistema)
  useEffect(() => {
    let cancelled = false
    async function resolveIsAdmin() {
      if (process.env.NEXT_PUBLIC_FORCE_ADMIN === '1') { if (!cancelled) setIsAdmin(true); return }
      try { const url = new URL(window.location.href); if (url.searchParams.get('force_admin') === '1') { if (!cancelled) setIsAdmin(true); return } } catch {}
      try {
        const { data:{ session } } = await supabase.auth.getSession()
        const u = session?.user
        if (u && !cancelled) {
          const roles = ([] as string[]).concat((u.app_metadata?.roles as any)||[],(u.user_metadata?.roles as any)||[]).map(String).map(s=>s.toLowerCase())
          const roleStr = String(u.app_metadata?.role || u.user_metadata?.role || '').toLowerCase()
          const metaFlag = isTrue(u.user_metadata?.is_admin) || isTrue(u.app_metadata?.is_admin)
          if (roleStr==='admin' || roles.includes('admin') || metaFlag) { setIsAdmin(true); return }
        }
      } catch {}
      try {
        if (idTime && isUuid(idTime) && !cancelled) {
          const { data } = await supabase.from('times').select('is_admin, admin, role').eq('id', idTime).maybeSingle()
          const roleStr = String(data?.role||'').toLowerCase()
          if (isTrue(data?.is_admin) || isTrue(data?.admin) || roleStr==='admin') { setIsAdmin(true); return }
        }
      } catch {}
      try {
        const { data:userData } = await supabase.auth.getUser()
        const emailAuth = normalizaEmail(userData?.user?.email)
        const emailLS1 = normalizaEmail(localStorage.getItem('email'))
        const emailLS2 = normalizaEmail(localStorage.getItem('Email'))
        let emailObj = ''
        try { const raw = localStorage.getItem('user') || localStorage.getItem('usuario'); if (raw) emailObj = normalizaEmail(JSON.parse(raw)?.email) } catch {}
        let emailURL = ''
        try { emailURL = normalizaEmail(new URL(window.location.href).searchParams.get('email')) } catch {}
        const email = emailAuth || emailLS1 || emailLS2 || emailObj || emailURL
        if (email) {
          localStorage.setItem('email', email)
          const { data } = await supabase.from('admins').select('email').ilike('email', email).maybeSingle()
          if (!cancelled && data) { setIsAdmin(true); return }
        }
      } catch {}
      if (!cancelled) setIsAdmin(false)
    }
    resolveIsAdmin()
    return () => { cancelled = true }
  }, [idTime])

  // Buscar leilão ativo mais recente
  useEffect(() => {
    const fetchAtivo = async () => {
      setCarregando(true)
      const { data, error } = await supabase
        .from('leiloes_escuros')
        .select('*')
        .eq('status','ativo')
        .order('criado_em',{ ascending:false })
        .limit(1)
        .maybeSingle()
      if (error) toast.error('Erro ao carregar leilão')
      setLeilao(data ?? null)
      setCarregando(false)
    }
    fetchAtivo()
  }, [])

  // Realtime do leilão
  useEffect(() => {
    if (!leilao?.id) return
    const ch = supabase
      .channel(`leilao_escuro_${leilao.id}`)
      .on('postgres_changes',
        { event:'*', schema:'public', table:'leiloes_escuros', filter:`id=eq.${leilao.id}` },
        (payload) => { if (payload.new) setLeilao(payload.new as LeilaoEscuro) }
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leilao?.id])

  // Relógio
  useEffect(() => {
    if (!leilao?.fim) return
    const tick = () => setTempo(segundosRestantes(leilao.fim))
    tick()
    const it = setInterval(tick, 1000)
    return () => clearInterval(it)
  }, [leilao?.fim])

  // Lances: carregar participantes + ouvir em tempo real
  useEffect(() => {
    if (!leilao?.id) return
    const load = async () => {
      const { data, error } = await supabase
        .from('leiloes_escuros_lances')
        .select('id_time, nome_time')
        .eq('leilao_id', leilao.id)
      if (error) return
      const mp = new Map<string,string>()
      for (const r of (data as any[])) { if (r.id_time) mp.set(String(r.id_time), String(r.nome_time || '—')) }
      setTimesComLance(mp)
    }
    load()
    const ch = supabase.channel(`lances_${leilao.id}`)
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'leiloes_escuros_lances', filter:`leilao_id=eq.${leilao.id}` },
        (payload) => {
          const r = payload.new as Lance
          setTimesComLance(prev => { const mp = new Map(prev); if (r.id_time) mp.set(r.id_time, r.nome_time || '—'); return mp })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leilao?.id])

  // Liberados (0..4)
  const liberados = useMemo(() => atributosLiberados(leilao?.valor_atual ?? 0), [leilao?.valor_atual])

  // Gate após 3º atributo
  const afterGate = (liberados ?? 0) >= 3
  const userJaDeuLance = !!(idTime && timesComLance.has(idTime))

  // Motivo de desabilitado (para tooltip/ux)
  const whyDisabled = useMemo(() => {
    if (!leilao) return 'Sem leilão carregado'
    if (leilao.status !== 'ativo') return 'Leilão não está ativo'
    if (tempo <= 0) return 'Tempo esgotado'
    if (!idTime) return 'Você precisa estar logado com um time'
    if (afterGate && !userJaDeuLance) return 'Após o 3º atributo, só quem já deu lance pode continuar'
    return null
  }, [leilao, tempo, idTime, afterGate, userJaDeuLance])

  const podeLance = !whyDisabled

  // Foto real: URL assinada quando >= 4
  useEffect(() => {
    let refreshTimer: any
    const genSigned = async () => {
      if (!leilao?.imagem_path_privada) { setImgReveladaUrl(null); return }
      if ((liberados ?? 0) < LIMIAR_IMAGEM) { setImgReveladaUrl(null); return }
      const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(leilao.imagem_path_privada, 600)
      if (error) { setImgReveladaUrl(null); return }
      setImgReveladaUrl(data.signedUrl)
      refreshTimer = setInterval(async () => {
        const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(leilao.imagem_path_privada!, 600)
        if (!error) setImgReveladaUrl(data.signedUrl)
      }, 9*60*1000)
    }
    genSigned()
    return () => { if (refreshTimer) clearInterval(refreshTimer) }
  }, [leilao?.imagem_path_privada, liberados])

  /* ===== Finalização estilo leilao_sistema ===== */
  async function upsertFinalizadosLikeSistema(l: LeilaoEscuro) {
    // garanta que exista unique index em id_leilao_origem na tabela finalizados
    const payload = {
      tipo: 'escuro',
      id_leilao_origem: l.id,
      criado_em: l.criado_em,
      fim_original: l.fim,
      finalizado_em: new Date().toISOString(),
      valor_final: l.valor_atual,
      id_time_vencedor: l.id_time_vencedor,
      nome_time_vencedor: l.nome_time_vencedor,
      nacionalidade: l.nacionalidade,
      posicao: l.posicao,
      overall: l.overall,
      velocidade: l.velocidade,
      finalizacao: l.finalizacao,
      cabeceio: l.cabeceio,
      silhueta_url: l.silhueta_url,
      imagem_path_privada: l.imagem_path_privada,
    }
    const { error } = await supabase.from('leiloes_finalizados').upsert(payload as any, { onConflict: 'id_leilao_origem' })
    if (error) throw error
  }
  async function marcarComoLeiloado(id: string) {
    const { error } = await supabase.from('leiloes_escuros').update({ status: 'leiloado' }).eq('id', id).in('status',['ativo'])
    if (error) throw error
  }
  async function finalizarFluxoSistema() {
    if (!leilao) return
    await upsertFinalizadosLikeSistema(leilao)
    await marcarComoLeiloado(leilao.id)
    toast.success('Leilão finalizado e arquivado!')
  }
  async function finalizarEArquivar() {
    if (!leilao || !isAdmin) return
    const ok = confirm('Finalizar este leilão e enviar para Leilões Finalizados?')
    if (!ok) return
    try {
      await finalizarFluxoSistema()
      window.location.href = '/admin/leiloes_finalizados'
    } catch (e:any) {
      toast.error(e?.message ?? 'Falha ao finalizar')
    }
  }
  // Auto-finalize ao zerar
  useEffect(() => {
    if (!leilao || leilao.status !== 'ativo') return
    if (tempo > 0) return
    if (autoFinalizando.current) return
    autoFinalizando.current = true
    finalizarFluxoSistema().finally(()=>{ autoFinalizando.current = false })
  }, [tempo, leilao?.status])

  /* ===== Lance ===== */
  async function darLance(delta: number) {
    if (dandoLance) return
    if (!leilao) { toast.error('Leilão não carregado'); return }
    if (whyDisabled) { toast.error(whyDisabled); return }
    if (!idTime) { toast.error('Faça login e selecione seu time'); return }

    setDandoLance(true)
    try {
      const novoValor = (Number(leilao.valor_atual)||0) + (Number(delta)||0)

      // UPDATE do leilão
      const { error: errUpdate } = await supabase
        .from('leiloes_escuros')
        .update({
          valor_atual: novoValor,
          id_time_vencedor: idTime,
          nome_time_vencedor: nomeTime || null,
        })
        .eq('id', leilao.id)
        .eq('status','ativo')

      if (errUpdate) {
        console.error('[darLance] update error:', errUpdate)
        throw new Error('Sem permissão para dar lance ou leilão bloqueado.')
      }

      // trilha do lance (não crítico se falhar)
      await supabase.from('leiloes_escuros_lances').insert({
        leilao_id: leilao.id,
        id_time: idTime,
        nome_time: nomeTime || '—',
        valor: novoValor,
        criado_em: new Date().toISOString(),
      } as Partial<Lance>)

      toast.success(`Lance de ${fmtBRL(delta)} registrado!`)
    } catch (e:any) {
      console.error('[darLance] erro:', e)
      toast.error(e?.message ?? 'Erro ao dar lance')
    } finally {
      setDandoLance(false)
    }
  }

  /* ================= RENDER ================= */
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold">🕵️‍♂️ Leilão no Escuro</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={finalizarEArquivar}
                className="px-3 py-2 rounded-lg font-semibold bg-emerald-700 hover:bg-emerald-800"
                title="Marca como leiloado e envia para Leilões Finalizados"
              >
                Finalizar & Arquivar
              </button>
            )}
            <div className="text-sm opacity-80">
              {idTime ? <span>Time: <b>{nomeTime}</b></span> : <span className="italic">Faça login / selecione seu time</span>}
            </div>
          </div>
        </header>

        {carregando && <div className="animate-pulse rounded-2xl bg-neutral-800 p-6">Carregando…</div>}

        {!carregando && !leilao && (
          <div className="rounded-2xl bg-neutral-900 p-6 text-center">Nenhum leilão no escuro ativo no momento.</div>
        )}

        {!carregando && leilao && (
          <div className={classNames('rounded-2xl p-4 md:p-6','bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800','shadow-xl')}>
            {/* Topo */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm md:text-base">
                <div className="opacity-70">Tempo restante</div>
                <div className={classNames('font-mono text-2xl md:text-3xl', tempo <= 10 ? 'text-red-400' : 'text-emerald-400')}>
                  {formatCountdown(tempo)}
                </div>
              </div>
              <div className="text-right">
                <div className="opacity-70 text-sm md:text-base">Valor atual</div>
                <div className="text-2xl md:text-3xl font-bold">{fmtBRL(leilao.valor_atual)}</div>
                {leilao.nome_time_vencedor && (
                  <div className="text-xs md:text-sm opacity-75">maior lance: <b>{leilao.nome_time_vencedor}</b></div>
                )}
              </div>
            </div>

            {/* Imagem + Atributos */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
              <div className="rounded-2xl bg-neutral-800/70 aspect-[3/4] overflow-hidden flex items-center justify-center">
                {imgReveladaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgReveladaUrl} alt="Jogador" className="w-full h-full object-cover" />
                ) : leilao.silhueta_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={leilao.silhueta_url} alt="Silhueta" className="w-full h-full object-cover opacity-90" />
                ) : (
                  <div className="text-neutral-400 text-center px-3">
                    <div className="text-6xl mb-2">🕶️</div>
                    Jogador Misterioso
                  </div>
                )}
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-3">Atributos</h2>

                {/* ordem de liberação */}
                <ul className="space-y-2">
                  {ATRIBUTOS_ORDEM.map((campo: CampoAtributoBase, i) => {
                    const desbloqueado = i < (liberados ?? 0)
                    const valor = (leilao as any)[campo]
                    const label =
                      campo === 'overall' ? 'Overall' :
                      campo === 'posicao' ? 'Posição' :
                      campo === 'nacionalidade' ? 'Nacionalidade' :
                      'Velocidade'
                    return (
                      <li key={campo} className="rounded-xl px-3 py-2 flex items-center justify-between bg-neutral-800/60 border border-neutral-700">
                        <div className="flex items-center gap-2">
                          <span className={classNames('text-xl', desbloqueado ? 'text-emerald-400' : 'text-neutral-500')}>
                            {desbloqueado ? '✅' : '🔒'}
                          </span>
                          <span className="font-medium">{label}</span>
                        </div>
                        <div className="text-right font-mono">
                          {desbloqueado ? (valor ?? <span className="opacity-60 italic">—</span>)
                                        : <span className="opacity-60 italic">oculto</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                {/* extras depois dos 4 */}
                {(liberados ?? 0) >= LIMIAR_IMAGEM && (
                  <>
                    <h3 className="text-sm font-semibold mt-4 mb-2 opacity-80">Mais atributos</h3>
                    <ul className="space-y-2">
                      {ATRIBUTOS_EXTRAS.map((campo: CampoAtributoExtra) => {
                        const valor = (leilao as any)[campo]
                        const label = campo === 'finalizacao' ? 'Finalização' : 'Cabeceio'
                        return (
                          <li key={campo} className="rounded-xl px-3 py-2 flex items-center justify-between bg-neutral-800/60 border border-neutral-700">
                            <div className="flex items-center gap-2">
                              <span className="text-xl text-emerald-400">✅</span>
                              <span className="font-medium">{label}</span>
                            </div>
                            <div className="text-right font-mono">
                              {valor ?? <span className="opacity-60 italic">—</span>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}

                <div className="mt-3 text-xs opacity-70">
                  A cada <b>{fmtBRL(DESBLOQUEIO_POR_FAIXA)}</b> um atributo é revelado.
                </div>

                {(liberados ?? 0) < 3 && timesComLance.size > 0 && (
                  <div className="mt-4">
                    <div className="text-xs opacity-80 mb-2">Times que já deram lance:</div>
                    <div className="flex flex-wrap gap-2">
                      {[...timesComLance.entries()].map(([tid, tnome]) => (
                        <span key={tid} className="text-xs bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 px-2 py-1 rounded-full">
                          {tnome || 'Time'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(liberados ?? 0) >= 3 && (
                  <div className="mt-3 text-xs text-amber-300">
                    Regra: após o 3º atributo, apenas times que já deram lance podem continuar.
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs opacity-75">Incremento mínimo: <b>{fmtBRL(INCREMENTO_MINIMO)}</b></div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={!podeLance || dandoLance}
                  title={whyDisabled || undefined}
                  onClick={() => darLance(INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  +{fmtBRL(INCREMENTO_MINIMO)}
                </button>
                <button
                  disabled={!podeLance || dandoLance}
                  title={whyDisabled || undefined}
                  onClick={() => darLance(5 * INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  +{fmtBRL(5 * INCREMENTO_MINIMO)}
                </button>
                <button
                  disabled={!podeLance || dandoLance}
                  title={whyDisabled || undefined}
                  onClick={() => darLance(10 * INCREMENTO_MINIMO)}
                  className="px-4 py-2 rounded-xl font-semibold bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50"
                >
                  +{fmtBRL(10 * INCREMENTO_MINIMO)}
                </button>
                {whyDisabled && <div className="text-xs text-amber-300">⚠️ {whyDisabled}</div>}
                {isAdmin && (
                  <button onClick={finalizarEArquivar} className="px-4 py-2 rounded-xl font-semibold bg-amber-600 hover:bg-amber-700">
                    Finalizar & Arquivar
                  </button>
                )}
              </div>
            </div>

            {/* Rodapé */}
            <div className="mt-4 text-xs opacity-70">
              Status: <b className={leilao.status === 'ativo' ? 'text-emerald-400' : 'text-neutral-300'}>{leilao.status}</b>
              {tempo <= 0 && leilao.status === 'ativo' && <span className="ml-2 text-red-400">— tempo esgotado (finalizando…)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
