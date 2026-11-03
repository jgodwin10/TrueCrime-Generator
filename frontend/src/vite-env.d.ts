/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL, e.g. https://biography-api.onrender.com/api */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
