# Roadmap: Trading, Clans, Season Pass, Cosmetics

Vier große Systeme in **vier separaten Phasen** — jede Phase ist ein eigener Build (Migration + Server-Fns + UI). Nach Genehmigung dieses Plans baue ich **Phase 1 zuerst**; die anderen Phasen bestätigst du dann einzeln.

---

## Phase 1 — Trading System (Baddie ↔ Baddie / Baddie ↔ DICE)

**Ziel:** Sichere P2P-Trades zwischen Freunden mit Bestätigungsfenster und History.

- Neue Tabelle `trades`: `id, from_user, to_user, status (pending/accepted/declined/cancelled/completed), from_baddies uuid[], to_baddies uuid[], from_dice bigint, to_dice bigint, created_at, resolved_at`.
- RPC `create_trade_tx` — lockt angebotene Baddies (`listing_id`-artiges Feld `trade_id`), zieht DICE-Anteil in Escrow.
- RPC `respond_trade_tx(_id, _accept)` — atomarer Swap: Baddie-Ownership + DICE-Balance in einer Transaktion, Escrow-Refund bei Decline/Cancel.
- Auto-Expire nach 24 h (pg_cron).
- **UI:** neue Route `/trades` mit Inbox / Sent / History; „Trade anbieten"-Button auf Freundes-Profil und in Baddie-Inventar.
- Nur zwischen bestätigten Freunden (verhindert Scams).

## Phase 2 — Clans / Crews

- Tabellen: `clans` (name, tag, banner, owner_id, created_at, total_dice_donated, weekly_score), `clan_members` (clan_id, user_id, role: owner/officer/member, joined_at), `clan_donations` (clan_id, user_id, amount, created_at), `clan_weekly_scores` (clan_id, week_start, xp/wins/dice_earned).
- RPCs: `create_clan_tx` (kostet 10 000 DICE), `join_clan_tx`, `leave_clan_tx`, `kick_member_tx`, `donate_to_clan_tx`, `promote_member_tx`.
- pg_cron wöchentlich: aggregiert `game_results` + Case-Opens pro Clan → `clan_weekly_scores`, Top-3-Clans bekommen DICE-Prämien.
- **UI:** `/clans` (Browser + Leaderboard), `/clans/$id` (Detail, Mitglieder, Spenden, Wochenscore).
- Clan-Tag optional neben Displayname.

## Phase 3 — Season Pass / Battle Pass

- Tabellen: `seasons` (id, name, starts_at, ends_at, tiers jsonb), `season_progress` (user_id, season_id, xp, claimed_free int[], claimed_vip int[]), `season_rewards` (tier, track free/vip, kind: dice/case/cosmetic/baddie/frame, value).
- Season-XP wird von Games/Cases/Missions gefarmt (separater Zähler, nicht Level-XP).
- Kostenlose Spur für alle, VIP-Spur nur `is_vip`.
- `claim_season_tier_tx(_tier, _track)` — atomar, prüft XP-Schwelle.
- **UI:** `/season` mit horizontaler Tier-Leiste, Progress-Bar, Claim-Buttons; VIP-Track visuell hervorgehoben.
- Erste Season = 30 Tage, 30 Tiers.

## Phase 4 — Skins & Cosmetics

- Tabelle `cosmetics` (id, kind: dice_skin/banner/avatar_frame/chat_emote/title, name, rarity, source: shop/pass/achievement, price, asset_url).
- `user_cosmetics` (user_id, cosmetic_id, acquired_at, equipped bool).
- Erweitert `profiles`: `equipped_dice_skin`, `equipped_frame`, `equipped_title`.
- Cosmetic-Shop: Route `/shop/cosmetics` — kaufen mit DICE.
- Chat-Emotes werden im Global Chat gerendert (`:emote_name:`).
- Dice-Skin ersetzt die Würfel-Textur in `play.dice` / Coinflip.
- Avatar-Frame wird um Profilbilder gerendert (Component `<AvatarFrame />`).
- Titles erscheinen unter Displayname.
- Cosmetics werden zusätzlich als Season-Pass- und Achievement-Belohnungen ausgegeben.

---

## Technische Notizen (technisch)

- Alle neuen Tabellen: `GRANT` + RLS mit `auth.uid()`-Policies, `service_role` für pg_cron.
- Alle Wertetransfers gehen über `wallet_adjust_idem` (idempotent, verhindert Doppel-Payout).
- Neue Server-Fns unter `src/lib/*.functions.ts` mit `requireSupabaseAuth`.
- Neue Routes unter `src/routes/` (public read-Teile: Clan-Browser, geschützt: Trades/eigene Clan-Aktionen).
- Activity-Feed-Events: `trade_completed`, `clan_joined`, `clan_donation`, `season_tier_claimed`, `cosmetic_equipped`.

---

**Nächster Schritt:** Approve → ich baue **Phase 1 (Trading)** komplett. Die anderen Phasen bestätigst du dann einzeln, damit jede sauber getestet werden kann.
