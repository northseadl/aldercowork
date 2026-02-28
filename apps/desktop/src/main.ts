import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import './design/index.css'
import router from './router'

const RUNTIME_ERROR_EVENT = 'aldercowork:runtime-error'

type RuntimeErrorSource = 'vue' | 'window' | 'promise' | 'router'

interface RuntimeErrorDetail {
  source: RuntimeErrorSource
  message: string
  stack?: string
  timestamp: string
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string' && error.trim()) return new Error(error)
  try {
    return new Error(JSON.stringify(error))
  } catch {
    return new Error('Unknown runtime error')
  }
}

function emitRuntimeError(detail: RuntimeErrorDetail) {
  window.dispatchEvent(
    new CustomEvent<RuntimeErrorDetail>(RUNTIME_ERROR_EVENT, {
      detail,
    }),
  )
}

function reportRuntimeError(source: RuntimeErrorSource, error: unknown, info?: unknown) {
  const normalized = normalizeError(error)
  console.error(`[runtime:${source}]`, normalized, info)

  emitRuntimeError({
    source,
    message: normalized.message || 'Unknown runtime error',
    stack: normalized.stack,
    timestamp: new Date().toISOString(),
  })
}

const rootElement = document.documentElement
if (!rootElement.dataset.theme) {
  rootElement.dataset.theme = 'dark'
}

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
