// /src/app/moedas/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COINS_PER_BRL = 5_000_000;

export default function ComprarMoedasPage() {
  const [user, setUser] = useState<any>(null);
  const [saldo, setSaldo] = useState<number | null>(null);

  const [valorBRL, setValorBRL] = useState<number>(10);
  const moedas = useMemo(() => Math.round(valorBRL * COINS_PER_BRL), [valorBRL]);

  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [copiaCola, setCopiaCola] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle'|'waiting'|'paid'>('idle');

  // Carrega user e saldo da carteira
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Faça login para comprar moedas.');
        return;
      }
      setUser(user);

      const { data } = await supabase
        .from('carteiras')
        .select('saldo')
        .eq('id_usuario', user.id)
        .maybeSingle();

      setSaldo(data?.saldo ?? 0);
    })();
  }, []);

  // Realtime: escuta atualização do pedido para status=paid
  useEffect(() => {
    if (!pedidoId) return;
    const channel = supabase
      .channel(`pix_pedido_${pedidoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pix_pedidos', filter: `id=eq.${pedidoId}` },
        async (payload) => {
          const st = payload.new.status as string;
          if (st === 'paid') {
            setStatus('paid');
            toast.success('Pagamento confirmado! Moedas creditadas 👏');
            // atualiza saldo
            const { data } = await supabase
              .from('carteiras')
              .select('saldo')
              .eq('id_usuario', user.id)
              .maybeSingle();
            setSaldo(data?.saldo ?? null);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [pedidoId, user?.id]);

  const criarPix = async () => {
    try {
      if (!user?.id) {
        toast.error('Usuário não autenticado.');
        return;
      }
      setStatus('waiting');
      setPedidoId(null);
      setQrImg(null);
      setCopiaCola(null);

      const res = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_usuario: user.id, valorBRL: Number(valorBRL) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Falha ao criar Pix.');

      setPedidoId(j.pedidoId);
      setQrImg(j.qrImageUrl || null);
      setCopiaCola(j.copiaCola || null);
      toast('Pix gerado. Pague e aguarde a confirmação.');
    } catch (e: any) {
      console.error(e);
      setStatus('idle');
      toast.error(e.message || 'Erro ao criar Pix.');
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Comprar Moedas</h1>

      <div className="p-4 rounded-xl border">
        <div className="text-sm opacity-70">Saldo atual</div>
        <div className="text-3xl font-extrabold">
          {saldo?.toLocaleString('pt-BR') ?? '—'} <span className="text-sm font-medium">moedas</span>
        </div>
      </div>

      <div className="p-4 rounded-xl border space-y-3">
        <label className="text-sm font-medium">Valor (R$)</label>
        <input
          type="number"
          min={1}
          step="1"
          value={valorBRL}
          onChange={(e) => setValorBRL(Number(e.target.value))}
          className="w-full rounded-lg border px-3 py-2"
        />
        <div className="text-sm">
          Taxa: <b>R$1 = 5.000.000</b> moedas<br/>
          Você receberá: <b>{moedas.toLocaleString('pt-BR')}</b> moedas
        </div>
        <button
          onClick={criarPix}
          disabled={status === 'waiting'}
          className="w-full rounded-lg bg-black text-white py-3 font-semibold disabled:opacity-50"
        >
          {status === 'waiting' ? 'Gerando Pix...' : 'Gerar Pix'}
        </button>
      </div>

      {pedidoId && (
        <div className="p-4 rounded-xl border space-y-3">
          <div className="font-semibold">Pague o Pix</div>
          {qrImg ? (
            <img src={qrImg} alt="QR Code Pix" className="w-full rounded-lg" />
          ) : (
            <div className="text-sm opacity-70">Mostrando somente “copia e cola”.</div>
          )}
          {copiaCola && (
            <div className="space-y-2">
              <div className="text-xs opacity-60">Copia e Cola:</div>
              <textarea className="w-full h-28 rounded-lg border p-2" readOnly value={copiaCola} />
              <button
                onClick={() => { navigator.clipboard.writeText(copiaCola); toast('Copiado!'); }}
                className="rounded-lg border px-3 py-2"
              >
                Copiar
              </button>
            </div>
          )}
          <div className="text-sm">
            Status: {status === 'paid' ? '✅ Pago' : '⏳ Aguardando pagamento'}
          </div>
        </div>
      )}
    </div>
  );
}
