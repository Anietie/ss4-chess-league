/**
 * SS4 Chess League — Real-Time WebSocket Game Server
 * Run with: node server/socket-server.js
 * Deploy separately on Railway / Render alongside Next.js.
 */

// Load .env.local in local dev only (Render injects env vars in production)
if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config({ path: '.env.local' }); } catch {}
}
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { initGameEngine, queuePosition, flushGameAnalysis, destroyGameEngine, analyseGameServerSide } = require('./stockfish-analysis');
// Load env vars from .env.local only in local development
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch {
    // dotenv not installed — probably production, env vars are injected
  }
}

const app = express();

const allowedOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  const ok =
    origin.startsWith('https://') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');
  if (!ok) console.warn(`[CORS] blocked origin: ${origin}`);
  callback(ok ? null : new Error('CORS blocked: ' + origin), ok);
};

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000, pingInterval: 25000,
  connectTimeout: 45000,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const activeGames = new Map();
const pendingGameSetup = new Map();
const challengeRooms = new Map();

function createGameState(game) {
  const [baseStr, incStr] = (game.time_control || '600+5').split('+');
  const baseMs = parseInt(baseStr) * 1000;
  const incMs = parseInt(incStr || '0') * 1000;

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
    white_name: game.white_name || 'White',
    black_name: game.black_name || 'Black',
    white_rating: game.white_rating || 1200,
    black_rating: game.black_rating || 1200,
    white_whatsapp: game.white_whatsapp || null,
    black_whatsapp: game.black_whatsapp || null,
    white_time: baseMs, black_time: baseMs,
    increment: incMs, base_time: baseMs,
    last_move_ts: null,
    status: 'waiting',
    result: null,
    is_rated: game.is_rated ?? true,
    competition_phase: game.competition_phase ?? null,
    connected: new Set(),
    spectators: new Set(),
    disc_timers: new Map(),
  };
}

