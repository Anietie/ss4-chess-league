# ♟ SS4 Chess League — v1.6

> **Two parallel domestic leagues. One Champions League. Every game rated by Glicko-2. Every record preserved forever.**

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SS4 Chess League                          │
│                                                             │
│  ┌─────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │  Next.js 14 │     │ Socket.io    │    │  Supabase    │  │
│  │  App Router │◄───►│ Game Server  │◄──►│  PostgreSQL  │  │
│  │  (Vercel)   │     │  (Railway)   │    │  + Auth      │  │
│  └─────────────┘     └──────────────┘    └──────────────┘  │
│         │                                        │          │
│         ▼                                        ▼          │
│  ┌─────────────┐                      ┌──────────────────┐  │
│  │  Chess.com  │                      │   Stockfish 16   │  │
│  │  Lichess    │  (rating seeding)    │  (game analysis) │  │
│  │  Public API │                      └──────────────────┘  │
│  └─────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18 |
| Styling | Tailwind CSS, custom design system |
| Chess UI | `react-chessboard`, `chess.js` |
| Real-time | Socket.io (game server) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (magic links) |
| Rating Engine | Glicko-2 (custom TypeScript implementation) |
| Analysis | Stockfish 16 via Web Worker |
| Hosting | Vercel (frontend) + Railway (Socket server) |

---

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/yourorg/ss4-chess-league
cd ss4-chess-league
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run `supabase/schema.sql`
3. Copy your project URL and keys

### 3. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase keys and secrets
```

### 4. Run locally

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Socket.io game server
npm run server
```

Frontend: http://localhost:3000  
Game server: http://localhost:3001/health

---

## 🌐 Production Deployment

### Frontend → Vercel

```bash
vercel --prod
```

Set all env vars from `.env.local.example` in Vercel dashboard.

### Game Server → Railway

1. Create a new Railway project
2. Connect your repo, set `NIXPACKS_START_CMD=node server/socket-server.js`
3. Add all env vars
4. Set `NEXT_PUBLIC_SOCKET_URL` in Vercel to your Railway URL

---

## 📋 Feature Map

### ✅ Phase 1 — Registration & Seeding
- [x] Player registration form
- [x] Auto-seed from Chess.com rapid rating via public API
- [x] Auto-seed from Lichess rapid rating
- [x] 5-game bot calibration (Stockfish, adaptive difficulty) for unrated players
- [x] Pioneer badge for Season 1 founders

### ✅ Phase 2 — Draft & League Assignment
- [x] Snake draft algorithm (balances rating distribution across leagues)
- [x] Parallel league architecture (League 1 + League 2)
- [x] Premier Tier + Development Tier per league
- [x] Admin endpoint to run draft with one POST request

### ✅ Phase 3 — Domestic Season
- [x] Round-robin fixture generation (< 8 players)
- [x] Swiss fixture generation (≥ 8 players, Dutch system)
- [x] Colour balance enforcement (max 3 consecutive same colour)
- [x] Football-style points (W=3, D=1, L=0)
- [x] Tiebreakers: Head-to-head → Sonneborn-Berger → Wins → Buchholz → Rating
- [x] Glicko-2 rating updates after every game (live)
- [x] Rating history tracking
- [x] Forfeit recording + suspension after 3 forfeits
- [x] Notification system (in-app)

### ✅ Phase 4 — Live Chess
- [x] Real-time WebSocket game rooms (Socket.io)
- [x] Server-side clock management (prevents manipulation)
- [x] Resign, draw offer, draw acceptance
- [x] 3-minute disconnection grace period
- [x] Spectator mode (read-only board)
- [x] PGN download

### ✅ Phase 5 — Playoffs
- [x] Top 4 per tier qualify → playoff bracket
- [x] Semifinal (1v4, 2v3) + Final
- [x] Playoff winner blocks relegation

### ✅ Phase 6 — Champions League
- [x] Top 4 from each league qualify (8 players total)
- [x] Seeded group draw (Pot 1 = league champions)
- [x] Coefficient-based seeding advantage for Season 2+
- [x] Group stage (round-robin within groups, chess scoring)
- [x] Knockout stage (cross-group: A1vB2, B1vA2)
- [x] CL Final
- [x] League coefficient calculation + cumulative tracking
- [x] CL badges (winner, runner-up, group top scorer, etc.)

### ✅ Parallel Competition Events
- [x] Open Cup (random draw, all players eligible)
- [x] Continental Shield (relegated players)
- [x] Newcomer Shield (first-season players)
- [x] Blitz Invitational (3+2 format)

### ✅ Player Profiles
- [x] Rating chart (SVG, all-time history)
- [x] Achievement badges (15 types)
- [x] Season-by-season stats
- [x] Recent game history with rating change
- [x] Chess.com / Lichess profile links

### ✅ Admin Panel
- [x] Password-protected League Officer interface
- [x] One-click draft execution
- [x] Fixture generation per league/tier
- [x] CL group draw + knockout generation
- [x] Season finalization (champions, badges, coefficients)
- [x] Promotion/relegation processing
- [x] Manual result entry

