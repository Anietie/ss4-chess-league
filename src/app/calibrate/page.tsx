"use client";
import { BOT_LEVELS } from "@/lib/chess-com-api";
import { supabase } from "@/lib/supabase";
import { Chess } from "chess.js";
import { ArrowRight, Bot, CheckCircle, ShieldAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const Chessboard = dynamic(
  () => import("react-chessboard").then((m) => m.Chessboard),
  { ssr: false },
);

function useStockfish(level: number) {
  const [engine, setEngine] = useState<Worker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const worker = new Worker("/stockfish.js");
      worker.postMessage("uci");
      worker.postMessage(
        `setoption name Skill Level value ${Math.min(level * 2, 20)}`,
      );
      worker.postMessage("ucinewgame");
      setEngine(worker);
      return () => worker.terminate();
    } catch {
      /* Stockfish fallback */
    }
  }, [level]);

  const getBestMove = useCallback(
    (fen: string): Promise<string> => {
      return new Promise((resolve) => {
        if (!engine) {
          resolve("");
          return;
        }
        engine.onmessage = (e: MessageEvent) => {
          const line = e.data as string;
          if (line.startsWith("bestmove")) {
            const move = line.split(" ")[1];
            resolve(move || "");
          }
        };
        engine.postMessage(`position fen ${fen}`);
        engine.postMessage("go movetime 1000");
      });
    },
    [engine],
  );

  return { getBestMove };
}

export default function CalibratePage() {
  const [chess] = useState(() => new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [state, setState] = useState<any>(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameResult, setGameResult] = useState<"win" | "loss" | "draw" | null>(
    null,
  );
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // TAP-TO-MOVE STATE
  const [moveFrom, setMoveFrom] = useState<any>(null);
  const [optionSquares, setOptionSquares] = useState({});

  const playerId =
    typeof window !== "undefined" ? localStorage.getItem("player_id") : null;
  const currentBotLevel = state?.next_bot?.level ?? 3;
  const { getBestMove } = useStockfish(currentBotLevel);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
    setGameActive(true);
    setGameResult(null);
  };

  const endCalibrationGame = async (result: "win" | "loss" | "draw") => {
    setGameActive(false);
    setGameResult(result);
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
          ? {
              ...state,
              calibration_complete: true,
              current_rating: data.final_rating,
              games_played: data.game_number,
            }
          : {
              ...state,
              games_played: data.game_number,
              games_remaining: data.games_remaining,
              next_bot: data.next_bot,
            },
      );
    } finally {
      setSubmitting(false);
    }
  };

  // DOT GENERATOR FOR TAP-TO-MOVE
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

  function handleMove(m: any) {
    try {
      const result = chess.move(m);
      if (!result) return false;
      setFen(chess.fen());

      if (chess.isGameOver()) {
        endCalibrationGame(chess.isCheckmate() ? "win" : "draw");
        return true;
      }

      setThinking(true);
      getBestMove(chess.fen()).then((best) => {
        if (best && best !== "(none)") {
          chess.move(best);
          setFen(chess.fen());
          if (chess.isGameOver())
            endCalibrationGame(chess.isCheckmate() ? "loss" : "draw");
        }
        setThinking(false);
      });
      return true;
    } catch {
      return false;
    }
  }

  function onSquareClick(square: any) {
    if (!gameActive || thinking || chess.turn() !== "w") return;

    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    const moveSucceeded = handleMove({
      from: moveFrom,
      to: square,
      promotion: "q",
    });
    setMoveFrom(null);
    setOptionSquares({});
  }

  const onDrop = (src: string, tgt: string) => {
    if (!gameActive || thinking || chess.turn() !== "w") return false;
    return handleMove({ from: src, to: tgt, promotion: "q" });
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
        <h1 className="font-display text-3xl font-black text-chalk">
          Verification Required
        </h1>
        <p className="text-ink-400">
          You must click the link in your email and sign in before starting
          calibration.
        </p>
        <Link href="/auth/login" className="btn-gold block w-full text-center">
          Sign In
        </Link>
      </div>
    );
  }

  if (state?.calibration_complete) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center page-enter">
        <CheckCircle className="text-green-400 w-16 h-16 mx-auto mb-4" />
        <h1 className="font-display text-3xl font-black text-chalk mb-3">
          Calibration Complete!
        </h1>
        <div className="card p-6 mb-6 text-center">
          <div className="text-xs text-ink-400 mb-2">Starting Rating</div>
          <div className="font-display text-6xl font-black text-gold">
            {state.current_rating}
          </div>
          <div className="text-xs text-ink-500 mt-2">
            Rating Deviation: ±200 (provisional)
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href="/dashboard" className="btn-gold">
            Go to Dashboard <ArrowRight size={14} />
          </Link>
        </div>
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
        <h1 className="font-display text-3xl font-black text-chalk mb-2">
          Bot Calibration
        </h1>
        <p className="text-ink-400">
          Play {gamesRemaining} more game{gamesRemaining !== 1 ? "s" : ""} to
          determine your rating.
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
        <div className="text-center text-xs text-ink-500">
          {gamesPlayed}/5 games completed
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-3">
          <div className="card p-3 flex items-center gap-3">
            <Bot size={20} className="text-gold" />
            <div>
              <div className="font-medium text-chalk text-sm">
                {nextBot?.name || "Bot"}
              </div>
              <div className="text-xs text-ink-400">
                ~{nextBot?.elo || 1100} Elo · Stockfish {currentBotLevel}
              </div>
            </div>
            {thinking && (
              <span className="ml-auto text-xs text-ink-400 animate-pulse">
                Thinking...
              </span>
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
                arePiecesDraggable={gameActive && !thinking}
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
              <div className="text-xs text-ink-400">
                10 minutes · no increment
              </div>
            </div>
          </div>

          {!gameActive && !gameResult && (
            <button
              onClick={startGame}
              className="btn-gold w-full justify-center btn-lg"
            >
              Start Game {gamesPlayed + 1} of 5 <ArrowRight size={16} />
            </button>
          )}

          {gameActive && (
            <div className="flex gap-2">
              <button
                onClick={() => endCalibrationGame("draw")}
                className="btn-ghost flex-1 text-sm"
              >
                Offer Draw
              </button>
              <button
                onClick={() => endCalibrationGame("loss")}
                className="btn-danger flex-1 text-sm"
              >
                Resign
              </button>
            </div>
          )}

          {gameResult && !submitting && (
            <div
              className={`card p-4 text-center border ${gameResult === "win" ? "border-green-700 bg-green-900/20" : gameResult === "loss" ? "border-red-800 bg-red-900/20" : "border-ink-600"}`}
            >
              <div className="font-bold text-sm mb-3 capitalize">
                {gameResult === "win"
                  ? "You Won!"
                  : gameResult === "loss"
                    ? "Bot Won"
                    : "Draw!"}
              </div>
              {gamesRemaining > 0 && (
                <button onClick={startGame} className="btn-gold btn-sm">
                  Next Game <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}
          {submitting && (
            <div className="text-center text-ink-400 text-sm animate-pulse">
              Saving results...
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="section-label mb-3">How Calibration Works</div>
            <div className="space-y-3 text-xs text-ink-400 leading-relaxed">
              <p>
                You play 5 games against Stockfish bots. The bot difficulty
                adapts based on your results:
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">Win &rarr;</span> Next bot is
                  harder
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-400">Loss &rarr;</span> Next bot is
                  easier
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
