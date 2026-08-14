-- Links attachments to the comment they were posted with, so comment
-- attachment chips can open the exact file by id instead of matching
-- on filename (which breaks on renames, deletes, or duplicate names).
alter table attachments add column if not exists comment_id uuid references comments(id) on delete set null;
create index if not exists attachments_comment_id_idx on attachments(comment_id);