### ✅ Hall of Champions
- [x] Permanent season records
- [x] All-time rating leaderboard
- [x] Achievement wall
- [x] Season 1 Pioneer founders wall

---

## 🗄 Database Schema

See `supabase/schema.sql` for the full schema. Key tables:

| Table | Purpose |
|-------|---------|
| `players` | All registered players with Glicko-2 fields |
| `seasons` | Season metadata and status |
| `games` | Every game — live state + historical record |
| `standings` | Per-tier per-season leaderboard (materialised) |
| `rating_history` | Complete rating timeline per player |
| `champions_league` | CL qualification, group results, knockout progress |
| `league_coefficients` | Running coefficient scores per league per season |
| `player_badges` | Achievement badges (permanent record) |
| `notifications` | In-app notification inbox |
| `season_draft` | Draft assignment record |
| `conduct_violations` | Anti-cheating / disciplinary log |

---

## ⚙️ Glicko-2 Implementation

The rating engine (`src/lib/glicko2.ts`) is a full TypeScript implementation of the Glicko-2 system (Glickman 2013):

- **Rating (r)** — displayed publicly, ≈ Elo-like scale centered at 1500
- **Rating Deviation (RD)** — uncertainty; ±200 for new players, drops with more games
- **Volatility (σ)** — consistency of performance (0.06 default)
- **Provisional flag** — shown as `1234?` when RD > 100
- **Inactivity decay** — RD increases ~35 points per season without games

All updates happen game-by-game (not batch), so the leaderboard is live.

---

## 🔐 Security

- Row Level Security (RLS) enabled on all Supabase tables
- Public read access for standings, games, players
- Write access via service role key (server-side only)
- Admin panel behind `ADMIN_SECRET` header
- Socket→API communication via `INTERNAL_API_SECRET`
- No player passwords — magic link auth via Supabase

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/players` | Register new player |
| `GET` | `/api/players` | List all players |
| `GET` | `/api/players/[id]` | Player profile + history |
| `POST` | `/api/draft` | Run snake draft (admin) |
| `GET` | `/api/draft?season=1` | Get draft results |
| `POST` | `/api/fixtures` | Generate fixtures (admin) |
| `GET` | `/api/fixtures` | List fixtures with filters |
| `POST` | `/api/ratings/update` | Update Glicko-2 ratings |
| `GET` | `/api/calibration?player_id=` | Calibration state |
| `POST` | `/api/calibration` | Record calibration game |
| `GET` | `/api/champions-league?season=1` | CL data |
| `POST` | `/api/champions-league` | CL operations (admin) |
| `GET` | `/api/notifications?player_id=` | Player notifications |
| `PATCH` | `/api/notifications/[id]` | Mark notification read |
| `GET` | `/api/games/[id]` | Single game |
| `POST` | `/api/games/[id]` | Record forfeit (admin) |

---

## 🎯 League Structure (Season 1)

```
League 1 (Navy & Gold)          League 2 (Crimson & Silver)
────────────────────────        ────────────────────────────
Premier Tier  (top ~13)         Premier Tier  (top ~13)
Development Tier (rest)         Development Tier (rest)
     │                               │
     └──── Top 4 from Premier ───────┘
                  │
          Champions League
          ┌───────────────┐
          │  Group A  │  Group B  │
          └───────────────┘
                  │
          Semifinal + Final
                  │
              👑 Champion
```

---

## 🏅 Badge System

| Badge | Criteria |
|-------|----------|
| ⭐ Pioneer S1 | Registered in Season 1 |
| 🏆 League Champion | Won Premier Tier |
| 👑 CL Winner | Won Champions League |
| 🥈 CL Runner-Up | CL finalist |
| ⚡ Giant Killer | Beat player rated 300+ above |
| 🛡️ Unbeaten Season | No losses in Phase 1 |
| 🔥 Comeback King | Promoted after relegation |
| 💯 Century Club | 100+ league games |
| 🎯 Group Top Scorer | Most CL group points |
| 🌍 Continental Shield | Won Continental Shield |
| 🏅 Open Cup | Won Open Cup |
| ⚡ Blitz King | Won Blitz Invitational |

---

## 🤖 Bot Calibration

For players without a Chess.com or Lichess account:

1. Play 5 games vs Stockfish (always as White, 10+0)
2. Bot difficulty adapts: Win → +2 levels, Loss → -2 levels, Draw → hold
3. Final rating = weighted average of bot Elos (games 4-5 weighted 2x)
4. Clamped to 600–2400 range
5. RD starts at 200 (provisional)

---

## 📞 Support

- **League Officer**: Contact via WhatsApp group
- **Bug reports**: Submit to GitHub Issues
- **Feature requests**: SS4 League General Chat

---

*All data is permanent. Every game ever played in the SS4 Chess League is preserved forever in this database.*

**SS4 Chess League v1.6 · Season 1 · Apr–Jul 2026**
