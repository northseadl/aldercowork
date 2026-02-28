import { onMounted, onUnmounted } from 'vue'

type KeyboardHandlers = Record<string, () => void>

export function useKeyboard(handlers: KeyboardHandlers) {
  function onKeydown(event: KeyboardEvent) {
    if (!event.metaKey && !event.ctrlKey) {
      return
    }

    const handler = handlers[event.key]
    if (!handler) {
      return
    }

    event.preventDefault()
    handler()
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
  })
}
