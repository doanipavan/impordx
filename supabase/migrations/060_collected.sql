-- Collected: a carga saiu da fábrica e está com o transportador.
--
-- Entre `Ready to Ship` e `Shipped` faltava o momento em que a
-- responsabilidade passa a ser da RDX. "Pronto na fábrica" e "embarcado" são
-- coisas diferentes, e entre as duas pode haver semanas de coleta, consolidação
-- e porto — tempo que hoje desaparece dentro de "pronto".
--
-- O fornecedor vê esta etapa: foi ele quem entregou a carga ao transportador.
-- `Arrived` continua escondido dele, porque o dia em que a mercadoria pousa no
-- Brasil revelaria o tempo de trânsito que a perna de embarque não mostra.
--
-- Três objetos vivos enumeram as etapas de pedido e precisam saber da nova. Os
-- quatro dos avisos ao cliente (052, 053, 054) já a conheciam desde que foram
-- escritos, à espera desta migração.

-- 1. A restrição, que hoje recusaria um card em Collected.
alter table cards drop constraint if exists valid_status;
alter table cards add constraint valid_status check (
  (board = 'quotes' and status in ('Requested', 'Quoted', 'Confirmed', 'Declined'))
  or (board = 'samples' and status in ('Requested', 'In Preparation',
        'Under RDX Revision', 'Under DEQI Revision', 'Approved', 'Lost'))
  or (board = 'orders' and status in ('Purchasing', 'Commercial', 'PI Requested',
        'PI In Preparation', 'PI Approved', 'Placed', 'In Production',
        'Ready to Ship', 'Collected', 'Shipped', 'Arrived'))
);

-- 2. Os portões de etapa. A sequência é a mesma, com Collected na nona casa;
--    os portões cobram nas casas 1, 2 e 3, então inserir aqui não muda
--    nenhuma cobrança — mas deixar a etapa fora da lista faria
--    `array_position` devolver null e o portão liberar tudo em silêncio.
create or replace function enforce_order_stage_gates()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  stage_index constant text[] := array[
    'Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation',
    'PI Approved', 'Placed', 'In Production', 'Ready to Ship', 'Collected',
    'Shipped', 'Arrived'];
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

  -- Reaching PI Requested (or anything past it): a sample approved as a file
  -- on this card. Decided 21 Sep 2026 — the supplier uploads it as "Sample",
  -- Redantex approves it, and only then is the proforma requested. The card
  -- having passed through Samples → Approved is not enough on its own.
  if v_old < 3 and v_new >= 3 then
    if not exists (
      select 1 from attachments a
       where a.card_id = new.id and a.kind = 'sample' and a.review_status = 'approved'
    ) then
      raise exception 'An approved sample is required before requesting the PI — upload it as "Sample" and approve it first';
    end if;
  end if;

  return new;
end;
$function$;

-- 3. A rede de segurança do relógio: um card arrastado direto para Collected
--    ficaria sem `order_confirmed_at` e sumiria da timeline.
create or replace function stamp_order_confirmed()
returns trigger
language plpgsql
as $function$
begin
  -- Approving the PI is the commercial commitment, so that is when DEQI's 60
  -- days begin — not when the card reaches the board, and not at Placed.
  if new.status = 'PI Approved' and coalesce(old.status,'') <> 'PI Approved'
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;

  -- Safety net: a card dragged straight past PI Approved would otherwise carry
  -- no clock at all and vanish from the timeline.
  elsif new.status in ('Placed','In Production','Ready to Ship','Collected','Shipped','Arrived')
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$function$;
