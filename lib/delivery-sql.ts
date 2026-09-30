/** Bounce is terminal; durable receipts also cover a webhook arriving before the send response. */
export const applyDeliveryEventsSql = `
UPDATE deliveries SET
  status=CASE
    WHEN EXISTS(SELECT 1 FROM delivery_events e WHERE e.provider_id=deliveries.provider_id AND e.type='email.bounced') THEN 'bounced'
    WHEN EXISTS(SELECT 1 FROM delivery_events e WHERE e.provider_id=deliveries.provider_id AND e.type IN ('email.complained','email.suppressed','email.failed','email.canceled')) THEN 'blocked'
    WHEN EXISTS(SELECT 1 FROM delivery_events e WHERE e.provider_id=deliveries.provider_id AND e.type='email.delivered') THEN 'delivered'
    ELSE status END,
  delivered_at=COALESCE(delivered_at,(SELECT MIN(e.received_at) FROM delivery_events e WHERE e.provider_id=deliveries.provider_id AND e.type='email.delivered'))
WHERE provider_id=?`;

/** Paginate invoices before joining deliveries so a page never truncates an invoice's history. */
export const reminderCandidatesSql = `
WITH candidates AS (
  SELECT i.* FROM invoices i JOIN businesses b ON b.owner=i.owner
  WHERE i.id>? AND i.status='issued' AND i.sample=0
    AND json_extract(b.data,'$.reminders')=1
    AND json_extract(i.data,'$.dueDate')<=?
    AND json_extract(i.data,'$.customerEmail')<>''
    AND EXISTS(SELECT 1 FROM deliveries d WHERE d.invoice_id=i.id AND d.owner=i.owner AND d.kind='initial' AND d.status='delivered')
  ORDER BY i.id LIMIT 100
)
SELECT i.*, d.kind AS attempt_kind, d.status AS attempt_status,
  d.created_at AS attempt_created_at, d.delivered_at AS attempt_delivered_at
FROM candidates i LEFT JOIN deliveries d ON d.invoice_id=i.id AND d.owner=i.owner
ORDER BY i.id`;
