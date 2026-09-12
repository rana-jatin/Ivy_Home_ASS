/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IVY_BASE_URL: string;
  readonly VITE_IVY_API_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
