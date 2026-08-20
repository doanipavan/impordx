-- Digital samples: a file the supplier sends for judgement, reviewed one by
-- one. Separate from the single "Approved Artwork" per card, which stays the
-- final piece that goes to production.
--
-- Also closes a hole found while building this: attachments carried an UPDATE
-- policy of plain `true` for any authenticated user, added straight in the
-- dashboard and in no migration. The UI hid the approve button from the
-- supplier; the database let them approve their own artwork through the API.

alter table attachments add column if not exists is_sample boolean not null default false;
alter table attachments add column if not exists sample_status text
  check (sample_status is null or sample_status in ('pending', 'approved', 'rejected'));
alter table attachments add column if not exists sample_reviewed_at timestamptz;
alter table attachments add column if not exists sample_reviewed_by uuid references users(id);
alter table attachments add column if not exists sample_review_note text;

-- Judging a sample is Redantex's call, and a rejection without a reason just
-- sends the factory back to work with no instruction. Both are enforced here
-- rather than in the form, where the API can walk around them.
create or replace function review_sample(
  p_attachment_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select u.role from users u where u.id = auth.uid()), '') not in ('admin', 'member') then
    raise exception 'Only Redantex can approve or reject a sample';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Status must be approved or rejected';
  end if;

  if p_status = 'rejected' and coalesce(btrim(coalesce(p_note, '')), '') = '' then
    raise exception 'A rejected sample needs a reason';
  end if;

  update attachments
     set is_sample = true,
         sample_status = p_status,
         sample_reviewed_at = now(),
         sample_reviewed_by = auth.uid(),
         sample_review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_attachment_id;
end;
$$;

revoke execute on function review_sample(uuid, text, text) from public;
revoke execute on function review_sample(uuid, text, text) from anon;
grant execute on function review_sample(uuid, text, text) to authenticated;

-- Anyone could edit anyone's attachment row. Now: Redantex, or the person who
-- uploaded it — which is what lets the supplier flag their own file as a sample.
drop policy if exists "Update attachments" on attachments;
drop policy if exists "Attachments are edited by Redantex or their uploader" on attachments;
create policy "Attachments are edited by Redantex or their uploader"
  on attachments for update to authenticated
  using (
    coalesce((select u.role from users u where u.id = auth.uid()), '') in ('admin', 'member')
    or user_id = auth.uid()
  )
  with check (
    coalesce((select u.role from users u where u.id = auth.uid()), '') in ('admin', 'member')
    or user_id = auth.uid()
  );
