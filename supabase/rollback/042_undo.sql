-- DESFAZER a migração 042 (a meta de logística e o status Arrived).
--
-- NÃO ESTÁ APLICADO. Existe para que voltar seja um comando e não uma
-- reconstrução de memória. Aplicar com:
--
--   node ~/.rdx-dbtool/db.mjs -f supabase/rollback/042_undo.sql
--
-- Antes de aplicar: nenhum card pode estar em 'Arrived' — a constraint
-- restaurada recusaria a linha e a transação inteira voltaria atrás. O
-- primeiro comando abaixo confere e para com erro se houver algum.
--
-- As três funções são restauradas ao texto exato que estava no ar antes da
-- 042 (copiado do banco em 14 Sep 2026, não de uma migração antiga).
--
-- Voltar SÓ o código (git revert) sem rodar isto é seguro e é o caminho
-- preferido: a coluna e o status a mais não atrapalham a tela antiga.

do $$
begin
  if exists (select 1 from cards where status = 'Arrived') then
    raise exception 'Há card(s) em Arrived — mova-os para Shipped antes de desfazer';
  end if;
end $$;

drop trigger if exists cards_stamp_arrived_at on cards;
drop function if exists stamp_arrived_at();
alter table cards drop column if exists arrived_at;

alter table cards drop constraint if exists valid_status;
alter table cards add constraint valid_status check (
  (board = 'quotes'  and status in ('Requested','Quoted','Confirmed','Declined'))
  or (board = 'samples' and status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision','Approved','Lost'))
  or (board = 'orders'  and status in ('Purchasing','Commercial','PI Requested','PI In Preparation','PI Approved',
                                       'Placed','In Production','Ready to Ship','Shipped'))
);

-- as três funções, como eram
CREATE OR REPLACE FUNCTION public.enforce_order_stage_gates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stage_index constant text[] := array[
    'Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation',
    'PI Approved', 'Placed', 'In Production', 'Ready to Ship', 'Shipped'];
  v_old int;
  v_new int;
  v_items int;
  v_missing int;
begin
  if new.board <> 'orders' or new.status is not distinct from old.status then
    return new;
  end if;

  v_old := array_position(stage_index, old.status);
  v_new := array_position(stage_index, new.status);
  if v_old is null or v_new is null or v_new <= v_old then
    return new;
  end if;

  select count(*) into v_items from card_items where card_id = new.id;

  -- Leaving Purchasing: what Redantex is buying, and for how much.
  if v_old <= 1 and v_new > 1 then
    if coalesce(btrim(new.purchase_order), '') = '' then
      raise exception 'Purchase order number is required before leaving Purchasing';
    end if;

    if v_items = 0 then
      raise exception 'Add at least one item before leaving Purchasing';
    end if;

    select count(*) into v_missing
      from card_items
     where card_id = new.id and coalesce(btrim(erp_code), '') = '';
    if v_missing > 0 then
      raise exception 'Every item needs an ERP (DEV) code — % still without one', v_missing;
    end if;

    select count(*) into v_missing
      from card_items
     where card_id = new.id and unit_price_usd is null;
    if v_missing > 0 then
      raise exception 'Every item needs a purchase price in USD — % still without one', v_missing;
    end if;
  end if;

  -- Leaving Commercial: what Redantex is selling it for.
  if v_old <= 2 and v_new > 2 then
    if coalesce(btrim(new.sales_order), '') = '' then
      raise exception 'Sales order number is required before leaving Commercial';
    end if;

    if v_items = 0 then
      raise exception 'Add at least one item before leaving Commercial';
    end if;

    select count(*) into v_missing
      from card_items ci
      left join card_item_pricing p on p.item_id = ci.id
     where ci.card_id = new.id and p.sale_price_brl is null;
    if v_missing > 0 then
      raise exception 'Every item needs a sale price in BRL — % still without one', v_missing;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_order_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Approving the PI is the commercial commitment, so that is when DEQI's 60
  -- days begin — not when the card reaches the board, and not at Placed.
  if new.status = 'PI Approved' and coalesce(old.status,'') <> 'PI Approved'
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;

  -- Safety net: a card dragged straight past PI Approved would otherwise carry
  -- no clock at all and vanish from the timeline.
  elsif new.status in ('Placed','In Production','Ready to Ship','Shipped')
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select u.full_name into v_actor from users u where u.id = v_actor_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor_id, 'status_change',
         coalesce(v_actor,'Someone') || ' moved "' || coalesce(new.title,'a card') || '" to ' || new.status
    from (
      select c.created_by         as p from cards c where c.id = new.id
      union select c.salesperson_id     from cards c where c.id = new.id
      union select c.project_manager_id from cards c where c.id = new.id
      union select cm.user_id           from comments cm where cm.card_id = new.id
      -- Purchasing e Commercial são a entrada interna da Redantex: o fornecedor
      -- não vê essas colunas no quadro dele, e avisá-lo de uma etapa que ele
      -- não consegue encontrar é ruído — e conta mais do que ele deve saber.
      union select s.id from card_supplier_users(new.id) s
             where new.status not in ('Purchasing', 'Commercial')
    ) participants
   where p is not null and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$function$;
