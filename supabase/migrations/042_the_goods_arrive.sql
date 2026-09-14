-- A mercadoria chega: um status a mais, e a data em que chegou.
--
-- Até aqui a régua de entrega terminava em "Shipped" — embarcado — e o
-- desembarque no Brasil era uma previsão que ninguém conferia. Doani quer uma
-- meta para a perna da Redantex: 50 dias entre a data que o fornecedor deu
-- para ficar pronto e a chegada no Brasil. Meta que não é medida é desejo, e
-- para medir precisa existir o dia em que chegou.
--
-- 'Arrived' vem depois de 'Shipped'. Arrastar o card para lá carimba
-- `arrived_at` em data de São Paulo; tirar de lá apaga o carimbo, como o
-- `shipped_at` já faz.
--
-- O fornecedor não vê esta coluna nem é avisado dela: a perna dele terminou no
-- embarque, e a chegada revelaria o tempo real de trânsito — que é a parte da
-- régua que a Redantex escolheu não mostrar (CLAUDE.md, "viewer means DEQI").
--
-- As três funções abaixo são as que estão no ar, com uma linha a mais cada.
-- Copiadas do banco no dia, não de uma migração antiga: a 033 já ensinou que
-- reescrever uma função a partir de um arquivo desatualizado apaga o que
-- alguém mudou no painel depois.

alter table cards drop constraint if exists valid_status;
alter table cards add constraint valid_status check (
  (board = 'quotes'  and status in ('Requested','Quoted','Confirmed','Declined'))
  or (board = 'samples' and status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision','Approved','Lost'))
  or (board = 'orders'  and status in ('Purchasing','Commercial','PI Requested','PI In Preparation','PI Approved',
                                       'Placed','In Production','Ready to Ship','Shipped','Arrived'))
);

alter table cards add column if not exists arrived_at date;
comment on column cards.arrived_at is
  'Dia em que a mercadoria chegou ao Brasil (data de São Paulo). Carimbado ao entrar em Arrived; apagado ao sair.';

create or replace function stamp_arrived_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'Arrived' and coalesce(old.status, '') <> 'Arrived' then
    -- Data, não instante: a meta é contada em dias de calendário, e um card
    -- arrastado às 22h de Brasília chegou hoje, não amanhã em UTC.
    new.arrived_at := (now() at time zone 'America/Sao_Paulo')::date;
  elsif new.status <> 'Arrived' and old.status = 'Arrived' then
    new.arrived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_stamp_arrived_at on cards;
create trigger cards_stamp_arrived_at
  before update of status on cards
  for each row execute function stamp_arrived_at();

-- ---------------------------------------------------------------------
-- As três funções que enumeram as etapas de Orders, com 'Arrived' no fim
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_order_stage_gates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  stage_index constant text[] := array[
    'Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation',
    'PI Approved', 'Placed', 'In Production', 'Ready to Ship', 'Shipped', 'Arrived'];
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
  elsif new.status in ('Placed','In Production','Ready to Ship','Shipped','Arrived')
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
             where new.status not in ('Purchasing', 'Commercial', 'Arrived')
    ) participants
   where p is not null and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$function$;
