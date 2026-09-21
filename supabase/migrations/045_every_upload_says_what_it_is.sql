-- 045 · Every upload says what it is
--
-- Decided 21 Sep 2026. A file arrives with a category — reference, sample,
-- PI or quotation — chosen by whoever uploads it, supplier included. Until
-- now the type was set afterwards, by a button almost nobody pressed: 299
-- files had none. Those stay as they are (the rule is forward-only); a file
-- that has a category keeps one, though it may change.
--
-- Sample and PI go into review the moment they land, pending. Reference and
-- quotation are never reviewed. The one place that knows this is the trigger
-- below — the client used to set review_status itself, and two writers of one
-- rule is how they drift.
--
-- And the gate: an order reaches PI Requested only with a sample approved as
-- a file on the card (option A, chosen over "passed through Samples →
-- Approved"). Forward-only as well: it fires on the move, never on a card
-- already past it.

alter table attachments drop constraint if exists attachments_kind_check;
alter table attachments
  add constraint attachments_kind_check
  check (kind is null or kind in ('reference', 'sample', 'pi', 'quotation'));

create or replace function attachments_keep_a_category()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind is null then
      raise exception 'Every upload needs a category — reference, sample, PI or quotation';
    end if;
  elsif new.kind is null and old.kind is not null then
    raise exception 'A file keeps its category — change it rather than removing it';
  end if;

  -- The verdict follows the category, on arrival and on every change of it.
  if tg_op = 'INSERT' or new.kind is distinct from old.kind then
    if new.kind in ('sample', 'pi') then
      new.review_status := 'pending';
    else
      new.review_status := null;
    end if;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_note := null;
  end if;

  return new;
end;
$$;

drop trigger if exists attachments_keep_a_category on attachments;
create trigger attachments_keep_a_category
  before insert or update of kind on attachments
  for each row execute function attachments_keep_a_category();

-- The gate, from the live source with one block added.
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
$function$
;

-- Review, from the live source with one condition widened.
CREATE OR REPLACE FUNCTION public.review_attachment(p_attachment_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  v_card uuid;
begin
  if coalesce((select u.role from users u where u.id = auth.uid()), '') not in ('admin','member') then
    raise exception 'Only Redantex can approve or reject';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Status must be approved or rejected';
  end if;
  if p_status = 'rejected' and coalesce(btrim(coalesce(p_note,'')),'') = '' then
    raise exception 'A rejection needs a reason';
  end if;

  select a.kind, a.card_id into v_kind, v_card from attachments a where a.id = p_attachment_id;
  if v_kind is null or v_kind not in ('sample','pi') then
    raise exception 'Only a file categorised as a sample or a PI can be reviewed';
  end if;

  update attachments
     set review_status = p_status, reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = nullif(btrim(coalesce(p_note,'')),'')
   where id = p_attachment_id;

  -- Approving the proforma is what PI Approved means, so the card follows the
  -- document rather than the two drifting apart. A rejection sends it back.
  if v_kind = 'pi' then
    if p_status = 'approved' then
      update cards set status = 'PI Approved'
       where id = v_card and board = 'orders' and status <> 'PI Approved';
    else
      update cards set status = 'PI In Preparation'
       where id = v_card and board = 'orders' and status in ('PI Approved','PI Requested');
    end if;
  end if;
end;
$function$
;
