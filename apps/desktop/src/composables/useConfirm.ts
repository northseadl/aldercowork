import { ref } from 'vue'

import type { PermissionDecision, PermissionRequest } from '../services/stream/types'

// ---------------------------------------------------------------------------
// Programmatic confirm/permission dialog — replaces window.confirm
// ---------------------------------------------------------------------------

export type ConfirmDecision = 'confirm' | 'cancel'

interface ConfirmRequest {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'danger'
}

interface PendingConfirm {
    request: ConfirmRequest
    resolve: (decision: ConfirmDecision) => void
}

interface PendingPermission {
    request: PermissionRequest
    resolve: (decision: PermissionDecision) => void
}

// Singleton state — shared across all consumers via useConfirm()
const pendingConfirm = ref<PendingConfirm | null>(null)
const pendingPermission = ref<PendingPermission | null>(null)

/**
 * Programmatic confirm dialog composable.
 *
 * Usage:
 *   const { confirm, confirmPermission } = useConfirm()
 *   const ok = await confirm({ title, message })        // 'confirm' | 'cancel'
 *   const perm = await confirmPermission({ title, ... }) // 'once' | 'always' | 'reject'
 */
export function useConfirm() {
    function confirm(request: ConfirmRequest): Promise<ConfirmDecision> {
        return new Promise((resolve) => {
            pendingConfirm.value = { request, resolve }
        })
    }

    function resolveConfirm(decision: ConfirmDecision) {
        if (pendingConfirm.value) {
            pendingConfirm.value.resolve(decision)
            pendingConfirm.value = null
        }
    }

    function confirmPermission(request: PermissionRequest): Promise<PermissionDecision> {
        return new Promise((resolve) => {
            pendingPermission.value = { request, resolve }
        })
    }

    function resolvePermission(decision: PermissionDecision) {
        if (pendingPermission.value) {
            pendingPermission.value.resolve(decision)
            pendingPermission.value = null
        }
    }

    return {
        // State (for dialog components to read)
        pendingConfirm,
        pendingPermission,

        // Producers (for calling code to open dialogs)
        confirm,
        confirmPermission,

        // Consumers (for dialog components to resolve)
        resolveConfirm,
        resolvePermission,
    }
}

export type { ConfirmRequest, PermissionRequest }
