// /src/server/pixAdapter.ts
import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';

export type PixCharge = {
  txid: string;
  copiaCola: string;     // BR Code (Pix copia e cola)
  qrImageDataUrl?: string;
  expiresAt?: string;    // ISO
  raw?: any;
};

type CreateArgs = {
  valorBRL: number;
  descricao: string;
  pedidoId: string; // nosso id em pix_pedidos
  notificationUrl: string;
  payer?: { email?: string; first_name?: string; last_name?: string };
  // opcional: override de expiração (ISO); se não enviar, usamos 10 min
  dateOfExpirationISO?: string;
};

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function createPixCharge(args: CreateArgs): Promise<PixCharge> {
  const payment = new Payment(mpClient);

  // expiração: 10 minutos por padrão (ajuste ao seu negócio)
  const expiresAt =
    args.dateOfExpirationISO ||
    new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const result = await payment.create({
    body: {
      transaction_amount: Number(args.valorBRL),
      description: args.descricao,
      payment_method_id: 'pix',
      payer: {
        email: args.payer?.email || 'comprador@example.com',
        first_name: args.payer?.first_name,
        last_name: args.payer?.last_name,
      },
      notification_url: args.notificationUrl,
      external_reference: args.pedidoId,       // volta no GET do pagamento
      date_of_expiration: expiresAt,           // default é 24h; aqui deixei 10min
    },
  });

  const txid = String(result.id);
  const tdata = (result as any).point_of_interaction?.transaction_data;

  return {
    txid,
    copiaCola: tdata?.qr_code || '',
    qrImageDataUrl: tdata?.qr_code_base64 ? `data:image/png;base64,${tdata.qr_code_base64}` : undefined,
    expiresAt: (result as any).date_of_expiration || expiresAt,
    raw: result,
  };
}

// -------- Webhook --------

function parseSignatureHeader(sigHeader: string | null) {
  if (!sigHeader) return {};
  // formato: "ts=1699999999, v1=hexhmac..."
  const parts = sigHeader.split(',').map(s => s.trim());
  const out: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) out[k] = v;
  }
  return out; // { ts: "...", v1: "..." }
}

function verifyWebhookSignature({
  signature,
  requestId,
  dataId,
  secret,
}: { signature: string | null; requestId: string | null; dataId: string | number | undefined; secret?: string }) {
  if (!secret || !signature || !requestId || !dataId) return true; // se não configurou, não bloqueia
  const { ts, v1 } = parseSignatureHeader(signature) as any;
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(hmac));
}

export async function parseWebhookAndGetStatus(req: Request): Promise<{
  pedidoId?: string;
  txid?: string;
  paid: boolean;
  raw: any;
}> {
  const signature = req.headers.get('x-signature');
  const requestId = req.headers.get('x-request-id');
  const body = await req.json().catch(() => ({} as any));

  // notificação típica: { type: 'payment', data: { id: '...'} }
  if (body?.type === 'payment' && body?.data?.id) {
    const ok = verifyWebhookSignature({
      signature,
      requestId,
      dataId: body.data.id,
      secret: process.env.MP_WEBHOOK_SECRET,
    });
    if (!ok) {
      return { paid: false, raw: { error: 'invalid_signature', body } };
    }

    const payment = new Payment(mpClient);
    const p = await payment.get({ id: String(body.data.id) });

    return {
      pedidoId: (p as any).external_reference || undefined,
      txid: String(p.id),
      paid: p.status === 'approved',
      raw: p,
    };
  }

  // fallback (outras notificações)
  return { paid: false, raw: body };
}
