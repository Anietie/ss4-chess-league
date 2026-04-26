'use client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Step = 'form' | 'verify' | 'calibrating' | 'done';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]     = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [result, setResult] = useState<any>(null);
  
  // Cooldown timer state
  const [countdown, setCountdown] = useState(0);

  const [form, setForm] = useState({
    full_name:          '',
    email:              '',
    password:           '',
    confirm_password:   '',
    chess_com_username: '',
    lichess_username:   '',
    whatsapp_number:    '',
    year_started_chess: '',
  });

  // Timer logic that ticks down every second
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.full_name || !form.email || !form.password) {
      setError('Name, email, and password are required.'); return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.'); return;
    }

    setLoading(true); setError('');
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:          form.full_name,
          email:              form.email,
          password:           form.password,
          chess_com_username: form.chess_com_username || undefined,
          lichess_username:   form.lichess_username   || undefined,
          whatsapp_number:    form.whatsapp_number    || undefined,
          year_started_chess: form.year_started_chess ? Number(form.year_started_chess) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed.'); setLoading(false); return; }
      setResult(data);
      localStorage.setItem('player_id', data.player_id);
      setStep(data.needs_calibration ? 'calibrating' : 'verify');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Handle resending the confirmation email
  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true); setError('');

    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: form.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);

    if (err) {
      if (err.status === 429) {
        setError('Please wait a minute before requesting another link.');
        setCountdown(60);
      } else {
        setError(err.message);
      }
      return;
    }

    setCountdown(60); // Start the 60-second cooldown
  };

  // ── Check your email (Skipping Calibration) ─────────────────────────────────
  if (step === 'verify') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-md text-center space-y-6">
        <div className="text-5xl">📧</div>
        <h1 className="font-display text-2xl font-bold text-chalk">Check Your Email</h1>
        <p className="text-ink-300 text-sm">
          We sent a confirmation link to <strong className="text-gold">{form.email}</strong>.
          Click it to verify your account, then sign in.
        </p>
        
        {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 text-left">{error}</p>}

        {result?.seed_rating && (
          <div className="card p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-400">Seed Rating</span><span className="font-mono font-bold text-gold">{result.seed_rating}</span></div>
            <div className="flex justify-between"><span className="text-ink-400">Source</span><span className="text-ink-300 capitalize">{result.seed_source?.replace(/_/g, ' ')}</span></div>
          </div>
        )}
        
        <div className="space-y-3 pt-2">
          <button 
            onClick={handleResend} 
            disabled={loading || countdown > 0} 
            className="btn-ghost w-full disabled:opacity-50"
          >
            {loading ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend Confirmation Email'}
          </button>
          
          <button onClick={() => router.push('/auth/login')} className="btn-gold w-full">
            Go to Sign In
          </button>
        </div>
        
        <p className="text-xs text-ink-500">
          Didn't receive it? Check spam, or{' '}
          <button onClick={() => setStep('form')} className="text-gold hover:underline">try a different email</button>.
        </p>
      </div>
    </div>
  );

  // ── Calibration required ────────────────────────────────────────────────────
  if (step === 'calibrating') return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-md text-center space-y-6">
        <div className="text-5xl">📧</div>
        <h1 className="font-display text-2xl font-bold text-chalk">Verify Your Email</h1>
        <p className="text-ink-300 text-sm">
          We sent a confirmation link to <strong className="text-gold">{form.email}</strong>.
        </p>
        
        {error && <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 text-left">{error}</p>}

        <div className="card p-4 text-left space-y-2 text-sm text-ink-300">
          <div className="flex items-start gap-2"><span className="text-gold font-bold">1.</span> <span>Click the confirmation link in your email</span></div>
          <div className="flex items-start gap-2"><span className="text-gold font-bold">2.</span> <span>Sign in to your new account</span></div>
          <div className="flex items-start gap-2"><span className="text-gold font-bold">3.</span> <span>Complete 5 bot calibration games to set your rating</span></div>
        </div>
        
        <p className="text-ink-500 text-xs">
          Because no Chess.com or Lichess account was found, you must calibrate your rating before entering the draft.
        </p>

        <div className="space-y-3 pt-2">
          <button 
            onClick={handleResend} 
            disabled={loading || countdown > 0} 
            className="btn-ghost w-full disabled:opacity-50"
          >
            {loading ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend Confirmation Email'}
          </button>
          
          {/* FIXED: This now properly forces them to log in before playing the bot */}
          <button onClick={() => router.push('/auth/login')} className="btn-gold w-full">
            Go to Sign In &rarr;
          </button>
        </div>
      </div>
    </div>
  );

  // ── Registration form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="card p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">Create Account</h1>
          <p className="text-ink-400 text-sm mt-1">SS4 Chess League - Season Registration</p>
        </div>

        <div className="space-y-4">
          {/* Required fields */}
          <div>
            <label className="section-label block mb-1.5">Full Name *</label>
            <input className="input" placeholder="Your full name" value={form.full_name} onChange={set('full_name')} />
          </div>
          <div>
            <label className="section-label block mb-1.5">Email Address *</label>
            <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="section-label block mb-1.5">Password *</label>
            <input className="input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} />
          </div>
          <div>
            <label className="section-label block mb-1.5">Confirm Password *</label>
            <input className="input" type="password" placeholder="Repeat password" value={form.confirm_password} onChange={set('confirm_password')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {/* Optional fields */}
          <div className="border-t border-ink-700 pt-4">
            <p className="text-xs text-ink-400 mb-3">Optional - helps us seed your rating automatically</p>
            <div className="space-y-3">
              <div>
                <label className="section-label block mb-1.5">Chess.com Username <span className="text-ink-500 normal-case">(for rating seed)</span></label>
                <input className="input" placeholder="username" value={form.chess_com_username} onChange={set('chess_com_username')} />
              </div>
              <div>
                <label className="section-label block mb-1.5">Lichess Username <span className="text-ink-500 normal-case">(alternative)</span></label>
                <input className="input" placeholder="username" value={form.lichess_username} onChange={set('lichess_username')} />
              </div>
              <div>
                <label className="section-label block mb-1.5">WhatsApp Number <span className="text-ink-500 normal-case">(for announcements)</span></label>
                <input className="input" placeholder="+234..." value={form.whatsapp_number} onChange={set('whatsapp_number')} />
              </div>
              <div>
                <label className="section-label block mb-1.5">Year You Started Playing Chess</label>
                <input className="input" type="number" placeholder="e.g. 2020" min="1900" max="2030" value={form.year_started_chess} onChange={set('year_started_chess')} />
              </div>
            </div>
          </div>
        </div>

        {/* Rating seed explainer */}
        <div className="card p-3 text-xs text-ink-400 space-y-0.5 bg-ink-900">
          <div className="text-chalk font-medium mb-1">How rating seeding works</div>
          <div>• Chess.com / Lichess rapid rating &rarr; instant seed, skip calibration</div>
          <div>• No platform account &rarr; 5 bot calibration games after registration</div>
          <div>• All ratings shown as <span className="font-mono text-gold">1234?</span> until 5 SS4 league games played</div>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
        )}

        <button onClick={handleSubmit} disabled={loading} className="btn-gold w-full disabled:opacity-50">
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-center text-xs text-ink-500">
          Already registered?{' '}
          <a href="/auth/login" className="text-gold hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}