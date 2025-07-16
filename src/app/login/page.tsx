'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const router = useRouter()
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [tela, setTela] = useState<'login' | 'trocar'>('login')
  const [showSenha, setShowSenha] = useState(false)
  const [showNovaSenha, setShowNovaSenha] = useState(false)

  useEffect(() => {
    localStorage.clear()
  }, [])

  const handleLogin = async () => {
    if (!usuario || !senha) {
      alert('⚠️ Preencha usuário e senha!')
      return
    }

    setLoading(true)

    try {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('usuario', usuario)
        .eq('senha', senha)
        .single()

      if (error || !userData) {
        alert('❌ Usuário ou senha inválidos!')
        setLoading(false)
        return
      }

      const { data: timeData, error: timeError } = await supabase
        .from('times')
        .select('id, nome')
        .eq('id', userData.time_id)
        .single()

      if (timeError || !timeData) {
        alert('❌ Seu time não foi encontrado. Contate o administrador.')
        setLoading(false)
        return
      }

      const { data: adminData } = await supabase
        .from('admins')
        .select('email')
        .eq('email', userData.usuario.toLowerCase())  // verifica minúsculo

      localStorage.setItem('user', JSON.stringify({
        usuario_id: userData.id,
        id_time: timeData.id,
        nome_time: timeData.nome,
        usuario: userData.usuario,
        isAdmin: !!adminData
      }))

      localStorage.setItem('id_time', timeData.id)
      localStorage.setItem('nome_time', timeData.nome)

      // Salva o email em minúsculo para verificação admin
      localStorage.setItem('email', userData.usuario.toLowerCase())

      router.push('/')
    } catch (err) {
      console.error('Erro ao fazer login:', err)
      alert('❌ Ocorreu um erro ao tentar fazer login.')
    } finally {
      setLoading(false)
    }
  }

  const handleTrocarSenha = async () => {
    if (!usuario || !senha || !novaSenha) {
      alert('⚠️ Preencha todos os campos!')
      return
    }

    setLoading(true)

    try {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('usuario', usuario)
        .eq('senha', senha)
        .single()

      if (error || !userData) {
        alert('❌ Usuário ou senha inválidos!')
        setLoading(false)
        return
      }

      await supabase
        .from('usuarios')
        .update({ senha: novaSenha })
        .eq('id', userData.id)

      alert('✅ Senha atualizada com sucesso! Faça login novamente.')
      setTela('login')
      setSenha('')
      setNovaSenha('')
    } catch (err) {
      console.error('Erro ao atualizar senha:', err)
      alert('❌ Erro ao tentar atualizar a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded shadow-md w-80 text-white">
        <h1 className="text-xl font-bold mb-4 text-center">
          {tela === 'login' ? '🔐 Login LigaFut' : '🔑 Trocar Senha'}
        </h1>

        <input
          type="text"
          placeholder="Usuário"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="border p-2 w-full mb-3 rounded text-sm bg-gray-700 border-gray-600"
        />

        <div className="relative mb-3">
          <input
            type={showSenha ? 'text' : 'password'}
            placeholder="Senha Atual"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="border p-2 w-full rounded text-sm pr-10 bg-gray-700 border-gray-600"
          />
          <button
            type="button"
            onClick={() => setShowSenha(!showSenha)}
            className="absolute right-2 top-2 text-xs text-gray-400"
          >
            {showSenha ? '🙈' : '👁️'}
          </button>
        </div>

        {tela === 'trocar' && (
          <div className="relative mb-3">
            <input
              type={showNovaSenha ? 'text' : 'password'}
              placeholder="Nova Senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="border p-2 w-full rounded text-sm pr-10 bg-gray-700 border-gray-600"
            />
            <button
              type="button"
              onClick={() => setShowNovaSenha(!showNovaSenha)}
              className="absolute right-2 top-2 text-xs text-gray-400"
            >
              {showNovaSenha ? '🙈' : '👁️'}
            </button>
          </div>
        )}

        <button
          onClick={tela === 'login' ? handleLogin : handleTrocarSenha}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white w-full py-2 rounded text-sm mb-2"
        >
          {loading ? '🔄 Processando...' : tela === 'login' ? 'Entrar' : 'Atualizar Senha'}
        </button>

        <div className="text-center text-xs text-gray-400">
          {tela === 'login' ? (
            <button onClick={() => setTela('trocar')} className="hover:underline">
              🔑 Trocar Senha
            </button>
          ) : (
            <button onClick={() => setTela('login')} className="hover:underline">
              🔙 Voltar ao Login
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
