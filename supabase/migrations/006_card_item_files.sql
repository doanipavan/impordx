-- Line items have offered a file attachment in the UI since the feature landed,
-- but card_items was never given anywhere to store it, so any item added with a
-- file failed the insert outright ("column card_items.file_url does not exist").
alter table card_items add column if not exists file_url text;
alter table card_items add column if not exists file_name text;
