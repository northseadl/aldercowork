/**
 * Build-time configuration — values are baked into the binary at compile time.
 *
 * In Vite, these are exposed via `import.meta.env.VITE_*`.
 * Set them in `.env.local` or pass them via CLI:
 *   VITE_APP_MODE=enterprise pnpm build
 */

export type AppMode = 'standalone' | 'enterprise'

/** Startup hint only. Runtime identity now comes from the active profile registry. */
export const APP_MODE: AppMode =
    (import.meta.env.VITE_APP_MODE as AppMode) || 'standalone'

export interface MarketplaceBuildConfig {
    openSourceCatalogUrl: string
    enterpriseCatalogPath: string
}

export const MARKETPLACE_BUILD_CONFIG: MarketplaceBuildConfig = {
    openSourceCatalogUrl: import.meta.env.VITE_OPEN_SOURCE_SKILL_CATALOG_URL || '',
    enterpriseCatalogPath: import.meta.env.VITE_ENTERPRISE_SKILL_CATALOG_PATH || '/api/skills/catalog',
}
