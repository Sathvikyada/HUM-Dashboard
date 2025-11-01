/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETLIFY_FUNCTIONS_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

