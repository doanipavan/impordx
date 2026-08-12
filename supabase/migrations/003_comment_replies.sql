-- Adds threaded replies to comments.
alter table comments add column if not exists parent_id uuid references comments(id) on delete cascade;
create index if not exists comments_parent_id_idx on comments(parent_id);
