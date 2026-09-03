-- A second supplier, and the isolation that has to exist before one arrives.
--
-- Supersedes 012_suppliers.sql, which was written months ago and never applied.
-- 012 could not have worked: every one of its `drop policy` statements named a
-- policy that does not exist in this database. "Authenticated users can view
-- card items" is really called `vi`; "Users are readable by authenticated
-- users" is really "Users readable by authenticated" — wrong by two words, and
-- `drop policy if exists` says nothing when it matches nothing.
--
-- The old permissive policies would have survived alongside the new ones, and
-- permissive policies on the same command are OR'd: one saying `using (true)`
-- re-opens everything the other closes. The isolation would have looked
-- complete on screen while Sconcept read every DEQI card through the API.
--
-- Every drop below was checked against pg_policies first.

-- =====================================================================
-- The supplier as a real thing
-- =====================================================================

create table if not exists suppliers (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  short_name text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists suppliers_short_name_key on suppliers(lower(short_name));

insert into suppliers (name, short_name)
select 'DEQI', 'DEQI'
where not exists (select 1 from suppliers where lower(short_name) = 'deqi');

insert into suppliers (name, short_name)
select 'Sconcept', 'Sconcept'
where not exists (select 1 from suppliers where lower(short_name) = 'sconcept');

alter table cards add column if not exists supplier_id uuid references suppliers(id);
alter table users add column if not exists supplier_id uuid references suppliers(id);
create index if not exists cards_supplier_id_idx on cards(supplier_id);

comment on column cards.supplier_id is
  'Which supplier this piece is being made by. Null means unassigned, which '
  'the read policy treats as Redantex-only — a card can never leak by having '
  'been created before anyone picked a supplier.';

-- Everything that exists today is DEQI's, including their two logins.
update cards set supplier_id = (select id from suppliers where lower(short_name) = 'deqi')
 where supplier_id is null;

update users set supplier_id = (select id from suppliers where lower(short_name) = 'deqi')
 where role = 'viewer' and supplier_id is null;

-- Carlos does not exist yet. When Doani creates the account:
--   update users set supplier_id = (select id from suppliers where short_name = 'Sconcept')
--    where email = 'carlos@axonservice.com';
--
-- Note the delivery clock is NOT stored here. DEQI counts 60 + 60 days from
-- sample approval; Sconcept counts 60 days of production from proforma
-- approval. Both rules live in src/lib/utils.ts, keyed by short_name, for the
-- same reason migration 026 gave: this rule changed three times in one day, and
-- anything written into SQL or onto a row keeps answering with the dead version
-- long after the live one moved. Code is also the only version the tests reach.

-- =====================================================================
-- Who is asking
-- =====================================================================
-- All three are security definer so they can read `users` and `cards` without
-- re-entering the policies that call them, which would recurse forever.

create or replace function current_user_is_redantex()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.role from users u where u.id = auth.uid()) in ('admin', 'member'), false)
$$;

create or replace function current_user_supplier()
returns uuid language sql stable security definer set search_path = public as $$
  select u.supplier_id from users u where u.id = auth.uid()
$$;

-- Child rows inherit their card's visibility. Without this the isolation is
-- cosmetic: the comments and attachments endpoints would keep serving
-- everything to anyone holding a session.
create or replace function can_see_card(p_card_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cards c
     where c.id = p_card_id
       and (current_user_is_redantex() or c.supplier_id = current_user_supplier())
  )
$$;

revoke execute on function current_user_is_redantex() from public, anon;
revoke execute on function current_user_supplier() from public, anon;
revoke execute on function can_see_card(uuid) from public, anon;
grant execute on function current_user_is_redantex() to authenticated;
grant execute on function current_user_supplier() to authenticated;
grant execute on function can_see_card(uuid) to authenticated;

-- =====================================================================
-- cards
-- =====================================================================

drop policy if exists "View active cards" on cards;
create policy "Cards are visible to Redantex or to their own supplier"
  on cards for select to authenticated
  using (current_user_is_redantex() or supplier_id = current_user_supplier());

