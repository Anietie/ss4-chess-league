"use client";
import { supabase } from "@/lib/supabase";
import { createPortal } from "react-dom";
import { formatRating } from "@/lib/utils";
import {
    Bell, Crown, Home, LayoutDashboard, LogOut, Menu, Shield, Star, Swords, Users, X, Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function leagueDisplayName(key: string): string {
  const match = key.match(/^league_(\d+)$/);
  if (match) return `League ${match[1]}`;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [player, setPlayer] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    async function loadPlayer(email?: string) {
      const playerId = localStorage.getItem("player_id");
      if (playerId) {
        const r = await fetch(`/api/players/${playerId}`);
        const d = await r.json();
        if (d.player) {
          setPlayer(d.player);
          fetch(`/api/notifications?player_id=${playerId}&unread=true`)
            .then((r) => r.json())
            .then((d) => setUnread(d.count ?? 0));
          return;
        }
      }
      if (email) {
        const { data } = await supabase
          .from("players")
          .select("id, full_name, home_league, ss4_rating, rating_deviation, is_provisional, is_admin")
          .eq("email", email)
          .single();
        if (data) {
          localStorage.setItem("player_id", data.id);
          setPlayer(data);
          fetch(`/api/notifications?player_id=${data.id}&unread=true`)
            .then((r) => r.json())
            .then((d) => setUnread(d.count ?? 0));
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadPlayer(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadPlayer(session.user.email);
      } else {
        setPlayer(null);
        setUnread(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    setOpen(false);
    await supabase.auth.signOut();
    localStorage.removeItem("player_id");
    setPlayer(null);
    setUnread(0);
    window.location.href = '/auth/login';
  };

  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  const staticLinks = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={13} /> },
    { href: "/casual", label: "Casual Play", icon: <Swords size={13} /> },
    { href: "/leagues", label: "Leagues", icon: <Trophy size={13} /> },
    { href: "/champions-league", label: "Champions League", icon: <Crown size={13} /> },
    { href: "/players", label: "Players", icon: <Users size={13} /> },
    { href: "/hall-of-champions", label: "Hall of Fame", icon: <Star size={13} /> },
  ];

  // Build links based on auth state
  const allLinks = player
    ? [
        ...staticLinks,
        ...(player.is_admin ? [{ href: "/admin", label: "Admin", icon: <Shield size={13} /> }] : []),
      ]
    : [
        { href: "/", label: "Home", icon: <Home size={13} /> },
        ...staticLinks,
      ];

  const playerLeaguePill = player?.home_league === "league_1" ? "league-pill-l1" : player?.home_league === "league_2" ? "league-pill-l2" : "league-pill-cl";

  return (
    <>
    <nav className="sticky top-0 z-50 bg-ink-900/90 backdrop-blur-sm border-b border-ink-700">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0">
          <img src="/logo.png" alt="SS4 Chess League" className="h-7 w-auto" />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {allLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors
                ${active(l.href) ? "bg-ink-700 text-chalk" : l.href === "/admin" ? "text-orange-400 hover:text-orange-300 hover:bg-ink-800" : "text-ink-300 hover:text-chalk hover:bg-ink-800"}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {player ? (
            <>
              <Link href="/notifications" className="relative p-2 text-ink-400 hover:text-chalk transition-colors">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 text-[9px] font-bold rounded-full bg-orange-500 text-white flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="flex items-center gap-2 px-3 py-1.5 card-hover rounded-lg">
                {player.home_league && player.home_league !== "unassigned" && (
                  <span className={`${playerLeaguePill} text-[10px]`}>
                    {leagueDisplayName(player.home_league)}
                  </span>
                )}
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-medium text-chalk leading-none">
                    {player.full_name?.split(" ")[0]}
                  </div>
                  <div className="text-[10px] font-mono text-orange-500 leading-none mt-0.5">
                    {formatRating(player.ss4_rating, player.rating_deviation)}
                  </div>
                </div>
                <LayoutDashboard size={14} className="text-ink-400" />
              </Link>
              <button
                onClick={() => setShowSignOutConfirm(true)}
                className="p-2 text-ink-400 hover:text-red-400 transition-colors"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="btn-ghost btn-sm">Sign In</Link>
              <Link href="/register" className="btn-gold btn-sm hidden sm:inline-flex">Register</Link>
            </div>
          )}
          <button onClick={() => setOpen((o) => !o)} className="lg:hidden p-2 text-ink-400 hover:text-chalk">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="lg:hidden border-t border-ink-700 bg-ink-900 px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
          {allLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${active(l.href) ? "bg-ink-700 text-chalk" : l.href === "/admin" ? "text-orange-400" : "text-ink-300"}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
          {player ? (
            <button onClick={() => setShowSignOutConfirm(true)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-400 w-full">
              <LogOut size={14} /> Sign Out
            </button>
          ) : (
            <div className="flex gap-2 pt-2">
              <Link href="/auth/login" onClick={() => setOpen(false)} className="btn-ghost flex-1 justify-center text-sm">Sign In</Link>
              <Link href="/register" onClick={() => setOpen(false)} className="btn-gold flex-1 justify-center text-sm">Register</Link>
            </div>
          )}
        </div>
      )}
    </nav>

    {/* Sign Out Confirmation Modal */}
    {mounted && showSignOutConfirm && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowSignOutConfirm(false); }}>
        <div className="card p-6 max-w-sm mx-4 space-y-4">
          <h2 className="font-display text-xl font-bold text-chalk">Sign Out?</h2>
          <p className="text-sm text-ink-300">Are you sure you want to sign out?</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowSignOutConfirm(false)} className="btn-ghost">Cancel</button>
            <button onClick={handleSignOut} className="btn-gold">Sign Out</button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}