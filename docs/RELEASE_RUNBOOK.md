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
   `hsclubs.net`. `/api/schools` is unchanged.
3. **iOS app** — only after every real school passes the checks below.

A school may be at step 1 while another is not; the guiding page lists each independently and marks
the laggard `degraded` or `incompatible` without affecting the rest.

## The 2026-08 domain move

The directory used to answer on `clubs.bangxiao.net` and the first school site owned the apex
`hsclubs.net`. That is now the other way round: the directory is the apex (`hsclubs.net`) and the
first school sits on `mvhs.hsclubs.net`, so every later school is a subdomain of the same name
rather than of a personal domain. Three consequences, all of which are release-blocking if
skipped:

- **The Universal Link domain changed.** The association is now served from `hsclubs.net`, so the
  app's associated-domains entitlement must name `applinks:hsclubs.net` and each school's
  `APP_MOBILE_AUTH_CALLBACK_URLS` must allow `https://hsclubs.net/mobile-auth/callback`. An app
  build entitled only to the old host silently falls through to the browser fallback. Ship the
  school allow-list first, then the app.
- **Keep the old host resolving.** `clubs.bangxiao.net` should 301 to `hsclubs.net` for as long as
  any released app build or bookmark can still reach for it. A redirect does *not* rescue a
  Universal Link (iOS matches the association against the host it was given, and does not follow
  the redirect), which is why the entitlement change above is the real fix.
- **The school's origin changed, so its verification is stale.** Origin verification proves
  control of a host; `mvhs.hsclubs.net` is a different host from `hsclubs.net`. Point the registry
  entry at the new summary URL, publish the challenge file on the new origin, and re-run
  `npm run verify -- <slug>` before expecting the school back in the directory.

## Per-school acceptance, before the app ships

Every real school must pass, in order (demo schools are shown but excluded from the auth gate):

1. **Immutable id** — `npm run id:issue -- <slug>` has been run once and the school publishes the
   same value in its v1 summary and manifest.
2. **Manifest** — `/.well-known/hsclubs-app.json` validates, its id, origin and slug agree with the
   registry, and it declares `mobile-auth.v1`.
3. **Root page** — the school site loads over its verified https origin.
4. **v1 summary** — `/api/v1/summary` validates and carries the issued id.
5. **v1 directory** — the school appears `compatible` in `/api/v1/schools`.
6. **Universal Link** — `hsclubs.net/.well-known/apple-app-site-association` names the
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
`usage` field): counts and first/last timestamps only, never any user data, persisted to
`HSCLUBS_USAGE_STORE` (default `data/usage.json`) so the window survives restarts. The template
records the equivalent for `/api/summary` and `/api/v1/summary` (`SummaryUsage`).

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
