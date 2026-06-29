## 1. Idle XP (+25 XP/min, any open tab)

Server-authoritative — clients cannot self-grant XP.

- New server function `heartbeatXp` (`src/lib/xp.functions.ts`) using `requireSupabaseAuth`. Called every 60s from a small `useIdleXp()` hook mounted in `__root.tsx`. Runs regardless of tab visibility (per your choice).
- DB function `award_idle_xp(_uid)`:
  - Reads `profiles.last_xp_tick_at` (new column, `timestamptz`).
  - If now − last_tick ≥ 55s, award `+25 XP`, set `last_xp_tick_at = now()`.
  - Server-side throttle stops anyone scripting faster ticks. Max 1 minute granted per call.
- Returns `{ xp, level, leveled_up, dice_awarded }` so the UI can toast level-ups.

## 2. +500 DICE per level

- Same `award_idle_xp` function (and any other XP source we add later) re-computes level from XP using existing `levelFromXp` formula in SQL.
- If new level > old level, loop awards `500 DICE × levelsGained` via existing `wallet_adjust` (source: `'level_up'`) and updates `profiles.level`.
- The manual "buy level" button in Settings (already exists) is removed — levels now come only from XP.
- Toast: "Level up! +500 DICE" on the client when `leveled_up` is true.

## 3. Design refresh — navigation + dashboards

Same palette (dark casino + gold), no new fonts. Targets:

### Top nav (`TopNav.tsx`)
- Sticky, slimmer (h-14), blurred glass, gold hairline bottom border.
- Left: logo only. Center (desktop): primary nav as pill-group with active indicator (animated underline via framer-motion `layoutId`). Right: DICE balance pill, chat icon, notifications icon, avatar menu.
- Mobile: hamburger opens a `Sheet` drawer with grouped sections (Play / Social / Market). Removes the current cramped wrap-around row.
- Avatar menu shows display name + `@username#tag`, DICE balance, links to Profile / Settings / Admin (if staff) / Sign out.

### Home (`routes/index.tsx`)
- Bento-grid layout:
  - Hero card: greeting, level + XP progress bar, daily reward CTA.
  - Wallet card: balance, lifetime earned, "Buy Coins" link to Settings.
  - Quick-play card: 6 game tiles with icons.
  - Active challenges card.
  - Friends online card.
  - Activity feed card (compact).
- Skeleton loaders per card (no full-page spinner).

### Play hub (`routes/play.index.tsx`)
- Replace current list with a responsive game grid: each game tile uses `CasinoFrame`-style gold trim mini-card with icon, name, short tagline, "min bet" badge.
- Filter chips: Solo / PvP / All.

### Shared polish
- Card component gets a `glass-gold` variant (subtle gold border + inner hairline) reused across home/play/profile headers.
- Empty states get illustrations + clearer CTAs.
- Consistent page header pattern (icon + title + subtitle) across all top-level routes.

## Technical details

- Migration: add `profiles.last_xp_tick_at timestamptz`, create `award_idle_xp` SECURITY DEFINER fn (revoke EXECUTE from public/anon/authenticated; called only via server fn using service-role import or via authenticated RPC scoped to `auth.uid()`).
- Hook: `useIdleXp` uses `setInterval(60_000)`; clears on unmount; no visibility gating.
- No changes to game logic, marketplace, or auth.
- Files touched: `src/lib/xp.functions.ts` (new), `src/hooks/use-idle-xp.ts` (new), `src/routes/__root.tsx`, `src/components/dice/TopNav.tsx`, `src/routes/index.tsx`, `src/routes/play.index.tsx`, `src/routes/settings.tsx` (remove buy-level), `src/components/ui/card.tsx` or a new `GlassCard` wrapper, plus one migration.
