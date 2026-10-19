-- Migration 0047: System event backfill (ADR-040 §5, #2223, story 2.4)
--
-- Data only: no table is created or altered except two TEMP helper tables that are dropped at the
-- end. Converts every legacy automatic diary entry (is_automatic = 1) whose `metadata` is NULL,
-- malformed, or has no `v` key (this includes the first auto-event release's
-- { changeSummary, previousValue?, newValue? } objects) into version-1 system event parameters
-- (shared/src/types/systemEvent.ts), parsing the stored English body without regular expressions.
-- Rows that cannot be parsed become {"v":1,"event":"legacy"} and keep rendering their stored text.
-- Deposit events are re-linked from the deposit to its invoice (defect D-16).
--
-- Non-destructive: no DELETE; title, body, entry_date, created_at, updated_at and created_by are
-- never touched.
-- Idempotent: every metadata UPDATE is guarded by the scope predicate (rows that already carry a
-- `v` key are out of scope) and the re-link finds no 'invoice_deposit' rows once it has run.
--
-- Scope predicate (reused verbatim below). CASE is used instead of OR because SQLite does not
-- promise short-circuit evaluation and json_* raises on malformed JSON:
--   is_automatic = 1 AND (CASE WHEN metadata IS NULL THEN 1
--                              WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
--                              ELSE 1 END) = 1

-- 1. Status labels: every status value ever stored by the writers, with both spellings (the
--    English label the writer used, and the raw value the first release wrote).
CREATE TEMP TABLE IF NOT EXISTS se_status (
  vocab TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL
);
DELETE FROM se_status;
INSERT INTO se_status (vocab, value, label) VALUES
  ('work_item', 'not_started', 'Not Started'),
  ('work_item', 'not_started', 'not_started'),
  ('work_item', 'in_progress', 'In Progress'),
  ('work_item', 'in_progress', 'in_progress'),
  ('work_item', 'completed', 'Completed'),
  ('work_item', 'completed', 'completed'),
  ('invoice', 'pending', 'Pending'),
  ('invoice', 'pending', 'pending'),
  ('invoice', 'paid', 'Paid'),
  ('invoice', 'paid', 'paid'),
  ('invoice', 'claimed', 'Claimed'),
  ('invoice', 'claimed', 'claimed'),
  ('invoice', 'quotation', 'Quotation'),
  ('invoice', 'quotation', 'quotation'),
  ('deposit', 'pending', 'Pending'),
  ('deposit', 'pending', 'pending'),
  ('deposit', 'paid', 'Paid'),
  ('deposit', 'paid', 'paid'),
  ('deposit', 'claimed', 'Claimed'),
  ('deposit', 'claimed', 'claimed'),
  ('grant', 'eligible', 'Eligible'),
  ('grant', 'eligible', 'eligible'),
  ('grant', 'applied', 'Applied'),
  ('grant', 'applied', 'applied'),
  ('grant', 'approved', 'Approved'),
  ('grant', 'approved', 'approved'),
  ('grant', 'received', 'Received'),
  ('grant', 'received', 'received'),
  ('grant', 'rejected', 'Rejected'),
  ('grant', 'rejected', 'rejected');

-- 3. Result table: one row of new metadata per parsed diary entry.
CREATE TEMP TABLE IF NOT EXISTS se_meta (
  id TEXT PRIMARY KEY,
  metadata TEXT NOT NULL
);
DELETE FROM se_meta;

-- 4. Status rows (work item, invoice, deposit, grant).
--    A row matches a pair (A, B) when its body ends with <connector> || A-label || ' to ' || B-label.
--    The longest matching suffix wins; the subject is the text before the suffix with the template's
--    fixed prefix removed.
INSERT INTO se_meta (id, metadata)
WITH scoped AS (
  SELECT
    id,
    body,
    entry_type,
    source_entity_type,
    source_entity_id,
    CASE WHEN json_valid(metadata) THEN
      CASE WHEN json_type(metadata) = 'object' THEN json_extract(metadata, '$.previousValue') END
    END AS prev_v,
    CASE WHEN json_valid(metadata) THEN
      CASE WHEN json_type(metadata) = 'object' THEN json_extract(metadata, '$.newValue') END
    END AS new_v
  FROM diary_entries
  WHERE is_automatic = 1
    AND (CASE WHEN metadata IS NULL THEN 1
              WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
              ELSE 1 END) = 1
    AND entry_type IN ('work_item_status', 'invoice_status', 'subsidy_status')
),
typed AS (
  SELECT
    *,
    CASE entry_type
      WHEN 'work_item_status' THEN 'work_item'
      WHEN 'subsidy_status' THEN 'grant'
      ELSE CASE WHEN source_entity_type = 'invoice_deposit' THEN 'deposit' ELSE 'invoice' END
    END AS vocab,
    CASE entry_type
      WHEN 'work_item_status' THEN ' status changed from '
      WHEN 'subsidy_status' THEN ' application status changed from '
      ELSE CASE WHEN source_entity_type = 'invoice_deposit'
        THEN ' changed from '
        ELSE ' status changed from '
      END
    END AS connector
  FROM scoped
),
cand AS (
  SELECT
    t.id, t.body, t.vocab, t.source_entity_id, t.prev_v, t.new_v,
    a.value AS from_v,
    b.value AS to_v,
    t.connector || a.label || ' to ' || b.label AS suffix
  FROM typed t
  JOIN se_status a ON a.vocab = t.vocab
  JOIN se_status b ON b.vocab = t.vocab
  UNION ALL
  -- First-release grant form without a previous status: '... application status changed to <B>'
  SELECT
    t.id, t.body, t.vocab, t.source_entity_id, t.prev_v, t.new_v,
    NULL AS from_v,
    b.value AS to_v,
    ' application status changed to ' || b.label AS suffix
  FROM typed t
  JOIN se_status b ON b.vocab = t.vocab
  WHERE t.vocab = 'grant'
),
matched AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY length(suffix) DESC) AS rn
  FROM cand
  WHERE length(body) > length(suffix)
    AND substr(body, -length(suffix)) = suffix
),
stripped AS (
  SELECT
    id, vocab, source_entity_id, prev_v, new_v, from_v, to_v,
    substr(body, 1, length(body) - length(suffix)) AS s0
  FROM matched
  WHERE rn = 1
),
unprefixed AS (
  SELECT
    *,
    CASE vocab
      WHEN 'work_item' THEN
        CASE WHEN substr(s0, 1, length('[Work Item] ')) = '[Work Item] '
          THEN substr(s0, length('[Work Item] ') + 1) ELSE s0 END
      WHEN 'invoice' THEN
        CASE WHEN substr(s0, 1, length('[Invoice] ')) = '[Invoice] '
          THEN substr(s0, length('[Invoice] ') + 1) ELSE s0 END
      WHEN 'deposit' THEN
        CASE WHEN substr(s0, 1, length('Deposit for invoice ')) = 'Deposit for invoice '
          THEN substr(s0, length('Deposit for invoice ') + 1) END
      ELSE
        CASE WHEN substr(s0, 1, length('Subsidy: ')) = 'Subsidy: '
          THEN substr(s0, length('Subsidy: ') + 1) ELSE s0 END
    END AS s1
  FROM stripped
),
parsed AS (
  SELECT
    id, vocab, source_entity_id,
    COALESCE(prev_v, from_v) AS from_value,
    COALESCE(new_v, to_v) AS to_value,
    CASE vocab
      WHEN 'work_item' THEN
        CASE WHEN length(s1) >= 2 AND substr(s1, 1, 1) = '"' AND substr(s1, -1) = '"'
          THEN substr(s1, 2, length(s1) - 2) ELSE s1 END
      WHEN 'grant' THEN s1
      ELSE CASE WHEN s1 IN ('N/A', '') THEN NULL ELSE s1 END
    END AS subject
  FROM unprefixed
  -- A deposit body without its fixed prefix is not a deposit template: it becomes legacy
  WHERE vocab <> 'deposit' OR s1 IS NOT NULL
)
SELECT
  id,
  CASE WHEN vocab = 'deposit'
    THEN json_object('v', 1, 'event', 'status_changed', 'from', from_value, 'to', to_value,
                     'subjectLabel', subject, 'depositId', source_entity_id)
    ELSE json_object('v', 1, 'event', 'status_changed', 'from', from_value, 'to', to_value,
                     'subjectLabel', subject)
  END
