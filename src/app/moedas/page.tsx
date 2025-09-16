// /src/app/moedas/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import {
  Coins,
  Plus,
  Minus,
  QrCode,
  Clock,
  CheckCircle2,
  Link2,
  Copy as CopyIcon,
  Loader2,
  LogIn,
} from 'lucide-react';

// 👉 use um client ÚNICO do supabase no browser.
// se você criou o arquivo sugerido, mantenha este import:
import { supabase } from '@/lib/supabase-browser';
// se NÃO usa alias "@", troque por:  "../../lib/supabase-browser"

const COINS_PER_BRL = Number(process.env.NEXT_PUBLIC_COINS_PER_BRL ?? '5000000');

type PixCreateResponse = {
  pedidoId: string;
  txid: string;
  copiaCola?: string;
  qrImageUrl?: string;
  expiresAt?: string; // ISO
  moedas?: number;
  raw?: any; // contém ticket_url em raw.point_of_interaction.transaction_data.ticket_url
};

type PixStatus = 'idle' | 'waiting' | 'paid' | 'expired' | 'error';

function cn(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(' ');
}

export default function ComprarMoedasPage() {
  // auth + saldo
  const [user, setUser] = useState<any>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const carregandoSaldo = useRef(false);

  // compra
  const [valorBRL, setValorBRL] = useState<number>(10);
  const moedas = useMemo(() => Math.max(0, Math.round((valorBRL || 0) * COINS_PER_BRL)), [valorBRL]);

  // pix atual
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [copiaCola, setCopiaCola] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PixStatus>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // utils
  const fmtCoins = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR');
  const fmtCountdown = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  async function carregarSaldo(idUsuario: string) {
    if (carregandoSaldo.current) return;
    try {
      carregandoSaldo.current = true;
      const { data } = await supabase
        .from('carteiras')
        .select('saldo')
        .eq('id_usuario', idUsuario)
        .maybeSingle();
      setSaldo(data?.saldo ?? 0);
    } finally {
      carregandoSaldo.current = false;
    }
  }

  // Auth: sessão atual + reatividade
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const u = s?.session?.user ?? null;
      setUser(u);
      if (u) await carregarSaldo(u.id);
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        const uu = session?.user ?? null;
        setUser(uu);
        if (uu) carregarSaldo(uu.id);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => { unsub?.(); };
  }, []);

  // Realtime: ouvir mudança de status do pedido
  useEffect(() => {
    if (!pedidoId) return;
    const ch = supabase
      .channel(`pix_pedido_${pedidoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pix_pedidos', filter: `id=eq.${pedidoId}` },
        async (payload) => {
          const st = (payload.new as any)?.status as string;
          if (st === 'paid') {
            setStatus('paid');
            setSecondsLeft(null);
            toast.success('Pagamento confirmado! Moedas creditadas 👏');
            if (user?.id) await carregarSaldo(user.id);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pedidoId, user?.id]);

  // Countdown até expirar
  useEffect(() => {
    if (!expiresAt || status !== 'waiting') return;
    const target = new Date(expiresAt).getTime();
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) { clearInterval(t); setStatus('expired'); toast('Pix expirou. Gere outro.', { icon: '⏱️' }); }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, status]);

  // Ações
  const criarPix = async () => {
    try {
      if (!user?.id) { toast.error('Faça login para continuar.'); return; }
      const valor = Number(valorBRL);
      if (!Number.isFinite(valor) || valor < 1) { toast.error('Informe um valor (mínimo R$1).'); return; }

      setStatus('waiting');
      setPedidoId(null);
      setQrImg(null);
      setCopiaCola(null);
      setTicketUrl(null);
      setExpiresAt(null);
      setSecondsLeft(null);

      const res = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_usuario: user.id, valorBRL: valor }),
      });
      const j: PixCreateResponse | { error?: string } = await res.json();
      if (!res.ok || !('pedidoId' in j)) throw new Error((j as any)?.error || 'Falha ao criar Pix.');

      setPedidoId((j as PixCreateResponse).pedidoId);
      setQrImg((j as PixCreateResponse).qrImageUrl || null);
      setCopiaCola((j as PixCreateResponse).copiaCola || null);
      setExpiresAt((j as PixCreateResponse).expiresAt || null);

      const tk = ((j as PixCreateResponse).raw?.point_of_interaction?.transaction_data?.ticket_url as string) || null;
      setTicketUrl(tk);

      toast('Pix gerado. Pague e aguarde a confirmação.');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      toast.error(e?.message || 'Erro ao criar Pix.');
    }
  };

  const limparPix = () => {
    setPedidoId(null);
    setQrImg(null);
    setCopiaCola(null);
    setTicketUrl(null);
    setExpiresAt(null);
    setSecondsLeft(null);
    setStatus('idle');
  };

  // UI
  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-8 text-white">
      <Toaster position="top-right" />
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 border border-white/10">
          <Coins className="size-6 text-indigo-300" />
        </div>
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Comprar Moedas</h1>
          <p className="text-sm md:text-base text-neutral-400">
            Taxa: <span className="font-semibold text-neutral-200">R$ 1,00 = {fmtCoins(COINS_PER_BRL)} moedas</span>
          </p>
        </div>
      </div>

      {/* Card Saldo */}
      <div className="rounded-2xl border border-white/10 p-5 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] backdrop-blur">
        <div className="text-sm text-neutral-400">Seu saldo</div>
        <div className="mt-1 flex items-end gap-2">
          <div className="text-4xl md:text-5xl font-extrabold tabular-nums">{fmtCoins(saldo)}</div>
          <div className="pb-1 text-neutral-400">moedas</div>
        </div>
      </div>

      {/* Card Valor / CTA */}
      <div className="rounded-2xl border border-white/10 p-5 space-y-5 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
        <label htmlFor="valor" className="text-sm font-medium text-neutral-200">Valor (em R$)</label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) - 1)))}
            className="inline-flex items-center justify-center size-10 rounded-xl border border-white/10 hover:bg-white/10"
            aria-label="Diminuir"
          >
            <Minus className="size-4" />
          </button>

          <input
            id="valor"
            type="number"
            min={1}
            step="1"
            value={valorBRL}
            onChange={(e) => setValorBRL(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-xl border border-white/10 px-4 py-3 text-lg bg-black/30"
          />

          <button
            type="button"
            onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) + 1)))}
            className="inline-flex items-center justify-center size-10 rounded-xl border border-white/10 hover:bg-white/10"
            aria-label="Aumentar"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="text-sm text-neutral-300">
          Você receberá: <b>{fmtCoins(moedas)}</b> moedas
        </div>

        <button
          onClick={criarPix}
          disabled={status === 'waiting' || !user}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold',
            'bg-white text-black hover:opacity-90 disabled:opacity-50'
          )}
        >
          {status === 'waiting' ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
          {status === 'waiting' ? 'Gerando Pix…' : 'Gerar Pix'}
        </button>

        {!user && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 px-3 py-2 text-sm">
            <LogIn className="size-4" /> Você precisa estar logado para comprar moedas.
          </div>
        )}
      </div>

      {/* Card Pagamento */}
      {pedidoId && (
        <div className="rounded-2xl border border-white/10 p-5 space-y-4 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Pague com Pix</div>
            <div className="text-sm">
              {status === 'paid' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-200/15 text-emerald-300">
                  <CheckCircle2 className="size-4" /> Pago
                </span>
              )}
              {status === 'waiting' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-200/15 text-amber-300">
                  <Clock className="size-4" /> Aguardando
                  {secondsLeft != null && expiresAt ? ` • expira em ${fmtCountdown(secondsLeft)}` : ''}
                </span>
              )}
              {status === 'expired' && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-200/15 text-rose-300">
                  <Clock className="size-4" /> Expirado
                </span>
              )}
            </div>
          </div>

          {qrImg ? (
            <img src={qrImg} alt="QR Code Pix" className="w-full rounded-xl border border-white/10" />
          ) : (
            <div className="rounded-xl border border-white/10 p-4 text-sm text-neutral-300 bg-black/30">
              Sem imagem do QR. Use o código “copia e cola” abaixo.
            </div>
          )}

          {ticketUrl && (
            <a
              className="inline-flex items-center gap-2 text-sm underline"
              href={ticketUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Link2 className="size-4" /> Abrir no Mercado Pago
            </a>
          )}

          {copiaCola && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-400">Copia e cola</div>
              <textarea
                className="w-full h-28 rounded-xl border border-white/10 p-3 text-sm bg-black/30"
                readOnly
                value={copiaCola}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(copiaCola); toast('Código copiado 👍'); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10"
                >
                  <CopyIcon className="size-4" /> Copiar
                </button>
                {(status === 'expired' || status === 'paid') && (
                  <button
                    onClick={limparPix}
                    className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10"
                  >
                    Gerar outro Pix
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
