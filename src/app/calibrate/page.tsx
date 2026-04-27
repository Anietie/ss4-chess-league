"use client";
import { BOT_LEVELS } from "@/lib/chess-com-api";
import { supabase } from "@/lib/supabase";
import { Chess } from "chess.js";
import { ArrowRight, Bot, CheckCircle, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

// Detect touch-only devices so we disable drag and rely on tap-to-move.
// This fixes the "piece appears far from finger" issue caused by
// react-chessboard's drag using raw pointer coords that don't account
// for the board's offset on mobile viewports.
function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function useStockfish(level: number) {
  const engineRef = useRef<Worker | null>(null);
  // Track whether the engine has confirmed it's ready
  const readyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let worker: Worker;
    try {
      worker = new Worker("/stockfish.js");
    } catch {
      return;
    }

    // Wait for "uciok" before marking ready, so getBestMove knows the
    // engine is actually responsive (fixes "thinking forever" bug).
    worker.onmessage = (e: MessageEvent) => {
      const line = e.data as string;
      if (line === "uciok") {
        readyRef.current = true;
        worker.postMessage(`setoption name Skill Level value ${Math.min(level * 2, 20)}`);
        worker.postMessage("ucinewgame");
      }
    };
    worker.postMessage("uci");
    engineRef.current = worker;

    return () => {
      readyRef.current = false;
      worker.terminate();
      engineRef.current = null;
    };
  }, [level]);

  const getBestMove = useCallback((fen: string): Promise<string> => {
    return new Promise((resolve) => {
      const engine = engineRef.current;
      if (!engine || !readyRef.current) {
        resolve("");
        return;
      }
      // Timeout after 5s in case engine stalls — prevents infinite "Thinking..."
      const timeout = setTimeout(() => resolve(""), 5000);

      engine.onmessage = (e: MessageEvent) => {
        const line = e.data as string;
        if (line.startsWith("bestmove")) {
          clearTimeout(timeout);
          const move = line.split(" ")[1];
          resolve(move && move !== "(none)" ? move : "");
        }
      };
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage("go movetime 1000");
    });
  }, []);

  return { getBestMove };
}

