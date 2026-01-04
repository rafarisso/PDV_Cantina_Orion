const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const appBaseFromEnv = import.meta.env.VITE_APP_BASE_URL as string | undefined

export const env = {
  supabaseUrl: supabaseUrl ?? '',
  supabaseAnonKey: supabaseAnonKey ?? '',
  appBaseUrl: appBaseFromEnv ?? (typeof window !== 'undefined' ? window.location.origin : ''),
  isDemo: (import.meta.env.VITE_DEMO as string | undefined) === 'true' || !supabaseUrl || !supabaseAnonKey,
  pagSeguroBaseUrl:
    (import.meta.env.VITE_PAGSEGURO_BASE_URL as string | undefined) ?? 'https://pix.api.pagseguro.com',
}
