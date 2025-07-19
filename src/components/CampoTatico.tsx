'use client'

import { useState } from 'react'

interface FormacaoProps {
  formacao: string[][]
  escalação: Record<string, any>
  onEscalar: (posicao: string) => void
}

export default function CampoTatico({ formacao, escalação, onEscalar }: FormacaoProps) {
  return (
    <div className="relative w-full max-w-2xl mx-auto h-[600px] bg-green-800 rounded-lg p-4 border-2 border-green-500">
      {formacao.map((linha, index) => (
        <div key={index} className="flex justify-center gap-4 my-4">
          {linha.map((pos, i) => (
            <div
              key={i}
              className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-xs text-black font-bold shadow-md cursor-pointer hover:bg-gray-200 transition"
              onClick={() => onEscalar(pos)}
            >
              {escalação[pos]?.nome || pos}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
