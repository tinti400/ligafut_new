'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'
import classNames from 'classnames'

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= CONFIG ================= */
const INCREMENTO_MINIMO = 20_000_000           // +20mi por clique
const DESBLOQUEIO_POR_FAIXA = 70_000_000       // a cada +70mi libera 1 atributo
const ATRIBUTOS_ORDEM = [
  'nacionalidade',
  'posicao',
  'overall',
  'velocidade',
  'finalizacao',
  'cabeceio',
] as const

// revele a foto real quando chegar em X atributos:
const LIMIAR_IMAGEM = ATRIBUTOS_ORDEM.length   // 6 = só no fim
const BUCKET_PRIVADO = 'imagens-privadas'

type CampoAtributo = typeof ATRIBUTOS_ORDEM[number]

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
  return Math.max(0, Math.min(n, ATRIBUTOS_ORDEM.length))
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

// ===== admin helpers (mesma lógica do leilao_sistema)
const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
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

  // imagem privada revelada
  const [imgReveladaUrl, setImgReveladaUrl] = useState<string | null>(null)

  // ===== Novo: times que já deram lance neste leilão
  const [timesComLance, setTimesComLance] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    setIdTime(localStorage.getItem('id_time') || localStorage.getItem('idTime') || localStorage.getItem('time_id'))
    setNomeTime(localStorage.getItem('nome_time') || localStorage.getItem('nomeTime') || localStorage.getItem('time_nome'))
  }, [])

  // ===== Admin (idêntico ao leilao_sistema)
  useEffect(() => {
    let cancelled = false
    async function resolveIsAdmin() {
      if (process.env.NEXT_PUBLIC_FORCE_ADMIN === '1') { if (!cancelled) setIsAdmin(true); return }
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get('force_admin') === '1') { if (!cancelled) setIsAdmin(true); return }
      } catch {}

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const u = session?.user
        if (u && !cancelled) {
          const roles = ([] as string[]).concat(
            (u.app_metadata?.roles as any) || [],
            (u.user_metadata?.roles as any) || []
          ).map(String).map(s => s.toLowerCase())
          const roleStr = String(u.app_metadata?.role || u.user_metadata?.role || '').toLowerCase()
          const metaFlag = isTrue(u.user_metadata?.is_admin) || isTrue(u.app_metadata?.is_admin)
          if (roleStr === 'admin' || roles.includes('admin') || metaFlag) { setIsAdmin(true); return }
        }
      } catch {}

      try {
        if (idTime && isUuid(idTime) && !cancelled) {
          const { data } = await supabase.from('times').select('is_admin, admin, role').eq('id', idTime).maybeSingle()
          const roleStr = String(data?.role || '').toLowerCase()
          if (isTrue(data?.is_admin) || isTrue(data?.admin) || roleStr === 'admin') { setIsAdmin(true); return }
        }
      } catch {}

      try {
        const { data: userData } = await supabase.auth.getUser()
        const emailAuth = normalizaEmail(userData?.user?.email)
        const emailLS1 = normalizaEmail(localStorage.getItem('email'))
        const emailLS2 = normalizaEmail(localStorage.getItem('Email'))
        let emailObj = ''
        try {
          const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
          if (raw) emailObj = normalizaEmail(JSON.parse(raw)?.email)
        } catch {}
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

  // Buscar leilão ativo (o mais recente)
  useEffect(() => {
    const fetchAtivo = async () => {
      setCarregando(true)
      const { data } = await supabase
        .from('leiloes_escuros')
        .select('*')
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
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
        { event: '*', schema: 'public', table: 'leiloes_escuros', filter: `id=eq.${leilao.id}` },
        (payload) => { if (payload.new) setLeilao(payload.new as LeilaoEscuro) })
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

  // ===== Novo: carregar e ouvir lances para saber quem já participou
  useEffect(() => {
    if (!leilao?.id) return

    // carga inicial
    const load = async () => {
      const { data, error } = await supabase
        .from('leiloes_escuros_lances')
        .select('id_time, nome_time')
        .eq('leilao_id', leilao.id)
      if (error) return
      const mp = new Map<string, string>()
      for (const r of (data as any[])) {
        if (r.id_time) mp.set(String(r.id_time), String(r.nome_time || '—'))
      }
      setTimesComLance(mp)
    }
    load()

    // realtime (novos lances)
    const ch = supabase.channel(`lances_${leilao.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leiloes_escuros_lances', filter: `leilao_id=eq.${leilao.id}` },
        (payload) => {
          const r = payload.new as Lance
          setTimesComLance((prev) => {
            const mp = new Map(prev)
            if (r.id_time) mp.set(r.id_time, r.nome_time || '—')
            return mp
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [leilao?.id])

  const liberados = useMemo(() => atributosLiberados(leilao?.valor_atual ?? 0), [leilao?.valor_atual])

  // Regra: após liberar o 3º atributo, só quem já deu lance pode continuar
  const afterGate = liberados >= 3
  const userJaDeuLance = !!(idTime && timesComLance.has(idTime))
  const bloqueadoPorRegra = afterGate && !userJaDeuLance

  const podeLance = useMemo(() => {
    if (!leilao) return false
    if (leilao.status !== 'ativo') return false
    if (tempo <= 0) return false
    if (afterGate && !userJaDeuLance) return false
    return Boolean(idTime && nomeTime)
  }, [leilao, tempo, idTime, nomeTime, afterGate, userJaDeuLance])

  // Gera/limpa URL assinada conforme liberação
  useEffect(() => {
    let refreshTimer: any
    const genSigned = async () => {
      if (!leilao?.imagem_path_privada || liberados < LIMIAR_IMAGEM) { setImgReveladaUrl(null); return }
      const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(leilao.imagem_path_privada, 600)
      if (error) { setImgReveladaUrl(null); return }
      setImgReveladaUrl(data.signedUrl)
      refreshTimer = setInterval(async () => {
        const { data, error } = await supabase.storage.from(BUCKET_PRIVADO).createSignedUrl(leilao.imagem_path_privada!, 600)
        if (!error) setImgReveladaUrl(data.signedUrl)
      }, 9 * 60 * 1000)
    }
    genSigned()
    return () => { if (refreshTimer) clearInterval(refreshTimer) }
  }, [leilao?.imagem_path_privada, liberados])

  async function darLance(delta: number) {
    if (!leilao) return
    if (!podeLance) {
      if (bloqueadoPorRegra) {
        toast.error('A partir do 3º atributo, somente times que já deram lance podem continuar.')
      }
      return
    }
    setDandoLance(true)
    try {
      const novoValor = leilao.valor_atual + delta

      // 1) atualiza o leilão
      const { error } = await supabase
        .from('leiloes_escuros')
        .update({
          valor_atual: novoValor,
          id_time_vencedor: idTime,
          nome_time_vencedor: nomeTime,
        })
        .eq('id', leilao.id)
        .eq('status', 'ativo')
      if (error) throw error

      // 2) registra o lance (tabela de trilha)
      if (idTime && nomeTime) {
        await supabase.from('leiloes_escuros_lances').insert({
          leilao_id: leilao.id,
          id_time: idTime,
          nome_time: nomeTime,
          valor: novoValor,
          criado_em: new Date().toISOString(),
        } as Partial<Lance>)
      }

      toast.success(`Lance de ${fmtBRL(delta)} registrado!`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao dar lance')
    } finally {
      setDandoLance(false)
    }
  }

  async function encerrarLeilao() {
    if (!leilao || !isAdmin) return
    const ok = confirm('Encerrar leilão agora?')
    if (!ok) return
    const { error } = await supabase
      .from('leiloes_escuros')
      .update({ status: 'leiloado' })
      .eq('id', leilao.id)
      .in('status', ['ativo'])
    if (error) toast.error('Falha ao encerrar')
    else toast.success('Leilão encerrado')
  }

  async function cancelarLeilao() {
    if (!leilao || !isAdmin) return
    const ok = confirm('Cancelar leilão? (sem vencedor)')
    if (!ok) return
    const { error } = await supabase
      .from('leiloes_escuros')
      .update({ status: 'cancelado' })
      .eq('id', leilao.id)
      .in('status', ['ativo'])
    if (error) toast.error('Falha ao cancelar')
    else toast.success('Leilão cancelado')
  }

  async function finalizarEArquivar() {
    if (!leilao || !isAdmin) return
    const ok = confirm('Finalizar este leilão e enviar para Leilões Finalizados?')
    if (!ok) return
    const agora = new Date().toISOString()
    const resumo = {
      tipo: 'escuro',
      id_leilao_origem: leilao.id,
      finalizado_em: agora,
      criado_em: leilao.criado_em,
      fim_original: leilao.fim,
      valor_final: leilao.valor_atual,
      id_time_vencedor: leilao.id_time_vencedor,
      nome_time_vencedor: leilao.nome_time_vencedor,
      nacionalidade: leilao.nacionalidade,
      posicao: leilao.posicao,
      overall: leilao.overall,
      velocidade: leilao.velocidade,
      finalizacao: leilao.finalizacao,
      cabeceio: leilao.cabeceio,
      silhueta_url: leilao.silhueta_url,
      imagem_path_privada: leilao.imagem_path_privada,
    } as const
    try { await supabase.from('leiloes_finalizados').insert(resumo as any) } catch {}
    const { error: upErr } = await supabase
      .from('leiloes_escuros')
      .update({ status: 'leiloado' })
      .eq('id', leilao.id)
      .in('status', ['ativo'])
    if (upErr) { toast.error('Falha ao finalizar'); return }
    toast.success('Leilão finalizado e arquivado!')
    window.location.href = '/admin/leiloes_finalizados'
  }

  const liberados = useMemo(() => atributosLiberados(leilao?.valor_atual ?? 0), [leilao?.valor_atual]) // re-decl segurança

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
            {/* Topo: Contagem + Valor atual */}
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

            {/* Imagem / Silhueta + Atributos */}
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
                <ul className="space-y-2">
                  {ATRIBUTOS_ORDEM.map((campo: CampoAtributo, i) => {
                    const desbloqueado = i < liberados
                    const valor = (leilao as any)[campo]
                    const label =
                      campo === 'posicao' ? 'Posição' :
                      campo === 'nacionalidade' ? 'Nacionalidade' :
                      campo === 'overall' ? 'Overall' :
                      campo === 'velocidade' ? 'Velocidade' :
                      campo === 'finalizacao' ? 'Finalização' :
                      'Cabeceio'
                    return (
                      <li key={campo} className="rounded-xl px-3 py-2 flex items-center justify-between bg-neutral-800/60 border border-neutral-700">
                        <div className="flex items-center gap-2">
                          <span className={classNames('text-xl', desbloqueado ? 'text-emerald-400' : 'text-neutral-500')}>
                            {desbloqueado ? '✅' : '🔒'}
                          </span>
                          <span className="font-medium">{label}</span>
                        </div>
                        <div className="text-right font-mono">
                          {desbloqueado ? (valor ?? <span className="opacity-60 italic">—</span>) : <span className="opacity-60 italic">oculto</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-3 text-xs opacity-70">
                  A cada <b>{fmtBRL(DESBLOQUEIO_POR_FAIXA)}</b> um atributo é revelado.
                </div>

                {/* ===== Novo: Sinalização de times com lance (só até liberar o 3º atributo) */}
                {liberados < 3 && timesComLance.size > 0 && (
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

                {/* Aviso de regra após 3º atributo */}
                {liberados >= 3 && (
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
                  onClick={() => darLance(INCREMENTO_MINIMO)}
                  className={classNames('px-4 py-2 rounded-xl font-semibold','bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50')}
                  title={bloqueadoPorRegra ? 'Apenas times que já deram lance podem continuar.' : undefined}
                >
                  +{fmtBRL(INCREMENTO_MINIMO)}
                </button>

                <button
                  disabled={!podeLance || dandoLance}
                  onClick={() => darLance(5 * INCREMENTO_MINIMO)}
                  className={classNames('px-4 py-2 rounded-xl font-semibold','bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50')}
                  title={bloqueadoPorRegra ? 'Apenas times que já deram lance podem continuar.' : undefined}
                >
                  +{fmtBRL(5 * INCREMENTO_MINIMO)}
                </button>

                <button
                  disabled={!podeLance || dandoLance}
                  onClick={() => darLance(10 * INCREMENTO_MINIMO)}
                  className={classNames('px-4 py-2 rounded-xl font-semibold','bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50')}
                  title={bloqueadoPorRegra ? 'Apenas times que já deram lance podem continuar.' : undefined}
                >
                  +{fmtBRL(10 * INCREMENTO_MINIMO)}
                </button>

                {isAdmin && (
                  <>
                    <button onClick={finalizarEArquivar} className="px-4 py-2 rounded-xl font-semibold bg-emerald-700 hover:bg-emerald-800">
                      Finalizar & Arquivar
                    </button>
                    <button onClick={encerrarLeilao} className="px-4 py-2 rounded-xl font-semibold bg-amber-600 hover:bg-amber-700">
                      Encerrar
                    </button>
                    <button onClick={cancelarLeilao} className="px-4 py-2 rounded-xl font-semibold bg-red-600 hover:bg-red-700">
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Rodapé: status */}
            <div className="mt-4 text-xs opacity-70">
              Status: <b className={leilao.status === 'ativo' ? 'text-emerald-400' : 'text-neutral-300'}>{leilao.status}</b>
              {tempo <= 0 && leilao.status === 'ativo' && (<span className="ml-2 text-red-400">— tempo esgotado</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
