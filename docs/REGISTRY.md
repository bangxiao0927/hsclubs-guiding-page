# The School Registry

The list of schools this page shows, and how a school gets on (and off) it.

Registration is a human decision: the operator adds a school. Verification is the mechanical
part -- proving that a URL really belongs to the school it claims to be -- and it is what keeps
"a human decided" from turning into "anyone who knows the format".

## The file

A JSON file the operator edits. `registry.example.json` in the repository root shows the shape;
**the operated file is not in git**, because it carries the verification tokens and the exact
URLs of every participating school. Keep it next to the running job (path supplied by
configuration) and back it up like any other operational data.

```json
{
  "schools": [
    {
      "slug": "mvhs",
      "schoolId": "sch_7Qb3Xf9KLm2ZpR4tVn6Y",
      "summaryUrl": "https://mvhs.example.org/api/summary",
      "verification": {
        "token": "issued-once-by-the-operator",
        "verifiedAt": "2026-08-08T12:00:00Z",
        "lastCheckedAt": "2026-08-08T12:00:00Z",
        "lastError": null,
        "state": "verified"
      },
      "listed": true,
      "integration": {
        "checkedAt": "2026-08-08T12:00:00Z",
        "state": "ok",
        "detail": null
      }
    }
  ]
}
```

- `schoolId` is the school's permanent identity, issued here and used by every repository. It is
  opaque (`sch_` and then alphanumerics), it is never derived from anything, and it never
  changes: a school that renames itself, changes its slug or moves to an approved new host keeps
  the same identity, because the app, the caches and the sessions that already refer to it are
  referring to *that school*. A demo entry's identity begins `sch_demo` so a fixture is
  recognisable wherever it appears. See [`../contracts/v1/README.md`](../contracts/v1/README.md).
- `summaryUrl` is the only address this repo ever fetches for that school.
- `state` is `pending`, `verified`, or `failing`. Only `verified` schools are shown.
- `verifiedAt` is the last successful proof; `lastCheckedAt` says when the latest attempt ran,
  and `lastError` says why that attempt failed. A **definitive** failure (challenge removed or
  wrong, redirect, bad summary shape, slug mismatch) keeps the old successful timestamp for
  history but changes `state` immediately, so the school stops being polled and listed. A
  transient failure (DNS, timeout, 5xx, 408/429) proves nothing about ownership: a previously
  verified school stays verified and the error is recorded for the next pass. One local network
  blip must not hide every school for the default 30-day interval.
- `listed` is the operator's own switch: set it false to stop guiding a school without deleting
  its history.
- `demo` is an optional boolean for fixture data. Set it to true when an origin exists to
  exercise the multi-school UI but does not represent an approved participating school. The
  page labels it **Demonstration**. Origin verification proves control of a host, not the
  institutional identity behind a made-up school name.
- `location` is an optional `{ "lat": number, "lon": number }` the operator confirms out of
  band. It is never derived: `/api/summary` publishes no coordinates, `address` is frequently
  null, and geocoding free text would drop a guessed pin on a real institution. A malformed or
  out-of-range pair is a hard registry error, while an absent one is normal -- the map plots the
  schools it knows and reports the rest as awaiting a confirmed location.
- `integration` is written by the verification pass and records what the school's
  `/.well-known/hsclubs-app.json` said: `ok`, or `absent`, `unreachable`, `invalid`,
  `id-missing`, `id-mismatch`, `slug-mismatch`, `origin-mismatch` with a `detail` line. It is
  diagnosis, not a switch -- see below for which of those revoke verification.

## Identity

A school gets its identity once:

```bash
npm run id:issue -- mvhs
```

The command refuses to run twice for the same school. Give the printed value to the school; its
deployment configures it and then publishes it in two places -- the v1 summary and
`/.well-known/hsclubs-app.json` -- and both must match the registry.

What changes an identity: nothing. A school that renames itself, adopts a new slug or moves to an
approved host keeps it. A genuinely different school is a removal and an addition, and its
identity is a new one; identities are never reused.

Schools registered before identities existed simply have no `schoolId`. They keep being polled,
verified and listed exactly as before -- they cannot appear on the v1 app surface until an
identity is issued and the school publishes it, which is what makes the migration incremental
rather than a flag day.

## Verifying a school

1. The operator issues a one-time token and gives it to the school out of band.
2. The school publishes it at `/.well-known/hsclubs-site.txt` **on the same origin that serves
   `/api/summary`**. On a single-origin deployment that is a file in the site's static root; a
   school that puts its API on a separate host adds one location to its reverse proxy that
   returns the token.
3. This repo fetches that URL over HTTPS and compares. A match with no cross-origin redirect
   means the operator of that origin is the one who was given the token.
4. The `slug` in that origin's `/api/summary` must equal the `slug` in the registry entry. This
   stops a verified school from claiming a different school's identity.
5. If the registry has issued an identity, a summary that stamps a *different* one is refused,
   and the school's manifest is read and compared. Publishing another school's identity, or
   pointing the manifest's origin somewhere off the verified host, revokes verification
   immediately: continuing to list that school would carry the mistake into every consumer.
   Everything else the manifest can do wrong -- absent, unreachable, malformed, or a slug the
   registry has not caught up with -- is recorded in `integration` and changes nothing else,
   because that is what a normal migration looks like.

The tooling performs that sequence:

```bash
npm run id:issue -- mvhs      # issues the permanent schoolId, once
npm run verify:issue -- mvhs  # writes a new token into registry.json and prints what to publish
npm run verify -- mvhs        # checks the challenge and the summary slug; writes the new state
npm run verify:all            # one pass over every listed school
npm run verify:watch          # one pass now, then every 30 days by default
```

`HSCLUBS_VERIFY_INTERVAL_MS` changes the interval. A bad numeric value falls back loudly rather
than becoming a hot loop against school servers.

Only one verification command may mutate the registry at a time. The tooling creates
`registry.json.lock` around the complete read/check/write operation; another command fails with
a clear "registry is busy" message instead of overwriting a token issued while a long pass was
in flight. A crash can leave the lock directory behind; if no verification command is running,
remove it manually. Polling and serving do not take this lock because they never write the
registry.

Both checks re-run on a schedule (monthly is plenty). A school that stops answering, or whose
challenge file disappears, moves to `failing` and drops off the page -- it is not deleted, so an
outage is not a removal and coming back needs no paperwork.

Why the challenge lives on the API origin and not the school's brand domain: a token served by a
host that does not serve the data proves nothing about the data.

## Leaving

Either side, independently, without the other's cooperation:

- **The school** deletes its challenge file. The next re-verification fails and it stops being
  listed. No request to the operator, no waiting.
- **The operator** sets `listed` to false, or removes the entry.

Neither side can force the other to keep the link. That is the right shape for a page one person
runs and schools join voluntarily.

## What never goes in git

- The operated registry file (tokens, real URLs).
- Any per-school secret, if a notification channel is ever added.
- Anything pulled from a school beyond what the page displays.
