'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { supabase } from '@/lib/supabase-browser';

const COINS_PER_BRL = Number(process.env.NEXT_PUBLIC_COINS_PER_BRL ?? '5000000');

type PixCreateResponse = {
  pedidoId: string;
  txid: string;
  copiaCola?: string;
  qrImageUrl?: string;
  expiresAt?: string;
  moedas?: number;
  raw?: any;
};

type PixStatus = 'idle' | 'waiting' | 'paid' | 'expired' | 'error';

export default function ComprarMoedasPage() {
  const [user, setUser] = useState<any>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const carregandoSaldo = useRef(false);

  const [valorBRL, setValorBRL] = useState<number>(10);
  const moedas = useMemo(() => Math.max(0, Math.round((valorBRL || 0) * COINS_PER_BRL)), [valorBRL]);

  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [copiaCola, setCopiaCola] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PixStatus>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const fmtCoins = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR');
  const fmtCountdown = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`;

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

  // Auth: pega sessão atual e reage a mudanças
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const u = s?.session?.user ?? null;
      if (!u) {
        toast.error('Faça login para comprar moedas.');
      } else {
        setUser(u);
        await carregarSaldo(u.id);
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        const uu = session?.user ?? null;
        setUser(uu);
        if (uu) carregarSaldo(uu.id);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => { unsub?.(); };
  }, []);

  // Realtime: ouvir pagamento do pedido
  useEffect(() => {
    if (!pedidoId) return;
    const ch = supabase
      .channel(`pix_pedido_${pedidoId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pix_pedidos', filter: `id=eq.${pedidoId}` },
        async (payload) => {
          const st = (payload.new as any)?.status as string;
          if (st === 'paid') {
            setStatus('paid'); setSecondsLeft(null);
            toast.success('Pagamento confirmado! Moedas creditadas 👏');
            if (user?.id) await carregarSaldo(user.id);
          }
        })
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
      if (!user?.id) { toast.error('Usuário não autenticado.'); return; }
      const valor = Number(valorBRL);
      if (!Number.isFinite(valor) || valor < 1) { toast.error('Informe um valor (mínimo R$1).'); return; }

      setStatus('waiting'); setPedidoId(null); setQrImg(null); setCopiaCola(null); setTicketUrl(null); setExpiresAt(null); setSecondsLeft(null);

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
      console.error(e); setStatus('error'); toast.error(e?.message || 'Erro ao criar Pix.');
    }
  };

  const limparPix = () => {
    setPedidoId(null); setQrImg(null); setCopiaCola(null); setTicketUrl(null); setExpiresAt(null); setSecondsLeft(null); setStatus('idle');
  };

  // UI
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <Toaster position="top-right" />

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Comprar Moedas</h1>
        <p className="text-sm text-neutral-400">
          Taxa atual: <span className="font-semibold text-neutral-200">R$ 1,00 = {fmtCoins(COINS_PER_BRL)} moedas</span>
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
        <div className="text-sm text-neutral-400">Seu saldo</div>
        <div className="mt-1 text-4xl font-extrabold tabular-nums text-white">
          {fmtCoins(saldo)} <span className="text-base font-medium text-neutral-400">moedas</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 p-5 space-y-4 bg-white/5">
        <label htmlFor="valor" className="text-sm font-medium text-neutral-200">Valor (em R$)</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) - 1)))}
            className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-white" aria-label="Diminuir">−</button>
          <input
            id="valor"
            type="number"
            min={1}
            step="1"
            value={valorBRL}
            onChange={(e) => setValorBRL(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-xl border border-white/10 px-3 py-2 text-lg bg-black/30 text-white"
          />
          <button type="button" onClick={() => setValorBRL((v) => Math.max(1, Math.floor((v || 1) + 1)))}
            className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-white" aria-label="Aumentar">+</button>
        </div>

        <div className="text-sm text-neutral-300">
          Você receberá: <b>{fmtCoins(moedas)}</b> moedas
        </div>

        <button
          onClick={criarPix}
          disabled={status === 'waiting' || !user}
          className="w-full rounded-2xl bg-white text-black py-3.5 font-semibold shadow hover:opacity-90 disabled:opacity-50"
        >
          {status === 'waiting' ? 'Gerando Pix…' : 'Gerar Pix'}
        </button>
      </div>

      {pedidoId && (
        <div className="rounded-2xl border border-white/10 p-5 space-y-4 bg-white/5 text-white">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Pague com Pix</div>
            <div className="text-sm">
              {status === 'paid' && <span className="px-2 py-1 rounded-full bg-emerald-200/20 text-emerald-300">✅ Pago</span>}
              {status === 'waiting' && (
                <span className="px-2 py-1 rounded-full bg-amber-200/20 text-amber-300">
                  ⏳ Aguardando {secondsLeft != null && expiresAt ? `• expira em ${fmtCountdown(secondsLeft)}` : ''}
                </span>
              )}
              {status === 'expired' && <span className="px-2 py-1 rounded-full bg-rose-200/20 text-rose-300">⏱️ Expirado</span>}
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
            <a className="inline-flex items-center gap-2 text-sm underline text-neutral-200"
               href={ticketUrl} target="_blank" rel="noreferrer">
              Abrir no Mercado Pago
            </a>
          )}

          {copiaCola && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-400">Copia e cola</div>
              <textarea className="w-full h-28 rounded-xl border border-white/10 p-3 text-sm bg-black/30 text-white"
                        readOnly value={copiaCola} />
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(copiaCola); toast('Código copiado 👍'); }}
                        className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10">
                  Copiar
                </button>
                {(status === 'expired' || status === 'paid') && (
                  <button onClick={limparPix}
                          className="rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10">
                    Gerar outro Pix
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!user && (
        <div className="rounded-2xl border border-amber-400/20 p-4 text-sm text-amber-200 bg-amber-400/10">
          Você precisa estar logado para comprar moedas.
        </div>
      )}
    </div>
  );
}
