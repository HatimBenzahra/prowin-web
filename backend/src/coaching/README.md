# ProWin coaching ownership

The external engine (repo `prowin-coaching`, checked out at `PRO_WIN/coaching`, next to
`prowin_V1/`) is a stateless synchronous calculator.
See its README for the complete HTTP contract and V2 compatibility change.

ProWin stores jobs and results in its own `CoachingAnalysis` table. The existing
`remote*` tracking fields now implement a local queue, not remote polling:

- `remoteManaged`: enrolled in the local queue;
- `remoteRequestKey`: local reanalysis generation/correlation key;
- `remoteSyncAttempts` / `attempts`: total stage dispatches (legacy counters);
- `transcriptionAttempts` / `evaluationAttempts`: independent budgets, three each;
- `remoteNextSyncAt` / `nextRetryAt`: due time/backoff;
- `remoteLeaseToken` / `remoteLeaseUntil`: conditional local ownership;
- `remotePlanSnapshot`: pinned `{ plan, products }`, no signed audio URL;
- `remoteResultSnapshot`: complete calculation facts before local quality gating;
- `remoteAnalysisId`: obsolete, cleared on computation/requeue;
- `remoteRelaunch`: obsolete, cleared.

Every 10 seconds the worker claims due jobs atomically. Without a valid transcript
checkpoint it writes TRANSCRIBING, signs caller-owned audio and calls
`/coaching/transcribe`. It persists transcript, measured duration and optional word/
quality metadata, then releases the lease. A later claim writes ANALYZING and calls
`/coaching/evaluate` with those facts; this endpoint never falls back to STT.
Writes require both the current token and an unexpired lease; claims also compare
the observed generation and updatedAt. Restart recovery resumes the unfinished
stage. STT_BUSY schedules a 60–75s jittered retry without consuming the failure
budget. STT timeout uses a 5-minute cooldown; ordinary stage errors back off 30s
per attempt plus jitter. Three actual attempts exhaust only that stage's budget.
A lost STT response can still require retranscription after capacity is released;
neither external service persists output or provides durable idempotency.

Quality thresholds and official score masking are local. Historical unmanaged
analyses remain readable and are never automatically recomputed. Manual launch
and bulk launch actually requeue READY/FAILED targets, preserving local IDs; an
already pending/running target is a no-op and excluded from the bulk count.
Relaunch preserves transcript facts by default; `retranscribe: true` on
`relaunchCoachingAnalysis` explicitly discards them. Changing plan keeps the old reference result
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

Admins import sales plans and product sheets from the Coaching IA screen (tabs *Plan
de vente* and *Produits*): GraphQL `importSalesPlan` / `importProductSheet`, then
`activate*Version` to read-then-reactivate a previous version (`salesPlanVersion` /
`productSheetVersion` return its content). A sheet cannot be retired. Directors can
only read. `SalesPlanService.importPlan` and
`ProductSheetService.importSheet` ask the stateless parser to validate (its message is
returned to the admin on a 400), verify the returned hash/content locally, record the
importing admin (`importedBy`) and version/activate only in ProWin's DB. Imports serialize per tenant/slug and dedup
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

Configuration: `backend/.env.example`. The additive local migration
`20261001120000_coaching_stage_checkpoints` is required before this worker starts.
It has only nullable facts/timestamps and default-zero counters, with no rewrites
to applied migrations. The Prisma schema was validated and the client generated
locally; SQL application and upgrade validation against a DB are deferred.
STT budget is ffprobe duration × multiplier (at least 1.5) + 10-minute margin,
bounded by 20–90 minutes by default. Unknown duration gets the 90-minute ceiling.
For 68m45s the ceiling is 90m; for 40m05s the budget is 70m07.5s. These are deadlines,
not predictions. Caller STT timeout is 98m including up to 5m download + 1m probe;
lease is another 2m longer. Evaluation has its own 10m timeout and 12m lease.
Signed URLs remain fresh 1h read URLs: download occurs first, so their expiry does
not limit subsequent CPU processing. Invalid/nonfinite/out-of-range numeric config
falls back to bounded defaults. Lowering caller budgets independently can truncate
the upstream response; configure them together.

Whisper admission protects all legacy routes and consumers, with no hidden waiting
queue. Cancellation retains capacity until native thread completion. Recording
extraction/enrichment distinguish busy from empty speech, preserve existing rows,
and schedule a deduplicated in-memory delayed retry, re-downloading after temp cleanup.
These auxiliary recording retries are best effort across process restarts; only the
coaching queue is DB-durable. SpeechAnalysis uses ffmpeg silencedetect rather than
Whisper, so its PENDING/READY/FAILED processing is independent of STT capacity.

Automated tests use mocked local DB delegates and HTTP calculations. Run `npm test -- --runInBand coaching` and
`npm run build` from `backend/`.
