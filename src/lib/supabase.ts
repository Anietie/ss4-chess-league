import { createBrowserClient as ssrCreateBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser singleton using @supabase/ssr's createBrowserClient.
 * Stores the session in cookies (not localStorage) so the middleware
 * can read it server-side via request.cookies — fixing the redirect loop
 * where signInWithPassword succeeded but the middleware still saw no session.
 */
let browserClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = ssrCreateBrowserClient(url, anon) as unknown as SupabaseClient;
  }
  return browserClient;
}

export const supabase: SupabaseClient =
  typeof window !== "undefined"
    ? getBrowserClient()
    : (createClient(url, anon) as SupabaseClient);

/**
 * Server-side admin client with service role key.
 * Creates a fresh instance per call (stateless, no cookie/session management).
 */
export function createServerClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}