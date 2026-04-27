import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * True singleton pattern for browser client
 * - Only created once when first accessed in browser
 * - All imports share the same instance
 * - Prevents multiple GoTrueClient instances competing for storage
 */
let browserClient: SupabaseClient | null = null;

function createBrowserClient(): SupabaseClient {
  if (browserClient === null) {
    browserClient = createClient(url, anon);
  }
  return browserClient;
}

// Export singleton - in browser, returns same instance every time
// In server, evaluated at build time (or returns null in SSR context)
export const supabase: SupabaseClient =
  typeof window !== "undefined"
    ? createBrowserClient()
    : (createClient(url, anon) as SupabaseClient);

/**
 * Server-side client with service role key
 * Creates new instance each time (each API route gets fresh instance)
 */
export function createServerClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
