'use client';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email) return;
    setLoading(true); setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">Sign In</h1>
          <p className="text-ink-400 text-sm mt-1">SS4 Chess League</p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <div className="text-3xl">📧</div>
            <p className="text-chalk text-sm">Magic link sent to <strong>{email}</strong>.</p>
            <p className="text-ink-400 text-xs">Check your email and click the link to sign in.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="section-label block mb-1.5">Email Address</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="your@email.com" className="input" autoFocus
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleLogin} disabled={loading || !email} className="btn-gold w-full disabled:opacity-50">
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>
            <p className="text-center text-xs text-ink-500">
              Not registered?{' '}
              <a href="/register" className="text-gold hover:underline">Register for Season 1</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}