# ProWin coaching ownership

The external sibling `../../../../coaching` is a stateless synchronous calculator.
See its README for the complete HTTP contract and V2 compatibility change.

ProWin stores jobs and results in its own `CoachingAnalysis` table. The existing
`remote*` tracking fields now implement a local queue, not remote polling:

- `remoteManaged`: enrolled in the local queue;
- `remoteRequestKey`: local reanalysis generation/correlation key;
- `remoteSyncAttempts` / `attempts`: calculation attempts, limited to three;
- `remoteNextSyncAt` / `nextRetryAt`: due time/backoff;
- `remoteLeaseToken` / `remoteLeaseUntil`: conditional local ownership;
- `remotePlanSnapshot`: pinned `{ plan, products }`, no signed audio URL;
- `remoteResultSnapshot`: complete calculation facts before local quality gating;
- `remoteAnalysisId`: obsolete, cleared on computation/requeue;
- `remoteRelaunch`: obsolete, cleared.

Every 10 seconds the worker claims due jobs atomically, signs caller-owned audio,
calls `/coaching/compute` with a 30-minute default timeout, validates the full
plan/product snapshots and saves with the lease token condition. An expired lease
is recovered by a later worker. Transport failure returns the row to PENDING with
backoff, then FAILED after three attempts. A lost response may recalculate because
the external engine intentionally has no persistent idempotency store.

Quality thresholds and official score masking are local. Historical unmanaged
analyses remain readable and are never automatically recomputed. Manual launch
and bulk launch actually requeue READY/FAILED targets, preserving local IDs; an
already pending/running target is a no-op and excluded from the bulk count.
Explicit relaunch clears transcript. Changing plan keeps the old reference result
and schedules the active-plan target. Mutations return scheduling, not completion.

Manual requeue atomically clears every generation output (summary, scores,
confidence, recommendations, criteria, conformity, product mapping/provenance and
raw result snapshot), using SQL NULL via `Prisma.DbNull` for nullable JSON fields.
Pending and failed generations therefore cannot expose a previous result. A deliberate
reanalysis refreshes the reference/pricing snapshot before requeuing, while keeping
reference history rows and CRM relation IDs. Retries reuse that generation's snapshot.

Before deployment, the external engine must be configured with
`COACHING_AUDIO_ALLOWED_HOSTS`: exact hostnames from ProWin's signed storage URLs.
It accepts HTTPS only and does not follow redirects. No storage hostname is inferred
or hardcoded, and no server configuration was changed during local implementation.

`SalesPlanService.importPlan(markdown)` and `ProductSheetService.importSheet(markdown)`
ask the stateless parser to validate, verify the returned hash/content locally, and
version/activate only in ProWin's DB. Imports serialize per tenant/slug and dedup
identical content. Existing local reference rows are used directly; nothing is
imported to a remote database. Manual launch, bulk launch and relaunch reuse the
integration key when `WINLEADPLUS_INTEGRATION_API_KEY` is configured, through
`WinleadPlusApiService.getIntegrationOffres`: a validated, complete `count/items`
commercial active catalog, with `x-api-key` only and an endpoint derived from
`WINLEADPLUS_API_URL`. The same method supplies gamification offer synchronization.
Without the key, they reuse the authenticated request's bearer for `getOffres`. Recording upload
confirmation forwards its authenticated bearer and awaits snapshot creation, not audio
calculation. A rejected token produces unavailable prices (`null`) without blocking
analysis or substituting cached prices. Credentials never enter the snapshot/queue.

Without an integration key or bearer, `CoachingPricesService` uses only API-synced local offers, with a
24-hour default maximum age. The optional Nest provider
`COACHING_PRICE_CACHE_MAX_AGE_MS` can explicitly override that age; it is not inferred
from the environment. Missing, unsynced, expired or future-dated matching rows are not
verified. Cache provenance is `winleadplus_cache` and `checkedAt` is the oldest
matching sync date (or null if unknown), not the time of the local read. The worker
uses pinned inputs; historical jobs missing inputs refresh through integration when configured.
Only validated parent `prix_base` amounts are certified; nonempty/unidentified
`formules` leave prices unavailable rather than claiming a verified variant grid.

Configuration: `backend/.env.example`. No remote database migration is needed.
The existing local tracking migration is retained; no applied migration was edited.

Automated tests use mocked local DB delegates and HTTP calculations. Run `npm test -- --runInBand coaching` and
`npm run build` from `backend/`.
