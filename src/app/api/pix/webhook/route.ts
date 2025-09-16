// Força execução só no server/node e evita qualquer render estático
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { parseWebhookAndGetStatus } from '@/server/pixAdapter';

function reqHeaders(srKey: string) {
  return {
    'Content-Type': 'application/json',
    apikey: srKey,
    Authorization: `Bearer ${srKey}`,
    Prefer: 'return=representation',
  };
}

export async function POST(req: NextRequest) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return NextResponse.json(
        { error: 'Env faltando: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    // 1) Interpreta o evento do MP (valida assinatura se houver MP_WEBHOOK_SECRET)
    const { pedidoId, paid, txid, raw } = await parseWebhookAndGetStatus(req);
    if (!pedidoId) return NextResponse.json({ ok: true, info: 'Sem pedidoId' });

    // 2) Lê o pedido atual
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pix_pedidos?select=id,status&id=eq.${pedidoId}&limit=1`,
      { headers: reqHeaders(SERVICE_ROLE), cache: 'no-store' }
    );
    if (!getRes.ok) {
      return NextResponse.json({ ok: false, step: 'get pedido', status: getRes.status }, { status: 500 });
    }
    const arr = await getRes.json();
    const ped = Array.isArray(arr) ? arr[0] : null;
    if (!ped) return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 });

    // idempotência
    if (ped.status === 'paid') return NextResponse.json({ ok: true, idempotent: true });

    // 3) Se pago no MP, primeiro credita via RPC (transacional no banco)
    if (paid) {
      const rpcRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/creditar_moedas_por_pix`,
        {
          method: 'POST',
          headers: reqHeaders(SERVICE_ROLE),
          body: JSON.stringify({ p_pedido: pedidoId }),
          cache: 'no-store',
        }
      );
      if (!rpcRes.ok) {
        const text = await rpcRes.text();
        return NextResponse.json({ ok: false, step: 'rpc', status: rpcRes.status, text }, { status: 500 });
      }

      // 4) Após creditar com sucesso, marque o pedido como paid e anexe payload/txid
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/pix_pedidos?id=eq.${pedidoId}`,
        {
          method: 'PATCH',
          headers: reqHeaders(SERVICE_ROLE),
          body: JSON.stringify({ status: 'paid', payload: raw, txid }),
          cache: 'no-store',
        }
      );
      if (!patchRes.ok) {
        return NextResponse.json({ ok: false, step: 'update pedido', status: patchRes.status }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('pix/webhook error', err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
