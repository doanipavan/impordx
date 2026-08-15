-- Approving an artwork records who and when, but not why. The note carries the
-- context that otherwise gets lost in a comment thread nobody scrolls back to
-- ("approved for the blue catalogue", "approved pending the inside swatch").
alter table attachments add column if not exists approval_note text;
