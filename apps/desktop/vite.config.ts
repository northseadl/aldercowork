import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      // @opencode-ai/sdk ships server.js that imports node:child_process.
      // We only use the client side — mark all node: imports as external.
      external: (id) => id.startsWith('node:'),
    },
  },
})
