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

**Excel dates come back a millisecond early.** `xlsx` round-trips a cell typed
as 09/09/2026 into `08/09/2026 23:59:59.999`, so reading the calendar fields
straight off it loses a day on every import. `calendarDay` in
`src/lib/cardSheet.ts` snaps to the nearest local midnight. The import parser
has no test runner but does have tests — run
`node_modules/.bin/jiti scripts/check-import-parser.ts`, and run it under
`TZ=Asia/Shanghai` too, because that is where the supplier is.

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

**Delivery is promised in monthly batches, anchored on the sample.** A sample
approved on or before the **10th** delivers **120 days after that 10th**, and the
whole batch lands on one date — five orders approved across three weeks all
showing 8 January is the rule working, not a bug. Approving on the 11th does not
cost a day, it costs the batch: the piece waits for the next cut-off, some thirty
days later. `sample_approved_at` is stamped by `stamp_sample_approved` and
survives promotion to Orders; `order_confirmed_at` (stamped at PI Approved) is
only the fallback for a confirmed quote that never was a sample. The arithmetic
is `batchCutoff` / `orderClock` in `src/lib/utils.ts`, mirrored — never stored —
by `sample_batch_cutoff` in migration 026: the lead time already moved once, from
130 to 120, and a stored value would keep answering with the dead rule. Tests:
`node_modules/.bin/jiti scripts/check-delivery-schedule.ts`, under
`TZ=Asia/Shanghai` too.

**A piece keeps one reference number for life.** `allocate_card_ref` mints
`2026-10014` once and it survives promotion: `QUO-2026-10014` → `SMP-` → `ORD-`,
with `-R2` for a repeat run. Never generate refs client-side.

**Hiding a column in the UI is not protecting it.** `cards` and `card_items`
both have a SELECT policy whose condition is `true`, so every authenticated
account — including both DEQI logins — reads every column of every row through
the API. RLS filters rows, not columns. Anything a supplier must not see needs
its own table with its own policy: `card_item_pricing` is the worked example
(migration 025), and the gate trigger reads it as `security definer`.

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

## Deploying costs real money

A production deploy costs roughly **15 Netlify credits**, against 1000 per
month — about 66 deploys, and 59 were spent in the first two weeks of one
period by pushing after every individual change.

**Batch the work and push once**, at the end of a task or a session, not after
each edit. `netlify.toml` already skips builds when only docs, migrations or
CLAUDE.md changed, but that is the small half of the fix; the habit is the
other half. Serving the site is free by comparison — bandwidth and compute
together came to under 2 credits in a month.

## Known open issues

- **Two RLS policies are wide open**: `cards` ("Members can update cards") and
  `card_items` ("upd") both allow any authenticated user to update any row.
  DEQI can change prices, quantities and deadlines. Added in the dashboard.
- **Deadlines show a day early** for the Brazilian side. Deferred deliberately —
  the obvious fix (pinning to São Paulo) breaks the supplier's view instead.
- **Notifications are in-app only.** No email, no push. Closed tab, no signal.
- **`012_suppliers.sql` is written but not applied.** Multi-supplier isolation;
  until it runs, a second supplier would read DEQI's prices and artwork.
- **`value_brl` is hidden in the UI, not protected.** The cards table is
  readable in full by any authenticated user, so the supplier can read the
  sale margin through the API. The real fix is the one applied to the per-item
  sale price in 025 — its own table with its own policy. Doani chose speed for
  the card-level field; it is still open.
- **The `attachments` storage bucket is public.** The client dutifully mints
  signed URLs, but anyone holding a file path reads it unauthenticated and the
  link never expires. Paths are UUIDs, so this is obscurity, not access
  control. Same family as `value_brl`.
- **Material codes have no columns.** `outside_material_code` /
  `inside_material_code` are in the zod schemas and the TypeScript, and do not
  exist in `cards`. They are stored as labelled lines inside `description`;
  `splitMaterialCodes` / `mergeMaterialCodes` in `src/lib/utils.ts` are the
  only sanctioned way in and out. Edit Card had inputs for them that silently
  dropped what you typed until `2026-08-24`.
- Orphaned images sit in storage from item uploads that failed before `e93dc72`.
