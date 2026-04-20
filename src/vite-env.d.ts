/// <reference types="vite/client" />
declare const __BUILD_TIME__: string;
declare const __GIT_SHA__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
