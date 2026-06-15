import { createClient } from '@supabase/supabase-js'
import { getRequiredEnv } from '@/lib/env'
import type { Database } from '@/types/supabase'

// Server-only Supabase client with Service Role Key.
// This bypasses RLS and should ONLY be used in trusted server contexts
// like webhooks (called by external services without user session).
// Lazy initialization to avoid build-time errors when env vars are not set.
let _supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient<Database>(
            getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
            getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY")
        )
    }
    return _supabaseAdmin
}
