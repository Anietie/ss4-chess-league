'use client';
import { supabase } from '@/lib/supabase';
import { formatRating } from '@/lib/utils';
import { Clock, Swords } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ChallengeAcceptPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const router = useRouter();

  const [challenge, setChallenge] = useState<any>(null);
  const [myId, setMyId]           = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem('player_id');
    setMyId(id);
    loadChallenge();
  }, [challengeId]);

  // Socket + polling so the challenger's own link tab also auto-redirects
  useEffect(() => {
    if (!challengeId) return;
    const playerId = localStorage.getItem('player_id');
    if (!playerId) return;

    const { io } = require('socket.io-client');
    const sock = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001');
    sock.emit('join_challenge', { challenge_id: challengeId, player_id: playerId });
    sock.on('challenge_accepted', ({ game_id }: { game_id: string }) => {
      sock.disconnect(); clearInterval(poll);
      router.push(`/play/${game_id}`);
    });

    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/casual/${challengeId}`);
        const d = await r.json();
        if (d.challenge?.status === 'accepted' && d.challenge?.game_id) {
          sock.disconnect(); clearInterval(poll);
          router.push(`/play/${d.challenge.game_id}`);
        }
      } catch {}
    }, 3000);

    return () => { sock.disconnect(); clearInterval(poll); };
  }, [challengeId, router]);

  async function loadChallenge() {
    setLoading(true);
    const r = await fetch(`/api/casual/${challengeId}`);
    const d = await r.json();
    if (!r.ok) { setError(d.error); setLoading(false); return; }
    setChallenge(d.challenge);
    setLoading(false);
  }

  async function accept() {
    if (!myId) {
      // Not logged in — redirect to login with return URL
      router.push(`/auth/login?next=/casual/${challengeId}`);
      return;
    }
    setAccepting(true);
    try {
      const r = await fetch(`/api/casual/${challengeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', acceptor_id: myId }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error); return; }
      router.push(`/play/${d.game_id}`);
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-ink-400">Loading challenge...</div>
      </main>
    );
  }

  if (error || !challenge) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">♟</div>
          <h1 className="font-display text-xl font-bold text-chalk">Challenge Not Found</h1>
          <p className="text-ink-400 text-sm">{error ?? 'This challenge may have expired or been cancelled.'}</p>
          <a href="/casual" className="btn-gold inline-block">Find a Game</a>
        </div>
      </main>
    );
  }

  // If accepted and this player is the challenger or acceptor, send them to play
  if (challenge.status === 'accepted' && challenge.game_id) {
    const isParticipant =
      challenge.challenger_id === myId ||
      (challenge.challenged_id && challenge.challenged_id === myId);
    if (isParticipant) {
      router.replace(`/play/${challenge.game_id}`);
      return <main className="min-h-screen flex items-center justify-center"><p className="text-ink-400">Starting game…</p></main>;
    }
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">♟</div>
          <h1 className="font-display text-xl font-bold text-chalk">Game In Progress</h1>
          <p className="text-ink-400 text-sm">This challenge has already been accepted.</p>
          <a href={`/game/${challenge.game_id}/spectate`} className="btn-gold inline-block">Watch Game</a>
        </div>
      </main>
    );
  }

  if (challenge.status !== 'pending') {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">♟</div>
          <h1 className="font-display text-xl font-bold text-chalk">Challenge Unavailable</h1>
          <p className="text-ink-400 text-sm capitalize">This challenge is {challenge.status}.</p>
          <a href="/casual" className="btn-gold inline-block">Find a Game</a>
        </div>
      </main>
    );
  }

  const isOwn = challenge.challenger_id === myId;
  const [tcBase, tcInc] = challenge.time_control.split('+').map(Number);
  const mins  = Math.floor(tcBase / 60);
  const secs  = tcBase % 60;
  const timeLabel = secs > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${mins} min`;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card p-8 max-w-md w-full space-y-6">
        {/* Chess piece hero */}
        <div className="text-center">
          <div className="text-5xl mb-2">♟</div>
          <h1 className="font-display text-2xl font-bold text-chalk">You've Been Challenged!</h1>
        </div>

        {/* Challenger info */}
        <div className="bg-ink-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-ink-700 flex items-center justify-center text-xl font-bold text-chalk">
            {challenge.challenger.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-chalk">{challenge.challenger.full_name}</div>
            <div className="text-sm font-mono text-gold">
              {formatRating(challenge.challenger.ss4_rating, challenge.challenger.rating_deviation)}
            </div>
          </div>
          <Swords size={20} className="ml-auto text-ink-500" />
        </div>

        {/* Game details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-ink-800 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-ink-400 text-xs mb-1">
              <Clock size={11} /> Time Control
            </div>
            <div className="font-semibold text-chalk">{timeLabel}</div>
            {Number(tcInc) > 0 && <div className="text-xs text-ink-500">+{tcInc}s increment</div>}
          </div>
          <div className="bg-ink-800 rounded-lg p-3 text-center">
            <div className="text-ink-400 text-xs mb-1">Type</div>
            <div className={`font-semibold ${challenge.is_rated ? 'text-gold' : 'text-chalk'}`}>
              {challenge.is_rated ? 'Rated' : 'Unrated'}
            </div>
            {challenge.is_rated && <div className="text-xs text-ink-500">Affects your rating</div>}
          </div>
        </div>

        {/* Actions */}
        {isOwn ? (
          <div className="text-center text-ink-400 text-sm py-2">
            This is your challenge. Share the link with someone to play!
          </div>
        ) : (
          <button
            onClick={accept}
            disabled={accepting}
            className="btn-gold w-full text-base py-3 flex items-center justify-center gap-2"
          >
            <Swords size={18} />
            {accepting ? 'Starting Game...' : 'Accept Challenge'}
          </button>
        )}

        <a href="/casual" className="block text-center text-sm text-ink-500 hover:text-ink-300">
          ← Back to Casual Play
        </a>
      </div>
    </main>
  );
}