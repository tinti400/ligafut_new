// src/lib/supabase-browser.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare global {
  // evita recriar em hot-reload
  // eslint-disable-next-line no-var
  var __supabase__: SupabaseClient | undefined;
}

export const supabase =
  globalThis.__supabase__ ??
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'ligafut_auth_v1',
      },
    }
  );

if (typeof window !== 'undefined') {
  globalThis.__supabase__ = supabase;
}
