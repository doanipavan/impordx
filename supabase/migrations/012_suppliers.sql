-- Multi-supplier isolation.
--
-- The app was built around one supplier: the `viewer` role meant DEQI, and
-- every table let any authenticated user read every row. A second supplier
-- added under that model would read the first one's prices, artwork and
-- conversations. This introduces the supplier as a real entity and rewrites
-- the read rules around it.

create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  short_name text not null,           -- the badge shown next to a comment
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists suppliers_short_name_key on suppliers(lower(short_name));

insert into suppliers (name, short_name)
select 'DEQI', 'DEQI'
where not exists (select 1 from suppliers where lower(short_name) = 'deqi');

alter table cards add column if not exists supplier_id uuid references suppliers(id);
alter table users add column if not exists supplier_id uuid references suppliers(id);
create index if not exists cards_supplier_id_idx on cards(supplier_id);

-- Everything that exists today belongs to DEQI, including their people.
update cards
   set supplier_id = (select id from suppliers where lower(short_name) = 'deqi')
 where supplier_id is null;

update users
   set supplier_id = (select id from suppliers where lower(short_name) = 'deqi')
 where role = 'viewer' and supplier_id is null;

-- =====================================================================
-- Who is asking
-- =====================================================================

-- Redantex staff see everything; a supplier user sees only its own work.
create or replace function current_user_is_redantex()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.role from users u where u.id = auth.uid()) in ('admin', 'member'), false)
$$;

create or replace function current_user_supplier()
returns uuid language sql stable security definer set search_path = public as $$
  select u.supplier_id from users u where u.id = auth.uid()
$$;

-- Child rows inherit their card's visibility. Without this the isolation is
-- cosmetic: the comments and attachments endpoints would still serve
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
-- Read rules
-- =====================================================================

drop policy if exists "Authenticated users can view non-archived cards" on cards;
drop policy if exists "Authenticated users can view archived cards" on cards;
create policy "Cards are visible to Redantex or to their own supplier"
  on cards for select to authenticated
  using (current_user_is_redantex() or supplier_id = current_user_supplier());

drop policy if exists "Authenticated users can view comments" on comments;
create policy "Comments follow their card"
  on comments for select to authenticated using (can_see_card(card_id));

drop policy if exists "Authenticated users can insert comments" on comments;
create policy "Comments can be written on a visible card"
  on comments for insert to authenticated
  with check (user_id = auth.uid() and can_see_card(card_id));

drop policy if exists "Authenticated users can view attachments" on attachments;
create policy "Attachments follow their card"
  on attachments for select to authenticated using (can_see_card(card_id));

drop policy if exists "Authenticated users can upload attachments" on attachments;
create policy "Attachments can be uploaded to a visible card"
  on attachments for insert to authenticated
  with check (user_id = auth.uid() and can_see_card(card_id));

drop policy if exists "Authenticated users can view activity logs" on activity_logs;
create policy "Activity follows its card"
  on activity_logs for select to authenticated using (can_see_card(card_id));

drop policy if exists "Authenticated users can view card items" on card_items;
create policy "Line items follow their card"
  on card_items for select to authenticated using (can_see_card(card_id));

drop policy if exists "Authenticated users can manage card items" on card_items;
create policy "Line items are managed by Redantex on a visible card"
  on card_items for all to authenticated
  using (current_user_is_redantex() and can_see_card(card_id))
  with check (current_user_is_redantex() and can_see_card(card_id));

drop policy if exists "Authenticated users can view card views" on card_views;
create policy "Card views follow their card"
  on card_views for select to authenticated using (can_see_card(card_id));

drop policy if exists "Users can record their own views" on card_views;
create policy "Users record their own views on a visible card"
  on card_views for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_see_card(card_id));

-- A supplier has no business reading the other supplier's staff list, which is
-- also what the @mention picker reads from.
drop policy if exists "Users are readable by authenticated users" on users;
create policy "Redantex is visible to all; suppliers see only their own"
  on users for select to authenticated
  using (
    current_user_is_redantex()
    or role in ('admin', 'member')
    or supplier_id = current_user_supplier()
  );

-- Suppliers list: readable so the app can label cards, writable by admins only.
alter table suppliers enable row level security;

drop policy if exists "Suppliers are readable" on suppliers;
create policy "Suppliers are readable"
  on suppliers for select to authenticated using (true);

drop policy if exists "Admins manage suppliers" on suppliers;
create policy "Admins manage suppliers"
  on suppliers for all to authenticated
  using ((select u.role from users u where u.id = auth.uid()) = 'admin')
  with check ((select u.role from users u where u.id = auth.uid()) = 'admin');