-- The old rule was `using (true) with check (true)` — every authenticated
-- account, both DEQI logins included, could rewrite any card's price, deadline
-- or delivery date.
--
-- It cannot become "Redantex only": Ashley moves cards across the board by
-- dragging them, and that is a plain update on this table. So the gate is the
-- supplier, not the side. A supplier still edits its own cards; it can no
-- longer touch anyone else's. Narrowing *which columns* a supplier may write
-- is a separate job — RLS filters rows, not columns.
drop policy if exists "Members can update cards" on cards;
create policy "Cards are updated by Redantex or by their own supplier"
  on cards for update to authenticated
  using  (current_user_is_redantex() or supplier_id = current_user_supplier())
  with check (current_user_is_redantex() or supplier_id = current_user_supplier());

-- "Members can create cards" and "Only admins delete cards" already check the
-- role properly and are left alone.

-- =====================================================================
-- card_items — named vi / ins / upd / del in the dashboard
-- =====================================================================

drop policy if exists "vi" on card_items;
create policy "Line items follow their card"
  on card_items for select to authenticated using (can_see_card(card_id));

-- DEQI quotes unit prices into these rows, so writing cannot be Redantex-only
-- here either. Same reasoning as cards above: scope it to the card.
drop policy if exists "ins" on card_items;
create policy "Line items are added to a visible card"
  on card_items for insert to authenticated with check (can_see_card(card_id));

drop policy if exists "upd" on card_items;
create policy "Line items are edited on a visible card"
  on card_items for update to authenticated
  using (can_see_card(card_id)) with check (can_see_card(card_id));

drop policy if exists "del" on card_items;
create policy "Line items are deleted by Redantex"
  on card_items for delete to authenticated
  using (current_user_is_redantex() and can_see_card(card_id));

-- =====================================================================
-- comments, attachments, activity, views
-- =====================================================================

drop policy if exists "View comments" on comments;
create policy "Comments follow their card"
  on comments for select to authenticated using (can_see_card(card_id));

drop policy if exists "Insert own comments" on comments;
create policy "Comments are written on a visible card"
  on comments for insert to authenticated
  with check (user_id = auth.uid() and can_see_card(card_id));

drop policy if exists "View attachments" on attachments;
create policy "Attachments follow their card"
  on attachments for select to authenticated using (can_see_card(card_id));

drop policy if exists "Upload attachments" on attachments;
create policy "Attachments are uploaded to a visible card"
  on attachments for insert to authenticated
  with check (user_id = auth.uid() and can_see_card(card_id));

-- This closes the table, not the bucket. `attachments` in storage is still
-- public: anyone holding a file path reads it unauthenticated. Same open issue
-- as before, unchanged by this migration.

drop policy if exists "View activity logs" on activity_logs;
create policy "Activity follows its card"
  on activity_logs for select to authenticated using (can_see_card(card_id));

drop policy if exists "sel" on card_views;
create policy "Card views follow their card"
  on card_views for select to authenticated using (can_see_card(card_id));

-- =====================================================================
-- users
-- =====================================================================
-- A supplier has no business reading the other supplier's staff list, which is
-- also what the @mention picker reads from. Redantex stays visible to everyone,
-- because both suppliers talk to Redantex.

drop policy if exists "Users readable by authenticated" on users;
create policy "Redantex is visible to all; suppliers see only their own"
  on users for select to authenticated
  using (
    current_user_is_redantex()
    or role in ('admin', 'member')
    or supplier_id = current_user_supplier()
  );

-- =====================================================================
-- suppliers
-- =====================================================================

alter table suppliers enable row level security;

drop policy if exists "Suppliers are readable" on suppliers;
create policy "Suppliers are readable"
  on suppliers for select to authenticated using (true);

drop policy if exists "Admins manage suppliers" on suppliers;
create policy "Admins manage suppliers"
  on suppliers for all to authenticated
  using      ((select u.role from users u where u.id = auth.uid()) = 'admin')
  with check ((select u.role from users u where u.id = auth.uid()) = 'admin');

-- =====================================================================
-- Deliberately not touched
-- =====================================================================
-- `notifications` keeps its open INSERT policy. The two triggers that raise
-- notifications swallow their own errors on purpose, so a policy that rejected
-- them would take notifications down in complete silence — which already
-- happened once, for four days, in a different way. An open insert here is
-- nuisance, not leakage: the SELECT policy is already own-rows-only. Worth
-- closing later, with the trigger path tested first.
