# RDX Supplier Hub

B2B hub where **Redantex** (jewellery packaging, São Paulo) runs quotes, samples
and orders with **DEQI**, its supplier in China. Three kanban boards, one card
per piece, moving Quotes → Samples → Orders.

React + Vite + TypeScript · Supabase (Postgres, auth, storage, realtime) ·
Netlify · Tailwind.

## Traps that have actually bitten

**The database is the source of truth, not `supabase/migrations/`.** Tables and
policies were created by hand in the dashboard and never written down. This has
caused three production bugs: `card_items` had no `file_url`, `cards` had no
`logo_*_outside/inside`, and `unit_price_usd` was `numeric(10,2)`, silently
rounding away the third decimal DEQI quotes in. **Probe the real schema before
diagnosing anything** — never trust the TypeScript interfaces as evidence a
column exists.

```
node ~/.rdx-dbtool/db.mjs "select column_name, data_type, numeric_scale
  from information_schema.columns where table_name = 'card_items'"
```

**Two components reading one realtime channel takes the page white.** Every
hook names its channel from data (`cards:${board}`), so two mounted consumers
of the same hook collide and one unmount kills the other's channel. It has
happened twice — `4042d96` (notifications) and `3fe9a02` (the Orders timeline
above the board). Guard: `supabase.getChannels().some(c => c.topic === 'realtime:' + name)`
and return early. Applied in `useCards`, `useComments`, `useNotifications`.

**`npm run build` is the authoritative typecheck.** `tsc --noEmit -p
tsconfig.app.json` reports ~71 errors that the real build does not — do not
quote that number as if it meant something.

**Errors are swallowed in many `catch` blocks.** Several were fixed to surface
the real message; more remain. When something "just fails", the cause is
usually being discarded rather than absent.

## Conventions

**The interface is English, all of it.** Doani writes in Portuguese and the
supplier reads English, so Portuguese has slipped into the UI twice — labels
once, and a `pt-BR` date format once. Includes anything `Intl` produces:
locale-aware dates and month names are interface text too.

**Status colour is semantic, not per-status.** Three families only — neutral
(waiting/closed), amber (running), green (done) — reused across all boards, so
one colour always means one thing. `STATUS_COLORS` in `src/types/index.ts`.

**Timestamps are pinned to São Paulo and labelled BRT.** Redantex and DEQI are
ten hours apart; the same event must not read as two different times.
`formatDateTime` in `src/lib/utils.ts`. **`formatDate` is deliberately not
pinned** — deadlines are typed as plain dates and stored at UTC midnight, so
pinning them would shift every deadline a day for the supplier.

**A piece keeps one reference number for life.** `allocate_card_ref` mints
`2026-10014` once and it survives promotion: `QUO-2026-10014` → `SMP-` → `ORD-`,
with `-R2` for a repeat run. Never generate refs client-side.

**`viewer` means DEQI.** The role is the supplier. Redantex is `admin`/`member`.
DEQI sees only their 60-day production leg — the shipping leg to Brazil is
withheld, on the board and inside the card.

**Notifications are raised by triggers, not the client.** `notify_on_comment`
and `notify_on_status_change`. Both swallow their own failures on purpose: a
notification must never be the reason a comment or a move fails to save.

## Running SQL

```
node ~/.rdx-dbtool/db.mjs "select ..."          # inline
node ~/.rdx-dbtool/db.mjs -f migration.sql      # a file, wrapped in a transaction
```

Credential in `~/.rdx-db-url` — read it, never print it. `psql` is not
installed. Write every schema change as a numbered file in
`supabase/migrations/` even though nothing replays them automatically, and
**verify independently after applying** rather than trusting the success
message.

## Known open issues

- **Two RLS policies are wide open**: `cards` ("Members can update cards") and
  `card_items` ("upd") both allow any authenticated user to update any row.
  DEQI can change prices, quantities and deadlines. Added in the dashboard.
- **Deadlines show a day early** for the Brazilian side. Deferred deliberately —
  the obvious fix (pinning to São Paulo) breaks the supplier's view instead.
- **Notifications are in-app only.** No email, no push. Closed tab, no signal.
- **`012_suppliers.sql` is written but not applied.** Multi-supplier isolation;
  until it runs, a second supplier would read DEQI's prices and artwork.
- Orphaned images sit in storage from item uploads that failed before `e93dc72`.
