// src/lib/supabase-server.ts
import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Missing Supabase env vars");
  process.exit(1);
}

// At this point TypeScript knows url and key are strings
export function createServerClient() {
  return createClient(url as string, key as string, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}