# Roadmap

Small on purpose. This repo exists to show a handful of school sites on one page; every feature
it does not have is a feature nobody has to maintain.

## Phase 1 - Read one school (done)

- Load the registry file.
- Fetch one verified school's `/api/summary` with the safety bounds in
  [`BRIDGE_CONTRACT.md`](BRIDGE_CONTRACT.md).
- Store the response and its `ETag`.

Exit check: running it twice against an unchanged school produces one `200` and one `304`.

## Phase 2 - Read every school on a schedule (done)

- Poll each verified school hourly, conditionally, one at a time.
- A slow or broken school affects only its own entry.
- Record `lastPolledAt` and the last error per school, so a stale card is explainable.

Exit check: with one school pointed at a dead host, the others still update and the page says
which one is stale.

## Phase 3 - The page (done)

- One list: school name, address, club count, category counts, when it was last updated.
- Link out to each school site.
- Escape everything; it is all free text from someone else's server.

Exit check: a visitor can tell which schools exist, how big each is, and where to go next.

## Phase 4 - Verification tooling (done)

- Issue a token, check a challenge file, flip a school to `verified`.
- Re-verify on a schedule and mark `failing`.

Exit check: adding a school is a documented sequence the operator can follow without reading
code, and a school that deletes its challenge file disappears on its own.

## Not planned

- Any inbound API. Schools do not call this machine (see the 1st repo's bridge design for why
  the notification half is deliberately skipped for a private, single-operator page).
- Accounts, logins, or per-school admin here. Schools administer their own sites.
- Copying club, member, or post data. If the page ever wants a club-level view, it links to the
  school site instead of duplicating it.
- A database, until a JSON file is genuinely painful. One machine, a handful of schools.
