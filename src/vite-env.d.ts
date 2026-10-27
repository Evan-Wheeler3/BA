/// <reference types="vite/client" />

declare const __APP_BUILD__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
}
