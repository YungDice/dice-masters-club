## 1. Fix `open_baddie_case_tx` wallet call

Root cause: `open_baddie_case_tx` and `collect_baddie_tx` call `public.wallet_debit` / `public.wallet_credit`, which do not exist in this project. The canonical helper is `public.wallet_adjust_idem(_user, _delta, _type, _source, _ref_kind, _ref_id, _note, _op_id)`.

Migration rewrites both functions to use `wallet_adjust_idem`:
- Debit happens first inside the same transaction; if balance is insufficient `wallet_adjust_idem` raises `Insufficient DICE balance`, the transaction rolls back, no Baddie is created, and the client surfaces the error toast already wired in `baddies.tsx`.
- Use idempotency keys `baddie_open:<uuid>` (generated inside the fn) and `baddie_collect:<baddie_id>:<epoch_minute>` so retries are safe.
- Cap check (2 non-VIP / 4 VIP) runs before the debit.

No duplicate wallet helpers are created.

## 2. New rarities + weighted drops

Migration:
- Add 2 new templates: `unreal` (Unreal, 0.8%), `elias` (Elias, 0.2%).
- Rebalance weights so totals match exact rates: weights out of 10000 → common 5000, uncommon 2500, rare 1400, epic 700, legendary 300, unreal 80, elias 20.
- Income per hour: unreal 720, elias 1500 (Elias rarest + best).
- `open_baddie_case_tx` already picks via weighted sum — no logic change needed beyond the new rows.

UI (`src/routes/baddies.tsx`):
- Extend `RARITY_STYLE` map for `unreal` (violet/cyan holo gradient) and `elias` (gold/black mythic gradient with ring).
- Show odds column on each rarity card (e.g. "0.2%") computed from `weight / sum(weight) * 100`.
- Ensure 7 rarity cards lay out cleanly on mobile (2 cols) and desktop (responsive grid).

## 3. Elias image

- Save attached image to `src/assets/baddies/elias.jpg` (responsive object-cover usage).
- Store `image_url` on the `elias` template row pointing at the imported asset URL (via Lovable assets pointer or static import path served by Vite).
- Update `RARITY_STYLE` rendering and reveal/inventory cards to show `template.image_url` when present (square `object-cover` with rounded corners). Other Baddies keep the Sparkles icon fallback.

## 4. Activity feeds (Recent Results + Friend Activity)

The `activity_feed` table is already inserted into by `record_game_result`, `buy_listing_tx`, `settle_auction_tx`. Gaps: case open / Baddie collect / friend-side reads.

Migration:
- Insert into `activity_feed` from `open_baddie_case_tx` (`kind='baddie_unlocked'`) and `collect_baddie_tx` (`kind='baddie_income'`).
- Insert into `activity_feed` from `grant_achievement_tx` (`kind='achievement'`).

Frontend (home dashboard `src/routes/index.tsx`):
- **Recent Results**: query `game_results` for current user ordered by `created_at desc limit 20`, render game kind, wagered, payout, outcome, relative time. Realtime subscribe to inserts on `game_results` filtered by `user_id`.
- **Friend Activity**: query accepted friend ids from `friendships`, then `activity_feed` where `user_id in (friends)` order desc limit 30. Realtime subscribe to inserts on `activity_feed`; filter client-side by friend set.
- Add loading skeleton, `EmptyState` for no rows, and error toast.

## Technical notes

- Single migration covering: rewrite `open_baddie_case_tx`, rewrite `collect_baddie_tx`, insert new templates, update existing template weights, add activity_feed inserts to baddie + achievement RPCs.
- Image stored via `lovable-assets` CLI from `/mnt/user-uploads/image-3.png` and referenced through generated `.asset.json`.
- No new tables, no duplicate wallet helpers, no schema-breaking changes.