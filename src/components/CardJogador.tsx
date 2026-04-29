export default function CardJogador({
  jogador,
  modo = 'mercado',
  selecionado = false,
  onComprar,
  loadingComprar = false,
  mercadoFechado = false,
  onToggleSelecionado,
}: CardJogadorProps) {
  const overallNumero = Number(jogador.overall ?? 0)
  const tipoCarta = getTipoCarta(overallNumero)

  const imagemJogador =
    jogador.imagem_url ||
    jogador.foto ||
    '/player-placeholder.png'

  const salario =
    typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null

  const flagCode = jogador.nacionalidade
    ? bandeiras[jogador.nacionalidade]
    : null

  const stats = {
    PAC: jogador.pace ?? 0,
    SHO: jogador.shooting ?? 0,
    PAS: jogador.passing ?? 0,
    DRI: jogador.dribbling ?? 0,
    DEF: jogador.defending ?? 0,
    PHY: jogador.physical ?? 0,
  }

  const tema =
    tipoCarta === 'ouro'
      ? 'from-yellow-200 via-yellow-400 to-yellow-700 text-black shadow-[0_0_40px_rgba(255,200,0,0.3)]'
      : tipoCarta === 'prata'
      ? 'from-gray-200 via-gray-400 to-gray-700 text-black shadow-[0_0_40px_rgba(200,200,200,0.2)]'
      : 'from-[#8b5a2b] via-[#b37a45] to-[#3a2416] text-white shadow-[0_0_40px_rgba(120,60,20,0.3)]'

  return (
    <div
      className={[
        'relative w-[240px] h-[410px] rounded-[28px] overflow-hidden',
        'bg-gradient-to-b',
        tema,
        'transition-all duration-300 hover:scale-[1.05] hover:-translate-y-2',
        selecionado ? 'ring-4 ring-emerald-400' : '',
      ].join(' ')}
    >
      {/* IMAGEM */}
      <div className="absolute inset-0">
        <img
          src={imagemJogador}
          alt={jogador.nome}
          className="absolute inset-0 w-full h-full object-cover scale-110 brightness-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </div>

      {/* OVERALL */}
      <div className="absolute left-4 top-4 z-20 text-white">
        <div className="text-[36px] font-black drop-shadow">
          {overallNumero}
        </div>
        <div className="text-xs font-bold uppercase">
          {jogador.posicao}
        </div>
      </div>

      {/* BANDEIRA */}
      {flagCode && (
        <img
          src={`https://flagcdn.com/w40/${flagCode}.png`}
          className="absolute left-4 top-[70px] z-20 w-7 h-5 rounded-sm shadow"
        />
      )}

      {/* NOME + INFO */}
      <div className="absolute bottom-4 left-3 right-3 z-30">
        <div className="rounded-2xl bg-black/70 backdrop-blur-md p-3 shadow-xl border border-white/10">
          
          <div className="text-sm font-black uppercase text-white text-center truncate">
            {jogador.nome}
          </div>

          {typeof jogador.valor === 'number' && (
            <div className="text-center mt-1 text-emerald-300 font-bold text-sm">
              R$ {jogador.valor.toLocaleString('pt-BR')}
            </div>
          )}

          {/* STATS PREMIUM */}
          <div className="grid grid-cols-3 gap-1 mt-3 text-[10px] font-black">
            {Object.entries(stats).map(([key, val]) => (
              <div
                key={key}
                className="bg-white/10 backdrop-blur rounded-lg py-1 text-center text-white border border-white/10"
              >
                <div className="text-white/60">{key}</div>
                <div>{val}</div>
              </div>
            ))}
          </div>

          {/* BOTÃO */}
          {modo === 'mercado' && onComprar && (
            <button
              onClick={onComprar}
              disabled={loadingComprar || mercadoFechado}
              className={[
                'mt-3 w-full rounded-xl py-2 text-sm font-black transition-all',
                loadingComprar || mercadoFechado
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white',
              ].join(' ')}
            >
              {loadingComprar
                ? 'Comprando...'
                : mercadoFechado
                ? 'Mercado fechado'
                : 'Comprar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}