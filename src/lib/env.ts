const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const appBaseFromEnv = import.meta.env.VITE_APP_BASE_URL as string | undefined
const isDemo = (import.meta.env.VITE_DEMO as string | undefined) === 'true'
const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)

export const env = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
  appBaseUrl: appBaseFromEnv ?? (typeof window !== 'undefined' ? window.location.origin : ''),
  isDemo,
  supabaseReady,
  configError: !isDemo && !supabaseReady,
  pagSeguroBaseUrl:
    (import.meta.env.VITE_PAGSEGURO_BASE_URL as string | undefined) ?? 'https://pix.api.pagseguro.com',
}
