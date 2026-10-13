import { createClient } from '@supabase/supabase-js';

let client;

// Server-only client using the service-role key. NEVER import this from src/.
export function getAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
