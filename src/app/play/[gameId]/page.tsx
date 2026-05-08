"use client";
import { SoundToggle } from "@/components/chess/SoundToggle";
import { CountdownBadge } from "@/components/ui/CountdownBadge";
import { useSound } from "@/hooks/useSound";
import { supabase } from "@/lib/supabase";
import { Chess, type Square } from "chess.js";
import {
  AlertTriangle,
  Bell,
  Clock as ClockIcon,
  Download,
  Eye,
  Flag,
  Handshake,
  Loader2,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

function formatTime(ms: number): { text: string; isLow: boolean } {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    text: `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`,
    isLow: ms < 30_000,
  };
}

// ─── Captured Pieces Component ──────────────────────────────────────────────

const PIECE_SYMBOLS: Record<string, string> = {
  p: '\u2659', n: '\u2658', b: '\u2657', r: '\u2656', q: '\u2655',
  P: '\u265F', N: '\u265E', B: '\u265D', R: '\u265C', Q: '\u265B',
};

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9,
};

function CapturedPieces({ chess, color }: { chess: Chess; color: 'white' | 'black' }): React.ReactElement {
  const captured: string[] = useMemo(() => {
    const history = chess.history({ verbose: true });
    const pieces: string[] = [];

    for (const move of history) {
      if (move.captured) {
        const capturedColor: 'b' | 'w' = move.color === 'w' ? 'b' : 'w';
        if (capturedColor === (color === 'white' ? 'b' : 'w')) {
          pieces.push(move.captured);
        }
      }
    }

    const order: string[] = ['q', 'r', 'b', 'n', 'p'];
    pieces.sort((a, b) => order.indexOf(b) - order.indexOf(a));

    return pieces;
  }, [chess.history().length, color]);

  const advantage: number = useMemo(() => {
    const board = chess.board();
    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (piece) {
          const val: number = PIECE_VALUES[piece.type] || 0;
          if (piece.color === 'w') whiteMaterial += val;
          else blackMaterial += val;
        }
      }
    }

    const diff = whiteMaterial - blackMaterial;
    return color === 'white' ? diff : -diff;
  }, [chess.fen(), color]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 min-w-[60px]">
        {captured.map((piece, i) => (
          <span key={i} className="text-lg leading-none opacity-80">
            {PIECE_SYMBOLS[piece] || ''}
          </span>
        ))}
        {captured.length === 0 && (
          <span className="text-xs text-ink-600">—</span>
        )}
      </div>
      {advantage > 0 && (
        <span className="text-xs font-bold text-green-400">+{advantage}</span>
      )}
      {advantage < 0 && (
        <span className="text-xs font-bold text-red-400">{advantage}</span>
      )}
    </div>
  );
}

// ─── Clock Component ─────────────────────────────────────────────────────────

interface ClockProps {
  name: string;
  rating: number;
  timeMs: number;
  isActive: boolean;
  color: 'white' | 'black';
  chess: Chess;
  playerColor: 'white' | 'black';
}

