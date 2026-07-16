
# Dashboard Redesign — Premium Dark Gaming Shell

Redesign the authenticated app shell + home dashboard using the reference layout: slim left icon rail, top bar with search & profile, hero banner, leaderboard side panel, and modern card sections. All routes, Supabase functionality, auth, and DICE content stay untouched — this is presentation only.

## Scope

- New app shell layout (`AppShell` in `src/components/dice/TopNav.tsx`) — replace top pill nav with slim left icon rail + slim top bar. Marketing landing page (`Landing`) untouched.
- Home dashboard (`src/routes/index.tsx`) — restructured into: featured hero banner + leaderboard panel (2‑col), then challenges / games / marketplace / activity / online friends card grid.
- Global tokens tightened in `src/styles.css` — near‑black surfaces, charcoal cards, red + gold accents, softer glows.
- No changes to any other route file, server functions, DB, auth, or business logic. Every existing nav destination remains reachable from the new sidebar (grouped items become sections on the rail with hover flyouts + a mobile Sheet).

## New Layout

```text
┌──┬──────────────────────────────────────────────────────────┐
│  │  [search........]      DICE badge  chat  bell  avatar ▾ │
│ L├──────────────────────────────────────────────────────────┤
│ o│  ┌───────────────────────── HERO ─────────┐  ┌─LEADER─┐  │
│ g│  │ Welcome / streak / claim daily / lvl   │  │ Top 5  │  │
│ o│  └────────────────────────────────────────┘  │ players│  │
│  │                                              └────────┘  │
│ ⌂│  ┌ Featured Challenges (4 cards) ─────────────────────┐  │
│ ♟│  └────────────────────────────────────────────────────┘  │
│ ♦│  ┌ Quick Play (6 game tiles) ─────────────────────────┐  │
│ ♣│  └────────────────────────────────────────────────────┘  │
│ ♥│  ┌ Marketplace ──────┐ ┌ Recent Activity ──┐            │
│ ★│  └───────────────────┘ └───────────────────┘            │
│ ⚙│  ┌ Online Friends ────────────────────────────────────┐  │
│  │  └────────────────────────────────────────────────────┘  │
└──┴──────────────────────────────────────────────────────────┘
```

## App Shell (`TopNav.tsx`)

Rewrite `AppShell` + `TopNav` into a two‑part shell while keeping the existing `nav` entries, wallet, chat popover, notifications popover, and account dropdown.

- **Sidebar (`hidden md:flex`, `w-16` fixed left):**
  - Top: `DiceLogo`.
  - Icon buttons for every current leaf; each `Group` becomes a single icon with a Radix `HoverCard` / `DropdownMenu` flyout listing its children (Missions, Market, Baddies, DikDok, Social, Ranks). Admin icon at bottom if `isStaff`.
  - Active state = red/gold glow + left accent bar. Tooltip on hover with label.
  - Subtle border-right `rgba(201,168,76,0.15)`, `bg-background/70 backdrop-blur-xl`.
- **Top bar (`h-14`, sticky):**
  - Left: mobile menu button (`md:hidden`) opening the existing Sheet, plus current page title on mobile.
  - Center: search input (visual only for now — routes to `/marketplace?q=` on submit, uses existing query infra; no new server code).
  - Right: DICE balance badge, `ChatPopover`, `NotificationsPopover`, avatar dropdown (unchanged menu items).
- **Content area:** `ml-16` on desktop, `max-w-none px-6 py-6` inside a `min-h-screen` flex row.
- **Mobile:** sidebar hidden, existing Sheet menu (already scroll‑fixed) remains; top bar keeps search + avatar.

No new dependencies. Reuses `DropdownMenu`, `Sheet`, `Avatar`, `motion`, existing icons.

## Home Dashboard (`routes/index.tsx`)

Keep every existing query (`daily`, `featured`, `friendIds`, `feed`, `recentGames`, `notif`, `leaderPreview`, `featuredListings`, `dailyClaimed`, wallet, profile) and the `onClaim` handler. Only the JSX layout changes:

1. **Hero banner (col‑span‑2):** larger, cinematic — gradient + radial glow, keeps greeting, balance, streak, level progress, "Claim daily" CTA, "Go to lobby" link. Add a decorative floating dice/coin motif via CSS (no new asset).
2. **Leaderboard panel (col‑span‑1):** uses `leaderPreview` data — rank number, avatar, name, level, XP; gold trim; link to `/leaderboard`.
3. **Featured Challenges:** existing 4‑card grid, restyled as charcoal cards with red accent on hover.
4. **Quick Play:** existing 6 tiles, restyled with gold border + red glow hover.
5. **Marketplace preview:** existing `featuredListings` — 4 cards.
6. **Recent Activity:** merge `feed` (friend activity) + `recentGames` into a single tabbed card, or two stacked cards on `lg:grid-cols-2`.
7. **Online Friends:** new lightweight section using `friendIds` + existing `profiles` query (add a small query for online status from `profiles.last_seen_at` if the column exists — otherwise show first N friends as "recently active"). Falls back gracefully when no friends.

Responsive: single column on mobile, `lg:grid-cols-3` for hero+leaderboard row, `md:grid-cols-2` / `lg:grid-cols-4` for card grids.

## Design Tokens (`src/styles.css`)

Small tuning only, no breaking changes:

- `--background`: near‑black `oklch(0.11 0.008 20)`.
- `--card`: charcoal `oklch(0.16 0.012 20 / 0.85)`.
- Body background: darker radial gradients, less purple.
- Add `@utility glow-gold` (soft gold ring) and `@utility card-hover` (translateY + red‑glow border on hover) for reuse.
- Keep `--primary` (casino red) and `--gold` as accent tokens; components use these semantic tokens only — no hardcoded colors.

## Explicitly Out of Scope

- No changes to `Landing` (signed‑out home).
- No changes to any `/routes/*` file other than `index.tsx`.
- No changes to server functions, Supabase schema, RLS, auth, wallet, or DICE mechanics.
- No new npm packages, no new assets/images.
- Reference image is inspiration only — no branding, copy, characters, or artwork from it is copied.

## Verification

- `tsgo` typecheck clean.
- Manual: desktop shows sidebar + top bar; mobile hides sidebar and shows Sheet menu; all existing nav links resolve; daily claim, chat, notifications, avatar menu still work; hero + leaderboard render for a logged‑in user; empty states render when queries return nothing.
