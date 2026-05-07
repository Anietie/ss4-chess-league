"use client";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function AuthCallbackLogic() {
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;

    const handleAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          window.location.href = "/auth/login?error=auth_failed";
          return;
        }

        if (!mounted) return;

        // Find matching player
        const { data: player } = await supabase
          .from("players")
          .select("id")
          .eq("email", session.user.email!)
          .maybeSingle();

        if (player?.id) {
          localStorage.setItem("player_id", player.id);
        }

        // Get redirect destination
        const next = searchParams.get("next") ?? "/dashboard";

        // Force full page reload to clear Next.js cache
        window.location.href = next;
      } catch (e) {
        window.location.href = "/auth/login?error=callback_failed";
      }
    };

    handleAuth();

    return () => { mounted = false; };
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink">
      <div className="text-center space-y-4">
        <div className="text-5xl animate-bounce">♟️</div>
        <div className="text-chalk text-lg font-medium">Welcome to SS4 Chess League</div>
        <div className="text-ink-400 text-sm">Setting up your account...</div>
        <div className="flex justify-center gap-1 mt-4">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: "0ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: "200ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: "400ms" }}></div>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-spin">♟</div>
          <div className="text-chalk text-sm">Loading...</div>
        </div>
      </div>
    }>
      <AuthCallbackLogic />
    </Suspense>
  );
}