function Clock({ name, rating, timeMs, isActive, color, chess, playerColor }: ClockProps): React.ReactElement {
  const [display, setDisplay] = useState<number>(timeMs);
  const lastRef = useRef<number>(Date.now());
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

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
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [timeMs, isActive]);

  const { text, isLow } = formatTime(display);
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
        isActive ? "bg-ink-700 border-ink-500" : "bg-ink-900 border-ink-800"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400">
            {color === "white" ? "♔ White" : "♚ Black"}
          </span>
          <CapturedPieces chess={chess} color={playerColor} />
        </div>
        <div className={`font-medium text-sm ${isActive ? "text-chalk" : "text-ink-400"}`}>
          {name}
        </div>
        <div className="text-xs text-ink-500">±{Math.round(rating)}</div>
      </div>
      <span
        className={`font-mono text-2xl font-bold tabular-nums flex-shrink-0 ml-3 ${
          !isActive ? "text-ink-400" : isLow ? "text-red-400" : "text-chalk"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

// ─── Move History ────────────────────────────────────────────────────────────

function MoveHistory({ moves }: { moves: string[] }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [moves]);
  const pairs: [string, string?][] = [];
  for (let i = 0; i < moves.length; i += 2)
    pairs.push([moves[i], moves[i + 1]]);
  return (
    <div ref={ref} className="h-40 overflow-y-auto font-mono text-sm space-y-0.5 no-scrollbar">
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

// ─── Nudge Button ────────────────────────────────────────────────────────────

function NudgeButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }): React.ReactElement {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-ghost btn-sm gap-2 disabled:opacity-50">
      <Bell size={14} />{label}
    </button>
  );
}

// ─── Main Game Room ──────────────────────────────────────────────────────────

export default function GameRoomPage(): React.ReactElement {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const [chess] = useState<Chess>(() => new Chess());
  const [fen, setFen] = useState<string>(chess.fen());
  const [status, setStatus] = useState<"loading" | "waiting" | "active" | "ended" | "unauthorized">("loading");
  const [result, setResult] = useState<string | null>(null);
  const [finalPgn, setFinalPgn] = useState<string | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [touchMode] = useState<boolean>(isTouchDevice);
  const [drawOffered, setDrawOffered] = useState<boolean>(false);
  const [spectators, setSpectators] = useState<number>(0);
  const { play, enabled: soundEnabled, toggle: toggleSound } = useSound();
  const playRef = useRef(play);
  useEffect(() => { playRef.current = play; }, [play]);

  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "reconnecting">("connected");
  const [opponentStatus, setOpponentStatus] = useState<"connected" | "disconnected">("connected");
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [disconnectedPlayerId, setDisconnectedPlayerId] = useState<string | null>(null);
  const [disconnectedPlayerName, setDisconnectedPlayerName] = useState<string | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current); };
  }, []);

  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});
  const [lastMoveSquares, setLastMoveSquares] = useState<Record<string, React.CSSProperties>>({});
  const [confirmMove, setConfirmMove] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("confirmMove") === "true";
  });
  const [pendingMove, setPendingMove] = useState<{ from: Square; to: Square; promotion: string } | null>(null);
  const [pendingFen, setPendingFen] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const myColorRef = useRef<"white" | "black" | null>(null);
  const myPlayerIdRef = useRef<string | null>(null);

  const [white, setWhite] = useState<{ name: string; rating: number; timeMs: number; isActive: boolean }>({ name: "White", rating: 1200, timeMs: 600_000, isActive: false });
  const [black, setBlack] = useState<{ name: string; rating: number; timeMs: number; isActive: boolean }>({ name: "Black", rating: 1200, timeMs: 600_000, isActive: false });
  const [whiteWhatsapp, setWhiteWhatsapp] = useState<string | null>(null);
  const [blackWhatsapp, setBlackWhatsapp] = useState<string | null>(null);
  const [nudgeCooldown, setNudgeCooldown] = useState<number>(0);
  const [claimPending, setClaimPending] = useState<boolean>(false);
  const [claimGraceEndsAt, setClaimGraceEndsAt] = useState<string | null>(null);
  const [claimCountdown, setClaimCountdown] = useState<number>(0);
  const [roundWindow, setRoundWindow] = useState<any>(null);

  // Timers
  useEffect(() => {
    if (nudgeCooldown <= 0) return;
    const t = setInterval(() => setNudgeCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [nudgeCooldown]);

  useEffect(() => {
    if (!claimGraceEndsAt) { setClaimCountdown(0); return; }
    const update = () => {
      const r = Math.max(0, Math.floor((new Date(claimGraceEndsAt).getTime() - Date.now()) / 1000));
      setClaimCountdown(r);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [claimGraceEndsAt]);

  useEffect(() => {
    if (!reconnectCountdown || reconnectCountdown <= 0) {
      if (reconnectTimerRef.current) { clearInterval(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      return;
    }
    reconnectTimerRef.current = setInterval(() => {
      setReconnectCountdown(p => {
        if (p === null || p <= 1) {
          if (reconnectTimerRef.current) { clearInterval(reconnectTimerRef.current); reconnectTimerRef.current = null; }
          return null;
        }
        return p - 1;
      });
    }, 1000);
    return () => { if (reconnectTimerRef.current) { clearInterval(reconnectTimerRef.current); reconnectTimerRef.current = null; } };
  }, [reconnectCountdown]);

  // Main socket init
  useEffect(() => {
    let sock: Socket;
    let user: any = null;

    async function init(): Promise<void> {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setStatus("unauthorized"); return; }
        user = session.user;

        let resolvedPlayerId: string | undefined = undefined;
        if (typeof window !== "undefined") {
          resolvedPlayerId = localStorage.getItem("player_id") ?? undefined;
        }
        if (!resolvedPlayerId) {
          const { data: byAuthId } = await supabase.from("players").select("id").eq("auth_user_id", user.id).maybeSingle();
          if (byAuthId?.id) {
            resolvedPlayerId = byAuthId.id;  // ✅ string assigned to string | undefined
            localStorage.setItem("player_id", resolvedPlayerId ?? "");
          }
        }
        myPlayerIdRef.current = resolvedPlayerId ?? null;  

        const socketUrl: string = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
        sock = io(socketUrl, { transports: ["websocket", "polling"], timeout: 20000, reconnectionAttempts: 10, reconnectionDelay: 1000, reconnectionDelayMax: 5000 });
        socketRef.current = sock;

        sock.on("connect", () => {
          sock.emit("join_game", { game_id: gameId, auth_user_id: user?.id, player_id: myPlayerIdRef.current ?? undefined, is_spectator: false });
        });
        sock.on("disconnect", () => { setConnectionStatus("disconnected"); });
        sock.on("reconnect_attempt", () => setConnectionStatus("reconnecting"));
        sock.on("reconnect_failed", () => setConnectionStatus("disconnected"));
        sock.on("connect_error", () => { setStatus("waiting"); setConnectionStatus("disconnected"); });

        sock.on("game_state", (d: any) => {
          if (d.pgn) chess.loadPgn(d.pgn);
          setFen(d.fen || chess.fen());
          setMoves(chess.history());
          setStatus(d.status === "active" ? "active" : "waiting");
          setSpectators(d.spectator_count || 0);
          setWhiteWhatsapp(d.white_whatsapp || null);
          setBlackWhatsapp(d.black_whatsapp || null);
          setConnectionStatus("connected");
          if (d.your_player_id) { myPlayerIdRef.current = d.your_player_id; localStorage.setItem("player_id", d.your_player_id); }
          const myId: string | null = myPlayerIdRef.current;
          if (myId && d.white_player_id && d.black_player_id) {
            if (myId === d.white_player_id) myColorRef.current = "white";
            else if (myId === d.black_player_id) myColorRef.current = "black";
          }
          setWhite(p => ({ ...p, name: d.white_name || p.name, rating: d.white_rating || p.rating, timeMs: d.white_time, isActive: d.current_turn === "w" && d.status === "active" }));
          setBlack(p => ({ ...p, name: d.black_name || p.name, rating: d.black_rating || p.rating, timeMs: d.black_time, isActive: d.current_turn === "b" && d.status === "active" }));
        });

        sock.on("game_started", (d: any) => {
          setStatus("active");
          if (myPlayerIdRef.current === d.white_player_id) myColorRef.current = "white";
          if (myPlayerIdRef.current === d.black_player_id) myColorRef.current = "black";
          setWhite(p => ({ ...p, name: d.white_name || p.name, rating: d.white_rating || p.rating, timeMs: d.white_time, isActive: true }));
          setBlack(p => ({ ...p, name: d.black_name || p.name, rating: d.black_rating || p.rating, timeMs: d.black_time, isActive: false }));
        });

        sock.on("move_made", (d: any) => {
          if (d.pgn) chess.loadPgn(d.pgn); else chess.load(d.fen);
          const history = chess.history({ verbose: true });
          const lastMove = history[history.length - 1];
          if (lastMove?.promotion) playRef.current("promote");
          else if (lastMove?.flags?.includes("k") || lastMove?.flags?.includes("q")) playRef.current("castle");
          else if (chess.isCheck()) playRef.current("check");
          else if (lastMove?.captured) playRef.current("capture");
          else playRef.current("move");
          setFen(chess.fen());
          setMoves(chess.history());
          setWhite(p => ({ ...p, timeMs: d.white_time, isActive: d.current_turn === "w" }));
          setBlack(p => ({ ...p, timeMs: d.black_time, isActive: d.current_turn === "b" }));
          if (lastMove) setLastMoveSquares({ [lastMove.from]: { backgroundColor: "rgba(255, 255, 0, 0.25)" }, [lastMove.to]: { backgroundColor: "rgba(255, 255, 0, 0.35)" } });
          setPendingMove(null);
          setPendingFen(null);
        });

        sock.on("player_disconnected", ({ player_id, reconnect_window }: { player_id: string; reconnect_window: number }) => {
          if (player_id !== myPlayerIdRef.current) {
            setOpponentStatus("disconnected");
            setDisconnectedPlayerId(player_id);
            setReconnectCountdown(reconnect_window || 180);
          } else { setConnectionStatus("disconnected"); }
        });

        sock.on("player_joined", ({ player_id, is_spectator }: { player_id: string; is_spectator: boolean }) => {
          if (!is_spectator && player_id === disconnectedPlayerId) { setOpponentStatus("connected"); setDisconnectedPlayerId(null); setReconnectCountdown(null); }
          else if (!is_spectator && player_id === myPlayerIdRef.current) { setConnectionStatus("connected"); }
        });

        sock.on("game_ended", (d: any) => {
          setStatus("ended"); setResult(d.result); setConnectionStatus("connected"); setOpponentStatus("connected");
          if (d.pgn) { setFinalPgn(d.pgn); try { chess.loadPgn(d.pgn); setFen(chess.fen()); setMoves(chess.history()); } catch {} }
          setWhite(p => ({ ...p, isActive: false })); setBlack(p => ({ ...p, isActive: false }));
          if (myColorRef.current) {
            const iWon: boolean = (d.result === "1-0" && myColorRef.current === "white") || (d.result === "0-1" && myColorRef.current === "black");
            if (iWon) playRef.current("win"); else if (d.result === "0.5-0.5") playRef.current("draw"); else playRef.current("loss");
          }
        });

        sock.on("draw_offered", ({ by_player_id }: { by_player_id: string }) => { if (by_player_id !== myPlayerIdRef.current) setDrawOffered(true); });
        sock.on("spectator_count", ({ count }: { count: number }) => setSpectators(count));
        sock.on("error", ({ message }: { message: string }) => { setStatus("ended"); setResult(message); });
        sock.on("game_already_finished", ({ result: r, pgn: finishedPgn }: { result: string; pgn: string }) => { setStatus("ended"); setResult(r); if (finishedPgn) { try { chess.loadPgn(finishedPgn); setFen(chess.fen()); setMoves(chess.history()); setFinalPgn(finishedPgn); } catch {} } });
        sock.on("no_show_claimed", ({ grace_ends_at }: { grace_ends_at: string }) => { setClaimPending(true); setClaimGraceEndsAt(grace_ends_at); });
        sock.on("claim_denied", ({ reason }: { reason: string }) => console.warn("[claim] denied:", reason));
      } catch { setStatus("waiting"); }
    }

    init();

    async function fetchRoundWindow(): Promise<void> {
      try {
        const { data: game } = await supabase.from("games").select("season, round, league").eq("id", gameId).single();
        if (game?.season && game?.round) {
          const { data: rw } = await supabase.from("round_windows").select("*").eq("season", game.season).eq("round", game.round).eq("league", game.league).single();
          if (rw) setRoundWindow(rw);
        }
      } catch {}
    }
    fetchRoundWindow();

    return () => { sock?.disconnect(); socketRef.current = null; };
  }, [gameId]);

  function getMoveOptions(square: Square): boolean {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length === 0) { setOptionSquares({}); return false; }
    const newSquares: Record<string, React.CSSProperties> = {};
    moves.forEach((m) => {
      newSquares[m.to] = {
        background: chess.get(m.to)
          ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
          : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  }

  function tryMoveLocally(from: Square, to: Square, promotion: string = "q"): string | null {
    const tempChess = new Chess(chess.fen());
    try { const result = tempChess.move({ from, to, promotion }); return result ? tempChess.fen() : null; } catch { return null; }
  }

  function emitMove(from: Square, to: Square, promotion: string = "q"): void {
    socketRef.current?.emit("make_move", { game_id: gameId, player_id: myPlayerIdRef.current, move: { from, to, promotion } });
  }

  function onSquareClick(square: Square): void {
    if (status !== "active" || !myPlayerIdRef.current) return;
    const isMyTurn: boolean = (chess.turn() === "w" && myColorRef.current === "white") || (chess.turn() === "b" && myColorRef.current === "black");
    if (!isMyTurn) return;
    if (pendingMove) { setPendingMove(null); setPendingFen(null); setMoveFrom(null); return; }
    if (!moveFrom) { if (getMoveOptions(square)) setMoveFrom(square); return; }
    const newFen: string | null = tryMoveLocally(moveFrom, square);
    if (!newFen) { setMoveFrom(null); setOptionSquares({}); return; }
    if (confirmMove) { setPendingMove({ from: moveFrom, to: square, promotion: "q" }); setPendingFen(newFen); } else { emitMove(moveFrom, square); }
    setMoveFrom(null); setOptionSquares({});
  }

  const onDrop = useCallback((src: string, tgt: string): boolean => {
    if (status !== "active" || !socketRef.current) return false;
    const isMyTurn: boolean = (chess.turn() === "w" && myColorRef.current === "white") || (chess.turn() === "b" && myColorRef.current === "black");
    if (!isMyTurn) return false;
    const from: Square = src as Square;
    const to: Square = tgt as Square;
    const newFen: string | null = tryMoveLocally(from, to);
    if (!newFen) return false;
    if (confirmMove) { setPendingMove({ from, to, promotion: "q" }); setPendingFen(newFen); } else { emitMove(from, to); }
    return true;
  }, [status, chess, gameId, confirmMove]);

  const nudgeOpponent = (): void => {
    if (nudgeCooldown > 0 || opponentStatus === 'connected') return;
    socketRef.current?.emit("nudge_opponent", { game_id: gameId, player_id: myPlayerIdRef.current });
    setNudgeCooldown(60);
  };

  const claimNoShow = (): void => {
    if (opponentStatus === 'connected') return;
    if (!confirm("Claim opponent as no-show? They will have time to join before automatic forfeit.")) return;
    socketRef.current?.emit("claim_no_show", { game_id: gameId, player_id: myPlayerIdRef.current });
  };

  if (status === "unauthorized") return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-sm text-center space-y-4">
        <ShieldAlert className="mx-auto text-red-400" size={48} />
        <h2 className="text-xl font-bold text-chalk">Authentication Required</h2>
        <p className="text-ink-400 text-sm">You must verify your email and sign in before you can participate in a live match.</p>
        <button onClick={() => router.push("/auth/login")} className="btn-gold w-full text-sm">Sign In</button>
      </div>
    </div>
  );

  const orientation: 'white' | 'black' = myColorRef.current === "black" ? "black" : "white";
  const isSpectator: boolean = !myPlayerIdRef.current || myColorRef.current === null;
  const opponentOnline: boolean = opponentStatus === 'connected';

  // Prepare clock props to avoid type conflicts
  const opponentColor: 'white' | 'black' = orientation === "white" ? "black" : "white";
  const playerColor: 'white' | 'black' = orientation === "white" ? "white" : "black";
  const opponentClock = orientation === "white" ? black : white;
  const playerClock = orientation === "white" ? white : black;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {connectionStatus === "reconnecting" && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-amber-900/95 border border-amber-500/60 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3"><Loader2 className="animate-spin text-amber-400 flex-shrink-0" size={18} /><div><div className="font-semibold text-amber-300 text-sm">Reconnecting...</div><div className="text-xs text-amber-400/80">Attempting to restore connection</div></div></div>
        </div>
      )}
      {connectionStatus === "disconnected" && status !== "ended" && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/95 border border-red-500/60 px-6 py-3 rounded-xl shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3"><WifiOff size={18} className="text-red-400" /><div><div className="font-semibold text-red-300 text-sm">Connection Lost</div><div className="text-xs text-red-400/80">You have 3 minutes to reconnect.</div></div></div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {status === "active" && connectionStatus === "connected" && <span className="live-dot" />}
          <span className="text-sm font-medium text-chalk capitalize">{connectionStatus !== "connected" ? connectionStatus : status}</span>
          {result && <span className="text-sm font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">{result === "0.5-0.5" ? "Draw" : result === "1-0" ? "White wins" : "Black wins"}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${connectionStatus === "connected" ? "border-green-700/50 text-green-400 bg-green-400/10" : "border-red-700/50 text-red-400 bg-red-400/10"}`}>
            {connectionStatus === "connected" ? <Wifi size={11} /> : <WifiOff size={11} />}{connectionStatus}
          </span>
          {!isSpectator && (
            <button onClick={() => { const n = !confirmMove; setConfirmMove(n); localStorage.setItem("confirmMove", String(n)); if (!n) { setPendingMove(null); setPendingFen(null); } }} className={`text-xs px-2 py-1 rounded border ${confirmMove ? "border-orange-500 text-orange-400 bg-orange-500/10" : "border-ink-600 text-ink-400 hover:text-chalk"}`}>✓ Confirm</button>
          )}
          <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
        </div>
      </div>

      {roundWindow && <div className="mb-3"><CountdownBadge window={roundWindow} /></div>}

      {opponentStatus === "disconnected" && status === "active" && (
        <div className="mb-4 p-4 rounded-xl bg-red-900/20 border border-red-700/50">
          <div className="flex items-center gap-3">
            <WifiOff size={18} className="text-red-400 flex-shrink-0" />
            <div className="flex-1"><div className="text-sm font-medium text-red-300">{disconnectedPlayerName || "Opponent"} Disconnected</div>
              {reconnectCountdown !== null && reconnectCountdown > 0 && <div className="text-xs text-red-400/80 mt-1">Automatic forfeit in {Math.floor(reconnectCountdown / 60)}:{(reconnectCountdown % 60).toString().padStart(2, "0")}</div>}
            </div>
            <NudgeButton onClick={nudgeOpponent} disabled={nudgeCooldown > 0} label={nudgeCooldown > 0 ? `${nudgeCooldown}s` : "Nudge"} />
            <button onClick={claimNoShow} className="btn-danger btn-sm gap-1.5"><AlertTriangle size={13} />Claim Forfeit</button>
          </div>
        </div>
      )}

      {drawOffered && (
        <div className="mb-4 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-between">
          <span className="text-sm text-chalk">Draw offered - accept?</span>
          <div className="flex gap-2"><button onClick={() => { socketRef.current?.emit("accept_draw", { game_id: gameId }); setDrawOffered(false); }} className="btn-gold btn-sm">Accept</button><button onClick={() => setDrawOffered(false)} className="btn-ghost btn-sm">Decline</button></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <Clock
            name={opponentClock.name}
            rating={opponentClock.rating}
            timeMs={opponentClock.timeMs}
            isActive={opponentClock.isActive}
            color={opponentColor}
            playerColor={opponentColor}
            chess={chess}
          />

          <div className="board-wrapper touch-none select-none relative">
            {typeof window !== "undefined" && (
              <Chessboard
                position={pendingFen ?? fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={{ ...lastMoveSquares, ...optionSquares }}
                boardOrientation={orientation}
                customDarkSquareStyle={{ backgroundColor: "#4a6080" }}
                customLightSquareStyle={{ backgroundColor: "#b0bcce" }}
                arePiecesDraggable={status === "active" && !isSpectator && !touchMode && !pendingMove && connectionStatus === "connected"}
                animationDuration={150}
              />
            )}
          </div>

          {pendingMove && (
            <div className="flex gap-2 justify-center">
              <button onClick={() => { emitMove(pendingMove.from, pendingMove.to, pendingMove.promotion); setPendingMove(null); setPendingFen(null); }} className="btn-gold flex-1 text-sm font-semibold gap-1.5">✓ Confirm Move</button>
              <button onClick={() => { setPendingMove(null); setPendingFen(null); }} className="btn-ghost flex-1 text-sm gap-1.5">✕ Cancel</button>
            </div>
          )}

          <Clock
            name={playerClock.name}
            rating={playerClock.rating}
            timeMs={playerClock.timeMs}
            isActive={playerClock.isActive}
            color={playerColor}
            playerColor={playerColor}
            chess={chess}
          />

          {!isSpectator && status === "active" && (
            <div className="flex gap-2">
              <button onClick={() => socketRef.current?.emit("offer_draw", { game_id: gameId, player_id: myPlayerIdRef.current })} className="btn-ghost flex-1 gap-2 text-sm"><Handshake size={14} /> Offer Draw</button>
              <button onClick={() => confirm("Resign?") && socketRef.current?.emit("resign", { game_id: gameId, player_id: myPlayerIdRef.current })} className="btn-danger flex-1 gap-2 text-sm"><Flag size={14} /> Resign</button>
            </div>
          )}
          {status === "ended" && (
            <div className="flex gap-2">
              <Link href={`/game/${gameId}/review`} className="btn-ghost flex-1 justify-center gap-2 text-sm"><RotateCcw size={14} /> Analysis</Link>
              <button onClick={() => { const pgn = finalPgn ?? chess.pgn(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([pgn], { type: "text/plain" })); a.download = `game-${gameId}.pgn`; a.click(); }} className="btn-ghost flex-1 justify-center gap-2 text-sm"><Download size={14} /> PGN</button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="section-label mb-1">Opponent Contact</div>

            {(myColorRef.current === "white" ? blackWhatsapp : whiteWhatsapp) && (
              <a href={`https://wa.me/${(myColorRef.current === "white" ? blackWhatsapp : whiteWhatsapp)?.replace(/\+/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-green-400 hover:text-green-300 py-1.5 px-3 rounded-lg bg-green-400/5 border border-green-400/10 w-full">
                <MessageCircle size={14} />Message on WhatsApp
              </a>
            )}

            {!isSpectator && status === "active" && (
              <NudgeButton onClick={nudgeOpponent} disabled={nudgeCooldown > 0 || opponentOnline} label={opponentOnline ? "Opponent is Online" : nudgeCooldown > 0 ? `Nudge again in ${nudgeCooldown}s` : "Nudge Opponent"} />
            )}

            {!isSpectator && status === "active" && !claimPending && (
              <button onClick={claimNoShow} disabled={opponentOnline} className="btn-danger w-full text-sm gap-2 disabled:opacity-40">
                <AlertTriangle size={14} />{opponentOnline ? "Opponent is Online" : "Opponent No-Show"}
              </button>
            )}

            {claimPending && claimCountdown > 0 && (
              <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/50">
                <div className="flex items-center gap-3">
                  <ClockIcon size={18} className="text-amber-400 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-amber-300">No-Show Claimed</div>
                    <div className="text-xs text-amber-400/80 mt-1">Opponent has {Math.floor(claimCountdown / 60)}:{(claimCountdown % 60).toString().padStart(2, "0")} to join before automatic forfeit</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card p-4"><div className="section-label mb-3">Move History</div><MoveHistory moves={moves} /></div>
          <div className="card p-4">
            <div className="section-label mb-3">Game Info</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-400">Status</span><span className="text-chalk capitalize">{status}</span></div>
              <div className="flex justify-between"><span className="text-ink-400">Connection</span><span className={connectionStatus === "connected" ? "text-green-400" : "text-red-400"}>{connectionStatus}</span></div>
              <div className="flex justify-between"><span className="text-ink-400">Opponent</span><span className={opponentStatus === "connected" ? "text-green-400" : "text-red-400"}>{opponentStatus}</span></div>
              <div className="flex justify-between"><span className="text-ink-400">Spectators</span><span className="text-chalk">{spectators}</span></div>
            </div>
          </div>
          {status === "waiting" && <div className="card p-6 text-center border-dashed border-ink-600"><div className="text-2xl mb-2">⏳</div><div className="text-sm text-ink-400">Waiting for both players...</div></div>}
        </div>
      </div>
    </div>
  );
}