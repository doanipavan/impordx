-- The outside/inside logo fields have been on the create and edit forms since
-- 8f239d9, but the columns were never created — so saving a card worked only
-- while those fields were left blank, and failed the moment one was filled in.
alter table cards add column if not exists logo_technique_outside text;
alter table cards add column if not exists logo_technique_inside text;
alter table cards add column if not exists logo_text_outside text;
alter table cards add column if not exists logo_text_inside text;
alter table cards add column if not exists logo_color_outside text;
alter table cards add column if not exists logo_color_inside text;
