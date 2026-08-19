# Production Release Runbook

How the school template, this guiding page and the iOS app go to production together, in an order
that never breaks a client already in the field, and how the legacy endpoints are observed rather
than deleted. This is the operational half of hsclubs-guiding-page#40; it removes nothing.

## Release order

Compatibility flows one way, so the producers ship before the consumers:

1. **School template** (HSclubs) — publish the immutable `schoolId`, `/api/v1/summary`, the
   `/.well-known/hsclubs-app.json` manifest, and the mobile-auth endpoints. `/api/summary` is
   unchanged.
2. **Guiding page** — poll and verify each school's identity and manifest, publish
   `/api/v1/schools`, and serve the Universal Link association and fallback on
   `clubs.bangxiao.net`. `/api/schools` is unchanged.
3. **iOS app** — only after every real school passes the checks below.

A school may be at step 1 while another is not; the guiding page lists each independently and marks
the laggard `degraded` or `incompatible` without affecting the rest.

## Per-school acceptance, before the app ships

Every real school must pass, in order (demo schools are shown but excluded from the auth gate):

1. **Immutable id** — `npm run id:issue -- <slug>` has been run once and the school publishes the
   same value in its v1 summary and manifest.
2. **Manifest** — `/.well-known/hsclubs-app.json` validates, its id, origin and slug agree with the
   registry, and it declares `mobile-auth.v1`.
3. **Root page** — the school site loads over its verified https origin.
4. **v1 summary** — `/api/v1/summary` validates and carries the issued id.
5. **v1 directory** — the school appears `compatible` in `/api/v1/schools`.
6. **Universal Link** — `clubs.bangxiao.net/.well-known/apple-app-site-association` names the
   production app id and the callback path.
7. **Google sign-in** — a dedicated test account completes the flow on staging.
8. **Session recovery** — after quitting and reopening the app, the school session is still valid.

The registry-level pre-flight is `npm run release:check` here; the live end-to-end pre-flight is
`scripts/release-check.mjs` in the app. The full Google run is the release gate in the app's
`release-gate.yml`.

## The Google gate

A dedicated Google test account drives the whole sign-in as the release gate. Its credentials live
only in the CI secret store, never in the repo or a developer machine. The gate runs on a schedule
and on demand, never on pull requests, so Google's MFA, captcha and risk checks cannot block
ordinary work. A failed gate blocks the release and alerts; it does not fail unrelated PRs.

## What the app guarantees, and how it is verified

- **Slug migration** — a pre-v1 install's `selected-school-slug` maps to the school's `schoolId`
  on the first v1 directory read, and the school reopens after it later changes its slug. Verify by
  upgrading over an old install and renaming a school's slug in the registry.
- **Session isolation** — each school origin's session is separate; switching schools and
  restarting the app keep each session for as long as its own server allows, and one school's
  session never leaks to another. Verify by signing into two schools and restarting.
- **Fault isolation** — an `incompatible` school is visible but not openable, and one school's
  outage leaves the others working.

## Legacy observation window

`/api/summary` (template) and `/api/schools` (guiding page) keep working through the window. The
guiding page counts reads of `/api/schools` and `/api/v1/schools` (see `GET /api/status`, the
`usage` field): counts and first/last timestamps only, never any user data. The template records
the equivalent for `/api/summary`.

Retiring a legacy endpoint is out of scope here and must not happen in this issue. It needs, in
writing: every listed school on v1, a stated observation window with no non-app reads of the legacy
path, confirmation that no shipped client still depends on it, and a **separate contract issue** that
records all of the above. Until then both legacy endpoints stay.

## Playbooks

- **Bad release / rollback** — redeploy the previous build of the affected repo. Because producers
  are backward compatible, rolling back the app or the guiding page never strands a school; rolling
  back a school template drops it to `degraded` in the directory, not out of it.
- **One school down** — no action needed for the others; the failing school shows `incompatible` or
  `degraded` and is not openable. Fix the school, then `npm run verify -- <slug>`.
- **Universal Link failure** — if the AASA is wrong or uncached, sign-in returns to the browser
  fallback, which consumes nothing. Fix `HSCLUBS_IOS_APP_ID`, allow for Apple's AASA cache, and
  re-run the app's `release-check`.
- **Google risk trigger** — if the test account is challenged, the gate fails and alerts; sign-in
  for real users is unaffected. Clear the account's challenge or rotate the CI credential, then
  re-run the gate. Never move the credential out of the secret store to "test locally".
