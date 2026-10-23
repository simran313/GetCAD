-- 0037_ops_tables.sql
-- The tables Phases 2–4 write to, created now so their read rules ship with
-- the rest of the permission model and are tested once, together.
-- No writer exists yet for any of them except the seeds: each later phase
-- adds its SECURITY DEFINER functions, and none of these tables will ever get
-- a write grant or a write policy.
--
-- A "job" is an order. Owner answer Q5: a change after approval is a new
-- linked order, so there is no separate jobs table.

-- --------------------------------------------------------- assignment --

-- Every assignment, including the ones undone, so capacity and the board
-- (Spec §7) can be rebuilt from history. The live designer stays on
-- orders.designer_id.
CREATE TABLE job_assignments (
  id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id        text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  designer_id     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_by     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  -- Over-capacity assignments need a reason (Spec §7), audited.
  override_reason text        CHECK (override_reason IS NULL OR char_length(btrim(override_reason)) BETWEEN 1 AND 500),
  ended_at        timestamptz
);

CREATE INDEX job_assignments_designer_open_idx ON job_assignments (designer_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX job_assignments_one_open ON job_assignments (order_id) WHERE ended_at IS NULL;

-- ---------------------------------------------------------- checklist --

-- Spec §8, seeded exactly: 18 checks + the designer sign-off = 19.
CREATE TABLE checklist_items (
  id         smallint    PRIMARY KEY CHECK (id BETWEEN 1 AND 19),
  group_name text        NOT NULL,
  label      text        NOT NULL,
  flag       text        CHECK (flag IN ('MUST', 'STOP_IF_UNSURE', 'CRITICAL')),
  is_signoff boolean     NOT NULL DEFAULT false
);

INSERT INTO checklist_items (id, group_name, label, flag, is_signoff) VALUES
  ( 1, 'Before starting', 'Brief read — measurements, stone specs and special requirements noted', NULL, false),
  ( 2, 'Before starting', 'Reference image open alongside the CAD — compare at every stage', 'MUST', false),
  ( 3, 'Before starting', 'Metal and stone colour noted — matches the brief', NULL, false),
  ( 4, 'Before starting', 'Unclear points flagged to ops before starting', 'STOP_IF_UNSURE', false),
  ( 5, 'Dimensions', 'Length correct', NULL, false),
  ( 6, 'Dimensions', 'Width and height / depth correct', NULL, false),
  ( 7, 'Dimensions', 'Size correct — ring inner diameter, bangle or bracelet circumference', NULL, false),
  ( 8, 'Dimensions', 'Shank — top width, bottom width, top depth, bottom depth match the brief', NULL, false),
  ( 9, 'Stones', 'Centre stone seat matches brief dimensions', NULL, false),
  (10, 'Stones', 'Side stone count, size and placement match the brief', NULL, false),
  (11, 'Geometry', 'No open or naked edges — all geometry closed', 'CRITICAL', false),
  (12, '3DM file', 'Delivery views captured — TV, PV, RV, FV, BV, M, DD, GW', NULL, false),
  (13, '3DM file', 'Folder renamed for QC — follows the naming convention', NULL, false),
  (14, 'STL', 'Magic file applied and Ctrl+T executed', NULL, false),
  (15, 'STL', 'Naked edge check passed before export', 'CRITICAL', false),
  (16, 'STL', 'Mesh all files — max distance / edge = 0.005', NULL, false),
  (17, 'Final', 'Special requirements fulfilled — order notes re-read before submitting', NULL, false),
  (18, 'Final', 'Both 3DM and STL uploaded to the correct folder', NULL, false),
  (19, 'Sign-off', 'Designer sign-off', NULL, true);

-- One row per (order, version, item). The two columns are the two levels.
-- Who ticked is stored for audit and is not selectable (policies/0030).
CREATE TABLE order_checks (
  order_id    text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  version     integer     NOT NULL CHECK (version >= 1),
  item_id     smallint    NOT NULL REFERENCES checklist_items (id),
  designer_by text        REFERENCES users (id) ON DELETE RESTRICT,
  designer_at timestamptz,
  qc_by       text        REFERENCES users (id) ON DELETE RESTRICT,
  qc_at       timestamptz,
  PRIMARY KEY (order_id, version, item_id),
  CHECK ((designer_by IS NULL) = (designer_at IS NULL)),
  CHECK ((qc_by IS NULL) = (qc_at IS NULL))
);

-- ------------------------------------------------------- deliverables --

-- DECISIONS §9: ten required slots per CAD job; three optional.
CREATE TABLE deliverable_slots (
  code     text     PRIMARY KEY CHECK (code ~ '^[A-Z0-9_]{1,24}$'),
  label    text     NOT NULL,
  required boolean  NOT NULL,
  position smallint NOT NULL UNIQUE
);

INSERT INTO deliverable_slots (code, label, required, position) VALUES
  ('3DM', 'Rhino 3DM',              true,  1),
  ('STL', 'STL mesh',               true,  2),
  ('TV',  'Top view',               true,  3),
  ('PV',  'Perspective view',       true,  4),
  ('RV',  'Right view',             true,  5),
  ('FV',  'Front view',             true,  6),
  ('BV',  'Back view',              true,  7),
  ('M',   'M view',                 true,  8),
  ('DD',  'Diamond details',        true,  9),
  ('GW',  'Gold weight',            true, 10),
  ('GOLD_WEIGHT_CHART', 'Gold weight chart', false, 11),
  ('DIAMOND_DETAILS',   'Diamond details sheet', false, 12),
  ('SUMMARY',           'Summary sheet', false, 13);

CREATE TABLE deliverables (
  order_id        text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  slot            text        NOT NULL REFERENCES deliverable_slots (code),
  version         integer     NOT NULL CHECK (version >= 1),
  file_version_id text        NOT NULL UNIQUE REFERENCES file_versions (id) ON DELETE RESTRICT,
  -- {JOB_CODE}_{SLOT}_v{n}.{ext} — set by the server, never by the uploader.
  -- The JOB code, not the client reference: designers read this row, and the
  -- client code must not reach them (owner answer Q3). The client's download
  -- is named with the full reference at delivery.
  file_name       text        NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 120),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, slot, version)
);

