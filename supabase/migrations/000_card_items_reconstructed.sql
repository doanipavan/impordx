-- card_items was created directly in the Supabase dashboard and existed in no
-- migration, so the repo and the live database had drifted. That drift is why
-- the missing file_url/file_name columns (see 006) went unnoticed: the
-- TypeScript interface described columns nobody had ever created.
--
-- This file back-fills the definition so a fresh environment gets the table.
-- It is numbered 000 because it must precede 006, which alters this table.
--
-- VERIFIED against the live database by probing PostgREST — column names and
-- types are exact, and RLS is on (anon reads return no rows):
--   id uuid · card_id uuid · quantity integer · unit_price_usd numeric
--   sort_order integer · created_at timestamptz · everything else text
--
-- RECONSTRUCTED, not verified — the anon key cannot read constraints, defaults
-- or policies. These follow the conventions in 001_initial_schema.sql. If you
-- ever rebuild from scratch, confirm them against the real table first:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns where table_name = 'card_items';

create table if not exists card_items (
  id uuid primary key default uuid_generate_v4(),
  card_id uuid not null references cards(id) on delete cascade,
  reference_code text,
  collection text,
  description text,
  outside_color text,
  inside_color text,
  size text,
  quantity integer not null default 1,
  unit_price_usd numeric,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_items_card_id on card_items(card_id);

alter table card_items enable row level security;

-- Mirrors the comments/attachments policies in 001: everyone authenticated can
-- read, and writes are open to authenticated users since a card's line items
-- are collaborative between Redantex and the supplier.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'card_items' and policyname = 'Authenticated users can view card items') then
    create policy "Authenticated users can view card items"
      on card_items for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'card_items' and policyname = 'Authenticated users can manage card items') then
    create policy "Authenticated users can manage card items"
      on card_items for all to authenticated using (true) with check (true);
  end if;
end $$;
