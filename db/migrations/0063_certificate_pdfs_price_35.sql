-- 0063_certificate_pdfs_price_35.sql
--
-- Owner, 5 Nov 2026:
--
-- 1. A diamond certificate may also be a PDF. The app cleans it before it
--    is stored (lib/files/cleanPdf: only the pages are kept; document info,
--    XMP, comments, attachments, scripts and earlier revisions are dropped),
--    so the designer sees the certificate and nothing about who made it.
--
-- 2. The default quote for a standard piece (categories A–C) is $35, the
--    price the website already shows. The first-design price follows it:
--    a $49 "first design" would now cost more than the standard price.
--    Quotes already given keep their price; only new quotes use these.

ALTER TABLE public.order_stone_certificates
  DROP CONSTRAINT IF EXISTS order_stone_certificates_content_type_check;
ALTER TABLE public.order_stone_certificates
  ADD CONSTRAINT order_stone_certificates_content_type_check
  CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf'));

UPDATE public.price_bands SET price_cents = 3500 WHERE code IN ('BAND_STANDARD', 'BAND_FIRST');
