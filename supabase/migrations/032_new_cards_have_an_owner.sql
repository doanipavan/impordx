-- Two gaps left by 031, both found by testing rather than by reading.

-- 1. A new card had no supplier.
--
-- Nothing in the client sends supplier_id — it does not know the column exists
-- yet. So every card created after 031 would have landed with supplier_id null,
-- and the read policy treats null as Redantex-only: Ashley would simply not see
-- new work appear, with no error anywhere to explain why.
--
-- Until the create form has a supplier picker, the default is DEQI, which is
-- what every card has meant since the hub started. The picker will override it.
alter table cards
  alter column supplier_id set default '8c6081f5-4b10-4cf3-8b0e-094c1d810946';

-- 2. The supplier list was readable by everyone.
--
-- Left at `using (true)` by 031. It is only two names, but one of those names
-- is the fact that the other supplier exists — which is exactly what neither
-- side is supposed to learn. A supplier needs its own row and nothing else.
drop policy if exists "Suppliers are readable" on suppliers;
create policy "Redantex reads every supplier; a supplier reads only itself"
  on suppliers for select to authenticated
  using (current_user_is_redantex() or id = current_user_supplier());
