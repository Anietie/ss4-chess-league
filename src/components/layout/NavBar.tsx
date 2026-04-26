'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Menu, X, Bell, Users, Crown, Star, Home, LayoutDashboard } from 'lucide-react';
import { formatRating } from '@/lib/utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function leagueDisplayName(key: string): string {
  const match = key.match(/^league_(\d+)$/);
  if (match) return `League ${match[1]}`;
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [leagues, setLeagues] = useState<string[]>([]);

  useEffect(() => {
    supabase.from('players').select('home_league').eq('is_active', true)
      .neq('home_league', 'unassigned').neq('home_league', 'calibration')
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((p: any) => p.home_league))]
          .filter((l: string) => /^league_\d+$/.test(l))
          .sort((a: string, b: string) => parseInt(a.replace('league_', '')) - parseInt(b.replace('league_', '')));
        setLeagues(unique as string[]);
      });

    const playerId = localStorage.getItem('player_id');
    if (!playerId) return;
    fetch(`/api/players/${playerId}`).then(r => r.json()).then(d => d.player && setPlayer(d.player));
    fetch(`/api/notifications?player_id=${playerId}&unread=true`).then(r => r.json()).then(d => setUnread(d.count ?? 0));
  }, []);

  const active = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  const staticLinks = [
    { href: '/',                  label: 'Home',             icon: <Home size={13} /> },
    { href: '/champions-league',  label: 'Champions League', icon: <Crown size={13} /> },
    { href: '/players',           label: 'Players',          icon: <Users size={13} /> },
    { href: '/hall-of-champions', label: 'Hall of Fame',     icon: <Star size={13} /> },
  ];

  const allLinks = [
    staticLinks[0],
    ...leagues.map(l => ({ href: `/league/${l}`, label: leagueDisplayName(l), icon: null })),
    ...staticLinks.slice(1),
  ];

  const playerLeaguePill =
    player?.home_league === 'league_1' ? 'league-pill-l1' :
    player?.home_league === 'league_2' ? 'league-pill-l2' : 'league-pill-cl';

  return (
    <nav className="sticky top-0 z-50 bg-ink-900/90 backdrop-blur-sm border-b border-ink-700">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-gold text-xl">♟</span>
          <span className="font-display font-bold text-chalk hidden sm:block">SS4 Chess</span>
        </Link>

        <div className="hidden lg:flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {allLinks.map(l => (
            <Link key={l.href} href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors
                ${active(l.href) ? 'bg-ink-700 text-chalk' : 'text-ink-300 hover:text-chalk hover:bg-ink-800'}`}>
              {l.icon}{l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {player ? (
            <>
              <Link href="/dashboard" className="relative p-2 text-ink-400 hover:text-chalk transition-colors">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 text-[9px] font-bold rounded-full bg-gold text-navy flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="flex items-center gap-2 px-3 py-1.5 card-hover rounded-lg">
                {player.home_league && player.home_league !== 'unassigned' && (
                  <span className={`${playerLeaguePill} text-[10px]`}>{leagueDisplayName(player.home_league)}</span>
                )}
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-medium text-chalk leading-none">{player.full_name?.split(' ')[0]}</div>
                  <div className="text-[10px] font-mono text-gold leading-none mt-0.5">{formatRating(player.ss4_rating, player.rating_deviation)}</div>
                </div>
                <LayoutDashboard size={14} className="text-ink-400" />
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="btn-ghost btn-sm">Sign In</Link>
              <Link href="/register" className="btn-gold btn-sm hidden sm:inline-flex">Register</Link>
            </div>
          )}
          <button onClick={() => setOpen(o => !o)} className="lg:hidden p-2 text-ink-400 hover:text-chalk">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-ink-700 bg-ink-900 px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
          {allLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${active(l.href) ? 'bg-ink-700 text-chalk' : 'text-ink-300'}`}>
              {l.icon}{l.label}
            </Link>
          ))}
          {!player && (
            <div className="flex gap-2 pt-2">
              <Link href="/auth/login" onClick={() => setOpen(false)} className="btn-ghost flex-1 justify-center text-sm">Sign In</Link>
              <Link href="/register" onClick={() => setOpen(false)} className="btn-gold flex-1 justify-center text-sm">Register</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}