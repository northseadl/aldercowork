import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

interface UseDialogA11yOptions {
  open: Ref<boolean>
  containerRef: Ref<HTMLElement | null>
  initialFocusRef?: Ref<HTMLElement | null>
  onEscape?: () => void
}

function isFocusableVisible(element: HTMLElement): boolean {
  if (element.hidden) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function useDialogA11y(options: UseDialogA11yOptions): void {
  let restoreFocusTarget: HTMLElement | null = null
  let listenerAttached = false

  const listFocusableElements = (): HTMLElement[] => {
    const root = options.containerRef.value
    if (!root) return []

    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(isFocusableVisible)
  }

  const restoreFocus = () => {
    if (!restoreFocusTarget) return
    if (!document.contains(restoreFocusTarget)) {
      restoreFocusTarget = null
      return
    }

    restoreFocusTarget.focus({ preventScroll: true })
    restoreFocusTarget = null
  }

  const focusInitialTarget = () => {
    const root = options.containerRef.value
    if (!root) return

    const initialTarget = options.initialFocusRef?.value
    if (initialTarget && isFocusableVisible(initialTarget)) {
      initialTarget.focus({ preventScroll: true })
      return
    }

    const firstFocusable = listFocusableElements()[0]
    if (firstFocusable) {
      firstFocusable.focus({ preventScroll: true })
      return
    }

    root.focus({ preventScroll: true })
  }

  const handleDialogKeydown = (event: KeyboardEvent) => {
    if (!options.open.value) return

    if (event.key === 'Escape') {
      if (options.onEscape) {
        event.preventDefault()
        options.onEscape()
      }
      return
    }

    if (event.key !== 'Tab') return

    const root = options.containerRef.value
    if (!root) return

    const focusableElements = listFocusableElements()
    if (!focusableElements.length) {
      event.preventDefault()
      root.focus({ preventScroll: true })
      return
    }

    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const activeWithinDialog = activeElement ? root.contains(activeElement) : false

    if (event.shiftKey) {
      if (!activeWithinDialog || activeElement === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      }
      return
    }

    if (!activeWithinDialog || activeElement === last) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }

  const attachKeydown = () => {
    if (listenerAttached) return
    document.addEventListener('keydown', handleDialogKeydown)
    listenerAttached = true
  }

  const detachKeydown = () => {
    if (!listenerAttached) return
    document.removeEventListener('keydown', handleDialogKeydown)
    listenerAttached = false
  }

  watch(
    options.open,
    async (isOpen) => {
      if (isOpen) {
        restoreFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
        attachKeydown()
        await nextTick()
        focusInitialTarget()
        return
      }

      detachKeydown()
      restoreFocus()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    detachKeydown()
    restoreFocus()
  })
}