FROM parsed;

-- 5. Milestone delay rows: '[Milestone: ]<name> is delayed by <n> days (Target date <date>,
--    new projected date <date>)'. The dateless form does not match and becomes legacy below.
INSERT INTO se_meta (id, metadata)
WITH scoped AS (
  SELECT
    id,
    body,
    substr(body, 1, instr(body, ' is delayed by ') - 1) AS name0,
    substr(body, instr(body, '(Target date ') + length('(Target date '), 10) AS target,
    substr(body, -11, 10) AS projected
  FROM diary_entries
  WHERE is_automatic = 1
    AND (CASE WHEN metadata IS NULL THEN 1
              WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
              ELSE 1 END) = 1
    AND entry_type = 'milestone_delay'
    AND instr(body, ' is delayed by ') > 0
    AND instr(body, ' days (Target date ') > 0
    AND instr(body, ', new projected date ') > 0
    AND substr(body, -1) = ')'
),
valid AS (
  SELECT
    id, target, projected,
    CASE WHEN substr(name0, 1, length('Milestone: ')) = 'Milestone: '
      THEN substr(name0, length('Milestone: ') + 1) ELSE name0 END AS name
  FROM scoped
  WHERE date(target) = target AND date(projected) = projected
)
SELECT
  id,
  json_object('v', 1, 'event', 'milestone_delayed', 'targetDate', target,
              'projectedDate', projected,
              'delayDays', CAST(round(julianday(projected) - julianday(target)) AS INTEGER),
              'subjectLabel', name)