export default function CalibratePage() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [state, setState] = useState<any>(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState<"win" | "loss" | "draw" | null>(null);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [touchMode] = useState(isTouchDevice);

  // TAP-TO-MOVE STATE
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  const playerId =
    typeof window !== "undefined" ? localStorage.getItem("player_id") : null;
  const currentBotLevel = state?.next_bot?.level ?? 3;
  const { getBestMove } = useStockfish(currentBotLevel);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email_confirmed_at) {
        setIsVerified(false);
        setLoading(false);
        return;
      }
      setIsVerified(true);
      if (playerId) {
        const res = await fetch(`/api/calibration?player_id=${playerId}`);
        const data = await res.json();
        setState(data);
      }
      setLoading(false);
    }
    init();
  }, [playerId]);

  const startGame = () => {
    if (!isVerified) return;
    chess.reset();
    setFen(chess.fen());
    setMoveFrom(null);
    setOptionSquares({});
    setGameActive(true);
    setGameResult(null);
  };

  const endCalibrationGame = async (result: "win" | "loss" | "draw") => {
    setGameActive(false);
    setGameResult(result);
    setMoveFrom(null);
    setOptionSquares({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          bot_level: currentBotLevel,
          result,
          pgn: chess.pgn(),
        }),
      });
      const data = await res.json();
      setState(
        data.calibration_complete
          ? { ...state, calibration_complete: true, current_rating: data.final_rating, games_played: data.game_number }
          : { ...state, games_played: data.game_number, games_remaining: data.games_remaining, next_bot: data.next_bot },
      );
    } finally {
      setSubmitting(false);
    }
  };

  function getMoveOptions(square: string) {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const newSquares: Record<string, any> = {};
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

  async function handleMove(m: { from: string; to: string; promotion?: string }) {
    try {
      const result = chess.move(m);
      if (!result) return false;

      // Clear dots immediately after player moves
      setMoveFrom(null);
      setOptionSquares({});
      setFen(chess.fen());

      if (chess.isGameOver()) {
        endCalibrationGame(chess.isCheckmate() ? "win" : "draw");
        return true;
      }

      setThinking(true);
      const best = await getBestMove(chess.fen());
      if (best) {
        chess.move(best);
        setFen(chess.fen());
        if (chess.isGameOver()) {
          endCalibrationGame(chess.isCheckmate() ? "loss" : "draw");
        }
      }
      setThinking(false);
      return true;
    } catch {
      setThinking(false);
      return false;
    }
  }

  function onSquareClick(square: string) {
    if (!gameActive || thinking || chess.turn() !== "w") return;

    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    // Clicking same square deselects
    if (square === moveFrom) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }

    // Try to move; if invalid, try selecting the new square instead
    const moves = chess.moves({ square: moveFrom, verbose: true });
    const isValidTarget = moves.some((m) => m.to === square);
    if (isValidTarget) {
      handleMove({ from: moveFrom, to: square, promotion: "q" });
    } else {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      else { setMoveFrom(null); setOptionSquares({}); }
    }
  }

  const onDrop = (src: string, tgt: string) => {
    if (!gameActive || thinking || chess.turn() !== "w") return false;
    handleMove({ from: src, to: tgt, promotion: "q" });
    return true;
  };

  if (loading)
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-400 animate-pulse">
        Loading calibration...
      </div>
    );

  if (!isVerified) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-6">
        <ShieldAlert className="text-red-400 w-16 h-16 mx-auto" />
        <h1 className="font-display text-3xl font-black text-chalk">Verification Required</h1>
        <p className="text-ink-400">
          You must click the link in your email and sign in before starting calibration.
        </p>
        <Link href="/auth/login" className="btn-gold block w-full text-center">Sign In</Link>
      </div>
    );
  }

  if (state?.calibration_complete) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center page-enter">
        <CheckCircle className="text-green-400 w-16 h-16 mx-auto mb-4" />
        <h1 className="font-display text-3xl font-black text-chalk mb-3">Calibration Complete!</h1>
        <div className="card p-6 mb-6 text-center">
          <div className="text-xs text-ink-400 mb-2">Starting Rating</div>
          <div className="font-display text-6xl font-black text-gold">{state.current_rating}</div>
          <div className="text-xs text-ink-500 mt-2">Rating Deviation: ±200 (provisional)</div>
        </div>
        <Link href="/dashboard" className="btn-gold">Go to Dashboard <ArrowRight size={14} /></Link>
      </div>
    );
  }

  const gamesPlayed = state?.games_played || 0;
  const gamesRemaining = state?.games_remaining || 5;
  const nextBot = state?.next_bot || BOT_LEVELS[3];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">
      <div className="text-center mb-8">
        <Bot className="text-gold w-10 h-10 mx-auto mb-3" />
        <h1 className="font-display text-3xl font-black text-chalk mb-2">Bot Calibration</h1>
        <p className="text-ink-400">
          Play {gamesRemaining} more game{gamesRemaining !== 1 ? "s" : ""} to determine your rating.
        </p>
      </div>

      <div className="max-w-lg mx-auto mb-8">
        <div className="flex gap-2 justify-center mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${i < gamesPlayed ? "bg-gold" : i === gamesPlayed ? "bg-gold/40 animate-pulse" : "bg-ink-700"}`}
            />
          ))}
        </div>
        <div className="text-center text-xs text-ink-500">{gamesPlayed}/5 games completed</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <div className="card p-3 flex items-center gap-3">
            <Bot size={20} className="text-gold" />
            <div>
              <div className="font-medium text-chalk text-sm">{nextBot?.name || "Bot"}</div>
              <div className="text-xs text-ink-400">~{nextBot?.elo || 1100} Elo · Stockfish {currentBotLevel}</div>
            </div>
            {thinking && (
              <span className="ml-auto text-xs text-ink-400 animate-pulse">Thinking...</span>
            )}
          </div>

          <div className="board-wrapper touch-none select-none">
            {typeof window !== "undefined" && (
              <Chessboard
                position={fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={optionSquares}
                boardOrientation="white"
                // Disable drag on touch devices — tap-to-move works perfectly
                // and avoids the offset/phantom-piece bug on mobile
                arePiecesDraggable={gameActive && !thinking && !touchMode}
                customDarkSquareStyle={{ backgroundColor: "#4a6080" }}
                customLightSquareStyle={{ backgroundColor: "#b0bcce" }}
                animationDuration={150}
              />
            )}
          </div>

          <div className="card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center text-sm font-bold text-gold">
              You
            </div>
            <div>
              <div className="font-medium text-chalk text-sm">You (White)</div>
              <div className="text-xs text-ink-400">10 minutes · no increment</div>
            </div>
          </div>

          {!gameActive && !gameResult && (
            <button onClick={startGame} className="btn-gold w-full justify-center btn-lg">
              Start Game {gamesPlayed + 1} of 5 <ArrowRight size={16} />
            </button>
          )}

          {gameActive && (
            <div className="flex gap-2">
              {/* No "Offer Draw" vs bot — bots don't accept draws */}
              <button
                onClick={() => endCalibrationGame("loss")}
                className="btn-danger w-full text-sm"
              >
                Resign
              </button>
            </div>
          )}

          {gameResult && !submitting && (
            <div className={`card p-4 text-center border ${
              gameResult === "win" ? "border-green-700 bg-green-900/20" :
              gameResult === "loss" ? "border-red-800 bg-red-900/20" : "border-ink-600"
            }`}>
              <div className="font-bold text-sm mb-3 capitalize">
                {gameResult === "win" ? "You Won!" : gameResult === "loss" ? "Bot Won" : "Draw!"}
              </div>
              {gamesRemaining > 0 && (
                <button onClick={startGame} className="btn-gold btn-sm">
                  Next Game <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}
          {submitting && (
            <div className="text-center text-ink-400 text-sm animate-pulse">Saving results...</div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="section-label mb-3">How Calibration Works</div>
            <div className="space-y-3 text-xs text-ink-400 leading-relaxed">
              <p>You play 5 games against Stockfish bots. The bot difficulty adapts based on your results:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">Win &rarr;</span> Next bot is harder
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400">Loss &rarr;</span> Next bot is easier
                </div>
              </div>
              {touchMode && (
                <p className="text-gold/70 border-t border-ink-700 pt-2 mt-2">
                  Tap a piece to select it, then tap a highlighted square to move.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}