"use client";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AuthCallbackLogic() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const handleAuth = async () => {
      try {
        // First check if we have a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          // Try to exchange the code from the URL
          const code = searchParams.get('code');
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('Exchange error:', exchangeError);
              if (mounted) setError('Failed to verify email. Please try again.');
              return;
            }
          } else {
            // No session and no code — redirect to login
            window.location.href = '/auth/login?error=missing_confirmation';
            return;
          }
        }

        if (!mounted) return;

        // Now we should have a session — get the user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          window.location.href = '/auth/login?error=user_not_found';
          return;
        }

        // Find matching player and store their ID
        const { data: player } = await supabase
          .from("players")
          .select("id")
          .eq("email", user.email!)
          .maybeSingle();

        if (player?.id) {
          localStorage.setItem("player_id", player.id);
        }

        // Get redirect destination
        const next = searchParams.get("next") ?? "/dashboard";
        
        // Force full page reload to clear cache
        window.location.href = next;

      } catch (e) {
        console.error('Callback error:', e);
        if (mounted) setError('Something went wrong. Please try signing in.');
      }
    };

    handleAuth();

    return () => { mounted = false; };
  }, [searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <div className="card p-8 max-w-sm text-center space-y-4">
          <div className="text-4xl">❌</div>
          <div className="text-chalk font-medium">{error}</div>
          <a href="/auth/login" className="btn-gold inline-block">Go to Sign In</a>
        </div>
      </div>
    );
  }

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