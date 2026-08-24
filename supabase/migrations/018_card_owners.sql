-- Every card gets two owners on the Redantex side: the salesperson who brought
-- it in, and the project manager accountable for it moving.
--
-- `responsible_id` already existed and no card had ever used it — 0 of 13 — so
-- it is renamed into the project manager rather than left as a dead third
-- ownership field for someone to trip over later.

alter table cards rename column responsible_id to project_manager_id;
alter table cards rename constraint cards_responsible_id_fkey to cards_project_manager_id_fkey;

alter table cards add column if not exists salesperson_id uuid references users(id);

create index if not exists cards_salesperson_id_idx on cards(salesperson_id);
create index if not exists cards_project_manager_id_idx on cards(project_manager_id);
