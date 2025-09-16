// /src/app/api/pix/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { brlToMoedas } from '@/utils/moeda';
import { createPixCharge } from '@/server/pixAdapter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role: apenas no servidor!
);

export async function POST(req: NextRequest) {
  try {
    const { id_usuario, valorBRL } = await req.json();

    if (!id_usuario || typeof valorBRL !== 'number' || valorBRL <= 0) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    const moedas = brlToMoedas(valorBRL);

    // cria pedido 'pending'
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

    if (e1 || !pedido) throw e1 || new Error('Falha ao criar pedido.');

    // cria cobrança no PSP
    const notificationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/pix/webhook`;
    const charge = await createPixCharge({
      valorBRL,
      descricao: `Compra de ${moedas.toLocaleString('pt-BR')} moedas (pedido ${pedido.id})`,
      pedidoId: pedido.id,
      notificationUrl,
    });

    // grava dados do PSP
    await supabase
      .from('pix_pedidos')
      .update({
        txid: charge.txid,
        qr_code: charge.copiaCola,
        qr_image_url: charge.qrImageDataUrl,
        payload: charge.raw,
        expiracao: charge.expiresAt,
      })
      .eq('id', pedido.id);

    return NextResponse.json({
      pedidoId: pedido.id,
      txid: charge.txid,
      copiaCola: charge.copiaCola,
      qrImageUrl: charge.qrImageDataUrl,
      expiresAt: charge.expiresAt,
      moedas,
    });
  } catch (err: any) {
    console.error('pix/create error', err);
    return NextResponse.json({ error: 'Erro ao criar Pix.' }, { status: 500 });
  }
}
