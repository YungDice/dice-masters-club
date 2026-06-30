## Goal

Ship a large fixes-and-features pass across Marketplace, Baddies, Profiles, Game Stats, Streaks, Roles, Limits, Currency, Friends, and Activity. Keep all existing functionality intact; only extend.

---

## 1. Marketplace & Tags

- Listing a tag/username no longer detaches it from the seller. Seller keeps the tag/username and profile shows a "For Sale" badge while listing is active.
- Transfer happens only inside `buy_listing_tx` / `settle_auction_tx` on successful completion. On cancel/expire, nothing transfers.
- Add a `profile_tags` table (`user_id`, `tag`, `acquired_at`, unique on `tag`) so users can own up to **3 tags**. `profiles.tag` becomes the "active/displayed" tag chosen from owned tags.
- DB trigger + RPC checks enforce max 3 owned tags per user. Buy/auction-settle RPCs reject when buyer already owns 3.
- Settings/Profile UI: list owned tags, pick active one, "List for sale" action per tag.
- Username listings: seller keeps username until sale; on completion, seller gets a temp username + one free change (already implemented) and buyer receives the username.

## 2. Baddie Cases & Passive Income

Already partly built (`/cases`, `baddies` table, `openBaddieCase`, `collectBaddieIncome`). Audit and confirm:

- Move "Baddie Base" button to the right side of the page header (already done — verify).
- Cap 2 (non-VIP) / 4 (VIP) enforced in `create_baddie_tx`.
- Income strictly on-click via `collect_baddie_income_tx`, using `last_collected_at` with 48h max accrual cap.
- No background cron grants income.

No new schema unless audit shows gaps.

## 3. Profile Background

- Apply `profile_bg_url` as a fixed full-page background on `/u/$username` (and `/profile`), behind all sections, not just one card.
- Add a subtle dark overlay for readability. VIP-only upload remains.

## 4. Wins/Losses & Game Statistics

- `record_game_result` already exists. Audit every game route to confirm it's called on win **and** loss, including bot opponents and PvP both sides:
  - Roulette, Blackjack (solo + multi), Dice (solo + PvP), Coinflip (+ bot), Slots, Video Poker, Split-or-Steal (+ bot), Flappy, Obby.
- Extend `game_results` columns if missing: `wagered`, `payout`. Add migration if needed.
- New SQL view `user_game_stats` aggregating: games_played, wins, losses, total_wagered, total_won, total_lost, net, by-kind breakdown.
- Profile page reads from the view and shows combined + per-game stats.

## 5. Daily Streak

- Add `profiles.last_streak_at` (date) if missing.
- Rewrite `touch_presence` (or split into `touch_streak`) to:
  - If `last_streak_at = today (UTC)` → no-op.
  - If `last_streak_at = yesterday` → `streak_days += 1`.
  - Else → `streak_days = 1`.
  - Always update `last_streak_at = today`.
- Frontend continues calling on heartbeat; DB enforces idempotency.

## 6. Owner / Admin Permissions

- Owner can grant `owner` role (already enforced in `protect_role_assignment`). Verify admin role UI in `/admin`.
- New RPC `grant_achievement_tx(_user, _achievement)` — owner-only, inserts into `user_achievements`, logs to `moderation_actions`.
- New RPC `admin_delete_listing_tx(_listing_id, _reason)`:
  - Refund active bid escrow (auctions).
  - Mark listing `removed`, do not transfer asset (seller keeps tag/username).
  - Log `moderation_actions`.
- New RPC `admin_delete_challenge_tx(_challenge_id, _reason)`:
  - Refund the 500 DICE creation fee (and any stake) to creator.
  - Cascade-delete proofs/participants/comments/likes.
  - Log `moderation_actions`.
- Admin UI buttons in `/marketplace/$id` and `/challenges/$id` visible to staff with confirm dialog + reason input.

## 7. VIP Betting Limits

- Central helper `maxBet(isVip)` → `isVip ? 10000 : 2000`. Replace ad-hoc limits in every game UI.
- Server-side: every stake RPC (`solo_dice_tx`, coinflip, slots, blackjack, roulette, video poker, split-steal) validates stake ≤ user's max via `is_vip(_uid)`.

## 8. Currency Conversion

- Single constant `DICE_PER_UNIT = 1000` shared by `BuyCoins.tsx` and Stripe price calc in `payments.functions.ts`.
- Update labels: "1 EUR / USD / CHF = 1000 DICE".
- Stripe checkout amounts recalculated accordingly. Webhook credits 1000 DICE per currency unit regardless of EUR/USD/CHF.

## 9. Friends & Online Status

- `profiles.last_seen_at` (already touched by heartbeat). Define online = `last_seen_at > now() - 2 min`.
- `/friends` shows green/grey dot + "Online" / "Last seen 5m ago".
- `/u/$username` action button derives from `friendships` status:
  - none → "Add Friend"
  - pending (sent) → "Cancel request"
  - pending (received) → "Accept" / "Decline"
  - accepted → "Friends ▾" with "Remove Friend"
- Chat message delete button only rendered when `msg.user_id === currentUserId` OR `is_staff(currentUserId)`. RLS already enforces — UI now matches.

## 10. Recent Activity

- `activity_feed` table exists. Add inserts at the source of every event:
  - Game finished → `game_result`
  - Challenge created/completed
  - Marketplace purchase
  - Baddie unlocked / case opened
  - Achievement earned
- Home dashboard "Recent Results" + "Recent Games" + "Friend Activity" tabs read live data via queries with realtime invalidation.

---

## Technical Details

### Migrations (single batch)
1. `profile_tags` table + grants + RLS + trigger enforcing max 3.
2. `game_results.wagered`, `payout` columns (nullable backfill).
3. `user_game_stats` view (security_invoker).
4. `profiles.last_streak_at date`.
5. Rewrite `touch_presence` for streak logic; split out `touch_streak` if cleaner.
6. New RPCs: `grant_achievement_tx`, `admin_delete_listing_tx`, `admin_delete_challenge_tx`, `set_active_tag_tx`, `list_owned_tag_tx`.
7. Modify `buy_listing_tx` / `settle_auction_tx` to insert into `profile_tags` instead of mutating `profiles.tag`; enforce 3-tag cap.
8. Add bet-limit check helper `assert_bet_within_limit(_uid, _amount)`; call from every staking RPC.
9. Activity feed inserts inside existing RPCs (game results, purchases, baddies, achievements).

### Frontend
- New `/cases` audit (already exists).
- `Settings` → Tags manager (owned tags, set active, list for sale).
- `BuyCoins`, payments fn → 1000/unit.
- Game pages → import `maxBet` helper.
- `/friends`, `/u/$username` → presence + friendship state-aware buttons.
- `ChatPopover` → conditional delete button.
- `/admin` + listing/challenge detail → admin delete with reason modal.
- Profile page → full-page bg with overlay.
- Home dashboard activity tabs → live data.

### Out of scope (not requested)
- No new games, no payment provider changes beyond rate.
- No redesign of unrelated pages.

---

## Rollout order

1. Migration batch (schema + RPCs).
2. Marketplace tag/username retention + 3-tag system + UI.
3. Admin moderation RPCs + UI.
4. Streak + presence rewrite.
5. Bet limits + currency rate.
6. Game-result + activity-feed instrumentation audit.
7. Profile background full-page + friendship-aware buttons + chat delete gating.
8. Stats view + profile stats UI.
9. QA pass per area.
