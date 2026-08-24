-- One review mechanic, two kinds of document.
--
-- The sample review already did approve / reject-with-reason well. Bolting a
-- second, parallel version onto the proforma invoice would have given us two
-- sets of columns meaning the same thing, drifting apart from the first change
-- onwards. So `is_sample` becomes `kind`, and the sample_* review columns lose
-- the prefix.

alter table attachments add column if not exists kind text
  check (kind is null or kind in ('sample', 'pi'));

update attachments set kind = 'sample' where is_sample and kind is null;

alter table attachments rename column sample_status to review_status;
alter table attachments rename column sample_reviewed_at to reviewed_at;
alter table attachments rename column sample_reviewed_by to reviewed_by;
alter table attachments rename column sample_review_note to review_note;
alter table attachments drop column is_sample;

drop function if exists review_sample(uuid, text, text);

create or replace function review_attachment(
  p_attachment_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_card uuid;
begin
  if coalesce((select u.role from users u where u.id = auth.uid()), '') not in ('admin', 'member') then
    raise exception 'Only Redantex can approve or reject';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected';
  end if;

  if p_status = 'rejected' and coalesce(btrim(coalesce(p_note, '')), '') = '' then
    raise exception 'A rejection needs a reason';
  end if;

  select a.kind, a.card_id into v_kind, v_card from attachments a where a.id = p_attachment_id;
  if v_kind is null then
    raise exception 'Mark the file as a sample or a PI before reviewing it';
  end if;

  update attachments
     set review_status = p_status,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_attachment_id;

  -- Approving the proforma is what "PI Approved" means, so the card follows the
  -- document instead of the two drifting apart — and that is also what starts
  -- DEQI's 60 days. A rejection sends the card back for a new one.
  if v_kind = 'pi' then
    if p_status = 'approved' then
      update cards set status = 'PI Approved'
       where id = v_card and board = 'orders' and status <> 'PI Approved';
    else
      update cards set status = 'PI In Preparation'
       where id = v_card and board = 'orders' and status in ('PI Approved', 'PI Requested');
    end if;
  end if;
end;
$$;

revoke execute on function review_attachment(uuid, text, text) from public;
revoke execute on function review_attachment(uuid, text, text) from anon;
grant execute on function review_attachment(uuid, text, text) to authenticated;
