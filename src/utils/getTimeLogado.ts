export function getTimeLogado() {
  if (typeof window === 'undefined') {
    return {
      id_time: null,
      nome_time: null,
      user: null,
    }
  }

  let user: any = null

  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
    user = raw ? JSON.parse(raw) : null
  } catch {
    user = null
  }

  const id_time =
    localStorage.getItem('id_time') ||
    localStorage.getItem('time_id') ||
    user?.id_time ||
    user?.time_id ||
    user?.time?.id ||
    null

  const nome_time =
    localStorage.getItem('nome_time') ||
    localStorage.getItem('time_nome') ||
    user?.nome_time ||
    user?.time_nome ||
    user?.nome ||
    null

  return {
    id_time,
    nome_time,
    user,
  }
}