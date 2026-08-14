-- card_views was created directly in the dashboard and existed in no migration,
-- like card_items before it. Back-filled so a fresh environment gets the table
-- the "Seen by" panel reads from.
--
-- VERIFIED against the live database by probing PostgREST:
--   id uuid · card_id uuid · user_id uuid · viewed_at timestamptz
--   (there is no created_at column)
--
-- RECONSTRUCTED, not verified — the anon key cannot read constraints, defaults
-- or policies. The unique constraint below is required, not a guess: the app
-- upserts with onConflict 'card_id,user_id' (see useRecordView), which fails
-- without it. The rest follows the conventions in 001_initial_schema.sql.

create table if not exists card_views (
  id uuid primary key default uuid_generate_v4(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (card_id, user_id)
);

create index if not exists idx_card_views_card_id on card_views(card_id);

alter table card_views enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'card_views' and policyname = 'Authenticated users can view card views') then
    create policy "Authenticated users can view card views"
      on card_views for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'card_views' and policyname = 'Users can record their own views') then
    create policy "Users can record their own views"
      on card_views for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
