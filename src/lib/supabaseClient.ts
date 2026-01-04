import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | null = null

if (env.supabaseUrl && env.supabaseAnonKey) {
  client = createClient(env.supabaseUrl, env.supabaseAnonKey)
}

export const supabase = client

export const hasSupabase = () => Boolean(client)
