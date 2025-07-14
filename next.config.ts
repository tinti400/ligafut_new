import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    domains: [
      'via.placeholder.com',
      'cdn.sofifa.net',
      'cdn-icons-png.flaticon.com' // ✅ novo domínio adicionado
    ],
  },
}

export default nextConfig
