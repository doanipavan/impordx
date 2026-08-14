-- A piece keeps one number from quote through sample, order and every repeat,
-- so "3331" names the same product at any stage of the process.
--
--   QUO-2026-3331  ->  SMP-2026-3331  ->  ORD-2026-3331  ->  ORD-2026-3331-R2
--
-- ref_root ("2026-3331") is the shared family key; ref_number is the per-card
-- display string. source_card_id records what a card was generated from.

alter table cards add column if not exists source_card_id uuid references cards(id) on delete set null;
alter table cards add column if not exists ref_root text;
create index if not exists cards_source_card_id_idx on cards(source_card_id);
create index if not exists cards_ref_root_idx on cards(ref_root);

-- Refs used to be four random digits, which could collide — and ref_number is
-- what deep links resolve against. Allocation is sequential now, starting above
-- 9999 so a new root can never land on a legacy random ref.
create sequence if not exists card_ref_seq start with 10001;

-- security definer so the repeat count also sees archived cards; without it an
-- archived earlier run would be missed and the new ref would duplicate it.
create or replace function allocate_card_ref(p_board text, p_source_card_id uuid default null)
returns table (ref_number text, ref_root text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_root text;
  v_count int;
  v_suffix text := '';
begin
  v_prefix := case p_board
    when 'quotes' then 'QUO'
    when 'samples' then 'SMP'
    when 'orders' then 'ORD'
    else 'REF'
  end;

  -- Inherit the family key when generated from another card; mint one otherwise.
  if p_source_card_id is not null then
    select c.ref_root into v_root from cards c where c.id = p_source_card_id;
  end if;

  if v_root is null then
    v_root := to_char(now(), 'YYYY') || '-' || nextval('card_ref_seq')::text;
  end if;

  -- Nth card of this family on this board is the Nth production run.
  select count(*) into v_count from cards c where c.ref_root = v_root and c.board = p_board;
  if v_count > 0 then
    v_suffix := '-R' || (v_count + 1)::text;
  end if;

  ref_number := v_prefix || '-' || v_root || v_suffix;
  ref_root := v_root;
  return next;
end;
$$;

grant execute on function allocate_card_ref(text, uuid) to authenticated;
