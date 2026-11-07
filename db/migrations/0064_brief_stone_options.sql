-- 0064 — Brief stone options (owner, 7 Nov 2026).
--
-- 1. "As per reference image" is a shape and a setting a client may choose,
--    for the centre stone and the side stones: often the honest answer is
--    "like the picture", and forcing a named setting invents one.
-- 2. Side stones no longer ask "how many", and their size may be left to the
--    designer: a side-stone row with no width means "scale to the centre
--    stone". The wizard sends a row without a width only when the client
--    ticked "Scale to centre stone", so a stored NULL width always means that.
--
-- Forward-only and additive: existing rows keep their values, and every
-- function that copies side-stone rows (revisions 0042, claims 0051) copies
-- NULLs as they are. set_order_accents (0028) already inserts whatever the
-- arrays hold, so it needs no change.
--
-- The new enum values are not used in this file (Postgres refuses a value
-- added in the same transaction), so it runs as one script in the SQL editor.

ALTER TYPE stone_shape  ADD VALUE IF NOT EXISTS 'AS_PER_REFERENCE';
ALTER TYPE setting_type ADD VALUE IF NOT EXISTS 'AS_PER_REFERENCE';

-- The existing range checks (width 0.2–20 mm, quantity 1–2000) still apply
-- whenever a value is given.
ALTER TABLE public.order_spec_accents
  ALTER COLUMN width_um DROP NOT NULL,
  ALTER COLUMN quantity DROP NOT NULL;

COMMENT ON COLUMN public.order_spec_accents.width_um IS
  'Stone width in microns; NULL = scale to the centre stone (the client ticked it, 0064).';
COMMENT ON COLUMN public.order_spec_accents.quantity IS
  'How many, when known; the brief no longer asks (0064), the designer counts from the reference.';