io.on('connection', socket => {
  // ── Challenge lobby ──────────────────────────────────────────────────────
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

  // ── Join game ────────────────────────────────────────────────────────────
  socket.on('join_game', async ({ game_id, player_id, auth_user_id, is_spectator }) => {
    const room = `game:${game_id}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[join_game] socket=${socket.id} game=${game_id}`);
    console.log(`[join_game] client sent  → auth_user_id=${auth_user_id ?? 'MISSING'} | player_id=${player_id ?? 'MISSING'} | is_spectator=${is_spectator}`);

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
              .select(`*, white_player:players!games_white_player_id_fkey(full_name, ss4_rating, whatsapp_number, auth_user_id), black_player:players!games_black_player_id_fkey(full_name, ss4_rating, whatsapp_number, auth_user_id)`)
              .eq('id', game_id).single();

            if (gameError || !game) {
              console.error(`[join_game] game DB fetch error: ${gameError?.message} | game=${JSON.stringify(game)}`);
              throw { type: 'not_found' };
            }

            console.log(`[join_game] game loaded from DB:`);
            console.log(`  result='${game.result}' white_player_id=${game.white_player_id} black_player_id=${game.black_player_id}`);

            if (game.result !== '*') {
              throw { type: 'already_finished', result: game.result, pgn: game.pgn, white_name: game.white_player?.full_name, black_name: game.black_player?.full_name };
            }

            const enriched = {
              ...game,
              white_name: game.white_player?.full_name || 'White',
              black_name: game.black_player?.full_name || 'Black',
              white_rating: game.white_player?.ss4_rating || 1200,
              black_rating: game.black_player?.ss4_rating || 1200,
              white_whatsapp: game.white_player?.whatsapp_number || null,
              black_whatsapp: game.black_player?.whatsapp_number || null,
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

        // ── Cancel any pending no-show claims against this player ──────────        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (appUrl) {
          try {
            await fetch(`${appUrl}/api/games/${game_id}/claim-no-show`, {
              method: 'DELETE',
            });
          } catch {}
        }
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
        white_whatsapp: state.white_whatsapp,
        black_whatsapp: state.black_whatsapp,
        your_player_id: effectiveIsSpectator ? null : resolvedPlayerId,
      });

      const hasWhite = state.connected.has(state.white_player_id);
      const hasBlack = state.connected.has(state.black_player_id);

      if (state.status === 'waiting' && hasWhite && hasBlack) {
        console.log(`[join_game] ✓✓✓ BOTH PLAYERS CONNECTED — starting game!`);
        state.status = 'active';
        state.last_move_ts = Date.now();

        initGameEngine(game_id).catch(e =>
          console.warn(`[join_game] Stockfish init failed (non-fatal):`, e?.message)
        );

        io.to(room).emit('game_started', {
          white_player_id: state.white_player_id, black_player_id: state.black_player_id,
          white_time: state.white_time, black_time: state.black_time,
          white_name: state.white_name, black_name: state.black_name,
          white_rating: state.white_rating, black_rating: state.black_rating,
        });
        await supabase.from('games').update({ is_live: true, game_state_fen: state.chess.fen() }).eq('id', game_id);
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

  // ── Make move ────────────────────────────────────────────────────────────
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
        pgn: state.chess.pgn(),
        white_time: state.white_time, black_time: state.black_time,
        current_turn: state.chess.turn(), move_number: state.chess.history().length,
      });

      const plyNum = state.chess.history().length;
      queuePosition(game_id, state.chess.fen(), plyNum);

      if (state.chess.isGameOver()) {
        const gameResult = state.chess.isCheckmate()
          ? (isWhiteTurn ? '1-0' : '0-1')
          : '0.5-0.5';
        await endGame(game_id, gameResult, state.chess.pgn());
      }
    } catch { socket.emit('invalid_move', { reason: 'Error processing move' }); }
  });

  // ── Resign ───────────────────────────────────────────────────────────────
  socket.on('resign', async ({ game_id, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') return;
    await endGame(game_id, player_id === state.white_player_id ? '0-1' : '1-0', state.chess.pgn());
  });

  // ── Draw ─────────────────────────────────────────────────────────────────
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

  // ── Claim timeout ────────────────────────────────────────────────────────
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

  // ── No-Show Claim ───────────────────────────────────────────────────────
  socket.on('claim_no_show', async ({ game_id, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state || state.status !== 'active') {
      socket.emit('claim_denied', { reason: 'Game not active' });
      return;
    }
    
    const opponentId = player_id === state.white_player_id 
      ? state.black_player_id 
      : state.white_player_id;
    
    if (state.connected.has(opponentId)) {
      socket.emit('claim_denied', { reason: 'Opponent is connected' });
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      socket.emit('claim_denied', { reason: 'Server configuration error' });
      return;
    }
    
    try {
      const res = await fetch(`${appUrl}/api/games/${game_id}/claim-no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id }),
      });
      const data = await res.json();
      
      if (data.success) {
        io.to(`game:${game_id}`).emit('no_show_claimed', {
          claimed_by: player_id,
          claimed_against: opponentId,
          grace_ends_at: data.grace_ends_at,
          grace_minutes: data.grace_minutes,
        });
      } else {
        socket.emit('claim_denied', { reason: data.error });
      }
    } catch (err) {
      socket.emit('claim_denied', { reason: 'Server error' });
    }
  });

  // ── Nudge Opponent ──────────────────────────────────────────────────────
  socket.on('nudge_opponent', async ({ game_id, player_id }) => {
    const state = activeGames.get(game_id);
    if (!state) return;
    
    const opponentId = player_id === state.white_player_id 
      ? state.black_player_id 
      : state.white_player_id;
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return;
    
    try {
      await fetch(`${appUrl}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          player_id: opponentId,
          type: 'nudge',
          title: '👋 Nudge!',
          message: 'Your opponent is waiting for you to join the game.',
          game_id,
        }),
      });
    } catch (err) {
      console.warn('[nudge] Failed:', err?.message);
    }
    
    io.to(`game:${game_id}`).emit('opponent_nudged', { by: player_id });
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
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

  state.chess.header('Result', result);
  const finalPgn = state.chess.pgn();

  io.to(`game:${gameId}`).emit('game_ended', {
    result,
    pgn: finalPgn,
    fen: state.chess.fen(),
    competition_phase: state.competition_phase ?? null,
  });

  const scorableResult = ['1-0', '0-1', '0.5-0.5'].includes(result);
  if (scorableResult && finalPgn) {
    flushGameAnalysis(gameId).then(async (analysisJson) => {
      if (analysisJson.length > 0) {
        const { error: aErr } = await supabase.from('games').update({
          analysis_json:     analysisJson,
          analysis_complete: true,
        }).eq('id', gameId);
        if (aErr) console.error('[endGame] analysis_json save failed:', aErr.message);
        else console.log(`[endGame] ✓ ${analysisJson.length} positions saved — review ready`);
      }

      if (state.competition_phase !== 'calibration') {
        runAnticheatPipeline(
          gameId, finalPgn,
          state.white_name, state.black_name,
          state.white_player_id, state.black_player_id,
          state.competition_phase,
          analysisJson.length > 0 ? analysisJson : null,
        ).catch(e => console.error('[anticheat] Pipeline error:', e?.message));
      }
    }).catch(e => {
      console.error('[endGame] flushGameAnalysis failed:', e?.message);
      destroyGameEngine(gameId);
    });
  } else {
    destroyGameEngine(gameId);
  }

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

  if (state.is_rated === false) {
    console.log(`[endGame] Skipping ratings update — game is unrated`);
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
        } else {
          const data = await res.json().catch(() => null);
          console.log(`[endGame] ✓ Ratings updated. White: ${data?.white_change >= 0 ? '+' : ''}${Math.round(data?.white_change ?? 0)} | Black: ${data?.black_change >= 0 ? '+' : ''}${Math.round(data?.black_change ?? 0)}`);
        }
      } catch (err) {
        console.error('[endGame] ratings/update fetch threw:', err?.message);
      }
    }
  }

  setTimeout(() => activeGames.delete(gameId), 30_000);
}


