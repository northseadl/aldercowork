import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import './design/index.css'
import router from './router'
import { RUNTIME_ERROR_EVENT, type RuntimeErrorDetail, type RuntimeErrorSource } from './types'

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string' && error.trim()) return new Error(error)
  try {
    return new Error(JSON.stringify(error))
  } catch {
    return new Error('Unknown runtime error')
  }
}

function reportRuntimeError(source: RuntimeErrorSource, error: unknown, info?: unknown) {
  const normalized = normalizeError(error)
  console.error(`[runtime:${source}]`, normalized, info)

  window.dispatchEvent(
    new CustomEvent<RuntimeErrorDetail>(RUNTIME_ERROR_EVENT, {
      detail: {
        source,
        message: normalized.message || 'Unknown runtime error',
        stack: normalized.stack,
        timestamp: new Date().toISOString(),
      },
    }),
  )
}

// Theme is initialized by useTheme composable (single-writer pattern).
// The first `useTheme()` call sets up the reactive DOM sync & OS listener.
import { useTheme } from './composables/useTheme'
useTheme()

const app = createApp(App)

app.config.errorHandler = (error, _instance, info) => {
  reportRuntimeError('vue', error, { info })
}

window.addEventListener('error', (event) => {
  reportRuntimeError('window', event.error ?? event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  reportRuntimeError('promise', event.reason)
})

router.onError((error, to) => {
  reportRuntimeError('router', error, { to: to.fullPath })
})

app.use(createPinia())
app.use(router)
app.mount('#app')
