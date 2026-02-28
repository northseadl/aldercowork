import { ref } from 'vue'

export interface ToastData {
    id: string
    message: string
    type?: 'success' | 'error' | 'info'
    duration?: number
}

// Global state for toasts
const toasts = ref<ToastData[]>([])

let toastIdCounter = 0

export function useToast() {
    const addToast = (message: string, options: { type?: ToastData['type']; duration?: number } = {}) => {
        const id = `toast-${++toastIdCounter}`
        const duration = options.duration ?? 3000

        toasts.value.push({
            id,
            message,
            type: options.type ?? 'info',
            duration,
        })

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id)
            }, duration)
        }

        return id
    }

    const success = (message: string, duration?: number) => addToast(message, { type: 'success', duration })
    const error = (message: string, duration?: number) => addToast(message, { type: 'error', duration })
    const info = (message: string, duration?: number) => addToast(message, { type: 'info', duration })

    const removeToast = (id: string) => {
        const index = toasts.value.findIndex((t) => t.id === id)
        if (index > -1) {
            toasts.value.splice(index, 1)
        }
    }

    return {
        toasts,
        addToast,
        success,
        error,
        info,
        removeToast,
    }
}
