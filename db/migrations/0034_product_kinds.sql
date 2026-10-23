-- 0034_product_kinds.sql
-- Two product kinds the order reference needs (DECISIONS Q3 answer: BD band,
-- NK necklace). In a file of their own because a value added by
-- `ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it.
-- Signets are rings (RN); brooches have no code of their own and map to OT.

ALTER TYPE product_kind ADD VALUE IF NOT EXISTS 'BAND' AFTER 'RING';
ALTER TYPE product_kind ADD VALUE IF NOT EXISTS 'NECKLACE' AFTER 'BANGLE';
