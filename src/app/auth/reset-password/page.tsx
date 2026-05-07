"use client";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function ResetPasswordLogic() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkSession() {
      // Supabase puts the token in the URL hash fragment
      // We need to wait for Supabase to process it
      
      // Check immediately
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setHasSession(true);
        setCheckingSession(false);
        return;
      }

      // Hash might not be processed yet — wait and retry
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        // Supabase auth listener will process this automatically
        // Wait for it
        await new Promise(r => setTimeout(r, 1500));
        
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          setHasSession(true);
          setCheckingSession(false);
          return;
        }
      }

      // Not from a valid reset link
      setCheckingSession(false);
    }
    
    checkSession();
  }, []);

  const handleReset = async () => {
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setSuccess(true);
    
    await supabase.auth.signOut();
    
    setTimeout(() => {
      window.location.href = '/auth/login';
    }, 3000);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-spin">♟</div>
          <div className="text-chalk text-sm">Verifying your reset link...</div>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h1 className="font-display text-xl font-bold text-chalk">Invalid or Expired Link</h1>
          <p className="text-ink-400 text-sm">
            This password reset link is invalid or has expired. Please request a new one from the sign in page.
          </p>
          <a href="/auth/login" className="btn-gold inline-block">Request New Link</a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h1 className="font-display text-xl font-bold text-chalk">Password Updated!</h1>
          <p className="text-ink-400 text-sm">Your password has been changed. Redirecting to sign in...</p>
          <a href="/auth/login" className="btn-gold inline-block">Sign In Now</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-board-pattern">
      <div className="card p-8 w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">🔒</div>
          <h1 className="font-display text-2xl font-bold text-chalk">Set New Password</h1>
          <p className="text-ink-400 text-sm">Enter your new password below.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="section-label block mb-1.5">New Password</label>
            <input className="input" type="password" placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="section-label block mb-1.5">Confirm New Password</label>
            <input className="input" type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleReset()} />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={handleReset} disabled={loading || !password || !confirmPassword} className="btn-gold w-full disabled:opacity-50">
          {loading ? 'Updating...' : 'Set New Password'}
        </button>

        <p className="text-center text-xs text-ink-500">
          <a href="/auth/login" className="text-orange-400 hover:underline">← Back to Sign In</a>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <div className="text-4xl animate-spin">♟</div>
      </div>
    }>
      <ResetPasswordLogic />
    </Suspense>
  );
}