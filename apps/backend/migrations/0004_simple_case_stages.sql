-- Retain all fields and public history. Invalidate open forms after remapping.
UPDATE issues
SET case_progress = jsonb_set(case_progress, '{stage}',
  to_jsonb(CASE case_progress->>'stage'
    WHEN 'closed' THEN 'resolution_reported'
    ELSE 'assigned' END)),
  case_revision = case_revision + 1
WHERE case_progress->>'stage' IN ('sent', 'acknowledged', 'closed');
