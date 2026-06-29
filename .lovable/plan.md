
## Goal

Add a real Roulette game (American 0/00, solo + live shared table) and bring every existing game up to a premium dark casino standard — felt textures, chip stacks, dealt-card and dice motion, lighting/glow, sound, win celebrations, and clearer flow.

## 1. Roulette — new game

### Server logic (`src/lib/roulette.functions.ts`)
- `WHEEL_AMERICAN`: 38 pockets in correct wheel order with red/black/green colors.
- Bet types supported: straight (single number), split, street, corner, line, column, dozen, red/black, even/odd, low/high, 0, 00, top-line (0,00,1,2,3). Each with correct payouts (35:1 down to 1:1).
- `rouletteSpin({ bets })` — solo vs house. Validates total stake ≤ balance, debits wallet, generates spin with seeded RNG, settles every bet, credits winnings, logs to `game_results`.
- Live multiplayer table (one shared American wheel):
  - New table `roulette_tables` (single row "main" + room-style sub-tables).
  - New table `roulette_rounds`: `id, table_id, status (betting|spinning|settled), result_pocket, opens_at, closes_at, settled_at`.
  - New table `roulette_bets`: `round_id, user_id, bet_type, bet_value (jsonb), amount`.
  - Server fns: `placeRouletteBet`, `getCurrentRound`, plus a `tickRoulette` fn invoked by a `pg_cron` job every 5s that closes betting → spins → settles → opens next round (20s betting / 8s spin/reveal cycle).
  - Realtime publication on `roulette_rounds` + `roulette_bets`.

### UI (`src/routes/play.roulette.tsx`)
- Full felt table SVG with all number cells, dozens, columns, even-money rows, 0/00.
- Chip rail (5/25/100/500/1000) — click a chip then click a cell to place; right-click/remove on cell.
- Animated wheel: SVG with 38 segments in correct order, ball orbits opposite direction with framer-motion rotation, decelerates and lands on result pocket, slot highlight + glow on win.
- Tabs: "Solo" (instant spin button) vs "Live table" (shared round timer, list of other players' total stake, settle reveal, chat-style log of recent results — last 12 results board with red/black/green dots).
- Win celebration: confetti burst + payout breakdown per bet.
- Sound: ball click on rim, ratcheting, win chime (same WebAudio approach as slots).

### Lobby
- Add Roulette card to `src/routes/play.index.tsx` (icon: `CircleDot`).

## 2. Visual overhaul — all games

Shared additions:
- `src/components/dice/casino/Felt.tsx` — reusable layered felt background (radial vignette + noise + subtle gold trim).
- `src/components/dice/casino/Chip.tsx` — SVG poker chip with denomination, edge dashes, stackable.
- `src/components/dice/casino/PlayingCard.tsx` — single high-quality card face (suit pips, corner indices, back pattern, flip animation).
- `src/components/dice/casino/WinBurst.tsx` — confetti + glow + payout count-up.
- `src/components/dice/casino/SoundFx.ts` — small WebAudio helpers (chip clack, card deal, dice tumble, coin spin, win chime). Reusable across games.

Per-game upgrades:

**Blackjack (`play.blackjack.tsx` + multiplayer route)**
- Real felt table with seat arcs, dealer at top, player hand bottom; chip stack visualization per bet.
- Cards dealt with stagger + flip animation using `PlayingCard`; dealer hole card flips on stand.
- Running hand total badge animates; bust/blackjack/push banner.
- Action bar redesigned: large Hit/Stand/Double/Split buttons with icons + keyboard shortcuts (H/S/D/P).
- Multiplayer: clear active-seat highlight ring + countdown timer per turn.

**Dice (`play.dice.tsx`)**
- 3D-feeling tumbling dice using CSS transforms + framer-motion (rotateX/Y over ~1.4s) landing on result face. Two dice with shadow.
- Felt craps-style table backdrop; total + roll history strip.
- PvP: both players' dice roll side by side with synchronized reveal.

**Coin Flip (`play.coinflip.tsx`)**
- Real spinning coin (heads/tails SVG faces, rotateY animation with motion blur via box-shadow) with shadow ellipse pulsing.
- Suspense delay before reveal; winner glow.

**Slots (`play.slots.tsx`)**
- Cabinet frame upgrade: gold trim, marquee with animated bulbs, side jackpot meter.
- Pull-lever handle (clickable, animates down).
- Win line highlight across center row; jackpot WIN sequence with bigger confetti and ascending chime.
- Reels keep current mechanic but get inner shadow + chrome dividers.

**Split or Steal (`play.split-steal.tsx`)**
- Two large physical-looking cards (SPLIT green / STEAL red) that flip face-down then reveal simultaneously.
- Pot chip stack in center grows as both players ante.
- Outcome banner with each player's choice + payout.

**Video Poker (`play.poker.tsx`)**
- Replace ad-hoc cards with `PlayingCard`; HOLD badge becomes a metallic plate animation.
- Paytable highlights the current winning row in gold when achieved.
- Deal/draw chip clack + card deal sounds.

## 3. Navigation

`src/components/dice/TopNav.tsx` — no change (Roulette nests under Play). `play.index.tsx` lobby gets the new tile.

## Technical notes

- All new server functions use `requireSupabaseAuth` and go through `wallet_adjust` for balance changes — no client-trusted payouts.
- Roulette RNG happens server-side only; clients receive the result pocket after `status='spinning'` ends.
- pg_cron job name: `roulette-tick`, runs every 5 seconds calling an edge route at `/api/public/roulette/tick` guarded by a shared secret env var (kept server-side).
- Realtime added to `roulette_rounds` and `roulette_bets`; RLS: bets readable by everyone on the same round (aggregated UI), writable only by the betting user.
- Daily cleanup cron already in place gets a clause to purge settled rounds older than 24h.
- No real-money features added; chip denominations remain DICE only.
- Reuse existing `framer-motion`; add no new heavy dependencies. Confetti via a tiny inline canvas component (no extra package).

## Out of scope (ask later if wanted)

- European roulette toggle.
- Spectator mode for blackjack tables.
- Custom themes / skins per game.
