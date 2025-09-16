// /src/app/moedas/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';

// --- Supabase (cliente) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Config ---
const COINS_PER_BRL = Number(process.env.NEXT_PUBLIC_COINS_PER_BRL ?? '5000000'); // R$1 => 5.000.000

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

  // --------- helpers ----------
  const fmtCoins = (n: number | null | undefined) =>
    (n ?? 0).toLocaleString('pt-BR');

  const fmtCountdown = (s: number) => {
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, '0');
    return `${mm}:${ss}`;
  };

  async function carregarSaldo(idUsuario: string) {
    if (carregandoSaldo.current) return;
    try {
      carregandoSaldo.current = true;
      const { data, error } = await supabase
        .from('carteiras')
        .select('saldo')
        .eq('id_usuario', idUsuario)
        .maybeSingle();
      if (!error) setSaldo(data?.saldo ?? 0);
    } finally {
      carregandoSaldo.current = false;
    }
  }

  // --------- bootstrap: auth + saldo ----------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      if (!u) {
        toast.error('Faça login para comprar moedas.');
        return;
      }
      setUser(u);
      await carregarSaldo(u.id);
    })();
  }, []);

  // --------- realtime: ouvir mudança de status no pedido ----------
  useEffect(() => {
    if (!pedidoId) return;
    const channel = supabase
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pedidoId, user?.id]);

  // --------- countdown de expiração ----------
  useEffect(() => {
    if (!expiresAt || status !== 'waiting') return;
    const target = new Date(expiresAt).getTime();
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(t);
        setStatus('expired');
        toast('Pix expirou. Gere outro.', { icon: '⏱️' });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, status]);

  // --------- ações ----------
  const criarPix = async () => {
    try {
      if (!user?.id) {
        toast.error('Usuário não autenticado.');
        return;
      }
      const valor = Number(valorBRL);
      if (!Number.isFinite(valor) || valor < 1) {
        toast.error('Informe um valor em reais (mínimo R$1).');
        return;
      }

      // reset UI
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

      setPedidoId(j.pedidoId);
      setQrImg(j.qrImageUrl || null);
      setCopiaCola(j.copiaCola || null);
      setExpiresAt(j.expiresAt || null);

      // ticket_url (página do MP)
      const tk = (j.raw?.point_of_interaction?.transaction_data?.ticket_url as string) || null;
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

  // --------- UI ----------
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <Toaster position="top-right" />

      {/* header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Comprar Moedas</h1>
        <p className="text-sm text-neutral-600">
          Taxa atual: <span className="font-semibold">R$ 1,00 = {fmtCoins(COINS_PER_BRL)} moedas</span>
        </p>
      </div>

      {/* saldo */}
      <div className="rounded-2xl border p-5 bg-white/50 shadow-sm">
        <div className="text-sm text-neutral-500">Seu saldo</div>
        <div className="mt-1 text-4xl font-extrabold tabular-nums">
          {fmtCoins(saldo)} <span className="text-base font-medium text-neutral-500">moedas</span>
        </div>
      </div>

      {/* seletor de valor */}
      <div className="rounded-2xl border p-5 space-y-4 bg-white/50 shadow-sm">
        <label htmlFor="valor" className="text-sm font-medium">Valor (em R$)</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) - 1)))}
            className="px-3 py-2 rounded-xl border hover:bg-neutral-50"
            aria-label="Diminuir"
          >−</button>
          <input
            id="valor"
            type="number"
            min={1}
            step="1"
            value={valorBRL}
            onChange={(e) => setValorBRL(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-xl border px-3 py-2 text-lg"
          />
          <button
            type="button"
            onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) + 1)))}
            className="px-3 py-2 rounded-xl border hover:bg-neutral-50"
            aria-label="Aumentar"
          >+</button>
        </div>

        <div className="text-sm text-neutral-700">
          Você receberá: <b>{fmtCoins(moedas)}</b> moedas
        </div>

        <button
          onClick={criarPix}
          disabled={status === 'waiting'}
          className="w-full rounded-2xl bg-black text-white py-3.5 font-semibold shadow hover:opacity-90 disabled:opacity-50"
        >
          {status === 'waiting' ? 'Gerando Pix…' : 'Gerar Pix'}
        </button>
      </div>

      {/* bloco do pagamento */}
      {pedidoId && (
        <div className="rounded-2xl border p-5 space-y-4 bg-white/50 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Pague com Pix</div>
            <div className="text-sm">
              {status === 'paid' && <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">✅ Pago</span>}
              {status === 'waiting' && (
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  ⏳ Aguardando pagamento {secondsLeft != null && expiresAt ? `• expira em ${fmtCountdown(secondsLeft)}` : ''}
                </span>
              )}
              {status === 'expired' && <span className="px-2 py-1 rounded-full bg-rose-100 text-rose-800">⏱️ Expirado</span>}
            </div>
          </div>

          {qrImg ? (
            <img src={qrImg} alt="QR Code Pix" className="w-full rounded-xl border" />
          ) : (
            <div className="rounded-xl border p-4 text-sm text-neutral-600 bg-neutral-50">
              O provedor não retornou a imagem do QR. Use o código “copia e cola” abaixo.
            </div>
          )}

          {ticketUrl && (
            <a
              className="inline-flex items-center gap-2 text-sm underline"
              href={ticketUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir página do Pix no Mercado Pago
            </a>
          )}

          {copiaCola && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500">Copia e cola</div>
              <textarea
                className="w-full h-28 rounded-xl border p-3 text-sm"
                readOnly
                value={copiaCola}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(copiaCola);
                    toast('Código copiado 👍');
                  }}
                  className="rounded-xl border px-3 py-2 hover:bg-neutral-50"
                >
                  Copiar
                </button>
                {(status === 'expired' || status === 'paid') && (
                  <button
                    onClick={limparPix}
                    className="rounded-xl border px-3 py-2 hover:bg-neutral-50"
                  >
                    Gerar outro Pix
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* dica quando não logado */}
      {!user && (
        <div className="rounded-2xl border p-4 text-sm text-amber-800 bg-amber-50">
          Você precisa estar logado para comprar moedas.
        </div>
      )}
    </div>
  );
}
