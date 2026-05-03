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
app.use(cors({ origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', methods: ['GET','POST'] },
  pingTimeout: 30000, pingInterval: 10000,
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
  return {
    id: game.id,
    chess: new Chess(),
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

  socket.on('join_game', async ({ game_id, player_id, is_spectator }) => {
    const room = `game:${game_id}`;
    try {
      if (!activeGames.has(game_id)) {
        // --- Race-condition guard ---
        // If another join_game for this game is already doing the DB fetch,
        // wait for it instead of launching a duplicate fetch that would
        // overwrite the state and lose the first player's connected entry.
        if (pendingGameSetup.has(game_id)) {
          try { await pendingGameSetup.get(game_id); } catch { /* handled below */ }
        } else {
          const setupPromise = (async () => {
            const { data: game, error: gameError } = await supabase.from('games')
              .select(`*, white_player:players!games_white_player_id_fkey(full_name, ss4_rating), black_player:players!games_black_player_id_fkey(full_name, ss4_rating)`)
              .eq('id', game_id).single();

            if (gameError || !game) {
              throw { type: 'not_found' };
            }
            if (game.result !== '*') {
              throw { type: 'already_finished', result: game.result };
            }

            const enriched = {
              ...game,
              white_name: game.white_player?.full_name || 'White',
              black_name: game.black_player?.full_name || 'Black',
              white_rating: game.white_player?.ss4_rating || 1200,
              black_rating: game.black_player?.ss4_rating || 1200,
            };
            // Only write to the map if not already set by a concurrent join
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
              socket.emit('game_already_finished', { result: setupErr.result });
            } else {
              socket.emit('error', { message: 'Server error loading game' });
            }
            return;
          }
          pendingGameSetup.delete(game_id);
        }

        // After awaiting, the game may still not be in activeGames if setup failed
        if (!activeGames.has(game_id)) {
          socket.emit('error', { message: 'Game could not be loaded' });
          return;
        }
      }

      const state = activeGames.get(game_id);
      socket.join(room);
      socket.data = { game_id, player_id, is_spectator };

      if (is_spectator) {
        state.spectators.add(socket.id);
      } else {
        state.connected.add(player_id);
        const t = state.disc_timers.get(player_id);
        if (t) { clearTimeout(t); state.disc_timers.delete(player_id); }
      }

      socket.emit('game_state', {
        fen: state.chess.fen(), pgn: state.chess.pgn(),
        white_time: state.white_time, black_time: state.black_time,
        current_turn: state.chess.turn(), status: state.status,
        move_history: state.chess.history({ verbose: true }),
        connected_players: [...state.connected], spectator_count: state.spectators.size,
        // Include player identities so client can set color even if game_started was missed
        white_player_id: state.white_player_id,
        black_player_id: state.black_player_id,
        white_name: state.white_name,
        black_name: state.black_name,
        white_rating: state.white_rating,
        black_rating: state.black_rating,
      });

      if (state.status === 'waiting' &&
          state.connected.has(state.white_player_id) &&
          state.connected.has(state.black_player_id)) {
        state.status = 'active';
        state.last_move_ts = Date.now();
        io.to(room).emit('game_started', {
          white_player_id: state.white_player_id, black_player_id: state.black_player_id,
          white_time: state.white_time, black_time: state.black_time,
          white_name: state.white_name, black_name: state.black_name,
          white_rating: state.white_rating, black_rating: state.black_rating,
        });
        await supabase.from('games').update({ is_live: true, game_state_fen: state.chess.fen() }).eq('id', game_id);
      }

      io.to(room).emit('player_joined', {
        player_id, is_spectator, connected_players: [...state.connected], spectator_count: state.spectators.size,
      });
    } catch (err) {
      console.error('[join_game]', err);
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

  io.to(`game:${gameId}`).emit('game_ended', { result, pgn, fen: state.chess.fen() });

  // Call the analysis queue function here
  queueAnalysis(gameId, pgn);

  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ratings/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ game_id: gameId, result, pgn }),
    });
    await supabase.from('games').update({ is_live: false }).eq('id', gameId);
  } catch (err) { console.error('[endGame]', err); }

  setTimeout(() => activeGames.delete(gameId), 30_000);
}


// After game ends, queue Stockfish analysis
async function queueAnalysis(gameId, pgn) {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();
    const fens = [];
    const temp = new Chess();
    fens.push(temp.fen());
    for (const m of moves) { 
      temp.move(m); 
      fens.push(temp.fen()); 
    }
    
    // Write FENs to DB for client-side analysis pickup
    await supabase.from('games').update({ analysis_fens: JSON.stringify(fens) }).eq('id', gameId);
  } catch (e) { 
    console.error('Analysis queue error:', e); 
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

const PORT = process.env.SOCKET_PORT || 3001;
httpServer.listen(PORT, () => console.log(`[SS4] Game server on :${PORT}`));