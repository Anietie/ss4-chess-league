"use client";
import { supabase } from "@/lib/supabase";
import { formatRating } from "@/lib/utils";
import { Bell, Calendar, CheckCircle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlayerData = async (id: string) => {
    try {
      const [pData, fData, nData] = await Promise.all([
        fetch(`/api/players/${id}`).then((r) => r.json()),
        fetch(`/api/fixtures?player_id=${id}&status=pending&season=1`).then(
          (r) => r.json(),
        ),
        fetch(`/api/notifications?player_id=${id}`).then((r) => r.json()),
      ]);
      setPlayer(pData.player);
      setFixtures(fData.fixtures ?? []);
      setNotifications(nData.notifications ?? []);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    }
  };

  useEffect(() => {
    const id = localStorage.getItem("player_id");
    if (!id) {
      window.location.href = "/auth/login";
      return;
    }
    setPlayerId(id);

    fetchPlayerData(id).then(() => setLoading(false));

    // Refetch when window regains focus
    const handleFocus = () => {
      fetchPlayerData(id);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Subscribe to real-time player updates
  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`player-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `id=eq.${playerId}`,
        },
        (payload: any) => {
          if (payload.new) {
            setPlayer(payload.new);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playerId]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: true }),
    });
    setNotifications((n) =>
      n.map((x) => (x.id === id ? { ...x, is_read: true } : x)),
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (playerId) {
      await fetchPlayerData(playerId);
    }
    setRefreshing(false);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin text-gold text-2xl">♟</div>
      </div>
    );
  if (!player)
    return (
      <div className="text-center py-20 text-ink-400">Player not found.</div>
    );

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="card p-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-chalk">
            {player.full_name}
          </h1>
          <div className="text-ink-400 text-sm mt-1 capitalize">
            {player.home_league?.replace("_", " ")} · {player.current_tier} Tier
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold text-gold">
            {formatRating(player.ss4_rating, player.rating_deviation)}
          </div>
          <div className="text-xs text-ink-400 mt-1">
            {player.games_played} games played
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <Link
              href={`/profile/${player.id}`}
              className="text-xs text-gold hover:underline"
            >
              View Profile
            </Link>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs text-gold hover:text-chalk disabled:opacity-50 transition-opacity"
              title="Refresh rating"
            >
              <RotateCw
                size={12}
                className={`inline ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Upcoming Fixtures */}
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
            <Calendar size={16} className="text-gold" /> Your Fixtures
          </h2>
          <div className="card divide-y divide-ink-700">
            {fixtures.slice(0, 6).map((g) => {
              const isWhite = g.white_player?.id === playerId;
              const opp = isWhite ? g.black_player : g.white_player;
              return (
                <div key={g.id} className="px-4 py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-chalk font-medium">
                        vs {opp?.full_name}
                      </span>
                      <span className="text-xs text-ink-500 ml-2">
                        {isWhite ? "♔ White" : "♚ Black"}
                      </span>
                    </div>
                    <span className="text-xs text-ink-400">R{g.round}</span>
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {g.scheduled_date} · {g.time_control}
                  </div>
                  <div className="text-xs text-ink-600 mt-0.5">
                    Deadline: {g.deadline_date}
                  </div>
                </div>
              );
            })}
            {!fixtures.length && (
              <div className="px-4 py-8 text-center text-ink-400 text-sm">
                No pending fixtures.
              </div>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="font-display text-lg font-bold text-chalk mb-3 flex items-center gap-2">
            <Bell size={16} className="text-gold" /> Notifications
            {unread > 0 && (
              <span className="ml-auto text-xs bg-gold text-navy font-bold px-2 py-0.5 rounded-full">
                {unread}
              </span>
            )}
          </h2>
          <div className="card divide-y divide-ink-700 max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 flex items-start gap-3 ${!n.is_read ? "bg-gold/5" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-chalk">
                    {n.title}
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5 line-clamp-2">
                    {n.message}
                  </div>
                  <div className="text-xs text-ink-600 mt-1">
                    {new Date(n.created_at).toLocaleDateString()}
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="flex-shrink-0 text-ink-400 hover:text-gold transition-colors"
                  >
                    <CheckCircle size={14} />
                  </button>
                )}
              </div>
            ))}
            {!notifications.length && (
              <div className="px-4 py-8 text-center text-ink-400 text-sm">
                No notifications yet.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/calibrate", icon: "🎯", label: "Bot Calibration" },
          { href: "/champions-league", icon: "🏆", label: "Champions League" },
          { href: "/players", icon: "👥", label: "All Players" },
          { href: "/hall-of-champions", icon: "⭐", label: "Hall of Fame" },
        ].map(({ href, icon, label }) => (
          <Link key={href} href={href} className="card-hover p-4 text-center">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-xs text-ink-300">{label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
