# Tender invitation workflow

The active workflow uses `tblinvitation.status` and
`tblinvitationofvendor.status`. The evaluation tables introduced by the upstream
pull are preserved, but their independent status-writing endpoint is disabled
until a separate migration/integration is agreed. Existing status lookup rows
12 and 13 remain for historical compatibility and are not new transition targets.

## Employee transitions

| Action | Source | Target | Permission |
| --- | --- | --- | --- |
| request_publish | 0 | 6 | Responsible employee |
| publish | 6 | 1 | Publish or Admin |
| return_draft | 6 | 0 | Publish or Admin, reason required |
| open | 1 | 3 | Close or Admin; opening time reached; submitted bids exist |
| decide | 3 | Invitation stays 3; supplier becomes 4 or 5 | Close or Admin; reason required |
| finish | 3 | 7 | Close or Admin; all bids decided; at least one selected |
| cancel | 1, 3 | 8 | Cancel or Admin; reason required |
| request_republish | 7, 8 | 9 | Reopen or Admin; reason required |
| return_republish | 9 | Original 7 or 8 | Reopen or Admin; reason required |
| republish | 9 | Old 10; new draft 0 | Reopen or Admin |
| extend | 1 | 1 | Hold or Admin; before current deadline; reason required |

Non-admin employees must also be the creator or an evaluation committee member
of the invitation. The creator may be stored as the historical username or
employee display name. Permissions come from existing Tblsettings/Tbladmin data;
no permissions are granted by this change.
Migration 0007 adds the Publish permission to the existing action lookup. Assign
it explicitly to the chosen employee in `/employee/settings`; that employee
must also be responsible for the tender or on its committee (unless an admin).

The deadline closes submissions; it does not open bids or advance status to 3.
The responsible employee explicitly opens bids after the opening time. A tender
without a selected supplier must be cancelled with a reason rather than published
as a successful result. Returning a publication request restores its editable
draft. Completed or cancelled invitations cannot be edited or re-published in
place.

## API and portal

GET `/api/maktender/workflow/?invitationid=...` returns authoritative status,
permitted actions and supplier decisions. POST the same URL with `invitationid`,
`action`, optional `note`, and action-specific fields: `vendorid` + `decision`
(4/5), or `acceptdate` + `opendate` for an extension.

The employee tender editor contains a shadcn action panel and confirmation dialog.
Unsaved changes must be saved before requesting approval. Draft fields are
disabled after leaving state 0. The evaluation list includes state 3 so that
committee members can record scores before results are published.

Legacy lifecycle URLs delegate to this service; `saveInvitation`,
`updateInvitationOfTender`, and `updateTenderVendorEvaluationStatus` no longer
allow arbitrary state writes. The portal and legacy score/submission write paths
check invitation state and verified identity. Lifecycle operations serialize on
an invitation row lock and participate in the existing audit transaction.
This is not a comprehensive authorization review of all legacy APIs.

New draft deadline inputs without an offset are interpreted in Asia/Ulaanbaatar.
Stored timestamps are compared as instants and formatted in that timezone in the
portal. No historical timestamp data is rewritten.

## Reissue and deployment

Migration 0006 adds nullable request-origin and reissued-from fields to the legacy
invitation table. Historical rows are not backfilled or deleted. Reissue copies
the parent tender, batches, requirements, criteria, committee, contact notes,
document metadata and document references. It uses new tender/invitation codes,
clears deadlines and does not copy bids or scores. A separate parent tender is
necessary because the existing editor replaces tender-level batches when saving;
sharing it would modify historical rounds. The new invitation records its source
invitation in `reissued_from_invitationid`.

Copy failures roll back both new records and the old status. Publication/result
actions expose the change through existing portal lists; this service does not
send email notifications.

Deploy backend and frontend together, then run `python manage.py migrate` and
`python manage.py check`. Tests: `python manage.py test api --noinput`.
Do not delete or rename the already-applied audit or merge migrations.
