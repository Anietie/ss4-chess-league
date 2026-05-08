"use client";
import { SoundToggle } from "@/components/chess/SoundToggle";
import { useSound } from "@/hooks/useSound";
import { BOT_LEVELS } from "@/lib/chess-com-api";
import { supabase } from "@/lib/supabase";
import { Chess, type Move } from "chess.js";
import { ArrowRight, Bot, CheckCircle, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function getBotByElo(elo: number) {
  return BOT_LEVELS.reduce((prev, curr) =>
    Math.abs(curr.elo - elo) < Math.abs(prev.elo - elo) ? curr : prev,
  );
}

function useStockfish(level: number) {
  const engineRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let worker: Worker;
    try {
      worker = new Worker("/stockfish.js");
    } catch {
      return;
    }

    worker.onmessage = (e: MessageEvent) => {
      const line = e.data as string;
      if (line === "uciok") {
        readyRef.current = true;
        worker.postMessage(
          `setoption name Skill Level value ${Math.min(level * 2, 20)}`,
        );
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

  const getBestMove = useCallback(
    (fen: string): Promise<string> =>
      new Promise((resolve) => {
        const engine = engineRef.current;
        if (!engine || !readyRef.current) return resolve("");
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
      }),
    [],
  );

  return { getBestMove };
}

interface CalState {
  calibrationComplete: boolean;
  gamesPlayed: number;
  remainingGames: number;
  botElo: number;
  levelIndex: number;
  seedRating?: number;
}

function apiResultCode(r: "win" | "loss" | "draw"): string {
  if (r === "win") return "1-0";
  if (r === "loss") return "0-1";
  return "0.5-0.5";
}

export default function CalibratePage() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [cal, setCal] = useState<CalState | null>(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState<"win" | "loss" | "draw" | null>(null);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [touchMode] = useState(isTouchDevice);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, any>>({});

  const { play, enabled: soundEnabled, toggle: toggleSound } = useSound();
  const stockfishSkill = cal?.levelIndex ?? 3;
  const { getBestMove } = useStockfish(stockfishSkill);

  // Get player ID on mount
  useEffect(() => {
    const id = localStorage.getItem("player_id");
    if (!id) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase
            .from("players")
            .select("id")
            .eq("email", user.email!)
            .single()
            .then(({ data }) => {
              if (data) {
                localStorage.setItem("player_id", data.id);
                setPlayerId(data.id);
              }
            });
        }
      });
    } else {
      setPlayerId(id);
    }
  }, []);

  // Initialize calibration state
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email_confirmed_at) {
        setIsVerified(false);
        setLoading(false);
        return;
      }
      setIsVerified(true);
      
      const pid = playerId || localStorage.getItem("player_id");
      if (pid) {
        const res = await fetch(`/api/calibration?player_id=${pid}`);
        const d = await res.json();
        setCal({
          calibrationComplete: d.calibration_complete ?? false,
          gamesPlayed: d.games_played ?? 0,
          remainingGames: d.remaining_games ?? 5,
          botElo: d.current_bot_elo ?? 1000,
          levelIndex: d.current_level_index ?? 4,
        });
      }
      setLoading(false);
    }
    if (playerId !== null) {
      init();
    }
  }, [playerId]);

  const startGame = () => {
    if (!isVerified) return;
    setError(null);
    chess.reset();
    setFen(chess.fen());
    setMoveFrom(null);
    setOptionSquares({});
    setGameActive(true);
    setGameResult(null);
  };

  const endCalibrationGame = async (result: "win" | "loss" | "draw") => {
    setGameActive(false);
    if (result === "win") play("win");
    else if (result === "loss") play("loss");
    else play("draw");
    setGameResult(result);
    setMoveFrom(null);
    setOptionSquares({});
    setSubmitting(true);
    setError(null);

    const pid = playerId || localStorage.getItem("player_id");

    if (!pid) {
      console.error("[calibration] No player ID found");
      setError("Could not find your player account. Please sign in again.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: pid,
          bot_elo: cal?.botElo ?? 1000,
          result: apiResultCode(result),
          pgn: chess.pgn(),
        }),
      });
      const d = await res.json();

      if (!res.ok) {
        console.error("[calibration] API error:", d.error);
        setError(d.error || "Failed to save game result.");
        setSubmitting(false);
        return;
      }

      if (d.complete) {
        setCal({
          calibrationComplete: true,
          gamesPlayed: 5,
          remainingGames: 0,
          botElo: cal?.botElo ?? 1000,
          levelIndex: cal?.levelIndex ?? 4,
          seedRating: d.seed_rating,
        });
      } else {
        setCal({
          calibrationComplete: false,
          gamesPlayed: d.games_played,
          remainingGames: d.remaining_games,
          botElo: d.next_bot_elo ?? cal?.botElo ?? 1000,
          levelIndex: d.next_level_index ?? cal?.levelIndex ?? 4,
        });
      }
    } catch (e: any) {
      console.error("[calibration] Fetch error:", e.message);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  function getMoveOptions(square: string) {
    const moves = chess.moves({ square: square as any, verbose: true }) as Move[];
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }
    const sq: Record<string, any> = {};
    moves.forEach((m) => {
      sq[m.to] = {
        background: chess.get(m.to)
          ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
          : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    sq[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(sq);
    return true;
  }

  async function handleMove(m: { from: string; to: string; promotion?: string }) {
    try {
      const result = chess.move(m);
      if (!result) return false;
      
      if (result.promotion) play("promote");
      else if (result.flags.includes("k") || result.flags.includes("q")) play("castle");
      else if (chess.isCheck()) play("check");
      else if (result.captured) play("capture");
      else play("move");
      
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
        const botResult = chess.move(best);
        if (botResult) {
          if (botResult.promotion) play("promote");
          else if (botResult.flags.includes("k") || botResult.flags.includes("q")) play("castle");
          else if (chess.isCheck()) play("check");
          else if (botResult.captured) play("capture");
          else play("move");
        }
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
      if (getMoveOptions(square)) setMoveFrom(square);
      return;
    }
    if (square === moveFrom) {
      setMoveFrom(null);
      setOptionSquares({});
      return;
    }
    const moves = chess.moves({ square: moveFrom as any, verbose: true }) as Move[];
    if (moves.some((m) => m.to === square)) {
      handleMove({ from: moveFrom, to: square, promotion: "q" });
    } else {
      if (getMoveOptions(square)) setMoveFrom(square);
      else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    }
  }

  const onDrop = (src: string, tgt: string) => {
    if (!gameActive || thinking || chess.turn() !== "w") return false;
    handleMove({ from: src, to: tgt, promotion: "q" });
    return true;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-ink-400 animate-pulse">
        Loading calibration...
      </div>
    );
  }

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

  if (cal?.calibrationComplete) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center page-enter">
        <CheckCircle className="text-green-400 w-16 h-16 mx-auto mb-4" />
        <h1 className="font-display text-3xl font-black text-chalk mb-3">Calibration Complete!</h1>
        <div className="card p-6 mb-6 text-center">
          <div className="text-xs text-ink-400 mb-2">Starting Rating</div>
          <div className="font-display text-6xl font-black text-orange-500">{cal.seedRating}</div>
          <div className="text-xs text-ink-500 mt-2">Rating Deviation: ±200 (provisional)</div>
        </div>
        <Link href="/dashboard" className="btn-gold">Go to Dashboard <ArrowRight size={14} /></Link>
      </div>
    );
  }

  const gamesPlayed = cal?.gamesPlayed ?? 0;
  const gamesRemaining = cal?.remainingGames ?? 5;
  const currentBot = getBotByElo(cal?.botElo ?? 1000);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-enter">
      <div className="text-center mb-8">
        <Bot className="text-orange-500 w-10 h-10 mx-auto mb-3" />
        <h1 className="font-display text-3xl font-black text-chalk mb-2">Bot Calibration</h1>
        <p className="text-ink-400">
          Play {gamesRemaining} more game{gamesRemaining !== 1 ? "s" : ""} to determine your rating.
        </p>
      </div>

      {/* Progress bar */}
      <div className="max-w-lg mx-auto mb-8">
        <div className="flex gap-2 justify-center mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                i < gamesPlayed
                  ? "bg-orange-500"
                  : i === gamesPlayed
                    ? "bg-orange-500/40 animate-pulse"
                    : "bg-ink-700"
              }`}
            />
          ))}
        </div>
        <div className="text-center text-xs text-ink-500">{gamesPlayed}/5 games completed</div>
      </div>

      {/* Error display */}
      {error && (
        <div className="max-w-lg mx-auto mb-4 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-300 text-sm text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          {/* Bot header */}
          <div className="card p-3 flex items-center gap-3">
            <Bot size={20} className="text-orange-500" />
            <div>
              <div className="font-medium text-chalk text-sm">{currentBot.name}</div>
              <div className="text-xs text-ink-400">Stockfish · Adaptive difficulty</div>
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
                arePiecesDraggable={gameActive && !thinking && !touchMode}
                customDarkSquareStyle={{ backgroundColor: "#4a6080" }}
                customLightSquareStyle={{ backgroundColor: "#b0bcce" }}
                animationDuration={150}
              />
            )}
          </div>

          <div className="card p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-sm font-bold text-orange-500">You</div>
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

          <div className="flex justify-end mb-1">
            <SoundToggle enabled={soundEnabled} onToggle={toggleSound} />
          </div>
          
          {gameActive && (
            <button onClick={() => endCalibrationGame("loss")} className="btn-danger w-full text-sm">
              Resign
            </button>
          )}

          {gameResult && !submitting && (
            <div className={`card p-4 text-center border ${
              gameResult === "win" ? "border-green-700 bg-green-900/20" : gameResult === "loss" ? "border-red-800 bg-red-900/20" : "border-ink-600"
            }`}>
              <div className="font-bold text-sm mb-3">
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
                  <span className="text-green-400">Win →</span> Next bot is harder
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400">Loss →</span> Next bot is easier
                </div>
              </div>
              {touchMode && (
                <p className="text-orange-500/70 border-t border-ink-700 pt-2 mt-2">
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