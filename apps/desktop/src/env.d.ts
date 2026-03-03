/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Application mode — 'standalone' (default) or 'enterprise' */
    readonly VITE_APP_MODE?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
