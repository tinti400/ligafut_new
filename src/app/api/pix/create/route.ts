// /src/app/api/pix/create/route.ts
// Força execução só no server/node e evita qualquer render estático
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { brlToMoedas } from '@/utils/moeda';
import { createPixCharge } from '@/server/pixAdapter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id_usuario = body?.id_usuario as string | undefined;

    // Normaliza valor para número (aceita string "1" por segurança)
    const valorBRL = Number(body?.valorBRL);
    const valorEmCentavos = Math.round(valorBRL * 100);

    if (!id_usuario || !Number.isFinite(valorBRL) || valorEmCentavos < 100) {
      return NextResponse.json(
        { error: 'Parâmetros inválidos: informe id_usuario e valorBRL (mínimo R$1).' },
        { status: 400 }
      );
    }

    // ✅ Variáveis de ambiente
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return NextResponse.json(
        { error: 'Env faltando: NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }
    if (!SITE_URL) {
      return NextResponse.json(
        { error: 'Env faltando: NEXT_PUBLIC_SITE_URL.' },
        { status: 500 }
      );
    }

    // ✅ Supabase com service role (sem session no servidor)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Converte R$ -> moedas (usa sua função utilitária)
    const moedas = brlToMoedas(valorBRL);

    // 1) Cria pedido 'pending'
    const { data: pedido, error: e1 } = await supabase
      .from('pix_pedidos')
      .insert({
        id_usuario,
        valor_brl: valorBRL,
        moedas_credito: moedas,
        status: 'pending',
      })
      .select()
      .single();

    if (e1 || !pedido) {
      console.error('Erro ao inserir pedido:', e1);
      return NextResponse.json({ error: 'Falha ao criar pedido.' }, { status: 500 });
    }

    // 2) Cria cobrança Pix no PSP (Mercado Pago)
    const notificationUrl = `${SITE_URL}/api/pix/webhook`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    const charge = await createPixCharge({
      valorBRL, // número em reais
      descricao: `Compra de ${moedas.toLocaleString('pt-BR')} moedas (pedido ${pedido.id})`,
      pedidoId: pedido.id,
      notificationUrl,
      dateOfExpirationISO: expiresAt,
    });

    // 3) Grava dados do PSP no pedido
    const { error: e2 } = await supabase
      .from('pix_pedidos')
      .update({
        txid: charge.txid,
        qr_code: charge.copiaCola,
        qr_image_url: charge.qrImageDataUrl,
        payload: charge.raw,
        expiracao: charge.expiresAt,
      })
      .eq('id', pedido.id);

    if (e2) {
      console.error('Erro ao atualizar pedido com dados do PSP:', e2);
      return NextResponse.json({ error: 'Falha ao atualizar dados do Pix.' }, { status: 500 });
    }

    // 4) Retorna dados pro front
    return NextResponse.json({
      pedidoId: pedido.id,
      txid: charge.txid,
      copiaCola: charge.copiaCola,
      qrImageUrl: charge.qrImageDataUrl,
      expiresAt: charge.expiresAt,
      moedas,
      raw: charge.raw, // útil pro ticket_url
    });
  } catch (err: any) {
    console.error('pix/create error', err);
    return NextResponse.json({ error: 'Erro ao criar Pix.' }, { status: 500 });
  }
}
