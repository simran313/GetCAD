-- 0039_payment_methods.sql
-- How a payment arrived, for payments admin records by hand (DECISIONS §13,
-- v1.1): Wise or bank transfer, PayPal, or anything else. Own file because a
-- new enum value cannot be used in the transaction that adds it.

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'wise';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'paypal';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank';
