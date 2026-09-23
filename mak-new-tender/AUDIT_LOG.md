# Business action history

This feature stores employee and supplier business mutations. It deliberately
does not record login/logout, password flows, IP addresses, network information,
browser information, request bodies, headers, or response bodies. Ordinary reads
(including POST filter endpoints) and downloads are not recorded.
The public supplier signup branch (`vendor/save/` with JSON `vendorid: 0`) also
remains open and unlogged; editing an existing supplier requires authentication.

## Deployment

1. Restore the legacy business tables into the configured PostgreSQL `DB_SCHEMA`.
2. Run `python manage.py migrate` before serving the updated application.
3. Set `AUDIT_LOG_VIEWER_USER_IDS=123,456` in the backend environment to grant
   access to specific **Tbltenderuser.userid** values. These are not employee IDs.
   The default is empty: even ordinary employees cannot read all users' history.
   Only employee sessions with an explicitly listed user ID may read the logs.
4. Deploy the frontend change together with the backend: business write requests
   now require the signed login token in `Authorization: Bearer ...`. Existing
   sessions without a token or with an expired token must log in again.
5. Restart the backend after changing environment settings.

After restoring/replacing business tables *after* migrations, run
`python manage.py install_audit_triggers`. This idempotent command lists absent
tables; it never creates or modifies business rows. Newly introduced business
tables need to be added to the trigger allowlist in a new migration.

## What is stored

- `audit_event`: server time (UTC), request UUID, authenticated user ID and name
  snapshot, employee/supplier role, employee/vendor IDs, business action name,
  route template, outcome and HTTP status.
- `audit_change`: event ID, table, insert/update/delete operation, record IDs,
  actual before/after row values. Record IDs include related invitation/tender
  IDs when these columns exist in the changed row. An indirect relationship is
  not inferred when these IDs are absent.
- Password, salt/hash, token/session, bank-account, binary/image and similar
  sensitive columns are replaced with `[REDACTED]` in snapshots. Free-text
  business fields may still contain personal or commercial information; access
  to the history must remain restricted.

PostgreSQL row triggers cover the existing allowlisted business tables, including
raw SQL writes. One request can have many row changes. No-op row updates have no
change entry. Settings no longer write duplicate legacy log records or accept a
client-supplied `currentuser` as the audit identity. Old `TBLLOGRECORD` and
`TBLLOGDETAIL` data is preserved.

The request transaction contains the action, event and row changes. Exceptions,
HTTP errors, and legacy nonzero `RetType`/`retType`/`ret_type` results roll back
partial database writes. A failed event is then stored separately, without the
discarded row changes. If audit storage is unavailable the database mutation
does not commit. File-system and external email/ERP effects cannot be rolled
back by PostgreSQL and must not be interpreted as rolled back by a failed event.

Triggers need the request's transaction-local audit context. Direct SQL,
background scripts, authentication endpoints and ERP sync outside that context
are not attributed or logged by this feature. Auditing is not an authorization
policy for business objects: existing tender/company access checks still apply.

Audit rows cannot be updated/deleted via ordinary SQL, except the event's single
pending-to-final transition within its creation transaction. There is no write
or delete audit API. Database owners/superusers can bypass triggers; use a
restricted application database role and controlled backups for production.
No automatic deletion/retention job is enabled. Agree on retention and archival
before introducing any purge process.

## Read APIs

Both require an authorized employee Bearer token:

- `GET /api/audit/events/`: newest first, `page` (default 1), `page_size`
  (1–100, default 50). Filters: `user_id`, `employee_id`, `vendor_id`, `username`,
  `role`, `action`, `outcome`, `invitation_id`, `tender_id`, `date_from`, `date_to`.
  Dates use `YYYY-MM-DD` and inclusive Asia/Ulaanbaatar calendar days. Returns
  `{count, page, page_size, results}`.
- `GET /api/audit/events/<id>/`: event plus paginated before/after changes,
  with the same `page` and `page_size` limits.
- `GET /api/log/all/`: existing historical logs, now protected by the same
  viewer permission. Its response format remains unchanged.

`GET /api/audit/access/` reports `can_view_audit` for the authenticated user without
returning log data. The employee sidebar uses it to show **Үйлдлийн түүх** only
to authorized viewers. The `/employee/logs` page checks this permission again;
the list and detail APIs independently enforce it on every request. No local
storage or frontend cookie can grant access. Permission/network check failures
hide the menu. Focus, navigation and login/account changes recheck permission.

The screen supports date, name, role, outcome and related-ID filters, pagination,
and a before/after detail dialog. Times are shown in Asia/Ulaanbaatar.
Historical actions that were never logged cannot be reconstructed.

## Business summaries (migration 0003)

The employee UI requests `presentation=business`. `audit_summary` stores a frozen
allowlisted projection of each successful action, including full requirement
text, readable type, and attachment requirement. It never exposes raw table
names or DB IDs as detail fields. Unchanged deletes/reinserts are cancelled as
a multiset by content. Known saves with no meaningful changes are omitted from
the display, while their raw audit events remain intact. Separate real changes
are never merged merely because a user or timestamp is similar.

`savePortalTender/` combines the header, invitation and detail save into one
transaction and one event. Wizard steps that make real changes still have their
own meaningful entries. Uploads and publication remain distinct actions; they
are not presented as part of an already committed save.

Requirements now retain stable IDs and persist `document_required`. Saves return
the assigned IDs to the editor, allowing true before/after edits and preventing
unchanged requirements from being deleted/reinserted. Older rows use NULL for an
attachment option that was never recorded; history displays this as unknown.

Deploy frontend/backend together, run `python manage.py migrate`, then
`python manage.py build_audit_summaries` to project existing raw history. The
backfill preserves all original records, does not guess old display names from
current directories, and does not invent historical cross-request grouping.
Existing logical edits with stable IDs can be displayed as edits; old rows that
were deleted/recreated with different contents remain separate removed/added
entries when their identity cannot be proven.

## Verification

`python manage.py test api.tests api.test_audit` uses Django's separate test
database and requires a PostgreSQL account allowed to create a test database.
Tests cover employee/supplier attribution, forged/expired tokens, actual SQL
old/new values, inserts/deletes, no-op updates, transaction rollback, storage
failure, redaction, immutable records, read permissions and real settings routes.
