// /src/server/pixAdapter.ts
// Este arquivo centraliza a integração com o provedor Pix escolhido.
// Troque a implementação conforme seu PSP (Mercado Pago, Stripe, Efí, etc.)

export type PixCharge = {
  txid: string;
  copiaCola: string;     // BR Code (QR copia e cola)
  qrImageDataUrl?: string;
  expiresAt?: string;    // ISO
  raw?: any;             // payload bruto do PSP
};

type CreateArgs = {
  valorBRL: number;
  descricao: string;
  pedidoId: string; // id do pix_pedidos (para setar em metadata)
  notificationUrl: string;
  payer?: { email?: string; first_name?: string; last_name?: string };
};

export async function createPixCharge(args: CreateArgs): Promise<PixCharge> {
  // Exemplo comentado: Mercado Pago
  // import mercadopago from 'mercadopago';
  // mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN! });
  //
  // const res = await mercadopago.payment.create({
  //   transaction_amount: Number(args.valorBRL),
  //   description: args.descricao,
  //   payment_method_id: 'pix',
  //   payer: { email: args.payer?.email || 'user@example.com' },
  //   notification_url: args.notificationUrl,
  //   metadata: { pedido_id: args.pedidoId },
  // });
  //
  // const body = res.body;
  // const txid   = String(body.id);
  // const copia  = body.point_of_interaction.transaction_data.qr_code;
  // const imgB64 = body.point_of_interaction.transaction_data.qr_code_base64;
  // const exp    = body.date_of_expiration; // ISO
  //
  // return {
  //   txid,
  //   copiaCola: copia,
  //   qrImageDataUrl: imgB64 ? `data:image/png;base64,${imgB64}` : undefined,
  //   expiresAt: exp,
  //   raw: body,
  // };

  // Fallback de desenvolvimento (sem PSP real):
  const fakeTx = `dev_${Date.now()}`;
  return {
    txid: fakeTx,
    copiaCola: `000201FAKEBRCode-${fakeTx}`,
    qrImageDataUrl: undefined,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    raw: { provider: 'dev' },
  };
}

// Webhook: dado um evento do PSP, retorna {pedidoId, pago?}
export async function parseWebhookAndGetStatus(req: Request): Promise<{
  pedidoId?: string;
  txid?: string;
  paid: boolean;
  raw: any;
}> {
  const body = await req.json();

  // Exemplo (Mercado Pago):
  // - Recebe um POST com { type: 'payment', data: { id: 'PAYMENT_ID' } }
  // - Depois é comum buscar o pagamento por ID para checar status === 'approved'
  //
  // const { data } = body || {};
  // if (body?.type === 'payment' && data?.id) {
  //   const res = await mercadopago.payment.get(data.id);
  //   const p = res.body;
  //   return {
  //     pedidoId: p.metadata?.pedido_id,
  //     txid: String(p.id),
  //     paid: p.status === 'approved',
  //     raw: p,
  //   };
  // }

  // Fallback de desenvolvimento: aceita “pedido_id” no body
  return {
    pedidoId: body?.pedido_id,
    txid: body?.txid,
    paid: body?.paid === true,
    raw: body,
  };
}
