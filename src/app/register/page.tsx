"use client";
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Check, GraduationCap, BookOpen, MapPin, AlertCircle } from 'lucide-react';
import { searchSchools, getDepartments } from '@/lib/schools-data';
import type { Institution } from '@/lib/schools-data';

type Step = 'form' | 'verify' | 'calibrating' | 'done';

interface SeasonStatus {
  registration_open: boolean;
  state: 'open' | 'upcoming' | 'closed' | 'always_open';
  message: string;
  season_name: string | null;
  registration_end: string | null;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const [seasonStatus, setSeasonStatus] = useState<SeasonStatus | null>(null);
  const [countdown, setCountdown] = useState(0);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    school: '',
    department: '',
    whatsapp_number: '',
    chess_com_username: '',
    lichess_username: '',
    year_started_chess: '',
  });

  // School & department search state
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schoolSuggestions, setSchoolSuggestions] = useState<School[]>([]);
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [showCustomSchool, setShowCustomSchool] = useState(false);

  const [deptQuery, setDeptQuery] = useState('');
  const [deptSuggestions, setDeptSuggestions] = useState<string[]>([]);
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);

  const schoolInputRef = useRef<HTMLInputElement>(null);
  const schoolDropdownRef = useRef<HTMLDivElement>(null);
  const deptInputRef = useRef<HTMLInputElement>(null);
  const deptDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch season status on mount
  useEffect(() => {
    fetch('/api/season-status')
      .then(r => r.json())
      .then(d => setSeasonStatus(d))
      .catch(() => null);
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // School search suggestions
  useEffect(() => {
    if (schoolQuery.length >= 2) {
      const results = searchSchools(schoolQuery, 8);
      setSchoolSuggestions(results);
      setShowSchoolDropdown(true);
    } else {
      setSchoolSuggestions([]);
      setShowSchoolDropdown(false);
    }
  }, [schoolQuery]);

  // When a school is selected, load its departments
  useEffect(() => {
    if (selectedSchool) {
      setForm(f => ({ ...f, school: selectedSchool.name, department: '' }));
      setDeptQuery('');
      setDeptSuggestions([]);
    }
  }, [selectedSchool]);

  // Department search suggestions (from selected school)
  useEffect(() => {
    if (!selectedSchool) {
      setDeptSuggestions([]);
      setShowDeptDropdown(false);
      return;
    }

    const allDepts = getDepartments(selectedSchool.name);

    if (deptQuery.length >= 1) {
      const filtered = allDepts.filter(d =>
        d.toLowerCase().includes(deptQuery.toLowerCase())
      );
      setDeptSuggestions(filtered.slice(0, 8));
      setShowDeptDropdown(filtered.length > 0);
    } else {
      setDeptSuggestions(allDepts.slice(0, 6));
      setShowDeptDropdown(false);
    }
  }, [deptQuery, selectedSchool]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(e.target as Node) &&
          schoolInputRef.current && !schoolInputRef.current.contains(e.target as Node)) {
        setShowSchoolDropdown(false);
      }
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node) &&
          deptInputRef.current && !deptInputRef.current.contains(e.target as Node)) {
        setShowDeptDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (!form.school.trim()) {
      setError('School/Institution is required.'); return;
    }
    if (!form.department.trim()) {
      setError('Department is required.'); return;
    }
    if (!form.whatsapp_number || !/^(\+234|234|0)[7-9]\d{9}$/.test(form.whatsapp_number.replace(/[\s\-\(\)]/g, ''))) {
      setError('A valid Nigerian WhatsApp number is required (+234, 234, or 0 prefix).');
      return;
    }

    setLoading(true); setError('');
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          school: form.school,
          department: form.department,
          whatsapp_number: form.whatsapp_number.trim(),
          chess_com_username: form.chess_com_username || undefined,
          lichess_username: form.lichess_username || undefined,
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

  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true); setError('');

    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email: form.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`
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

    setCountdown(60);
  };

  const canRegister = seasonStatus?.state === 'open' || seasonStatus?.state === 'always_open';

  // ── Verify Step ──────────────────────────────────────────────────────────
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

  // ── Calibration Step ─────────────────────────────────────────────────────
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

          <button onClick={() => router.push('/auth/login')} className="btn-gold w-full">
            Go to Sign In →
          </button>
        </div>
      </div>
    </div>
  );

  // ── Registration Closed ──────────────────────────────────────────────────
  if (seasonStatus && !canRegister) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 w-full max-w-md text-center space-y-6">
          <div className="text-4xl mb-3">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">
            {seasonStatus.season_name ?? 'SS4 Chess League'}
          </h1>

          <div className="space-y-4">
            {seasonStatus.state === 'upcoming' && (
              <>
                <div className="text-4xl">📅</div>
                <p className="text-ink-300 text-sm">Registration hasn't opened yet.</p>
                <div className="card p-4 bg-blue-900/20 border border-blue-700/50 text-sm text-blue-300">
                  {seasonStatus.message}
                </div>
              </>
            )}

            {seasonStatus.state === 'closed' && (
              <>
                <div className="text-4xl">🔒</div>
                <p className="text-ink-300 text-sm">Registration is currently closed.</p>
                <div className="card p-4 bg-red-900/20 border border-red-700/50 text-sm text-red-300">
                  {seasonStatus.message}
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-ink-500 pt-2">
            Already registered?{' '}
            <a href="/auth/login" className="text-gold hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    );
  }

  // ── Registration Form ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="card p-8 w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">Create Account</h1>

          {seasonStatus && (
            <div className="mt-2">
              <p className="text-ink-400 text-sm">
                {seasonStatus.season_name ?? 'SS4 Chess League'}
              </p>
              {seasonStatus.state === 'open' && seasonStatus.registration_end && (
                <p className="text-xs text-amber-400/80 mt-0.5">
                  ⏳ {seasonStatus.message}
                </p>
              )}
            </div>
          )}
          {!seasonStatus && (
            <p className="text-ink-400 text-sm mt-1">SS4 Chess League</p>
          )}
        </div>

        <div className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="section-label block mb-1.5">Full Name *</label>
            <input className="input" placeholder="Your full name" value={form.full_name} onChange={set('full_name')} />
          </div>

          {/* Email */}
          <div>
            <label className="section-label block mb-1.5">Email Address *</label>
            <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={set('email')} />
          </div>

          {/* School / Institution — SEARCHABLE DROPDOWN */}
          <div>
            <label className="section-label block mb-1.5">School / Institution *</label>

            {!showCustomSchool ? (
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 z-10" />
                  <input
                    ref={schoolInputRef}
                    className="input pl-9 pr-8"
                    placeholder="Search for your school..."
                    value={schoolQuery}
                    onChange={e => {
                      setSchoolQuery(e.target.value);
                      setSelectedSchool(null);
                      setForm(f => ({ ...f, school: e.target.value }));
                    }}
                    onFocus={() => {
                      if (schoolSuggestions.length > 0) setShowSchoolDropdown(true);
                    }}
                  />
                  {schoolQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSchoolQuery('');
                        setSelectedSchool(null);
                        setForm(f => ({ ...f, school: '' }));
                        setSchoolSuggestions([]);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-chalk"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {showSchoolDropdown && (schoolSuggestions.length > 0 || schoolQuery.length >= 3) && (
                  <div
                    ref={schoolDropdownRef}
                    className="absolute z-20 w-full mt-1 bg-ink-800 border border-ink-700 rounded-lg overflow-hidden shadow-xl max-h-64 overflow-y-auto"
                  >
                    {schoolSuggestions.map(school => (
                      <button
                        key={school.name}
                        type="button"
                        onMouseDown={() => {
                          setSelectedSchool(school);
                          setSchoolQuery(school.name);
                          setShowSchoolDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-ink-700 transition-colors border-b border-ink-700/50 last:border-0 ${
                          selectedSchool?.name === school.name ? 'bg-gold/10 border-gold/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GraduationCap size={14} className="text-gold flex-shrink-0" />
                          <span className="text-sm text-chalk font-medium">{school.name}</span>
                          <span className="text-xs text-ink-400">({school.acronym})</span>
                          {selectedSchool?.name === school.name && (
                            <Check size={14} className="text-gold ml-auto" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 ml-6">
                          <span className="text-xs text-ink-500 flex items-center gap-1">
                            <MapPin size={10} /> {school.location}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            school.category === 'university' 
                              ? 'bg-blue-900/30 text-blue-300' 
                              : school.category === 'polytechnic'
                              ? 'bg-green-900/30 text-green-300'
                              : 'bg-purple-900/30 text-purple-300'
                          }`}>
                            {school.category === 'university' ? 'Uni' : 
                             school.category === 'polytechnic' ? 'Poly' : 'COE'}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            school.type === 'federal' ? 'bg-blue-900/30 text-blue-300' :
                            school.type === 'state' ? 'bg-green-900/30 text-green-300' :
                            'bg-purple-900/30 text-purple-300'
                          }`}>
                            {school.type}
                          </span>
                        </div>
                      </button>
                    ))}

                    {schoolQuery.length >= 3 && schoolSuggestions.length === 0 && (
                      <div className="px-4 py-3 text-center">
                        <p className="text-sm text-ink-400 mb-2">No schools found for "{schoolQuery}"</p>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setShowCustomSchool(true);
                            setForm(f => ({ ...f, school: schoolQuery }));
                            setShowSchoolDropdown(false);
                          }}
                          className="text-sm text-gold hover:underline"
                        >
                          Enter school manually
                        </button>
                      </div>
                    )}

                    {schoolQuery.length >= 3 && schoolSuggestions.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={() => {
                          setShowCustomSchool(true);
                          setForm(f => ({ ...f, school: schoolQuery }));
                          setShowSchoolDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-ink-700 transition-colors border-t border-ink-600 text-xs text-amber-400 flex items-center gap-2"
                      >
                        <AlertCircle size={12} />
                        Can't find your school? Enter manually
                      </button>
                    )}
                  </div>
                )}

                {selectedSchool && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-green-400 bg-green-400/10 px-3 py-2 rounded-lg border border-green-400/20">
                    <Check size={12} />
                    <span className="flex-1">{selectedSchool.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      selectedSchool.category === 'university' 
                        ? 'bg-blue-900/30 text-blue-300' 
                        : selectedSchool.category === 'polytechnic'
                        ? 'bg-green-900/30 text-green-300'
                        : 'bg-purple-900/30 text-purple-300'
                    }`}>
                      {selectedSchool.category === 'university' ? 'University' : 
                       selectedSchool.category === 'polytechnic' ? 'Polytechnic' : 'College of Education'}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      selectedSchool.type === 'federal' ? 'bg-blue-900/30 text-blue-300' :
                      selectedSchool.type === 'state' ? 'bg-green-900/30 text-green-300' :
                      'bg-purple-900/30 text-purple-300'
                    }`}>
                      {selectedSchool.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSchool(null);
                        setSchoolQuery('');
                        setForm(f => ({ ...f, school: '', department: '' }));
                      }}
                      className="text-ink-400 hover:text-red-400 ml-2"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input
                  className="input"
                  placeholder="Enter your school name"
                  value={form.school}
                  onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomSchool(false);
                    setSchoolQuery('');
                    setSelectedSchool(null);
                  }}
                  className="text-xs text-gold hover:underline mt-1"
                >
                  ← Back to school search
                </button>
              </div>
            )}
          </div>

          {/* Department — FILTERED BY SELECTED SCHOOL */}
          <div>
            <label className="section-label block mb-1.5">Department *</label>

            {selectedSchool ? (
              <div className="relative">
                <div className="relative">
                  <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 z-10" />
                  <input
                    ref={deptInputRef}
                    className="input pl-9 pr-8"
                    placeholder="Search or select your department..."
                    value={deptQuery}
                    onChange={e => {
                      setDeptQuery(e.target.value);
                      setForm(f => ({ ...f, department: e.target.value }));
                    }}
                    onFocus={() => {
                      if (selectedSchool) {
                        const allDepts = getDepartments(selectedSchool.name);
                        const filtered = deptQuery.length >= 1
                          ? allDepts.filter(d => d.toLowerCase().includes(deptQuery.toLowerCase()))
                          : allDepts;
                        setDeptSuggestions(filtered.slice(0, 8));
                        setShowDeptDropdown(filtered.length > 0);
                      }
                    }}
                  />
                  {deptQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeptQuery('');
                        setForm(f => ({ ...f, department: '' }));
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-chalk"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {showDeptDropdown && deptSuggestions.length > 0 && (
                  <div
                    ref={deptDropdownRef}
                    className="absolute z-20 w-full mt-1 bg-ink-800 border border-ink-700 rounded-lg overflow-hidden shadow-xl max-h-48 overflow-y-auto"
                  >
                    {deptSuggestions.map(dept => (
                      <button
                        key={dept}
                        type="button"
                        onMouseDown={() => {
                          setDeptQuery(dept);
                          setForm(f => ({ ...f, department: dept }));
                          setShowDeptDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-ink-700 transition-colors flex items-center justify-between ${
                          form.department === dept ? 'text-gold bg-gold/10' : 'text-chalk'
                        }`}
                      >
                        <span>{dept}</span>
                        {form.department === dept && <Check size={14} className="text-gold" />}
                      </button>
                    ))}
                  </div>
                )}

                {deptQuery.length >= 2 && deptSuggestions.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} />
                    Department not in our list for {selectedSchool.name}. It will be added when you submit.
                  </p>
                )}

                <div className="mt-1 text-xs text-ink-500">
                  {getDepartments(selectedSchool.name).length} departments available for {selectedSchool.name}
                </div>
              </div>
            ) : (
              <div>
                <input
                  className="input text-ink-500"
                  placeholder={showCustomSchool ? "Enter your department" : "Select a school first to see departments"}
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="section-label block mb-1.5">
              WhatsApp Number *
              <span className="text-ink-500 normal-case"> (+234 format)</span>
            </label>
            <input className="input" placeholder="+234 812 345 6789" value={form.whatsapp_number} onChange={set('whatsapp_number')} />
            {form.whatsapp_number && !/^(\+234|234|0)[7-9]\d{9}$/.test(form.whatsapp_number.replace(/[\s\-\(\)]/g, '')) && (
              <p className="text-red-400 text-xs mt-1">Enter a valid Nigerian number (+234, 234, or 0 prefix)</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="section-label block mb-1.5">Password *</label>
            <input className="input" type="password" placeholder="Min. 8 characters" value={form.password} onChange={set('password')} />
          </div>

          {/* Confirm Password */}
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
                <label className="section-label block mb-1.5">Year You Started Playing Chess</label>
                <input className="input" type="number" placeholder="e.g. 2020" min="1900" max="2030" value={form.year_started_chess} onChange={set('year_started_chess')} />
              </div>
            </div>
          </div>
        </div>

        {/* Rating seed explainer */}
        <div className="card p-3 text-xs text-ink-400 space-y-0.5 bg-ink-900">
          <div className="text-chalk font-medium mb-1">How rating seeding works</div>
          <div>• Chess.com / Lichess rapid rating → instant seed, skip calibration</div>
          <div>• No platform account → 5 bot calibration games after registration</div>
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