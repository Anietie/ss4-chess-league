/**
 * SS4 Chess League — Real-Time WebSocket Game Server
 * Run with: node server/socket-server.js
 * Deploy separately on Railway / Render alongside Next.js.
 */
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const app = express();

// Accept any https:// origin (browser game clients) + localhost for dev.
// Security is enforced by Supabase auth + player_id verification in game logic,
// NOT by origin restriction. Blocking by origin only breaks production connections
// when NEXT_PUBLIC_APP_URL on Render doesn't exactly match the Vercel deployment URL.
const allowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // same-origin / server-to-server
  const ok =
    origin.startsWith('https://') ||        // any browser HTTPS client
    origin.startsWith('http://localhost') || // local dev
    origin.startsWith('http://127.0.0.1');   // local dev
  if (!ok) console.warn(`[CORS] blocked origin: ${origin}`);
  callback(ok ? null : new Error('CORS blocked: ' + origin), ok);
};

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true },
  // Longer timeouts for Render free tier cold-start delays
  pingTimeout: 60000, pingInterval: 25000,
  connectTimeout: 45000,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Active game states (in-memory, authoritative during game)
const activeGames = new Map();

// Prevents race condition when two players join simultaneously:
// Maps game_id -> Promise of the DB setup so the second joiner awaits the first.
const pendingGameSetup = new Map();

// Pending challenge rooms: challenge_id -> Set of socket IDs waiting for acceptance
const challengeRooms = new Map();

function createGameState(game) {
  const [baseStr, incStr] = (game.time_control || '600+5').split('+');
  const baseMs = parseInt(baseStr) * 1000;
  const incMs = parseInt(incStr || '0') * 1000;

  // Set PGN headers upfront so every chess.pgn() call throughout the game
  // produces a properly-tagged PGN with real player names, date, etc.
  const cs = new Chess();
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '.');
  cs.header(
    'Event',       'SS4 Chess League',
    'Site',        'ss4-chess-league.vercel.app',
    'Date',        today,
    'White',       game.white_name  || 'White',
    'Black',       game.black_name  || 'Black',
    'WhiteElo',    String(Math.round(game.white_rating || 1200)),
    'BlackElo',    String(Math.round(game.black_rating || 1200)),
    'TimeControl', game.time_control || '600+5',
    'Result',      '*',
  );

  return {
    id: game.id,
    chess: cs,
    white_player_id: game.white_player_id,
    black_player_id: game.black_player_id,
    // Player info populated after DB fetch
    white_name: game.white_name || 'White',
    black_name: game.black_name || 'Black',
    white_rating: game.white_rating || 1200,
    black_rating: game.black_rating || 1200,
    white_time: baseMs, black_time: baseMs,
    increment: incMs, base_time: baseMs,
    last_move_ts: null,
    status: 'waiting',   // waiting | active | ended
    result: null,
    is_rated: game.is_rated ?? false,  // preserved so endGame can skip ratings for unrated games
    connected: new Set(),
    spectators: new Set(),
    disc_timers: new Map(),
  };
}

