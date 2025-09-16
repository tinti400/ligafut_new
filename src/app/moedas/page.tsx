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
  MessageCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-browser';

const COINS_PER_BRL = Number(process.env.NEXT_PUBLIC_COINS_PER_BRL ?? '5000000');
const WHATSAPP_NUMBER_RAW = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || ''; // ex.: 5511999999999
const WHATSAPP_NUMBER = WHATSAPP_NUMBER_RAW.replace(/\D/g, '');
const HAS_WHATSAPP = WHATSAPP_NUMBER.length >= 10;

/** ========= Tipos ========= */
type LocalUser = {
  usuario_id: string | number;
  id_time: string;
  usuario: string;
  nome_time?: string;
  nome?: string;
  email?: string;
  isAdmin?: boolean;
};

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
  /** ======== "Sessão" baseada no LOGIN da sua app (localStorage.user) ======== */
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);

  useEffect(() => {
    // carrega no primeiro render
    try {
      const raw = localStorage.getItem('user');
      if (raw) setLocalUser(JSON.parse(raw));
    } catch (e) {
      console.warn('Não foi possível ler localStorage.user', e);
    }

    // se o user mudar em outra aba, sincroniza aqui
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === 'user') {
        try {
          setLocalUser(ev.newValue ? JSON.parse(ev.newValue) : null);
        } catch {
          setLocalUser(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isLogged = !!localUser?.usuario_id;

  /** ======== Saldo ======== */
  const [saldo, setSaldo] = useState<number | null>(null);
  const carregandoSaldo = useRef(false);

  async function carregarSaldo(idUsuario: string | number) {
    if (carregandoSaldo.current) return;
    try {
      carregandoSaldo.current = true;
      const { data, error } = await supabase
        .from('carteiras')
        .select('saldo')
        .eq('id_usuario', String(idUsuario))
        .maybeSingle();
      if (error) console.error('Erro ao carregar saldo', error);
      setSaldo(data?.saldo ?? 0);
    } finally {
      carregandoSaldo.current = false;
    }
  }

  useEffect(() => {
    if (isLogged && localUser?.usuario_id) {
      carregarSaldo(localUser.usuario_id);
    } else {
      setSaldo(0);
    }
  }, [isLogged, localUser?.usuario_id]);

  /** ======== Compra ======== */
  const [valorBRL, setValorBRL] = useState<number>(10);
  const moedas = useMemo(
    () => Math.max(0, Math.round((valorBRL || 0) * COINS_PER_BRL)),
    [valorBRL]
  );

  /** ======== Pix atual ======== */
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [copiaCola, setCopiaCola] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PixStatus>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  /** ======== Realtime: status do pedido ======== */
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
            if (localUser?.usuario_id) await carregarSaldo(localUser.usuario_id);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [pedidoId, localUser?.usuario_id]);

  /** ======== Countdown ======== */
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

  /** ======== Ações ======== */
  const criarPix = async () => {
    try {
      if (!isLogged || !localUser?.usuario_id) {
        toast.error('Faça login para continuar.');
        return;
      }
      const valor = Number(valorBRL);
      if (!Number.isFinite(valor) || valor < 1) {
        toast.error('Informe um valor (mínimo R$1).');
        return;
      }

      setStatus('waiting');
      setPedidoId(null);
      setTxid(null);
      setQrImg(null);
      setCopiaCola(null);
      setTicketUrl(null);
      setExpiresAt(null);
      setSecondsLeft(null);

      const res = await fetch('/api/pix/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_usuario: String(localUser.usuario_id), // <-- usa o mesmo ID do login
          valorBRL: valor,
        }),
      });

      const j: PixCreateResponse | { error?: string } = await res.json();
      if (!res.ok || !('pedidoId' in j)) throw new Error((j as any)?.error || 'Falha ao criar Pix.');

      setPedidoId((j as PixCreateResponse).pedidoId);
      setTxid((j as PixCreateResponse).txid ?? null);
      setQrImg((j as PixCreateResponse).qrImageUrl || null);
      setCopiaCola((j as PixCreateResponse).copiaCola || null);
      setExpiresAt((j as PixCreateResponse).expiresAt || null);

      const tk =
        ((j as PixCreateResponse).raw?.point_of_interaction?.transaction_data?.ticket_url as string) ||
        null;
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
    setTxid(null);
    setQrImg(null);
    setCopiaCola(null);
    setTicketUrl(null);
    setExpiresAt(null);
    setSecondsLeft(null);
    setStatus('idle');
  };

  /** ======== WhatsApp (fallback/manual) ======== */
  function buildWhatsAppText() {
    const linhas = [
      '🧾 *Comprovante de Compra de Moedas*',
      '—',
      `👤 Usuário: ${localUser?.usuario ?? 'N/D'}`,
      pedidoId ? `🆔 Pedido: ${pedidoId}` : '',
      txid ? `🔗 TXID: ${txid}` : '',
      `💰 Valor: R$ ${Number(valorBRL).toFixed(2)}`,
      `🪙 Moedas: ${moedas.toLocaleString('pt-BR')}`,
      '',
      'Anexei o *comprovante Pix*.',
    ].filter(Boolean);
    return linhas.join('\n');
  }

  function abrirWhatsApp() {
    if (!HAS_WHATSAPP) return;
    const msg = buildWhatsAppText();
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** ======== UI helpers ======== */
  const fmtCoins = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR');
  const fmtCountdown = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  /** ======== Render ======== */
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
          disabled={status === 'waiting' || !isLogged}
          className={cn(
            'w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold',
            'bg-white text-black hover:opacity-90 disabled:opacity-50'
          )}
        >
          {status === 'waiting' ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
          {status === 'waiting' ? 'Gerando Pix…' : 'Gerar Pix'}
        </button>

        {!isLogged && (
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
                  onClick={() => {
                    navigator.clipboard.writeText(copiaCola);
                    toast('Código copiado 👍');
                  }}
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

          {/* Suporte / Fallback via WhatsApp */}
          {HAS_WHATSAPP && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <div className="flex items-center gap-2 text-emerald-200 font-medium">
                <MessageCircle className="size-4" />
                Precisa de ajuda? Envie o comprovante via WhatsApp
              </div>
              <p className="mt-1 text-sm text-neutral-300">
                Após pagar, abra o WhatsApp abaixo e <b>anexe o print do comprovante</b>.
                O texto já vai com seu <b>ID do pedido</b> e <b>TXID</b>.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={abrirWhatsApp}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10"
                >
                  <MessageCircle className="size-4" /> Abrir conversa no WhatsApp
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(buildWhatsAppText());
                    toast('Mensagem copiada ✅');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 hover:bg-white/10"
                >
                  <CopyIcon className="size-4" /> Copiar mensagem
                </button>
              </div>
              <div className="mt-2 text-xs text-neutral-400">Número configurado: +{WHATSAPP_NUMBER}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
