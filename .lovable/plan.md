# DICE Dominion — Build Plan

A persistent online strategy mini-game living at `/play/dice-dominion`, integrated into the existing DICE app (TanStack Router + React Query + Supabase + Tailwind + AppShell). Original DICE-themed art direction (emerald / black / gold / glowing dice energy), no Roblox or Mini War references.

Scope is large, so I'll ship it in **4 phases**. Each phase is playable and shippable on its own.

---

## Phase 1 — Foundation (backend + district loop)

Goal: a solo user can init a district, build, collect, and see resources tick correctly across refreshes.

**DB migration** (all with RLS + GRANTs + server-side timestamps):
- `dominion_profiles` (hq_level, roll_credits, scrap, power, command_energy, command_energy_updated_at, xp, initialized_at)
- `dominion_buildings` (profile_id, kind, level, slot_x, slot_y, last_collected_at)
- `dominion_jobs` (profile_id, kind: build/train/research, ref_id, starts_at, ends_at, payload, client_action_id UNIQUE)
- `dominion_units` (profile_id, kind, count)
- `dominion_research` (profile_id, branch, node, level)
- `dominion_daily_rewards` (profile_id, day, kind, granted_at, UNIQUE(profile_id, day, kind))
- Config tables/constants baked into server code: building specs, unit specs, research specs.
- RPC: `dominion_init`, `dominion_start_build`, `dominion_finish_job`, `dominion_collect`, `dominion_train`, `dominion_research_start`.
- Uses existing `wallet_adjust_idem` (inspect first) for any DICE grants — daily cap enforced server-side.

**Server functions** in `src/lib/dominion.functions.ts` (all `requireSupabaseAuth`, all take `client_action_id`):
- `dominionGetState` — snapshot + accrued production computed server-side.
- `dominionInit`, `dominionBuild`, `dominionUpgrade`, `dominionCollect`, `dominionFinishJob`.

**Route** `src/routes/play.dice-dominion.tsx` (under AppShell):
- Left panel: profile, resource bar, Command Energy, production rates.
- Center: 4x4 district grid (isometric-styled 2D via CSS) with build/upgrade actions.
- Right tabs: Build, Units (stub), Research (stub), Territory (stub), Activity.
- Empty state → Init district CTA. Loading skeletons. Toasts. Confirmations.

**Play index card** in `src/routes/play.index.tsx`: new "DICE Dominion" card, Online Strategy, min bet 0.

Deliverable: initialize district, place & upgrade Salvage Yard / Power Core / Dice Forge / Vault, collect resources, values survive refresh.

---

## Phase 2 — Units, Research, Combat vs neutral sectors

- Training queue (Scout Roller, Shield Guard, Crusher Tank, Sky Drone) — unit limit from Command Center + Tactics research.
- Research tree: Industry / Tactics / Logistics with permanent multipliers stored on `dominion_research`.
- Neutral sector attack flow (single-player at this stage):
  - `dominion_sectors` seeded with 16 sectors (neutral, dice_vault, fortified, event).
  - `dominion_battles` (attacker_id, sector_id, units_sent jsonb, result, seed, rewards, client_action_id UNIQUE).
  - RPC `dominion_attack` — validates units, debits Command Energy, deterministic RNG server-side, records battle, grants rewards, returns per-unit survivor counts for animation.
- Battle result modal with Framer Motion; survivors return to inventory.

---

## Phase 3 — Global world map, crews, realtime

- `dominion_sector_claims` (sector_id, owner_profile_id nullable, owner_crew_id nullable via existing `crews`, strength, protected_until).
- Territory tab: 16–20 sector map, ownership badges, crew emblem + name on crew-held sectors.
- Attack contested crew sectors; capture updates claims; contributes to Crew War Score (weekly view, aggregated via existing crew tables + a `dominion_crew_weekly` roll-up).
- Supabase Realtime on `dominion_sector_claims` and a lightweight `dominion_activity` feed — publish added in migration.
- Sector bonuses applied to production/training/rewards server-side.

---

## Phase 4 — Rewards, polish, admin

- Daily Dominion missions (3 rotating) + first-capture-of-day + weekly crew placement → DICE via `wallet_adjust_idem`, capped per user per day, idempotent via `client_action_id`.
- Admin tab additions in `src/routes/admin.tsx`: recent battles, suspicious reward claims (>cap attempts), sector map overview.
- Mobile polish: sticky resource bar, bottom sheet for Build/Units/Research/Map, tap-friendly targets, no hover-only affordances.
- Motion polish: resource collect burst, job-complete pulse, sector capture flash, battle result timeline.

---

## Technical notes

- **No client-trusted state**: all resource math, timers, battle outcomes, and wallet grants happen in RPC/server-fn. Client sends `client_action_id` (uuid) on every mutating call; unique index blocks dupes.
- **Production accrual**: `now() - last_collected_at`, capped at 8h, per building × level rate × research/sector multipliers. Computed in the `dominion_collect` RPC inside a transaction with `SELECT … FOR UPDATE`.
- **Command Energy**: regen via `now() - command_energy_updated_at` × rate, capped by Command Center level.
- **Timers short**: build 15–60s, train 20–90s, tuned per level.
- **RLS**: user reads/writes only own `dominion_*` rows; world map (`dominion_sectors`, `dominion_sector_claims`) publicly readable, writes via RPC only; admin via `has_role`.
- **Wallet integration**: I'll `code--view` the existing `wallet_adjust_idem` signature before wiring — no invented args.
- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE dominion_sector_claims, dominion_activity;` subscribers in `useEffect` with cleanup.
- **routeTree.gen.ts**: never hand-edit; the plugin regenerates.

---

## Approval

This is 4 sizable phases. On approval I'll start **Phase 1** in this turn (migration + server fns + route + play card). Say "go" to start Phase 1, or tell me to reshape scope/phasing first.
