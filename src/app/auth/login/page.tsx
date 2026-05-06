'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function LoginLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/dashboard';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
  // NEW: Cooldown timer state
  const [countdown, setCountdown] = useState(0);

  // NEW: Timer logic that ticks down every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleLogin = async () => {
    if (!email || !password) { 
      setError('Enter your email and password.'); 
      return; 
    }
    setLoading(true); 
    setError('');

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    
    if (err) {
      setLoading(false);
      if (err.message.includes('Invalid login credentials')) {
        setError('Wrong email or password.');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Please verify your email first. Check your inbox for a confirmation link.');
      } else {
        setError(err.message);
      }
      return;
    }

    if (data.user) {
      // Check if player record exists
      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('id, is_active')
        .eq('email', data.user.email!)
        .maybeSingle();

      if (playerError || !player) {
        // Player record doesn't exist — sign them out and show helpful message
        await supabase.auth.signOut();
        setLoading(false);
        setError(
          'Your account was not found in the league database. ' +
          'This may happen if your registration was removed. ' +
          'Please register again to join the league.'
        );
        // Show register link
        return;
      }

      if (!player.is_active) {
        await supabase.auth.signOut();
        setLoading(false);
        setError(
          'Your account has been deactivated. ' +
          'Please contact a League Officer to reactivate your account.'
        );
        return;
      }

      localStorage.setItem('player_id', player.id);
      
      // Use router.push instead of router.replace for more reliable navigation
      setLoading(false);
      router.push(next);
    }
  };

  const handleReset = async () => {
    if (!email) { setError('Enter your email address first.'); return; }
    if (countdown > 0) return; // Prevent clicking while counting down
    
    setLoading(true); setError('');
    
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    
    setLoading(false);
    
    if (err) { 
      // Catch Supabase's native rate limit error just in case
      if (err.status === 429) {
        setError('Please wait a minute before requesting another link.');
        setCountdown(60);
      } else {
        setError(err.message); 
      }
      return; 
    }
    
    setResetSent(true);
    setCountdown(60); // Start the 60-second cooldown
  };

  if (showReset) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-board-pattern">
      <div className="card p-8 w-full max-w-sm space-y-5">
        <button onClick={() => { setShowReset(false); setResetSent(false); }} className="text-ink-400 hover:text-chalk text-sm flex items-center gap-1">← Back to login</button>
        <div className="text-center space-y-1">
          <div className="text-3xl">🔑</div>
          <h2 className="font-display text-xl font-bold text-chalk">Reset Password</h2>
        </div>
        {resetSent ? (
          <div className="card p-4 bg-green-900/20 border-green-700/50 text-sm text-chalk text-center">
            Reset link sent to <strong className="text-gold">{email}</strong>.<br/>
            <span className="text-ink-400 text-xs">Check your inbox.</span>
          </div>
        ) : (
          <>
            <input id="reset-email" name="email" autoComplete="email" className="input" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </>
        )}
        
        {/* UPDATED: Button now respects the countdown */}
        <button 
          onClick={handleReset} 
          disabled={loading || countdown > 0} 
          className="btn-gold w-full disabled:opacity-50"
        >
          {loading ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : resetSent ? 'Send Again' : 'Send Reset Link'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-board-pattern">
      <div className="card p-8 w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">Sign In</h1>
          <p className="text-ink-400 text-sm">SS4 Chess League</p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="login-email" className="section-label block mb-1.5">Email</label>
            <input id="login-email" name="email" autoComplete="email" className="input" type="email" placeholder="your@email.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
          </div>
          <div>
            <label htmlFor="login-password" className="section-label block mb-1.5">Password</label>
            <input id="login-password" name="password" autoComplete="current-password" className="input" type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>}

        <button onClick={handleLogin} disabled={loading || !email || !password} className="btn-gold w-full disabled:opacity-50">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="flex items-center justify-between text-xs text-ink-500">
          <button onClick={() => { setShowReset(true); setError(''); setCountdown(0); }} className="hover:text-ink-300 transition-colors">Forgot password?</button>
          <Link href="/register" className="text-gold hover:underline">Create account</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4 bg-board-pattern">
        <div className="card p-8 w-full max-w-sm text-center">
          <div className="text-4xl animate-spin mb-4">♟</div>
          <div className="text-chalk text-sm">Loading login...</div>
        </div>
      </div>
    }>
      <LoginLogic />
    </Suspense>
  );
}