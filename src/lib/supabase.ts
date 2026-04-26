import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton pattern - only created when first accessed, not at module load time
let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  // Only use singleton in browser environment
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createClient(url, anon);
    }
    return browserClient;
  }
  // Server-side: always create new instance
  return createClient(url, anon);
}

// Lazy getter for backwards compatibility - doesn't create client until first access
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => getSupabaseClient()[prop as keyof SupabaseClient],
}) as SupabaseClient;

export function createServerClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
