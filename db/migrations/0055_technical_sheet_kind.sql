-- 0055_technical_sheet_kind.sql
--
-- Phase 13a. The technical sheet (four views with measurements, diamond
-- details and gold weight in karat, one image) is a file kind of its own. It
-- is part of the REVIEW set, like the renders: an image the client judges the
-- work on, nothing a mill can use.
--
-- Its own file: a new enum value can only be used once the transaction that
-- added it has committed (0056 uses it).

ALTER TYPE file_kind ADD VALUE IF NOT EXISTS 'TECHNICAL_SHEET' AFTER 'DIAMOND_DETAILS';
