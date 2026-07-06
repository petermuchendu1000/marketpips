# Supporting Pages — Design Dossier (Pip system)

Routes: `/leaderboard`, `/search`, `/profile`, `/notifications`
Status: **rebuild** on the Pip design system. The prior implementations were
written in the legacy DaisyUI vocabulary (`tabs-boxed`, `table-zebra`,
`bg-base-200`, `badge-success`, emoji headings 🏆🔍👤🔔). That language is
off-system, fails the "never template-like / no emoji" quality bar, and does not
match the rebuilt Landing, Markets, Market-detail, Portfolio, Auth and KYC
surfaces. Every page below is re-authored using only Pip tokens/components
(`.card`, `.btn-*`, `.tab-pill`, `.badge-*`, `.stat-chip`, `.input`, custom
`@/components/ui/icons`, `--text-*`, `--yes/--no`, mono numerics).

The backends are already shipped and unchanged: `GET /api/leaderboard`,
`GET /api/search`, Supabase `profiles`/`wallets`/`positions`/`notifications`,
and `GET/PATCH /api/notifications/preferences`. This work is **UI-only** on top
of stable contracts.

---

## Cross-page system rules (applied to all four)

- **Shell:** `mx-auto max-w-* px-4 py-6/8`; page title `font-display text-2xl
  text-text-primary`; section headers `text-sm font-semibold text-text-secondary`.
- **Numbers:** always `.mono` / `font-mono` with tabular figures. Money is
  neutral ink; only P&L and deltas take `--yes` / `--no`. Never neon.
- **Icons:** custom hand-built SVGs only (`IconLeaderboard`, `IconTrophy`,
  `IconSearch`, `IconBell`, `IconUser`, `IconPortfolio`, `CategoryIcon`, …).
  No Lucide/Heroicons as the visible language; no emoji.
- **States:** every async surface ships skeleton (`.skeleton`), empty, and
  error states. Empty states are illustrative (custom SVG), never a big emoji.
- **A11y:** WCAG AA+. Real semantics (`<table>`, `<nav>`, `role="tablist"`,
  `aria-live` for result counts and toasts, `aria-current` for rank/tab),
  visible `:focus-visible` rings, `prefers-reduced-motion` respected.
- **Motion:** `animate-fade-in` / `animate-slide-up` on mount only; row hovers
  are border/elevation, never scale-bounce. Reduced-motion disables all.
- **Responsive:** 390px first. Tables wrap in `.table-wrapper` (overflow-x) and
  collapse secondary columns; podium stacks under `sm`.

---

## 1) `/leaderboard` — ranked traders

### Research (why the references work)
- **Kalshi / Polymarket leaderboards** rank by a single switchable metric with a
  short period toggle. The top-3 get visual weight (podium); the long tail is a
  scannable table. Why it works: one dominant metric column removes cognitive
  load; the podium gives aspirational focus without turning the page into a game
  show. We keep the podium restrained (no confetti, no gold gradients — brass
  hairline accents only) so it reads institutional, not casino.
- **Bloomberg league tables** — dense monospaced ranks, right-aligned figures,
  hairline row rules. We adopt the numeric discipline and rank typography.

### User goals
1. "Who's the best right now?" → podium (top 3) for the active metric.
2. "By what measure?" → metric segmented control (Volume / Win rate / P&L).
3. "Over what window?" → period control (All-time / Month / Week).
4. "Where do I / a name rank?" → full ranked table, rank-stable with tie-breaks.

### Information architecture
```
Leaderboard
├── Header            title + one-line context (period × metric)
├── Controls          metric segmented (3) · period pills (3)   [sticky-ish]
├── Podium            #2 · #1 · #3 — avatar, name, primary metric, rank plinth
└── Standings table   # · Trader (avatar+name+@user) · Metric · Bets · Win% · P&L
                      (active metric column emphasized; you-row highlight ready)
```

### Component spec
- **MetricControl** — Pip segmented control (single inset track, active pill uses
  `--pip-100`/`--pip-text`), `role="tablist"`, arrow-key roving focus.
- **Podium** — three plinths; #1 taller and brass-accented, #2/#3 neutral. Rank
  numeral in a rounded medallion (custom, not emoji). Primary metric under name.
  Stacks to a simple 1-2-3 list under `sm`.
