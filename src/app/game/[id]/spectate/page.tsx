"use client";
import { supabase } from "@/lib/supabase";
import { Chess } from "chess.js";
import { Send } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

interface SpectatorMessage {
  id: string;
  message: string;
  created_at: string;
  player: { id: string; full_name: string };
}

export default function SpectatePage() {
  const { id: gameId } = useParams<{ id: string }>();

  const [game, setGame] = useState<any>(null);
  const [fen, setFen] = useState<string>("start");
  const [moves, setMoves] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameEnded, setGameEnded] = useState(false);

  const [messages, setMessages] = useState<SpectatorMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatLocked, setChatLocked] = useState(false); // players can't chat until game ends

  const [myId, setMyId] = useState<string | null>(null);
  const [spectatorCount, setSpectatorCount] = useState(0);

  const chatRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<string | null>(null);

  // ── Initialise ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = localStorage.getItem("player_id");
    setMyId(id);
    loadGame(id);
  }, [gameId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ── Load game state ─────────────────────────────────────────────────────────
  async function loadGame(playerId: string | null) {
    setLoading(true);
    const { data } = await supabase
      .from("games")
      .select(
        `
        id, result, is_live, pgn, moves_json, time_control,
        game_state_fen, white_time_remaining, black_time_remaining,
        white_player_id, black_player_id,
        white:players!games_white_player_id_fkey(id, full_name, ss4_rating, rating_deviation),
        black:players!games_black_player_id_fkey(id, full_name, ss4_rating, rating_deviation)
      `,
      )
      .eq("id", gameId)
      .single();

    if (!data) {
      setLoading(false);
      return;
    }

    setGame(data);
    const ended = data.result !== "*";
    setGameEnded(ended);

    // Replay moves to get FEN
    if (data.moves_json?.length) {
      const chess = new Chess();
      for (const m of data.moves_json as any[]) {
        try {
          chess.move(m);
        } catch {}
      }
      setFen(chess.fen());
      setMoves(
        (data.moves_json as any[]).map((m: any) =>
          typeof m === "string" ? m : (m.san ?? m.from + m.to),
        ),
      );
    } else if (data.game_state_fen) {
      setFen(data.game_state_fen);
    }

    // Is this player a participant?
    const isParticipant =
      playerId === data.white_player_id || playerId === data.black_player_id;
    setChatLocked(isParticipant && !ended);

    // Load existing messages
    await loadMessages(ended);
    setLoading(false);
  }

  async function loadMessages(ended: boolean) {
    const r = await fetch(`/api/spectate/${gameId}/chat`);
    const d = await r.json();
    if (d.messages) {
      setMessages(d.messages);
      if (d.messages.length > 0) {
        lastMsgRef.current = d.messages[d.messages.length - 1].id;
      }
    }
  }

  // ── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return;

    // Subscribe to game state changes
    const gameChannel = supabase
      .channel(`spectate_game_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (updated.game_state_fen) setFen(updated.game_state_fen);
          if (updated.moves_json) {
            setMoves(
              (updated.moves_json as any[]).map((m: any) =>
                typeof m === "string" ? m : (m.san ?? m.from + m.to),
              ),
            );
          }
          if (updated.result !== "*") {
            setGameEnded(true);
            setChatLocked(false); // unlock chat for participants too
          }
        },
      )
      .subscribe();

    // Subscribe to spectator messages
    const chatChannel = supabase
      .channel(`spectate_chat_${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "spectator_messages",
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          // Fetch with player join since realtime payload doesn't include relations
          const { data } = await supabase
            .from("spectator_messages")
            .select("id, message, created_at, player:players(id, full_name)")
            .eq("id", payload.new.id)
            .single();
          if (data) {
            setMessages((prev) => {
              // Deduplicate
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data as any as SpectatorMessage];
            });
          }
        },
      )
      .subscribe();

    // Spectator presence count
    const presenceChannel = supabase
      .channel(`spectate_presence_${gameId}`, {
        config: { presence: { key: myId ?? "anon" } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setSpectatorCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ joined_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(gameChannel);
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [gameId, myId]);

  // ── Send message ────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!draft.trim() || !myId || chatLocked || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await fetch(`/api/spectate/${gameId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: myId, message: text }),
      });
    } finally {
      setSending(false);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  function formatTime(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }

  function resultLabel(result: string) {
    if (result === "1-0")
      return { text: `${game?.white?.full_name} wins`, color: "text-chalk" };
    if (result === "0-1")
      return { text: `${game?.black?.full_name} wins`, color: "text-chalk" };
    if (result === "0.5-0.5") return { text: "Draw", color: "text-ink-300" };
    return { text: "Game Over", color: "text-ink-300" };
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-ink-400">Loading game...</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card p-8 text-center">
          <p className="text-chalk">Game not found.</p>
          <a href="/" className="btn-ghost mt-4 inline-block">
            Home
          </a>
        </div>
      </main>
    );
  }

  const movePairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2)
    movePairs.push([moves[i], moves[i + 1]]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Board side ────────────────────────────────────────── */}
        <div className="flex-1 space-y-4">
          {/* Status header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-xl font-bold text-chalk">
                {game.white?.full_name} vs {game.black?.full_name}
              </h1>
              <p className="text-sm text-ink-400">
                {game.time_control} · {gameEnded ? "Game Over" : "Live"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!gameEnded && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
              <span className="text-xs text-ink-500">
                {spectatorCount > 0 ? `${spectatorCount} watching` : ""}
              </span>
            </div>
          </div>

          {/* Black player clock */}
          <PlayerClockBar
            player={game.black}
            timeMs={game.black_time_remaining ?? 600_000}
            color="black"
          />

          {/* Board */}
          <div className="rounded-xl overflow-hidden border border-ink-700">
            <Chessboard
              position={fen}
              arePiecesDraggable={false}
              boardOrientation="white"
              customDarkSquareStyle={{ backgroundColor: "#2d4a3e" }}
              customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
            />
          </div>

          {/* White player clock */}
          <PlayerClockBar
            player={game.white}
            timeMs={game.white_time_remaining ?? 600_000}
            color="white"
          />

          {/* Game result banner */}
          {gameEnded && (
            <div className="card p-4 text-center">
              <p
                className={`font-display text-xl font-bold ${resultLabel(game.result).color}`}
              >
                {resultLabel(game.result).text}
              </p>
              <div className="flex justify-center gap-4 mt-3">
                <a href={`/game/${gameId}/review`} className="btn-ghost btn-sm">
                  Review Game
                </a>
              </div>
            </div>
          )}

          {/* Move list */}
          <div className="card p-4">
            <h3 className="text-xs text-ink-400 uppercase tracking-wider mb-3">
              Move History
            </h3>
            <div className="h-32 overflow-y-auto font-mono text-sm space-y-0.5 no-scrollbar">
              {movePairs.length === 0 && (
                <p className="text-ink-500 italic text-center py-4 text-sm">
                  No moves yet
                </p>
              )}
              {movePairs.map(([w, b], i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-ink-500 w-7 text-right">{i + 1}.</span>
                  <span className="flex-1 text-chalk">{w}</span>
                  <span className="flex-1 text-ink-300">{b ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Chat side ─────────────────────────────────────────── */}
        <div className="w-full lg:w-80 flex flex-col">
          <div className="card flex flex-col h-[600px]">
            <div className="px-4 py-3 border-b border-ink-800 flex items-center justify-between">
              <h3 className="font-semibold text-chalk text-sm">
                Spectator Chat
              </h3>
              {chatLocked && (
                <span className="text-xs text-ink-500 bg-ink-800 px-2 py-0.5 rounded-full">
                  Unlocks after game
                </span>
              )}
            </div>

            {/* Messages */}
            <div
              ref={chatRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 no-scrollbar"
            >
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-ink-500 text-center">
                    {chatLocked
                      ? "Chat will be visible after the game ends."
                      : "No messages yet. Be the first to comment!"}
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="space-y-0.5">
                    <span
                      className={`text-xs font-semibold ${
                        msg.player.id === myId ? "text-gold" : "text-ink-300"
                      }`}
                    >
                      {msg.player.full_name.split(" ")[0]}
                    </span>
                    <p className="text-sm text-chalk leading-snug">
                      {msg.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-ink-800">
              {!myId ? (
                <a
                  href="/auth/login"
                  className="btn-ghost w-full text-center text-sm"
                >
                  Sign in to chat
                </a>
              ) : chatLocked ? (
                <div className="text-xs text-ink-500 text-center py-1">
                  You're playing — chat unlocks after the game.
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && sendMessage()
                    }
                    placeholder="Say something..."
                    maxLength={280}
                    className="flex-1 bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-chalk placeholder-ink-500 focus:outline-none focus:border-gold"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!draft.trim() || sending}
                    className="p-2 bg-gold/10 hover:bg-gold/20 text-gold rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Send size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function PlayerClockBar({
  player,
  timeMs,
  color,
}: {
  player: any;
  timeMs: number;
  color: "white" | "black";
}) {
  const s = Math.max(0, Math.floor(timeMs / 1000));
  const label = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-ink-800 rounded-xl border border-ink-700">
      <div className="flex items-center gap-2">
        <span className="text-lg">{color === "white" ? "♔" : "♚"}</span>
        <div>
          <div className="text-sm font-medium text-chalk">
            {player?.full_name ?? color}
          </div>
          <div className="text-xs text-ink-400 font-mono">
            {Math.round(player?.ss4_rating ?? 1000)}
          </div>
        </div>
      </div>
      <span className="font-mono text-xl font-bold text-chalk">{label}</span>
    </div>
  );
}