io.on('connection', socket => {
  // ── Challenge lobby: challenger waits here for acceptance ──────────────────
  socket.on('join_challenge', ({ challenge_id, player_id }) => {
    const room = `challenge:${challenge_id}`;
    socket.join(room);
    socket.data = { ...socket.data, challenge_id, player_id };
    if (!challengeRooms.has(challenge_id)) challengeRooms.set(challenge_id, new Set());
    challengeRooms.get(challenge_id).add(socket.id);
    socket.emit('challenge_joined', { challenge_id });
    console.log(`[challenge] ${player_id} waiting in challenge:${challenge_id}`);
  });

  socket.on('leave_challenge', ({ challenge_id }) => {
    socket.leave(`challenge:${challenge_id}`);
    challengeRooms.get(challenge_id)?.delete(socket.id);
  });

  socket.on('join_game', async ({ game_id, player_id, auth_user_id, is_spectator }) => {
    const room = `game:${game_id}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[join_game] socket=${socket.id} game=${game_id}`);
    console.log(`[join_game] client sent  → auth_user_id=${auth_user_id ?? 'MISSING'} | player_id=${player_id ?? 'MISSING'} | is_spectator=${is_spectator}`);

    // ── Server-side player ID resolution ──────────────────────────────────────
    let resolvedPlayerId = player_id ?? null;
    let resolveMethod = 'client_provided';

    if (auth_user_id) {
      try {
        const { data: playerRow, error: lookupErr } = await supabase
          .from('players')
          .select('id, full_name, auth_user_id')
          .eq('auth_user_id', auth_user_id)
          .single();

        console.log(`[join_game] auth_user_id lookup → data=${JSON.stringify(playerRow)} | error=${lookupErr?.message ?? 'none'}`);

        if (playerRow?.id) {
          resolvedPlayerId = playerRow.id;
          resolveMethod = 'auth_user_id_lookup';
          console.log(`[join_game] ✓ resolved player_id=${resolvedPlayerId} via auth_user_id (name: ${playerRow.full_name})`);
        } else {
          console.warn(`[join_game] ✗ auth_user_id lookup returned no row — auth_user_id column may be NULL in DB for this player`);
          // Last-ditch: look up by the player_id hint and verify it's in the game
          if (player_id) {
            console.log(`[join_game] falling back to client player_id=${player_id}`);
            resolveMethod = 'client_fallback';
          }
        }
      } catch (e) {
        console.error(`[join_game] auth_user_id lookup threw:`, e?.message);
      }
    } else {
      console.warn(`[join_game] No auth_user_id received from client — old client code? Using player_id=${player_id ?? 'null'}`);
    }

    // Recompute is_spectator: only a spectator if we couldn't resolve any player ID
    const effectiveIsSpectator = !resolvedPlayerId || is_spectator === true;
    console.log(`[join_game] resolvedPlayerId=${resolvedPlayerId ?? 'NULL'} | resolveMethod=${resolveMethod} | effectiveIsSpectator=${effectiveIsSpectator}`);

    try {
      if (!activeGames.has(game_id)) {
        if (pendingGameSetup.has(game_id)) {
          console.log(`[join_game] waiting for pending setup...`);
          try { await pendingGameSetup.get(game_id); } catch { /* handled below */ }
        } else {
          const setupPromise = (async () => {
            const { data: game, error: gameError } = await supabase.from('games')
              .select(`*, white_player:players!games_white_player_id_fkey(full_name, ss4_rating, auth_user_id), black_player:players!games_black_player_id_fkey(full_name, ss4_rating, auth_user_id)`)
              .eq('id', game_id).single();

            if (gameError || !game) {
              console.error(`[join_game] game DB fetch error: ${gameError?.message} | game=${JSON.stringify(game)}`);
              throw { type: 'not_found' };
            }

            console.log(`[join_game] game loaded from DB:`);
            console.log(`  result='${game.result}' white_player_id=${game.white_player_id} black_player_id=${game.black_player_id}`);
            console.log(`  white_player=${JSON.stringify(game.white_player)}`);
            console.log(`  black_player=${JSON.stringify(game.black_player)}`);

            if (game.result !== '*') {
              throw { type: 'already_finished', result: game.result, pgn: game.pgn, white_name: game.white_player?.full_name, black_name: game.black_player?.full_name };
            }

            const enriched = {
              ...game,
              white_name: game.white_player?.full_name || 'White',
              black_name: game.black_player?.full_name || 'Black',
              white_rating: game.white_player?.ss4_rating || 1200,
              black_rating: game.black_player?.ss4_rating || 1200,
            };
            if (!activeGames.has(game_id)) {
              activeGames.set(game_id, createGameState(enriched));
            }
          })();

          pendingGameSetup.set(game_id, setupPromise);
          try {
            await setupPromise;
          } catch (setupErr) {
            pendingGameSetup.delete(game_id);
            if (setupErr?.type === 'not_found') {
              socket.emit('error', { message: 'Game not found' });
            } else if (setupErr?.type === 'already_finished') {
              socket.emit('game_already_finished', { result: setupErr.result, pgn: setupErr.pgn, white_name: setupErr.white_name, black_name: setupErr.black_name });
            } else {
              socket.emit('error', { message: 'Server error loading game' });
            }
            return;
          }
          pendingGameSetup.delete(game_id);
        }

        if (!activeGames.has(game_id)) {
          socket.emit('error', { message: 'Game could not be loaded' });
          return;
        }
      }

      const state = activeGames.get(game_id);

      // ── THE CRITICAL COMPARISON — log everything ───────────────────────────
      console.log(`[join_game] GAME STATE in memory:`);
      console.log(`  white_player_id=${state.white_player_id}`);
      console.log(`  black_player_id=${state.black_player_id}`);
      console.log(`  state.connected BEFORE add: [${[...state.connected].join(', ')}]`);
      console.log(`  resolvedPlayerId being added: ${resolvedPlayerId}`);
      console.log(`  match white? ${resolvedPlayerId === state.white_player_id}`);
      console.log(`  match black? ${resolvedPlayerId === state.black_player_id}`);

      socket.join(room);
      socket.data = { game_id, player_id: resolvedPlayerId, is_spectator: effectiveIsSpectator };

      if (effectiveIsSpectator) {
        state.spectators.add(socket.id);
        console.log(`[join_game] → joined as SPECTATOR`);
      } else {
        state.connected.add(resolvedPlayerId);
        const t = state.disc_timers.get(resolvedPlayerId);
        if (t) { clearTimeout(t); state.disc_timers.delete(resolvedPlayerId); }
        console.log(`[join_game] → joined as PLAYER | connected now: [${[...state.connected].join(', ')}]`);
      }

      socket.emit('game_state', {
        fen: state.chess.fen(), pgn: state.chess.pgn(),
        white_time: state.white_time, black_time: state.black_time,
        current_turn: state.chess.turn(), status: state.status,
        move_history: state.chess.history({ verbose: true }),
        connected_players: [...state.connected], spectator_count: state.spectators.size,
        white_player_id: state.white_player_id,
        black_player_id: state.black_player_id,
        white_name: state.white_name,
        black_name: state.black_name,
        white_rating: state.white_rating,
        black_rating: state.black_rating,
        your_player_id: effectiveIsSpectator ? null : resolvedPlayerId,
      });

      const hasWhite = state.connected.has(state.white_player_id);
      const hasBlack = state.connected.has(state.black_player_id);
      console.log(`[join_game] start-check → status=${state.status} | hasWhite=${hasWhite} | hasBlack=${hasBlack}`);

      if (state.status === 'waiting' && hasWhite && hasBlack) {
        console.log(`[join_game] ✓✓✓ BOTH PLAYERS CONNECTED — starting game!`);
        state.status = 'active';
        state.last_move_ts = Date.now();
        io.to(room).emit('game_started', {
          white_player_id: state.white_player_id, black_player_id: state.black_player_id,
          white_time: state.white_time, black_time: state.black_time,
          white_name: state.white_name, black_name: state.black_name,
          white_rating: state.white_rating, black_rating: state.black_rating,
        });
        await supabase.from('games').update({ is_live: true, game_state_fen: state.chess.fen() }).eq('id', game_id);
      } else {
        console.log(`[join_game] ✗ game NOT starting yet (waiting for the other player or state mismatch)`);
      }

      io.to(room).emit('player_joined', {
        player_id: resolvedPlayerId, is_spectator: effectiveIsSpectator,
        connected_players: [...state.connected], spectator_count: state.spectators.size,
      });
    } catch (err) {
      console.error('[join_game] unhandled error:', err);
      socket.emit('error', { message: 'Server error' });
    }
  });

  socket.on('make_move', async ({ game_id, move, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;

    const isWhiteTurn = state.chess.turn() === 'w';
    const isCorrect = isWhiteTurn ? player_id === state.white_player_id : player_id === state.black_player_id;
    if (!isCorrect) { socket.emit('invalid_move', { reason: 'Not your turn' }); return; }

    try {
      const result = state.chess.move(move);
      if (!result) { socket.emit('invalid_move', { reason: 'Illegal move' }); return; }

      const now = Date.now();
      const elapsed = now - (state.last_move_ts || now);
      if (isWhiteTurn) state.white_time = Math.max(0, state.white_time - elapsed + state.increment);
      else             state.black_time = Math.max(0, state.black_time - elapsed + state.increment);
      state.last_move_ts = now;

      io.to(`game:${game_id}`).emit('move_made', {
        move: result, fen: state.chess.fen(),
        pgn: state.chess.pgn(),   // ← needed by client to rebuild full move history
        white_time: state.white_time, black_time: state.black_time,
        current_turn: state.chess.turn(), move_number: state.chess.history().length,
      });

      if (state.chess.isGameOver()) {
        const gameResult = state.chess.isCheckmate()
          ? (isWhiteTurn ? '1-0' : '0-1')
          : '0.5-0.5';
        await endGame(game_id, gameResult, state.chess.pgn());
      }
    } catch { socket.emit('invalid_move', { reason: 'Error processing move' }); }
  });

  socket.on('resign', async ({ game_id, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;
    await endGame(game_id, player_id === state.white_player_id ? '0-1' : '1-0', state.chess.pgn());
  });

  socket.on('offer_draw', ({ game_id, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;
    io.to(`game:${game_id}`).emit('draw_offered', { by_player_id: player_id });
  });

  socket.on('accept_draw', async ({ game_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;
    await endGame(game_id, '0.5-0.5', state.chess.pgn());
  });

  socket.on('claim_timeout', async ({ game_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;
    const now = Date.now();
    const elapsed = now - (state.last_move_ts || now);
    const wTurn = state.chess.turn() === 'w';
    if (wTurn) state.white_time = Math.max(0, state.white_time - elapsed);
    else       state.black_time = Math.max(0, state.black_time - elapsed);
    if ((wTurn && state.white_time <= 0) || (!wTurn && state.black_time <= 0)) {
      await endGame(game_id, wTurn ? '0-1' : '1-0', state.chess.pgn());
    }
  });

  socket.on('disconnect', async () => {
    const { game_id, player_id, is_spectator } = socket.data || {};
    if (!game_id) return;
    const state = activeGames.get(game_id);
    if (!state) return;
    if (is_spectator) { state.spectators.delete(socket.id); return; }

    io.to(`game:${game_id}`).emit('player_disconnected', { player_id, reconnect_window: 180 });

    if (state.status === 'active') {
      const timer = setTimeout(async () => {
        if (state.status !== 'active') return;
        await endGame(game_id, player_id === state.white_player_id ? '0-1' : '1-0', state.chess.pgn());
      }, 3 * 60 * 1000);
      state.disc_timers.set(player_id, timer);
      state.connected.delete(player_id);
    }
  });
});

async function endGame(gameId, result, pgn) {
  const state = activeGames.get(gameId);
  if (!state || state.status === 'ended') return;
  state.status = 'ended'; state.result = result;
  state.disc_timers.forEach(t => clearTimeout(t));

  // Stamp the Result header so the PGN shows the real result (not '*').
  state.chess.header('Result', result);
  const finalPgn = state.chess.pgn();

  io.to(`game:${gameId}`).emit('game_ended', { result, pgn: finalPgn, fen: state.chess.fen() });
  queueAnalysis(gameId, finalPgn);

  // ── STEP 1: Persist result + PGN directly to DB ───────────────────────────
  // Must happen before the ratings API call so game data is always saved
  // even if the ratings update fails (wrong secret, network error, etc.)
  const now = new Date().toISOString();
  const { error: saveErr } = await supabase.from('games').update({
    result,
    pgn: finalPgn,
    is_live: false,
    played_at: now,
  }).eq('id', gameId);
  if (saveErr) {
    console.error('[endGame] Failed to save game result to DB:', saveErr.message);
  } else {
    console.log(`[endGame] ✓ Game ${gameId} saved: result=${result}`);
  }

  // ── STEP 2: Call ratings API (Glicko-2 update + standings) ────────────────
  // Skip entirely for unrated casual games — is_rated is stored in game state
  // from the game row's is_rated column.
  if (state.is_rated === false) {
    console.log(`[endGame] Skipping ratings update — game is unrated (is_rated=false)`);
  } else {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.INTERNAL_API_SECRET;

    if (!appUrl) {
      console.error('[endGame] NEXT_PUBLIC_APP_URL is not set — ratings will not be updated');
    } else {
      try {
        const res = await fetch(`${appUrl}/api/ratings/update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret || '',
          },
          body: JSON.stringify({ game_id: gameId, result, pgn: finalPgn }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '(no body)');
          console.error(`[endGame] ratings/update returned ${res.status}: ${body}`);
          console.error('[endGame] Check that INTERNAL_API_SECRET matches on both Render and Vercel');
        } else {
          const data = await res.json().catch(() => null);
          console.log(`[endGame] ✓ Ratings updated. White: ${data?.white_change >= 0 ? '+' : ''}${Math.round(data?.white_change ?? 0)} | Black: ${data?.black_change >= 0 ? '+' : ''}${Math.round(data?.black_change ?? 0)}`);
        }
      } catch (err) {
        console.error('[endGame] ratings/update fetch threw:', err?.message);
      }
    }
  }  // end else (is_rated)

  setTimeout(() => activeGames.delete(gameId), 30_000);
}


// ── Position evaluator (material + piece-square tables) ──────────────────────
// Used to produce analysis_json without needing a Stockfish server process.
// Scores are in centipawns, always from White's perspective (positive = white winning).

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables (rank 0=rank8 for white, indexed [rank][file])
const PST = {
  p: [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [ 50, 50, 50, 50, 50, 50, 50, 50],
    [ 10, 10, 20, 30, 30, 20, 10, 10],
    [  5,  5, 10, 25, 25, 10,  5,  5],
    [  0,  0,  0, 20, 20,  0,  0,  0],
    [  5, -5,-10,  0,  0,-10, -5,  5],
    [  5, 10, 10,-20,-20, 10, 10,  5],
    [  0,  0,  0,  0,  0,  0,  0,  0],
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  r: [
    [  0,  0,  0,  0,  0,  0,  0,  0],
    [  5, 10, 10, 10, 10, 10, 10,  5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [ -5,  0,  0,  0,  0,  0,  0, -5],
    [  0,  0,  0,  5,  5,  0,  0,  0],
  ],
  q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

function evalPosition(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -99999 : 99999;
  if (chess.isDraw() || chess.isStalemate()) return 0;

  let score = 0;
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const val   = PIECE_VALUES[piece.type] ?? 0;
      // PST: white pieces use table as-is (rank 0 = rank 8), black pieces mirror vertically
      const pstRow = piece.color === 'w' ? r : 7 - r;
      const bonus  = PST[piece.type]?.[pstRow]?.[f] ?? 0;
      score += piece.color === 'w' ? (val + bonus) : -(val + bonus);
    }
  }
  return score;
}

// Find best move via 1-ply search (good enough for identifying obvious blunders)
function findBestMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const isWhite = chess.turn() === 'w';
  let best = null;
  let bestScore = isWhite ? -Infinity : Infinity;
  // Search up to 30 moves (covers captures + checks first by chess.js ordering)
  for (const move of moves.slice(0, 30)) {
    chess.move(move);
    const score = evalPosition(chess);
    chess.undo();
    if (isWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best ? best.from + best.to : null;
}

async function queueAnalysis(gameId, pgn) {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    if (!moves.length) return;

    const evalPoints = [];
    const temp = new Chess();

    // Evaluate starting position (ply 0)
    evalPoints.push({
      ply: 0,
      score: evalPosition(temp),
      bestMove: findBestMove(temp) ?? '',  // camelCase — matches anticheat API + review page
    });

    // Evaluate after each move
    for (let i = 0; i < moves.length; i++) {
      temp.move(moves[i]);
      evalPoints.push({
        ply: i + 1,
        score: evalPosition(temp),
        bestMove: i < moves.length - 1 ? (findBestMove(temp) ?? '') : '',  // camelCase
      });
    }

    const { error } = await supabase.from('games')
      .update({ analysis_json: evalPoints })
      .eq('id', gameId);

    if (error) {
      console.error('[analysis] DB write failed:', error.message);
    } else {
      console.log(`[analysis] ✓ Game ${gameId}: ${evalPoints.length} positions stored (fallback PST evaluator; Stockfish will overwrite via review page)`);
    }
  } catch (e) {
    console.error('[analysis] Error:', e?.message ?? e);
  }
}

// ── Internal: called by /api/casual/[id] when a challenge is accepted ───────
app.post('/notify-challenge-accepted', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== (process.env.INTERNAL_API_SECRET || '')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { challenge_id, game_id } = req.body;
  if (!challenge_id || !game_id) {
    return res.status(400).json({ error: 'challenge_id and game_id required' });
  }
  // Push to everyone waiting in this challenge room
  io.to(`challenge:${challenge_id}`).emit('challenge_accepted', { game_id });
  // Clean up room after a short delay
  setTimeout(() => challengeRooms.delete(challenge_id), 10_000);
  console.log(`[challenge] Notified challenge:${challenge_id} → game:${game_id}`);
  res.json({ ok: true, notified: challengeRooms.get(challenge_id)?.size ?? 0 });
});

app.get('/health', (req, res) => res.json({
  status: 'ok', 
  timestamp: Date.now(),
  active_games: activeGames.size, 
  clients: io.engine.clientsCount
}));

// ── Debug: inspect any active game's state ───────────────────────────────────
// Call GET /debug/game/<game_id> to see exactly what player IDs are stored
// vs what's in state.connected. No secret required — remove after debugging.
app.get('/debug/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const state = activeGames.get(gameId);
  if (!state) {
    return res.json({
      found: false,
      active_game_ids: [...activeGames.keys()],
      message: 'Game not in memory — not yet joined or already ended'
    });
  }
  res.json({
    found: true,
    game_id: gameId,
    status: state.status,
    white_player_id: state.white_player_id,
    black_player_id: state.black_player_id,
    white_name: state.white_name,
    black_name: state.black_name,
    connected: [...state.connected],
    spectators: state.spectators.size,
    has_white_connected: state.connected.has(state.white_player_id),
    has_black_connected: state.connected.has(state.black_player_id),
    white_match: state.connected.has(state.white_player_id),
    black_match: state.connected.has(state.black_player_id),
    fen: state.chess.fen(),
  });
});

const PORT = process.env.SOCKET_PORT || 3001;
httpServer.listen(PORT, () => console.log(`[SS4] Game server on :${PORT}`));