- **StandingsTable** — real `<table>`, sticky header, `.mono` right-aligned
  figures, win-rate as `.badge-green/.badge-muted`, P&L signed `--yes/--no`.
  Rank medals for 1-3 rendered as tinted numerals, not emoji.
- States: 8-row skeleton; empty = "No ranked traders yet" with custom trophy SVG.

### SEO / perf
- Public, cacheable data (SWR headers already set server-side). Page can be
  server-rendered; keep interactive controls as a small client island.
- No CLS: result area reserves height; skeleton rows match final row height.

---

## 2) `/search` — instant market discovery

### Research
- **Linear / Raycast command palettes** — instant, keyboard-first, zero-latency
  feel via debounce + optimistic clearing. We borrow the immediacy and the
  "recent / suggested" scaffold shown before a query exists.
- **Polymarket search** — category facets + status + sort as compact controls,
  results as the same market cards used elsewhere (consistency = trust). We reuse
  the canonical `MarketCard`, so a result looks identical to a discovery card.

### User goals
1. "Find a market fast" → focused input, 250-300ms debounce, live count.
2. "I don't know what to type" → recent searches (local) + trending markets +
   category facets as launchpads.
3. "Narrow it" → category facet chips + status + sort.
4. "Open it" → click straight through to `/markets/[slug]`.

### Information architecture
```
Search
├── Search field         big, autofocused, clearable, ⌘K-style affordance
├── Facet row            category chips (CategoryIcon) · status select · sort select
├── Pre-query state      Recent searches (localStorage) · Trending (empty-q volume)
└── Results              live count (aria-live) → grid of MarketCard  |  empty state
```

### Component spec
- **SearchField** — `.input` xl variant with leading `IconSearch` and trailing
  clear (`IconX`); `type="search"`; keyboard `/` to focus, `Esc` to clear.
- **CategoryFacets** — horizontally scrollable `.tab-pill` row with
  `CategoryIcon`; "All" default; reflects `?category`.
- **RecentSearches** — up to 6 chips from `localStorage` (`mp:recent-searches`),
  each removable; cleared individually or all.
- **Trending** — when query empty, fetch `/api/search?sort=volume` and show the
  top markets as `MarketCard`s under a "Trending now" header.
- **Results** — reuse `MarketCard`; highlight matched query tokens in titles via
  `splitHighlight` using a `--pip-100` mark (not amber). Count is `aria-live`.
- States: 6-card skeleton grid; empty = "No markets match" custom SVG + reset.

### SEO / perf
- `robots: noindex` on the search route (thin/duplicative). Debounced fetch with
  `AbortController`; reserved count height to avoid CLS (already a fixed issue in
  the a11y history — preserve it).

---

## 3) `/profile` — identity, stats, positions, settings entry

### Research
- **Stripe Dashboard settings** — a calm two-column form with grouped sections,
  inline save, and clear helper text. We adopt the section grouping and the
  quiet inline "Saved" confirmation (toast/pill), no modal churn.
- **Robinhood/eToro profile headers** — identity block (avatar, name, @handle,
  member-since) over a KPI strip (volume, win rate, P&L, bets). We keep KPIs
  numeric and neutral; P&L signed.

### User goals
1. "This is me" → identity header (avatar, display name, @username, join date,
   KYC/level badge, referral).
2. "How am I doing?" → KPI strip (Total bets · Win rate · Volume · P&L).
3. "My money" → wallets by currency (available balance).
4. "My activity" → recent positions history with a link into `/portfolio`.
5. "Change my details" → edit form (name, username, bio, phone, currency),
   inline save; settings entry (notifications → `/notifications`).

### Information architecture
```
Profile
├── Identity header     avatar · display name · @username · joined · KYC badge · referral chip
├── KPI strip           Total bets · Win rate · Volume · P&L (mono, signed P&L)
├── Two-column body
│   ├── Left (main)     Positions history (recent) + link to full Portfolio
│   └── Right (rail)    Wallets · Settings entries (Notifications, KYC, Deposit)
└── Edit profile        grouped form, inline Save, referral share
```

### Component spec
- **ProfileHeader** — `.card` with `.avatar` (initial or image), name/handle,
  `IconCalendar` join date, KYC `level-badge`, referral `IconShare` chip (copy).
- **StatStrip** — 4 `.stat-chip`-style tiles with `stat-chip-icon` (IconTrophy,
  IconPercent, IconTrendUp, IconPortfolio). P&L colored, rest neutral.