// ── Position evaluator (material + piece-square tables) ──────────────────────

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

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
      const pstRow = piece.color === 'w' ? r : 7 - r;
      const bonus  = PST[piece.type]?.[pstRow]?.[f] ?? 0;
      score += piece.color === 'w' ? (val + bonus) : -(val + bonus);
    }
  }
  return score;
}

function findBestMove(chess) {
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const isWhite = chess.turn() === 'w';
  let best = null;
  let bestScore = isWhite ? -Infinity : Infinity;
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

// ── Server-side anti-cheat analysis pipeline ─────────────────────────────────

const { computeCorrelationScore } = (() => {
  const THRESHOLD = 75;
  function computeCorrelationScore(actualMoves, analysisJson, playingSide, player_id, game_id) {
    const byPly = new Map(analysisJson.map(a => [a.ply, a]));
    const playerEntries = analysisJson.filter(a => {
      if (a.ply === 0) return false;
      const isWhiteMove = a.ply % 2 === 1;
      return playingSide === 'white' ? isWhiteMove : !isWhiteMove;
    });
    if (!playerEntries.length) {
      return { player_id, game_id, move_count: 0, top1_matches: 0, top3_matches: 0,
               avg_centipawn_loss: 0, correlation_score: 0, flag: false, verdict: 'insufficient_data' };
    }
    let top1 = 0, top3 = 0, totalCPL = 0, cplCount = 0;
    for (const entry of playerEntries) {
      const actualMove = actualMoves[entry.ply - 1];
      if (!actualMove) continue;
      if (actualMove === entry.bestMove) top1++;
      if (entry.top3?.includes(actualMove)) top3++;
      const before = byPly.get(entry.ply - 1);
      if (before !== undefined) {
        const rawCPL = playingSide === 'white'
          ? before.score - entry.score
          : entry.score - before.score;
        totalCPL += Math.max(0, Math.min(rawCPL, 500));
        cplCount++;
      }
    }
    const n        = playerEntries.length;
    const top1Pct  = (top1 / n) * 100;
    const top3Pct  = (top3 / n) * 100;
    const avgCPL   = cplCount > 0 ? totalCPL / cplCount : 999;
    const cplScore = Math.max(0, 100 - avgCPL / 3);
    const correlation_score = Math.round(top1Pct * 0.5 + top3Pct * 0.25 + cplScore * 0.25);
    const flag = correlation_score >= THRESHOLD && n >= 20;
    let verdict = 'clean';
    if (n < 20)    verdict = 'insufficient_moves';
    else if (flag) verdict = correlation_score >= 90 ? 'strong_suspicion' : 'elevated_correlation';
    return { player_id, game_id, move_count: n, top1_matches: top1, top3_matches: top3,
             avg_centipawn_loss: Math.round(avgCPL), correlation_score, flag, verdict };
  }
  return { computeCorrelationScore };
})();

async function runAnticheatPipeline(gameId, pgn, whiteName, blackName, whitePlayerId, blackPlayerId, competitionPhase, prebuiltAnalysis = null) {
  if (competitionPhase === 'calibration') return;
  console.log(`[anticheat] Pipeline for game ${gameId} (${whiteName} vs ${blackName})`);

  try {
    let analysisJson = prebuiltAnalysis;

    if (!analysisJson || analysisJson.length === 0) {
      console.log(`[anticheat] No prebuilt analysis — running batch Stockfish depth 20`);
      analysisJson = await analyseGameServerSide(pgn);
      if (!analysisJson.length) { console.warn(`[anticheat] Empty analysis — skipping`); return; }
      await supabase.from('games').update({ analysis_json: analysisJson, analysis_complete: true }).eq('id', gameId);
    } else {
      console.log(`[anticheat] Using prebuilt analysis (${analysisJson.length} positions)`);
    }

    const chess = new Chess();
    chess.loadPgn(pgn);
    const uciMoves = chess.history({ verbose: true })
      .map(m => m.from + m.to + (m.promotion ?? ''));

    const whiteResult = computeCorrelationScore(uciMoves, analysisJson, 'white', whitePlayerId, gameId);
    const blackResult = computeCorrelationScore(uciMoves, analysisJson, 'black', blackPlayerId, gameId);

    console.log(`[anticheat] ${whiteName} (white): score=${whiteResult.correlation_score} verdict=${whiteResult.verdict}`);
    console.log(`[anticheat] ${blackName} (black): score=${blackResult.correlation_score} verdict=${blackResult.verdict}`);

    await supabase.from('games').update({
      white_anticheat_score: whiteResult.correlation_score,
      black_anticheat_score: blackResult.correlation_score,
      anticheat_flagged:     whiteResult.flag || blackResult.flag,
    }).eq('id', gameId);

    const flaggedPlayers = [
      whiteResult.flag ? { result: whiteResult, name: whiteName, opponentId: blackPlayerId, opponentName: blackName, side: 'white' } : null,
      blackResult.flag ? { result: blackResult, name: blackName, opponentId: whitePlayerId, opponentName: whiteName, side: 'black' } : null,
    ].filter(Boolean);

    for (const fp of flaggedPlayers) {
      const isStrong = fp.result.verdict === 'strong_suspicion';
      const scoreLabel = `${fp.result.correlation_score}/100`;
      const topLabel   = `${fp.result.top1_matches}/${fp.result.move_count} engine top-1 matches`;

      await supabase.from('conduct_violations').insert({
        player_id:      fp.result.player_id,
        violation_type: 'cheating_flag',
        severity:       isStrong ? 'game_forfeit' : 'warning',
        description:    `Engine correlation score ${scoreLabel} (${topLabel}, avg CPL ${fp.result.avg_centipawn_loss}). Verdict: ${fp.result.verdict}. Pending manual review.`,
        game_id:        gameId,
      });

      await supabase.from('notifications').insert({
        player_id: fp.result.player_id,
        type:      'admin_action',
        title:     isStrong ? '⚠️ Game Under Serious Review' : '🔍 Game Flagged for Review',
        message:   isStrong
          ? `Your game against ${fp.opponentName} has been flagged with a high engine-correlation score (${scoreLabel}). The game result has been placed under review. A League Officer will investigate and you will be notified of the outcome.`
          : `Your game against ${fp.opponentName} has been flagged for routine review (score ${scoreLabel}). No action has been taken. A League Officer will review and notify you.`,
        game_id: gameId,
      });

      await supabase.from('notifications').insert({
        player_id: fp.opponentId,
        type:      'admin_action',
        title:     '🔍 Opponent Game Under Review',
        message:   `Your game against ${fp.name} is under review for a potential conduct issue. Your result is ${isStrong ? 'temporarily held pending a League Officer decision' : 'unaffected unless the review finds a confirmed violation'}. You will be notified of the outcome.`,
        game_id: gameId,
      });

      console.log(`[anticheat] ⚑ Flagged ${fp.name} (${fp.result.verdict}) — conduct_violation created, both players notified`);
    }

    if (!flaggedPlayers.length) {
      console.log(`[anticheat] ✓ Both players clean for game ${gameId}`);
    }

  } catch (err) {
    console.error(`[anticheat] Pipeline error for game ${gameId}:`, err?.message ?? err);
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
  io.to(`challenge:${challenge_id}`).emit('challenge_accepted', { game_id });
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
    fen: state.chess.fen(),
  });
});

const PORT = process.env.SOCKET_PORT || 3001;
httpServer.listen(PORT, () => console.log(`[SS4] Game server on :${PORT}`));