"use client";
import { SoundToggle } from "@/components/chess/SoundToggle";
import { useSound } from "@/hooks/useSound";
import { supabase } from "@/lib/supabase";
import { Chess } from "chess.js";
import {
  Download,
  Eye,
  Flag,
  Handshake,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}
import { io, Socket } from "socket.io-client";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

function formatTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    text: `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`,
    isLow: ms < 30_000,
  };
}

function Clock({ name, rating, timeMs, isActive, color }: any) {
  const [display, setDisplay] = useState(timeMs);
  const lastRef = useRef(Date.now());
  const ref = useRef<any>();

  useEffect(() => {
    setDisplay(timeMs);
    if (isActive) {
      lastRef.current = Date.now();
      ref.current = setInterval(() => {
        const now = Date.now();
        const el = now - lastRef.current;
        lastRef.current = now;
        setDisplay((p: number) => Math.max(0, p - el));
      }, 100);
    }
    return () => clearInterval(ref.current);
  }, [timeMs, isActive]);

  const { text, isLow } = formatTime(display);
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${isActive ? "bg-ink-700 border-ink-500" : "bg-ink-900 border-ink-800"}`}
    >
      <div>
        <div className="text-xs text-ink-400">
          {color === "white" ? "♔ White" : "♚ Black"}
        </div>
        <div
          className={`font-medium text-sm ${isActive ? "text-chalk" : "text-ink-400"}`}
        >
          {name}
        </div>
        <div className="text-xs text-ink-500">±{Math.round(rating)}</div>
      </div>
      <span
        className={`font-mono text-2xl font-bold tabular-nums ${!isActive ? "text-ink-400" : isLow ? "text-red-400" : "text-chalk"}`}
      >
        {text}
      </span>
    </div>
  );
}

function MoveHistory({ moves }: { moves: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [moves]);
  const pairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2)
    pairs.push([moves[i], moves[i + 1]]);
  return (
    <div
      ref={ref}
      className="h-40 overflow-y-auto font-mono text-sm space-y-0.5 no-scrollbar"
    >
      {pairs.map(([w, b], i) => (
        <div key={i} className="flex gap-2">
          <span className="text-ink-500 w-6">{i + 1}.</span>
          <span className="flex-1 text-chalk">{w}</span>
          <span className="flex-1 text-chalk-700">{b || ""}</span>
        </div>
      ))}
      {!moves.length && (
        <div className="text-ink-500 italic text-center py-4">No moves yet</div>
      )}
    </div>
  );
}

export default function GameRoomPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [status, setStatus] = useState<
    "loading" | "waiting" | "active" | "ended" | "unauthorized"
  >("loading");
  const [result, setResult] = useState<string | null>(null);
  const [finalPgn, setFinalPgn] = useState<string | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [touchMode] = useState(isTouchDevice);
  const [drawOffered, setDrawOffered] = useState(false);
  const [spectators, setSpectators] = useState(0);
  const { play, enabled: soundEnabled, toggle: toggleSound } = useSound();

  // TAP-TO-MOVE STATE
  const [moveFrom, setMoveFrom] = useState<any>(null);
  const [optionSquares, setOptionSquares] = useState({});

  const socketRef = useRef<Socket | null>(null);
  const myColorRef = useRef<"white" | "black" | null>(null);
  const [white, setWhite] = useState({
    name: "White",
    rating: 1200,
    timeMs: 600_000,
    isActive: false,
  });
  const [black, setBlack] = useState({
    name: "Black",
    rating: 1200,
    timeMs: 600_000,
    isActive: false,
  });

  const myPlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let sock: Socket;

    async function init() {
      try {
        // ── Step 1: Get auth identity ─────────────────────────────────────────
        // getSession() reads from browser cookies (no network round-trip to Supabase).
        // getUser() makes a network call to /auth/v1/user on every mount which can
        // hang on slow networks or Render free-tier cold starts, keeping status=loading.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStatus('unauthorized'); return; }
        const user = session.user;

        // ── Step 2: Resolve player_id on the CLIENT before connecting ─────────
        // If we rely purely on the server to resolve auth_user_id → player_id,
        // legacy players whose auth_user_id column is NULL in the DB join as
        // spectators — so state.connected never has both players → game_started
        // never fires. Resolve it here once so we always pass a concrete player_id.
        let resolvedPlayerId: string | null =
          typeof window !== 'undefined' ? localStorage.getItem('player_id') : null;

        if (!resolvedPlayerId) {
          // auth_user_id column may be NULL for players created before it was added.
          // Try the fast path first; fall back to looking up by supabase uid column.
          const { data: byAuthId } = await supabase
            .from('players')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

          if (byAuthId?.id) {
            resolvedPlayerId = byAuthId.id;
          } else {
            // Legacy players: auth_user_id column is NULL. Try matching on supabase_uid
            // or any column the app uses to link auth → player. Worst case, the server
            // will resolve it and echo back your_player_id in game_state.
            console.warn('[init] auth_user_id lookup returned nothing — will rely on server resolution');
          }

          if (resolvedPlayerId) {
            localStorage.setItem('player_id', resolvedPlayerId);
          }
        }

        myPlayerIdRef.current = resolvedPlayerId;

        // ── Step 3: Connect to socket server ──────────────────────────────────
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
        if (!socketUrl) {
          console.error('[socket] NEXT_PUBLIC_SOCKET_URL is not set — check Vercel env vars');
        }

        sock = io(socketUrl || 'http://localhost:3001', {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });
        socketRef.current = sock;

        sock.on('connect', () => {
          console.log('[socket] connected | game:', gameId, '| auth:', user.id, '| player:', resolvedPlayerId);
          sock.emit('join_game', {
            game_id: gameId,
            auth_user_id: user.id,       // server uses this to verify identity
            player_id: resolvedPlayerId, // already resolved — server falls back to this
            is_spectator: false,
          });
        });

        sock.on('connect_error', (err) => {
          console.error('[socket] connect_error:', err.message);
          // Don't leave user stuck on "Loading" — show "Waiting" so they know something happened
          setStatus('waiting');
        });

      sock.on("game_state", (d) => {
        if (d.pgn) chess.loadPgn(d.pgn);
        setFen(d.fen || chess.fen());
        setMoves(chess.history());
        setStatus(d.status === "active" ? "active" : "waiting");
        setSpectators(d.spectator_count || 0);

        // Server echoes back our resolved player_id — use it as the source of truth.
        // This handles the case where the client-side auth_user_id lookup would have
        // failed (e.g., auth_user_id was null for legacy players in the DB).
        if (d.your_player_id) {
          myPlayerIdRef.current = d.your_player_id;
          localStorage.setItem('player_id', d.your_player_id);
        }

        const myId = myPlayerIdRef.current;
        if (myId && d.white_player_id && d.black_player_id) {
          if (myId === d.white_player_id) myColorRef.current = "white";
          else if (myId === d.black_player_id) myColorRef.current = "black";
        }
        setWhite((p) => ({
          ...p,
          name:   d.white_name   || p.name,
          rating: d.white_rating || p.rating,
          timeMs: d.white_time,
          isActive: d.current_turn === "w" && d.status === "active",
        }));
        setBlack((p) => ({
          ...p,
          name:   d.black_name   || p.name,
          rating: d.black_rating || p.rating,
          timeMs: d.black_time,
          isActive: d.current_turn === "b" && d.status === "active",
        }));
      });

      sock.on("game_started", (d) => {
        setStatus("active");
        // Use ref here — myPlayerIdRef is already populated from game_state which
        // arrives just before this event. Never use a stale closure variable.
        const myId = myPlayerIdRef.current;
        if (myId === d.white_player_id) myColorRef.current = "white";
        if (myId === d.black_player_id) myColorRef.current = "black";
        setWhite((p) => ({
          ...p,
          name:   d.white_name   || p.name,
          rating: d.white_rating || p.rating,
          timeMs: d.white_time, isActive: true,
        }));
        setBlack((p) => ({
          ...p,
          name:   d.black_name   || p.name,
          rating: d.black_rating || p.rating,
          timeMs: d.black_time, isActive: false,
        }));
      });

      sock.on("move_made", (d) => {
        // chess.load(fen) only loads a position — it wipes all move history.
        // chess.loadPgn(pgn) restores the full game including all past moves,
        // which is what we need for move history display and sound detection.
        if (d.pgn) {
          chess.loadPgn(d.pgn);
        } else {
          // Fallback for older server versions that don't send pgn
          chess.load(d.fen);
        }
        const history = chess.history({ verbose: true });
        const lastMove = history[history.length - 1];
        if (lastMove?.promotion) play("promote");
        else if (lastMove?.flags?.includes("k") || lastMove?.flags?.includes("q")) play("castle");
        else if (chess.isCheck()) play("check");
        else if (lastMove?.captured) play("capture");
        else play("move");
        setFen(chess.fen());
        setMoves(chess.history());
        setWhite((p) => ({ ...p, timeMs: d.white_time, isActive: d.current_turn === "w" }));
        setBlack((p) => ({ ...p, timeMs: d.black_time, isActive: d.current_turn === "b" }));
      });

      sock.on("game_ended", (d) => {
        setStatus("ended");
        setResult(d.result);
        if (d.pgn) setFinalPgn(d.pgn); // server sends the complete, correctly-headered PGN
        setWhite((p) => ({ ...p, isActive: false }));
        setBlack((p) => ({ ...p, isActive: false }));
        if (myColorRef.current) {
          const iWon = (d.result === "1-0" && myColorRef.current === "white") || (d.result === "0-1" && myColorRef.current === "black");
          if (iWon) play("win");
          else if (d.result === "0.5-0.5") play("draw");
          else play("loss");
        }
      });
      sock.on("draw_offered", ({ by_player_id }) => {
        if (by_player_id !== myPlayerIdRef.current) setDrawOffered(true);
      });
      sock.on("spectator_count", ({ count }) => setSpectators(count));
      sock.on("error", ({ message }) => {
        console.error("[socket error]", message);
        setStatus("ended");
        setResult(message || "Server error");
      });
      sock.on("game_already_finished", ({ result: r }) => {
        setStatus("ended");
        setResult(r);
      });

      } catch (err: any) {
        // Catch any unhandled error in init() so status never stays stuck at "loading"
        console.error('[init] unhandled error:', err?.message ?? err);
        setStatus('waiting');
      }
    }

    init();

    return () => {
      sock?.disconnect();
      socketRef.current = null;
    };
  }, [gameId]);

  // HELPER: Show valid move dots
  function getMoveOptions(square: any) {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const newSquares: any = {};
    moves.map((m) => {
      newSquares[m.to] = {
        background: chess.get(m.to)
          ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
          : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return m;
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  }

  // TAP-TO-MOVE HANDLER
  function onSquareClick(square: any) {
    const myPlayerId = myPlayerIdRef.current;
    if (status !== "active" || !myPlayerId) return;
    const isMyTurn =
      (chess.turn() === "w" && myColorRef.current === "white") ||
      (chess.turn() === "b" && myColorRef.current === "black");
    if (!isMyTurn) return;

    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    // Try to make move
    const sock = socketRef.current;
    sock?.emit("make_move", {
      game_id: gameId,
      player_id: myPlayerId,
      move: { from: moveFrom, to: square, promotion: "q" },
    });
    setMoveFrom(null);
    setOptionSquares({});
  }

  const onDrop = useCallback(
    (src: string, tgt: string) => {
      const myPlayerId = myPlayerIdRef.current;
      const sock = socketRef.current;
      if (status !== "active" || !sock) return false;
      const isMyTurn =
        (chess.turn() === "w" && myColorRef.current === "white") ||
        (chess.turn() === "b" && myColorRef.current === "black");
      if (!isMyTurn) return false;
      sock.emit("make_move", {
        game_id: gameId,
        player_id: myPlayerId,
        move: { from: src, to: tgt, promotion: "q" },
      });
      return true;
    },
    [status, chess, gameId],
  );

  if (status === "unauthorized")
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="card p-8 w-full max-w-sm text-center space-y-4">
          <ShieldAlert className="mx-auto text-red-400" size={48} />
          <h2 className="text-xl font-bold text-chalk">
            Authentication Required
          </h2>
          <p className="text-ink-400 text-sm">
            You must verify your email and sign in before you can participate in
            a live match.
          </p>
          <button
            onClick={() => router.push("/auth/login")}
            className="btn-gold w-full text-sm"
          >
            Sign In
          </button>
        </div>
      </div>
    );

  const orientation = myColorRef.current === "black" ? "black" : "white";
  const isSpectator = !myPlayerIdRef.current || myColorRef.current === null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {status === "active" && <span className="live-dot" />}
          <span className="text-sm font-medium text-chalk capitalize">
            {status}
          </span>
          {result && (
            <span className="text-sm font-bold px-2 py-0.5 rounded bg-gold/20 text-gold">
              {result === "0.5-0.5"
                ? "Draw"
                : result === "1-0"
                  ? "White wins"
                  : "Black wins"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {spectators > 0 && (
            <a href={`/game/${gameId}/spectate`} target="_blank"
               className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-chalk transition-colors">
              <Eye size={12} /> {spectators} watching
            </a>
          )}
          <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
        </div>
      </div>

      {drawOffered && (
        <div className="mb-4 p-4 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-between">
          <span className="text-sm text-chalk">Draw offered - accept?</span>
          <div className="flex gap-2">
            <button
              onClick={() => {
                socketRef.current?.emit("accept_draw", { game_id: gameId });
                setDrawOffered(false);
              }}
              className="btn-gold btn-sm"
            >
              Accept
            </button>
            <button
              onClick={() => setDrawOffered(false)}
              className="btn-ghost btn-sm"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <Clock
            {...(orientation === "white"
              ? { ...black, color: "black" }
              : { ...white, color: "white" })}
          />

          {/* UPDATED: touch-none wrapper stops scrolling during piece movement */}
          <div className="board-wrapper touch-none select-none">
            {typeof window !== "undefined" && (
              <Chessboard
                position={fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={optionSquares}
                boardOrientation={orientation}
                customDarkSquareStyle={{ backgroundColor: "#4a6080" }}
                customLightSquareStyle={{ backgroundColor: "#b0bcce" }}
                arePiecesDraggable={status === "active" && !isSpectator && !touchMode}
                animationDuration={150}
              />
            )}
          </div>

          <Clock
            {...(orientation === "white"
              ? { ...white, color: "white" }
              : { ...black, color: "black" })}
          />

          {!isSpectator && status === "active" && (
            <div className="flex gap-2">
              <button
                onClick={() =>
                  socketRef.current?.emit("offer_draw", {
                    game_id: gameId,
                    player_id: myPlayerIdRef.current,
                  })
                }
                className="btn-ghost flex-1 gap-2 text-sm"
              >
                <Handshake size={14} /> Offer Draw
              </button>
              <button
                onClick={() =>
                  confirm("Resign?") &&
                  socketRef.current?.emit("resign", {
                    game_id: gameId,
                    player_id: myPlayerIdRef.current,
                  })
                }
                className="btn-danger flex-1 gap-2 text-sm"
              >
                <Flag size={14} /> Resign
              </button>
            </div>
          )}
          {status === "ended" && (
            <div className="flex gap-2">
              <Link
                href={`/game/${gameId}`}
                className="btn-ghost flex-1 justify-center gap-2 text-sm"
              >
                <RotateCcw size={14} /> Analysis
              </Link>
              <button
                onClick={() => {
                  // Use the PGN received from the server — it has correct headers
                  // (player names, Elo, date, result). Falling back to chess.pgn()
                  // would produce '[Result "*"]' and no player names.
                  const pgn = finalPgn ?? chess.pgn();
                  const blob = new Blob([pgn], { type: "text/plain" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `game-${gameId}.pgn`;
                  a.click();
                }}
                className="btn-ghost flex-1 justify-center gap-2 text-sm"
              >
                <Download size={14} /> PGN
              </button>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <div className="section-label mb-3">Move History</div>
            <MoveHistory moves={moves} />
          </div>
          <div className="card p-4">
            <div className="section-label mb-3">Game Info</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-400">Status</span>
                <span className="text-chalk capitalize">{status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-400">Spectators</span>
                <span className="text-chalk">{spectators}</span>
              </div>
            </div>
          </div>
          {status === "waiting" && (
            <div className="card p-6 text-center border-dashed border-ink-600">
              <div className="text-2xl mb-2">⏳</div>
              <div className="text-sm text-ink-400">
                Waiting for both players...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}