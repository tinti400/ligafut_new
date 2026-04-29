'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Tela = 'login' | 'trocar'

export default function LoginPage() {
  const router = useRouter()

  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [tela, setTela] = useState<Tela>('login')
  const [showSenha, setShowSenha] = useState(false)
  const [showNovaSenha, setShowNovaSenha] = useState(false)

  useEffect(() => {
    localStorage.removeItem('user')
    localStorage.removeItem('id_time')
    localStorage.removeItem('nome_time')
  }, [])

  const limparTexto = (valor: string) => valor.trim().toLowerCase()

  const salvarSessao = (userData: any, timeData: any) => {
    const admin = userData.administrador === true

    const sessao = {
      usuario_id: userData.id,
      time_id: timeData.id,
      id_time: timeData.id,
      nome_time: timeData.nome,
      usuario: userData.usuario,
      nome: userData.usuario?.toLowerCase(),
      email: userData.usuario?.toLowerCase(),

      administrador: admin,
      isAdmin: admin,
      admin: admin,
    }

    localStorage.setItem('user', JSON.stringify(sessao))
    localStorage.setItem('id_time', String(timeData.id))
    localStorage.setItem('time_id', String(timeData.id))
    localStorage.setItem('nome_time', String(timeData.nome))
    localStorage.setItem('admin', admin ? 'true' : 'false')
    localStorage.setItem('isAdmin', admin ? 'true' : 'false')
  }

  const handleLogin = async () => {
    const usuarioLimpo = limparTexto(usuario)
    const senhaLimpa = senha.trim()

    if (!usuarioLimpo || !senhaLimpa) {
      alert('⚠️ Preencha usuário e senha!')
      return
    }

    setLoading(true)

    try {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('usuario', usuarioLimpo)
        .eq('senha', senhaLimpa)
        .single()

      if (error || !userData) {
        alert('❌ Usuário ou senha inválidos!')
        return
      }

      if (!userData.time_id) {
        alert('❌ Este usuário ainda não está vinculado a um time.')
        return
      }

      const { data: timeData, error: timeError } = await supabase
        .from('times')
        .select('*')
        .eq('id', userData.time_id)
        .single()

      if (timeError || !timeData) {
        alert('❌ Seu time não foi encontrado.')
        return
      }

      salvarSessao(userData, timeData)

      alert(`✅ Bem-vindo ao LigaFut, ${timeData.nome}!`)
      router.push('/')
    } catch (err) {
      console.error('Erro ao fazer login:', err)
      alert('❌ Ocorreu um erro ao tentar fazer login.')
    } finally {
      setLoading(false)
    }
  }

  const handleTrocarSenha = async () => {
    const usuarioLimpo = limparTexto(usuario)
    const senhaLimpa = senha.trim()
    const novaSenhaLimpa = novaSenha.trim()

    if (!usuarioLimpo || !senhaLimpa || !novaSenhaLimpa) {
      alert('⚠️ Preencha todos os campos!')
      return
    }

    if (novaSenhaLimpa.length < 4) {
      alert('⚠️ A nova senha precisa ter pelo menos 4 caracteres.')
      return
    }

    setLoading(true)

    try {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('usuario', usuarioLimpo)
        .eq('senha', senhaLimpa)
        .single()

      if (error || !userData) {
        alert('❌ Usuário ou senha atual inválidos!')
        return
      }

      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ senha: novaSenhaLimpa })
        .eq('id', userData.id)

      if (updateError) {
        console.error('Erro ao atualizar senha:', updateError)
        alert('❌ Erro ao atualizar a senha.')
        return
      }

      alert('✅ Senha atualizada com sucesso!')
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

  const executarEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      tela === 'login' ? handleLogin() : handleTrocarSenha()
    }
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#0f9f5f33,transparent_35%),radial-gradient(circle_at_bottom,#0ea5e933,transparent_30%)]" />

      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(45deg,#ffffff_1px,transparent_1px)] bg-[length:22px_22px]" />

      <section className="relative w-full max-w-[390px] rounded-[28px] border border-white/10 bg-white/10 backdrop-blur-xl shadow-[0_30px_90px_rgba(0,0,0,0.65)] overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-lime-400 to-cyan-400" />

        <div className="p-7">
          <div className="text-center mb-7">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <span className="text-2xl font-black text-black">LF</span>
            </div>

            <h1 className="text-2xl font-black tracking-tight">
              {tela === 'login' ? 'Login LigaFut' : 'Trocar Senha'}
            </h1>

            <p className="mt-2 text-sm text-white/60">
              {tela === 'login'
                ? 'Entre para gerenciar seu clube, elenco e mercado.'
                : 'Atualize sua senha com segurança.'}
            </p>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Usuário / e-mail"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              onKeyDown={executarEnter}
              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
            />

            <div className="relative">
              <input
                type={showSenha ? 'text' : 'password'}
                placeholder="Senha atual"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={executarEnter}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pr-12 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              />

              <button
                type="button"
                onClick={() => setShowSenha(!showSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white"
              >
                {showSenha ? '🙈' : '👁️'}
              </button>
            </div>

            {tela === 'trocar' && (
              <div className="relative">
                <input
                  type={showNovaSenha ? 'text' : 'password'}
                  placeholder="Nova senha"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  onKeyDown={executarEnter}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 pr-12 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />

                <button
                  type="button"
                  onClick={() => setShowNovaSenha(!showNovaSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-white/60 hover:text-white"
                >
                  {showNovaSenha ? '🙈' : '👁️'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={tela === 'login' ? handleLogin : handleTrocarSenha}
              disabled={loading}
              className={[
                'w-full rounded-2xl py-3 text-sm font-black transition-all shadow-lg',
                loading
                  ? 'bg-gray-600 text-white/70 cursor-not-allowed'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02] shadow-emerald-500/25',
              ].join(' ')}
            >
              {loading
                ? 'Processando...'
                : tela === 'login'
                  ? 'Entrar no LigaFut'
                  : 'Atualizar senha'}
            </button>
          </div>

          <div className="mt-5 text-center">
            {tela === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setTela('trocar')
                  setSenha('')
                  setNovaSenha('')
                }}
                className="text-xs text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                Trocar minha senha
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTela('login')
                  setSenha('')
                  setNovaSenha('')
                }}
                className="text-xs text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                Voltar ao login
              </button>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
            <p className="text-[11px] leading-relaxed text-white/55 text-center">
              Ao entrar, o sistema salva seu time, usuário e permissões de administrador
              para liberar os menus corretos.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}