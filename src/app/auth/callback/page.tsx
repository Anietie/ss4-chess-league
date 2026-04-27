"use client";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// 1. We move the logic that uses useSearchParams into its own component
function AuthCallbackLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Try to find matching player record and store player_id locally
        const { data: player } = await supabase
          .from("players")
          .select("id")
          .eq("email", session.user.email!)
          .single();
        if (player) localStorage.setItem("player_id", player.id);

        const next = searchParams.get("next") ?? "/dashboard";
        router.replace(next);
      }
    });
    return () => subscription.unsubscribe();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl animate-spin">♟</div>
        <div className="text-chalk text-sm">Signing you in…</div>
      </div>
    </div>
  );
}

// 2. We wrap that component in Suspense so Next.js can build the page successfully
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-4xl animate-spin">♟</div>
            <div className="text-chalk text-sm">Preparing...</div>
          </div>
        </div>
      }
    >
      <AuthCallbackLogic />
    </Suspense>
  );
}
