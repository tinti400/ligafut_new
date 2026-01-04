// src/config/temasTimes.ts

export type TemaTime = {
  nome: string
  corPrimaria: string
  fundo: string
  escudo: string
}

export const temasTimes: Record<string, TemaTime> = {
  palmeiras: {
    nome: 'Palmeiras',
    corPrimaria: '#1E7F43',
    fundo: '/times/palmeiras/fundo.jpg',
    escudo: '/times/palmeiras/escudo.png',
  },

  flamengo: {
    nome: 'Flamengo',
    corPrimaria: '#C8102E',
    fundo: '/times/flamengo/fundo.jpg',
    escudo: '/times/flamengo/escudo.png',
  },

  corinthians: {
    nome: 'Corinthians',
    corPrimaria: '#000000',
    fundo: '/times/corinthians/fundo.jpg',
    escudo: '/times/corinthians/escudo.png',
  },
}