FROM valid;

-- 6. Invoice created rows: '[Invoice] <number> created for <vendor>' / '<number> created for <vendor>'.
INSERT INTO se_meta (id, metadata)
WITH scoped AS (
  SELECT
    id,
    source_entity_id,
    substr(body, 1, instr(body, ' created for ') - 1) AS number0,
    substr(body, instr(body, ' created for ') + length(' created for ')) AS vendor_name
  FROM diary_entries
  WHERE is_automatic = 1
    AND (CASE WHEN metadata IS NULL THEN 1
              WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
              ELSE 1 END) = 1
    AND entry_type = 'invoice_created'
    AND instr(body, ' created for ') > 0
),
numbered AS (
  SELECT
    id, source_entity_id, vendor_name,
    CASE WHEN substr(number0, 1, length('[Invoice] ')) = '[Invoice] '
      THEN substr(number0, length('[Invoice] ') + 1) ELSE number0 END AS number1
  FROM scoped
)
SELECT
  id,
  json_object('v', 1, 'event', 'invoice_created',
              'subjectLabel', CASE WHEN number1 IN ('N/A', '') THEN NULL ELSE number1 END,
              'vendorId', (SELECT vendor_id FROM invoices WHERE invoices.id = numbered.source_entity_id),
              'vendorName', NULLIF(vendor_name, ''))
FROM numbered;

-- 7. Apply the parsed metadata.
UPDATE diary_entries
SET metadata = (SELECT se_meta.metadata FROM se_meta WHERE se_meta.id = diary_entries.id)
WHERE id IN (SELECT id FROM se_meta)
  AND is_automatic = 1
  AND (CASE WHEN metadata IS NULL THEN 1
            WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
            ELSE 1 END) = 1;

-- 8. Every other in-scope row (budget_breach, auto_reschedule, unknown labels, empty bodies,
--    the dateless milestone form) becomes legacy; a deposit row keeps its deposit id.
UPDATE diary_entries
SET metadata = CASE
  WHEN source_entity_type = 'invoice_deposit' AND source_entity_id IS NOT NULL
    THEN json_object('v', 1, 'event', 'legacy', 'depositId', source_entity_id)
  ELSE json_object('v', 1, 'event', 'legacy')
END
WHERE is_automatic = 1
  AND (CASE WHEN metadata IS NULL THEN 1
            WHEN json_valid(metadata) THEN json_type(metadata, '$.v') IS NULL
            ELSE 1 END) = 1;

-- 9. Re-link deposit events to their invoice (D-16). Both SET expressions read the old
--    source_entity_id. A deposit that no longer exists leaves both columns NULL;
--    metadata.depositId keeps the old id either way.
UPDATE diary_entries
SET source_entity_type = CASE
      WHEN EXISTS (SELECT 1 FROM invoice_deposits d WHERE d.id = diary_entries.source_entity_id)
        THEN 'invoice'
      ELSE NULL
    END,
    source_entity_id = (
      SELECT d.invoice_id FROM invoice_deposits d WHERE d.id = diary_entries.source_entity_id
    )
WHERE is_automatic = 1
  AND source_entity_type = 'invoice_deposit';

-- 10. Clean up.
DROP TABLE IF EXISTS temp.se_status;
DROP TABLE IF EXISTS temp.se_meta;
