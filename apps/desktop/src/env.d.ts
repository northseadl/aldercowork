/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Application mode — 'standalone' (default) or 'enterprise' */
    readonly VITE_APP_MODE?: string
    readonly VITE_OPEN_SOURCE_SKILL_CATALOG_URL?: string
    readonly VITE_ENTERPRISE_HUB_URL?: string
    readonly VITE_ENTERPRISE_SKILL_CATALOG_PATH?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
