// /src/app/api/pix/create/route.ts
// Executa só no server e evita render estático
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { brlToMoedas } from '@/utils/moeda';
import { createPixCharge } from '@/server/pixAdapter';

type SafePgErr = Partial<Pick<PostgrestError, 'code' | 'message' | 'details' | 'hint'>> | any;

function errJson(msg: string, e?: SafePgErr, status = 400) {
  const ext = e
    ? ` | code=${e.code ?? ''} msg=${e.message ?? ''} details=${e.details ?? ''} hint=${e.hint ?? ''}`
    : '';
  console.error('[pix/create]', msg, ext);
  return NextResponse.json({ error: `${msg}${e?.message ? `: ${e.message}` : ''}` }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // --- validação básica ---
    const id_usuario = String(body?.id_usuario ?? '').trim();
    const valorBRL = Number(body?.valorBRL);
    const valorEmCentavos = Math.round(valorBRL * 100);

    if (!id_usuario || !Number.isFinite(valorBRL) || valorEmCentavos < 100) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos: informe id_usuario e valorBRL (mínimo R$1).' },
        { status: 400 }
      );
    }

    // --- envs ---
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return errJson('Env faltando: NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY', undefined, 500);
    }
    if (!SITE_URL) {
      return errJson('Env faltando: NEXT_PUBLIC_SITE_URL', undefined, 500);
    }
    if (!MP_TOKEN) {
      // mesmo que o adapter leia do env, validamos aqui para dar erro claro
      return errJson('Env faltando: MP_ACCESS_TOKEN (ou MERCADOPAGO_ACCESS_TOKEN)', undefined, 500);
    }

    // --- supabase admin (service role) ---
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // --- moedas ---
    const moedas = brlToMoedas(valorBRL);

    // =====================================================================
    // 1) INSERT do pedido (com fallbacks de schema)
    // =====================================================================
    type Pedido = { id: string };

    async function tryInsert(fields: Record<string, any>) {
      const r = await supabase.from('pix_pedidos').insert(fields).select('id').single<Pedido>();
      if (r.error) throw r.error;
      return r.data!;
    }

    let pedido: Pedido | null = null;

    // tentativa A: schema "completo"
    let fields: Record<string, any> = {
      id_usuario,
      valor_brl: valorBRL,
      moedas_credito: moedas,
      status: 'waiting', // alinha com o front
    };

    try {
      pedido = await tryInsert(fields);
    } catch (eA: any) {
      const msgA = String(eA?.message ?? '');
      if (eA?.code === '42703' && msgA.includes('moedas_credito')) {
        // remove moedas_credito e tenta de novo
        delete fields.moedas_credito;
        try {
          pedido = await tryInsert(fields);
        } catch (eB: any) {
          const msgB = String(eB?.message ?? '');
          if (eB?.code === '42703' && msgB.includes('valor_brl')) {
            // alguns schemas usam "valor"
            delete fields.valor_brl;
            fields.valor = valorBRL;
            try {
              pedido = await tryInsert(fields);
            } catch (eC: any) {
              if (eC?.code === '23514') {
                fields.status = 'pending';
                try {
                  pedido = await tryInsert(fields);
                } catch (eD: any) {
                  return errJson('Falha ao criar pedido (schema incompatível)', eD, 500);
                }
              } else {
                return errJson('Falha ao criar pedido', eC, 500);
              }
            }
          } else if (eB?.code === '23514') {
            fields.status = 'pending';
            try {
              pedido = await tryInsert(fields);
            } catch (eC: any) {
              return errJson('Falha ao criar pedido (constraint status)', eC, 500);
            }
          } else {
            return errJson('Falha ao criar pedido', eB, 500);
          }
        }
      } else if (eA?.code === '23514') {
        fields.status = 'pending';
        try {
          pedido = await tryInsert(fields);
        } catch (eB: any) {
          return errJson('Falha ao criar pedido (constraint status)', eB, 500);
        }
      } else {
        return errJson('Falha ao criar pedido', eA, 500);
      }
    }

    if (!pedido?.id) {
      return errJson('Falha ao criar pedido (sem ID retornado)', undefined, 500);
    }

    // =====================================================================
    // 2) Cobrança Pix via PSP
    // =====================================================================
    const notificationUrl = `${SITE_URL}/api/pix/webhook`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // ⚠️ NÃO tipamos manualmente: deixamos o tipo vir do adapter
    let charge;
    try {
      charge = await createPixCharge({
        valorBRL,
        descricao: `Compra de ${moedas.toLocaleString('pt-BR')} moedas (pedido ${pedido.id})`,
        pedidoId: pedido.id,
        notificationUrl,
        dateOfExpirationISO: expiresAt,
      });
    } catch (e: any) {
      return errJson('Erro ao criar cobrança Pix no PSP', e, 500);
    }

    // Normalização para null (adapter pode retornar undefined)
    const copiaCola = charge.copiaCola ?? null;
    const qrImageUrl = charge.qrImageDataUrl ?? null;
    const chargeExpiresAt = charge.expiresAt ?? null;

    // =====================================================================
    // 3) UPDATE do pedido com dados do PSP (com fallback de colunas)
    // =====================================================================
    async function updateFull() {
      return await supabase
        .from('pix_pedidos')
        .update({
          txid: String(charge.txid ?? ''),
          qr_code: copiaCola,
          qr_image_url: qrImageUrl,
          ticket_url: charge.raw?.point_of_interaction?.transaction_data?.ticket_url ?? null,
          raw: charge.raw,              // se a coluna "raw" não existir, cairemos no fallback
          expires_at: chargeExpiresAt,  // idem para expires_at
        })
        .eq('id', pedido!.id);
    }

    async function updateMinimal() {
      return await supabase
        .from('pix_pedidos')
        .update({
          txid: String(charge.txid ?? ''),
          qr_code: copiaCola,
          qr_image_url: qrImageUrl,
        })
        .eq('id', pedido!.id);
    }

    let upd = await updateFull();
    if (upd.error) {
      if (upd.error.code === '42703') {
        upd = await updateMinimal();
        if (upd.error) return errJson('Falha ao atualizar dados do Pix (mínimo)', upd.error, 500);
      } else {
        return errJson('Falha ao atualizar dados do Pix', upd.error, 500);
      }
    }

    // =====================================================================
    // 4) Resposta ao front
    // =====================================================================
    return NextResponse.json({
      pedidoId: pedido.id,
      txid: String(charge.txid ?? ''),
      copiaCola,
      qrImageUrl,
      expiresAt: chargeExpiresAt,
      moedas,
      raw: charge.raw ?? null,
    });
  } catch (err: any) {
    return errJson('Erro inesperado ao criar Pix', err, 500);
  }
}
