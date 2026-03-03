/**
 * Build-time configuration — values are baked into the binary at compile time.
 *
 * In Vite, these are exposed via `import.meta.env.VITE_*`.
 * Set them in `.env.local` or pass them via CLI:
 *   VITE_APP_MODE=enterprise pnpm build
 */

export type AppMode = 'standalone' | 'enterprise'

/** Application mode — decided at build time, immutable at runtime */
export const APP_MODE: AppMode =
    (import.meta.env.VITE_APP_MODE as AppMode) || 'standalone'
