/**
 * Build-time configuration — values are baked into the binary at compile time.
 *
 * In Vite, these are exposed via `import.meta.env.VITE_*`.
 * Set them in `.env.local` or pass them via CLI:
 *   VITE_APP_MODE=enterprise VITE_HUB_URL=https://hub.example.com pnpm build
 */

export type AppMode = 'standalone' | 'enterprise'

/** Application mode — decided at build time, immutable at runtime */
export const APP_MODE: AppMode =
    (import.meta.env.VITE_APP_MODE as AppMode) || 'standalone'

/** Enterprise Hub URL — only relevant when APP_MODE === 'enterprise' */
export const HUB_URL: string =
    (import.meta.env.VITE_HUB_URL as string) || ''

/** Brand name override — allows white-labeling for enterprise distributions */
export const BRAND_NAME: string =
    (import.meta.env.VITE_BRAND_NAME as string) || 'AlderCowork'

export const isEnterprise = APP_MODE === 'enterprise'
export const isStandalone = APP_MODE === 'standalone'