-- ------------------------------------------------- on-behalf intake --

-- Screenshots of the WhatsApp/email conversation an on-behalf order came
-- from (DECISIONS §11). They show the client's name and number, so a designer
-- never reads this table.
CREATE TABLE order_screenshots (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  object_key   text        NOT NULL UNIQUE,
  content_type text        NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   integer     NOT NULL CHECK (size_bytes > 0),
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 20),
  added_by     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, position)
);

-- ------------------------------------------------------------- SLA --

CREATE TABLE sla_events (
  id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id   text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  kind       text        NOT NULL CHECK (kind IN ('started', 'met', 'breached', 'credit_pending', 'credit_decided')),
  at         timestamptz NOT NULL DEFAULT now(),
  detail     jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX sla_events_order_idx ON sla_events (order_id, at);

-- ------------------------------------------------- client credits --

-- Owner answer Q4: a missed standard SLA creates a PENDING credit for the
-- full amount paid; an admin must decide it — apply to the next order,
-- refund, a partial credit with a reason, or reject with a reason.
-- One credit per (order, kind), so a breach can never be credited twice.
CREATE TABLE client_credits (
  id                     text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id              text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  order_id               text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  kind                   text        NOT NULL CHECK (kind IN ('sla_credit', 'claim_credit')),
  amount_cents           integer     NOT NULL CHECK (amount_cents > 0),
  currency               text        NOT NULL CHECK (char_length(currency) = 3),
  status                 text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'apply_next', 'refunded', 'partial', 'rejected', 'applied')),
  decided_amount_cents   integer     CHECK (decided_amount_cents IS NULL OR decided_amount_cents >= 0),
  decision_reason        text        CHECK (decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 1 AND 1000),
  decided_by             text        REFERENCES users (id) ON DELETE RESTRICT,
  decided_at             timestamptz,
  applied_to_order_id    text        REFERENCES orders (id) ON DELETE RESTRICT,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind),
  CHECK (status = 'pending' OR decided_at IS NOT NULL),
  CHECK (status NOT IN ('partial', 'rejected') OR decision_reason IS NOT NULL),
  CHECK (status <> 'partial' OR decided_amount_cents < amount_cents)
);

CREATE INDEX client_credits_client_idx ON client_credits (client_id, status);

-- -------------------------------------------------- payout obligations --

-- What we owe designers and pod leads, in INR (owner answer Q2). Created when
-- an order closes; in October exported for bank transfer (in_app_payouts off).
CREATE TABLE payout_obligations (
  id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id     text        NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  payee_id     text        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  party        text        NOT NULL CHECK (party IN ('DESIGNER', 'QC')),
  amount_paise integer     NOT NULL CHECK (amount_paise > 0),
  status       text        NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'exported', 'paid', 'void')),
  export_batch text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  exported_at  timestamptz,
  paid_at      timestamptz,
  UNIQUE (order_id, party)
);

CREATE INDEX payout_obligations_payee_idx ON payout_obligations (payee_id, status);

-- ------------------------------------------------------- policy helpers --

-- Row policies that ask "is this in my pod?" cannot read orders.pod_id
-- themselves: a policy's subquery runs with the caller's column privileges,
-- and pod_id / client_id are not granted (policies/0029). These answer the
-- question without exposing the columns.
CREATE OR REPLACE FUNCTION app.order_in_my_pods(p_order_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.pod_id = ANY (app.current_pod_ids())
  )
$$;

CREATE OR REPLACE FUNCTION app.client_in_my_pods(p_client_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.client_id = p_client_id AND o.pod_id = ANY (app.current_pod_ids())
  )
$$;

GRANT EXECUTE ON FUNCTION app.order_in_my_pods(text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.client_in_my_pods(text) TO authenticated, service_role;
