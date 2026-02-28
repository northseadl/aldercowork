/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Application mode — 'standalone' (default) or 'enterprise' */
    readonly VITE_APP_MODE?: string
    /** Enterprise Hub URL — only relevant when VITE_APP_MODE=enterprise */
    readonly VITE_HUB_URL?: string
    /** Brand name override for white-labeling */
    readonly VITE_BRAND_NAME?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
