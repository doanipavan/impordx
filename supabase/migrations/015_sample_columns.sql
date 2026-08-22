-- The Samples board gains two columns. "Under Revision" said a sample was being
-- revised but not by whom, which is the thing worth knowing when a date slips —
-- it splits into RDX and DEQI. "Lost" gives a sample that went nowhere somewhere
-- to end, instead of sitting in preparation forever.
--
-- No sample was in "Under Revision" when this ran, so nothing needed moving.

alter table cards drop constraint if exists valid_status;

-- Before the new constraint, not after: adding a constraint validates the rows
-- already in the table, so a leftover "Under Revision" would make it fail.
update cards
   set status = 'Under RDX Revision'
 where board = 'samples' and status = 'Under Revision';

alter table cards add constraint valid_status check (
  (board = 'quotes'  and status in ('Requested', 'Quoted', 'Confirmed', 'Declined')) or
  (board = 'samples' and status in ('Requested', 'In Preparation', 'Under RDX Revision',
                                    'Under DEQI Revision', 'Approved', 'Lost')) or
  (board = 'orders'  and status in ('Placed', 'In Production', 'Ready to Ship', 'Shipped'))
);
