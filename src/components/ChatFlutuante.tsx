'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function ChatFlutuante() {
  const [abrirChat, setAbrirChat] = useState(false)
  const [chat, setChat] = useState<any[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [usuariosOnline, setUsuariosOnline] = useState<any[]>([])

  useEffect(() => {
    const buscarChat = async () => {
      const { data } = await supabase
        .from('chat')
        .select('*')
        .order('data_envio', { ascending: true })
        .limit(50)
      if (data) setChat(data)
    }

    buscarChat()

    const canal = supabase
      .channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat' }, (payload) => {
        setChat((prev) => [...prev, payload.new])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  const enviarMensagem = async () => {
    if (!novaMensagem.trim()) return
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    await supabase.from('chat').insert({
      usuario: user.nome_time || 'Anônimo',
      mensagem: novaMensagem
    })
    setNovaMensagem('')
  }

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (!user?.id_time) return

    const registrarOnline = async () => {
      await supabase
        .from('online_users')
        .upsert({
          id_time: user.id_time,
          usuario: user.nome_time,
          ultima_atividade: new Date()
        }, { onConflict: 'id_time' }) // ✅ Correção aqui!
    }

    registrarOnline()

    const interval = setInterval(registrarOnline, 60000) // Atualiza a cada 60s

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const buscarOnline = async () => {
      const { data } = await supabase
        .from('online_users')
        .select('*')
        .gte('ultima_atividade', new Date(Date.now() - 2 * 60 * 1000))
      if (data) setUsuariosOnline(data)
    }

    buscarOnline()
    const interval = setInterval(buscarOnline, 10000) // Atualiza a cada 10s

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {abrirChat ? (
        <div className="bg-gray-900 border border-green-500 rounded-lg w-80 shadow-lg">
          <div className="bg-green-600 text-white flex justify-between items-center p-2 rounded-t-lg">
            <span>💬 Chat da Liga</span>
            <button onClick={() => setAbrirChat(false)}>❌</button>
          </div>

          <div className="text-white text-xs p-1">
            <strong>🟢 Online:</strong> {usuariosOnline.map(u => (
              <span key={u.id_time} className="ml-1">🟢 {u.usuario}</span>
            ))}
          </div>

          <div className="h-64 overflow-y-auto p-2 text-white bg-gray-800 text-sm">
            {chat.map((msg, idx) => (
              <p key={idx}><strong>{msg.usuario}:</strong> {msg.mensagem}</p>
            ))}
          </div>

          <div className="flex border-t border-gray-700">
            <input
              type="text"
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviarMensagem()}
              placeholder="Digite..."
              className="flex-1 p-2 text-black text-sm"
            />
            <button
              onClick={enviarMensagem}
              className="bg-green-600 text-white px-3 text-sm"
            >
              ➤
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAbrirChat(true)}
          className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg"
        >
          💬
        </button>
      )}
    </div>
  )
}
