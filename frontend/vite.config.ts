import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const rootEnvDir = new URL('..', import.meta.url).pathname

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, '')
  const apiUrl = env.VITE_API_URL || 'http://127.0.0.1:3000'
  const allowedHosts = ['portalescarlate.com.br', 'api.portalescarlate.com.br']

  return {
    plugins: [react()],
    envDir: rootEnvDir,
    server: {
      allowedHosts,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
    preview: {
      allowedHosts,
    },
  }
})
