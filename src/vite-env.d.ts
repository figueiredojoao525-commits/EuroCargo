/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy anon key; used only when VITE_SUPABASE_PUBLISHABLE_KEY is not set. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_CONTACT_EMAIL?: string
  readonly VITE_CONTACT_PHONE?: string
  /** Public WhatsApp business numbers per country, international format, digits only. */
  readonly VITE_WHATSAPP_PT?: string
  readonly VITE_WHATSAPP_ES?: string
  /** 'external' = licensed catalogue via the catalog-external Edge Function (falls back to local). */
  readonly VITE_CATALOG_PROVIDER?: 'local' | 'external'
  /** 'external' = AI provider via the ai-assistant Edge Function (falls back to local). */
  readonly VITE_AI_PROVIDER?: 'local' | 'external'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
