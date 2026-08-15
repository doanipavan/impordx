-- DEQI quotes unit prices to three decimals. card_items was created by hand in
-- the dashboard, so its numeric precision is not something the repo can vouch
-- for — if it landed as numeric(_,2) every third decimal was being rounded away
-- on write, silently. This pins it wide enough either way.
alter table card_items
  alter column unit_price_usd type numeric(12,4);