- **PositionsHistory** — compact list of recent positions (market title, side
  YES/NO chip, shares, invested), each links to the market; "View full
  portfolio →" CTA. Reads `positions` join `markets` for the current user.
- **WalletsCard** — per-currency rows (flag, code, `.mono` balance).
- **EditProfileForm** — Pip `.input`/`select`/textarea, grouped; single Save
  `.btn-primary`; inline "Saved" pill with `aria-live`. Reuses existing supabase
  update logic; adds proper Pip fields + real toggles for email/SMS.
- Guarded: redirect to `/auth/login` if unauthenticated; skeleton while loading.
- `robots: noindex` (personal).

---

## 4) `/notifications` — grouped feed + per-type preferences

### Research
- **GitHub / Linear inbox** — notifications grouped by time ("Today", "Earlier"),
  unread emphasized with a leading dot + weight, bulk "mark all read", per-item
  read-on-click. We adopt time grouping + the unread dot, and add type filters.
- **Slack notification prefs** — per-channel/per-type matrix. We ship a per-type
  preference surface (delivery channels) via the existing preferences component,
  rebuilt on-system, plus type filters on the feed.

### User goals
1. "What's new?" → unread-first, time-grouped feed with typed icons.
2. "Only show X" → type filter pills (All / Trades / Money / Markets / Account).
3. "Clear it" → mark-all-read; click a row to mark read + deep-link.
4. "Tune delivery" → collapsible preferences (in-app always on; email/SMS/push).

### Information architecture
```
Notifications
├── Header              title + unread count chip · "Mark all read"
├── Type filters        All · Trades · Money · Markets · Account (pills)
├── Preferences         DeliveryPreferences (rebuilt on Pip) — collapsible
└── Feed                grouped Today / This week / Earlier
                        row = typed icon · title · body · relative time · unread dot
```

### Type → group + icon mapping
- **Trades:** bet_filled, bet_won, bet_lost → IconSwap / IconTrophy / IconTrendDown
- **Money:** deposit_completed, withdrawal_completed, withdrawal_failed,
  referral_bonus → IconDeposit / IconWithdraw / IconWarning / IconShare
- **Markets:** market_created, market_resolved, market_closing_soon, price_alert
  → IconMarkets / IconCheck / IconClock / IconPercent
- **Account:** kyc_approved, kyc_rejected, system_announcement → IconShield /
  IconWarning / IconBell
Each icon sits in a tinted `stat-chip-icon`-style medallion colored by group
(pip / yes / no / brass), never emoji.

### Component spec
- **TypeFilter** — `.tab-pill` row, roving focus, reflects group filter.
- **DeliveryPreferences** (rebuild of `NotificationPreferences.tsx`) — Pip rows
  with real switches (Radix `Switch` styled on-system or a Pip toggle), optimistic
  PATCH with revert on error, `aria-live` error text. In-app row shown as "Always
  on" (disabled, explained).
- **NotificationRow** — medallion icon + title + body + relative time
  (`date-fns`), unread dot + subtle `--pip` left rule; whole row is a button when
  unread (Enter/Space to mark read), links via `data.href` when present.
- **Grouping** — bucket by Today / This week / Earlier from `created_at`.
- Realtime INSERT subscription preserved; new items animate in.
- States: 6-row skeleton; empty = "You're all caught up" custom bell SVG.
- `robots: noindex` (personal).

---

## Implementation roadmap (tight commits — one per step)
1. **Dossier** (this file) → commit.
2. **/leaderboard** rebuild (podium + standings, metric/period controls) → typecheck+lint → commit → push.
3. **/search** rebuild (field, facets, recent/trending, MarketCard results) → typecheck+lint → commit → push.
4. **/profile** rebuild (identity header, KPI strip, positions history, wallets, edit form) → typecheck+lint → commit → push.
5. **/notifications** rebuild + **DeliveryPreferences** rebuild (grouped feed, type filters, prefs) → typecheck+lint → commit → push.
6. **Review loop** per page against the quality bar; fix; final commit.

## Review loop checklist (run per page)
- Would Stripe/Linear/Bloomberg ship this? Is every element justified?
- Zero emoji, zero DaisyUI, zero generic-Tailwind card soup. Only Pip tokens.
- Spacing on the 8px grid; numerals tabular/mono; hierarchy unmistakable.
- Skeleton + empty + error present; AA contrast in light & dark; keyboard-complete.
- No CLS; motion respects reduced-motion; focus rings visible.
