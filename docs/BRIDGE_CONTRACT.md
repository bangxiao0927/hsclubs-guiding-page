# Bridge Contract

What a school site publishes, and what this repo is allowed to assume about it. The authoritative
version lives with the producer, in the 1st repo's
[`docs/AGGREGATOR_BRIDGE.md`](https://github.com/bangxiao0927/HSclubs/blob/main/docs/AGGREGATOR_BRIDGE.md)
and [`docs/API.md`](https://github.com/bangxiao0927/HSclubs/blob/main/docs/API.md); this file is
the consumer's copy so this repo can be read on its own.

This document describes the unversioned `/api/summary` that is in production today, and it keeps
describing it: v1 is being built beside it, not on top of it. The versioned contracts the school
template, this page and the iOS app share -- `/api/v1/summary`,
`/.well-known/hsclubs-app.json`, `/api/v1/schools` and mobile authentication -- live as machine
checkable schemas and fixtures in [`../contracts/v1/README.md`](../contracts/v1/README.md).

This page also *produces* one v1 surface of its own: `GET /api/v1/schools`, the minimal directory
the iOS app reads. It is assembled from the registry and the store, isolates a school whose
configuration or record is bad as `incompatible` rather than failing the response, and is
documented alongside the schemas it honours. The unversioned `/api/schools` the browser page uses
is unchanged.

## The one endpoint

`GET https://<school-host>/api/summary` -- anonymous, read-only, cross-origin readable.

```json
{
  "schoolName": "Mountain View High School",
  "shortName": "MVHS",
  "slug": "mvhs",
  "address": "3535 Truman Ave, Mountain View, CA 94040",
  "status": "active",
  "clubCount": 106,
  "categories": { "STEM & Innovation": 15, "Service & Leadership": 60 },
  "memberCount": 0,
  "lastUpdatedAt": "2026-08-08T21:41:31.064406-07:00",
  "dataHash": "5907928d4ec9881498a60cbb5c3cf5f0666e3ce949d002635c1aa35972bfb597"
}
```

- `schoolName`, `shortName`, `slug`, `address` are school identity, configured on that site.
  `address` may be `null`; every key is always present.
- `clubCount`, `categories`, `memberCount`, `lastUpdatedAt`, `dataHash` are computed from that
  school's active clubs. Archived and pending clubs are excluded.
- `lastUpdatedAt` is an ISO-8601 instant **with an offset**, so it is comparable across schools
  in different zones. It is `null` for a directory that has never been updated.
- No student, member, or admin data appears here, and none ever will. If a future field looks
  like it does, that is a bug in the producer, not a feature to consume.

## Polling

The response carries an `ETag`. Send it back as `If-None-Match` and an unchanged school answers
`304` with no body:

```text
GET /api/summary                          -> 200, ETag: "abc..."
GET /api/summary  If-None-Match: "abc..."  -> 304
```

Store the `ETag` per school and poll conditionally. An hourly poll is plenty for a directory that
changes weekly; every unchanged school then costs one 304.

`dataHash` answers a narrower question than the `ETag` does: it digests the clubs only, so it is
stable when a school edits its own name or address. Use the `ETag` to decide whether to re-read,
and `dataHash` if you ever want "did the clubs change?" specifically.

## Fetching safely

The registry supplies the URL, so the fetch is a server-side request to an address this repo did
not choose. Bound it:

- HTTPS only, and the host must be the verified one (see [`REGISTRY.md`](REGISTRY.md)).
- Do not follow cross-origin redirects.
- Short connect and read timeouts; a slow school must not stall the others.
- Cap the response size and reject a body that is not JSON of the shape above.
- Never render a field without escaping it. `schoolName` and `address` are free text typed by
  someone else.

## What this repo must never do

- Write to a school site. There is no endpoint for it; `POST /api/summary` answers 401.
- Accept a school's numbers from anywhere except a pull it initiated itself.
- Require a school to reach this machine. Nothing here is a dependency of a school site.
