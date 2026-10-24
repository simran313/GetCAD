-- 0044_email_queue_order.sql
-- Fix: failing emails starved new ones.
--
-- 0025's claim_emails took the oldest PENDING or FAILED rows, 20 at a time.
-- Once 20 old emails were failing (a sender domain not yet verified), every
-- flush retried those same 20 and a new email never reached the front of the
-- queue: it stayed PENDING with 0 attempts, forever.
--
-- Now: new (PENDING) emails go first. A FAILED one waits before it is tried
-- again (2, 4, 8 … up to 60 minutes after its last try) and is left alone
-- after 8 tries; to send those once the cause is fixed:
--   UPDATE email_outbox SET status = 'PENDING', attempts = 0 WHERE status = 'FAILED';

CREATE OR REPLACE FUNCTION public.claim_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'limit must be between 1 and 100';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.email_outbox
    WHERE status = 'PENDING'
       OR (status = 'FAILED'
           AND attempts < 8
           AND updated_at < now() - make_interval(mins => least(60, power(2, attempts)::integer)))
       OR (status = 'SENDING' AND updated_at < now() - interval '5 minutes')
    ORDER BY (status = 'PENDING') DESC, created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_outbox e
  SET status = 'SENDING',
      attempts = e.attempts + 1,
      failure_reason = NULL,
      updated_at = now()
  FROM claimed c
  WHERE e.id = c.id
  RETURNING e.*;
END
$$;

REVOKE ALL ON FUNCTION public.claim_emails(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_emails(integer) TO service_role;
