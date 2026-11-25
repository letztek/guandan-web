/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASSET_REVISIONS?: Record<string, string>
  readonly VITE_MASTER_MODEL?: boolean
}
