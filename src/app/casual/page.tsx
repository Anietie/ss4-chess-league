'use client';
import { io, Socket } from 'socket.io-client';
import { supabase } from '@/lib/supabase';
import { formatRating } from '@/lib/utils';
import { Check, Clock, Copy, Link2, Search, Swords, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const TIME_CONTROLS = [
  { label: 'Bullet',   value: '60+0',   desc: '1 min' },
  { label: 'Bullet',   value: '120+1',  desc: '2+1' },
  { label: 'Blitz',    value: '180+0',  desc: '3 min' },
  { label: 'Blitz',    value: '300+0',  desc: '5 min' },
  { label: 'Rapid',    value: '600+0',  desc: '10 min' },
  { label: 'Rapid',    value: '900+10', desc: '15+10' },
  { label: 'Classical', value: '1800+0', desc: '30 min' },
];

export default function CasualPage() {
  const router    = useRouter();
  const [myId, setMyId]       = useState<string | null>(null);
  const [myPlayer, setMyPlayer] = useState<any>(null);

  // Challenge creation state
  const [timeControl, setTimeControl]   = useState('600+0');
  const [isRated, setIsRated]           = useState(false);
  const [colorPref, setColorPref]       = useState<'white'|'black'|'random'>('random');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [creating, setCreating]         = useState(false);
  const [shareLink, setShareLink]       = useState<string | null>(null);
  const [copied, setCopied]             = useState(false);
  const searchRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef  = useRef<Socket | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Open challenges from others
  const [openChallenges, setOpenChallenges] = useState<any[]>([]);
  const [directChallenges, setDirectChallenges] = useState<any[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  // ID of challenge this player just created — used to subscribe for acceptance
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem('player_id');
    setMyId(id);
    if (id) {
      fetch(`/api/players/${id}`).then(r => r.json()).then(d => setMyPlayer(d.player));
      loadChallenges(id);
    }
  }, []);

  async function loadChallenges(id: string) {
    const r = await fetch(`/api/casual?player_id=${id}`);
    const d = await r.json();
    setOpenChallenges(d.open ?? []);
    setDirectChallenges(d.direct ?? []);
  }

  // When challenger is waiting: connect socket + poll as fallback
  useEffect(() => {
    if (!pendingChallengeId || !myId) return;

    // ── Primary: Socket.io push ────────────────────────────────────────
    const sock = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');
    socketRef.current = sock;
    sock.emit('join_challenge', { challenge_id: pendingChallengeId, player_id: myId });
    sock.on('challenge_accepted', ({ game_id }: { game_id: string }) => {
      cleanup();
      router.push(`/play/${game_id}`);
    });

    // ── Fallback: poll every 3s in case socket misses it ──────────────
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/casual/${pendingChallengeId}`);
        const d = await r.json();
        if (d.challenge?.status === 'accepted' && d.challenge?.game_id) {
          cleanup();
          router.push(`/play/${d.challenge.game_id}`);
        }
        if (['expired', 'cancelled', 'declined'].includes(d.challenge?.status)) {
          cleanup();
          setWaitingForOpponent(false);
          setPendingChallengeId(null);
          setShareLink(null);
        }
      } catch {}
    }, 3000);

    function cleanup() {
      sock.disconnect();
      if (pollRef.current) clearInterval(pollRef.current);
    }

    return () => { cleanup(); };
  }, [pendingChallengeId, myId, router]);

  // Debounced player search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    searchRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('players')
        .select('id, full_name, ss4_rating, rating_deviation, home_league')
        .ilike('full_name', `%${searchQuery}%`)
        .eq('is_active', true)
        .neq('id', myId ?? '')
        .limit(6);
      setSearchResults(data ?? []);
    }, 300);
  }, [searchQuery, myId]);

  async function createChallenge(challengedId?: string) {
    if (!myId) return;
    setCreating(true);
    try {
      const r = await fetch('/api/casual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_id:    myId,
          challenged_id:    challengedId ?? null,
          time_control:     timeControl,
          is_rated:         isRated,
          color_preference: colorPref,
        }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error); return; }

      // Both open and direct: go to waiting screen + start socket subscription
      setPendingChallengeId(d.challenge.id);
      setWaitingForOpponent(true);
      if (!challengedId) {
        // Open challenge — also show share link on waiting screen
        const link = `${window.location.origin}/casual/${d.challenge.id}`;
        setShareLink(link);
      } else {
        setSelectedPlayer(null);
        setSearchQuery('');
      }
    } finally {
      setCreating(false);
    }
  }

  async function acceptChallenge(challengeId: string) {
    if (!myId) return;
    setAccepting(challengeId);
    try {
      const r = await fetch(`/api/casual/${challengeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', acceptor_id: myId }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error); return; }
      router.push(`/play/${d.game_id}`);
    } finally {
      setAccepting(null);
    }
  }

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [tcBase, tcInc] = timeControl.split('+').map(Number);
  const tcMins = Math.floor(tcBase / 60);
  const tcLabel = TIME_CONTROLS.find(t => t.value === timeControl)?.label ?? 'Custom';

  // ── Waiting screen (challenger's view after sending challenge) ────────────
  if (waitingForOpponent) {
    const [tcBase] = timeControl.split('+').map(Number);
    const mins = Math.floor(tcBase / 60);
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center space-y-6">
          <div className="text-5xl animate-pulse">♟</div>
          <div>
            <h1 className="font-display text-2xl font-bold text-chalk mb-2">Waiting for opponent…</h1>
            <p className="text-ink-400 text-sm">
              {shareLink
                ? "Share the link below. The game will start automatically when someone accepts."
                : `Challenge sent! You'll be taken to the board as soon as they accept.`}
            </p>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="px-3 py-1.5 bg-ink-800 rounded-lg text-chalk">{mins} min</span>
            <span className={`px-3 py-1.5 rounded-lg text-xs ${isRated ? 'bg-gold/10 text-gold' : 'bg-ink-800 text-ink-400'}`}>
              {isRated ? 'Rated' : 'Unrated'}
            </span>
          </div>
          {shareLink && (
            <div className="p-3 bg-ink-800 rounded-lg border border-gold/30">
              <p className="text-xs text-ink-400 mb-2">Share link:</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs text-gold truncate text-left">{shareLink}</code>
                <button onClick={copyLink} className="text-ink-400 hover:text-chalk flex-shrink-0">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setWaitingForOpponent(false);
                setPendingChallengeId(null);
                setShareLink(null);
              }}
              className="btn-ghost flex-1 text-sm"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-600">You'll be redirected automatically when the game starts.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-chalk">Casual Play</h1>
        <p className="text-ink-400 mt-1">Challenge a player or create an open challenge to share.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Create Challenge ─────────────────────────────────── */}
        <div className="card p-6 space-y-5">
          <h2 className="font-display text-lg font-semibold text-chalk">New Challenge</h2>

          {/* Time control grid */}
          <div>
            <p className="text-xs text-ink-400 mb-2 uppercase tracking-wider">Time Control</p>
            <div className="grid grid-cols-3 gap-2">
              {TIME_CONTROLS.map(tc => (
                <button
                  key={tc.value}
                  onClick={() => setTimeControl(tc.value)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                    timeControl === tc.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-ink-700 text-ink-300 hover:border-ink-500'
                  }`}
                >
                  <div className="font-semibold">{tc.desc}</div>
                  <div className="text-[10px] opacity-70">{tc.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Rated toggle */}
          <div className="flex items-center justify-between py-2 border-t border-ink-800">
            <div>
              <p className="text-sm text-chalk font-medium">Rated Game</p>
              <p className="text-xs text-ink-500">Affects your SS4 rating</p>
            </div>
            <button
              onClick={() => setIsRated(v => !v)}
              role="switch"
              aria-checked={isRated}
              className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                isRated ? 'bg-gold' : 'bg-ink-700'
              }`}
            >
              <span
                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
                style={{ left: isRated ? '1.375rem' : '0.125rem' }}
              />
            </button>
          </div>

          {/* Color preference */}
          <div>
            <p className="text-xs text-ink-400 mb-2 uppercase tracking-wider">Play As</p>
            <div className="grid grid-cols-3 gap-2">
              {([['random','🎲 Random'],['white','♔ White'],['black','♚ Black']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setColorPref(val)}
                  className={`py-2 rounded-lg text-sm border transition-all ${
                    colorPref === val
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-ink-700 text-ink-300 hover:border-ink-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Player search */}
          <div className="relative">
            <p className="text-xs text-ink-400 mb-2 uppercase tracking-wider">Challenge Specific Player (optional)</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                type="text"
                placeholder="Search by name..."
                value={selectedPlayer ? selectedPlayer.full_name : searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedPlayer(null); }}
                className="w-full pl-9 pr-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-sm text-chalk placeholder-ink-500 focus:outline-none focus:border-gold"
              />
              {selectedPlayer && (
                <button
                  onClick={() => { setSelectedPlayer(null); setSearchQuery(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-chalk"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {searchResults.length > 0 && !selectedPlayer && (
              <div className="absolute z-20 w-full mt-1 bg-ink-800 border border-ink-700 rounded-lg overflow-hidden shadow-xl">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPlayer(p); setSearchResults([]); setSearchQuery(''); }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-ink-700 text-left transition-colors"
                  >
                    <span className="text-sm text-chalk">{p.full_name}</span>
                    <span className="text-xs font-mono text-gold">{formatRating(p.ss4_rating, p.rating_deviation)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CTA buttons */}
          <div className="flex gap-3 pt-1">
            {selectedPlayer ? (
              <button
                onClick={() => createChallenge(selectedPlayer.id)}
                disabled={creating}
                className="btn-gold flex-1 flex items-center justify-center gap-2"
              >
                <Swords size={15} />
                {creating ? 'Sending...' : `Challenge ${selectedPlayer.full_name.split(' ')[0]}`}
              </button>
            ) : (
              <button
                onClick={() => createChallenge()}
                disabled={creating}
                className="btn-gold flex-1 flex items-center justify-center gap-2"
              >
                <Link2 size={15} />
                {creating ? 'Creating...' : 'Create Open Challenge'}
              </button>
            )}
          </div>

          {/* Share link */}
          {shareLink && (
            <div className="mt-2 p-3 bg-ink-800 rounded-lg border border-gold/30">
              <p className="text-xs text-ink-400 mb-2">Share this link with anyone:</p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs text-gold truncate">{shareLink}</code>
                <button onClick={copyLink} className="text-ink-400 hover:text-chalk flex-shrink-0">
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Incoming Challenges ───────────────────────────────── */}
        <div className="space-y-4">
          {/* Direct challenges */}
          {directChallenges.length > 0 && (
            <div className="card p-5 space-y-3">
              <h2 className="font-display text-lg font-semibold text-chalk">Your Challenges</h2>
              {directChallenges.map(c => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  myId={myId}
                  accepting={accepting === c.id}
                  onAccept={() => acceptChallenge(c.id)}
                />
              ))}
            </div>
          )}

          {/* Open challenges */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-chalk">Open Challenges</h2>
              <button onClick={() => myId && loadChallenges(myId)} className="text-xs text-ink-400 hover:text-chalk">
                Refresh
              </button>
            </div>
            {openChallenges.length === 0 ? (
              <p className="text-sm text-ink-500 italic py-4 text-center">
                No open challenges right now. Create one and share the link!
              </p>
            ) : (
              openChallenges.map(c => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  myId={myId}
                  accepting={accepting === c.id}
                  onAccept={() => acceptChallenge(c.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ChallengeCard({
  challenge, myId, accepting, onAccept,
}: {
  challenge: any;
  myId: string | null;
  accepting: boolean;
  onAccept: () => void;
}) {
  const [tcBase] = challenge.time_control.split('+').map(Number);
  const mins     = Math.floor(tcBase / 60);
  const secs     = tcBase % 60;
  const timeLabel = secs > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${mins} min`;
  const isOwn    = challenge.challenger_id === myId;
  const expires  = new Date(challenge.expires_at);
  const hoursLeft = Math.max(0, Math.round((expires.getTime() - Date.now()) / 3_600_000));

  return (
    <div className="flex items-center justify-between p-3 bg-ink-800 rounded-lg border border-ink-700">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-chalk truncate">
            {challenge.challenger.full_name}
          </span>
          <span className="text-xs font-mono text-gold">
            {Math.round(challenge.challenger.ss4_rating)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-ink-400">
            <Clock size={10} /> {timeLabel}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            challenge.is_rated
              ? 'bg-gold/10 text-gold'
              : 'bg-ink-700 text-ink-400'
          }`}>
            {challenge.is_rated ? 'Rated' : 'Unrated'}
          </span>
          <span className="text-[10px] text-ink-600">~{hoursLeft}h left</span>
        </div>
      </div>
      {!isOwn && (
        <button
          onClick={onAccept}
          disabled={accepting}
          className="btn-gold btn-sm ml-3 flex-shrink-0"
        >
          {accepting ? '...' : 'Accept'}
        </button>
      )}
      {isOwn && (
        <span className="text-xs text-ink-500 ml-3">Your challenge</span>
      )}
    </div>
  );
}