# HSclubs Guiding Page

The 2nd repo of the HSclubs project: one page that lists the school club sites, and the small
job that keeps it up to date.

Each school runs its own instance of the 1st repo
([`HSclubs`](https://github.com/bangxiao0927/HSclubs)) and publishes a public summary of its
club directory. This repo does not manage clubs, members, or logins; it reads those summaries
and shows them together.

## How it connects

```text
school site A  --\
school site B  ----> (this repo, one machine) ----> guiding page
school site C  --/       pulls /api/summary
```

**This side pulls. Schools never push.** The school site stays the single source of truth, and
nothing a school (or anyone impersonating one) sends can become content here. The full reasoning,
and the optional notification half that is deliberately not being built, is in the 1st repo's
[`docs/AGGREGATOR_BRIDGE.md`](https://github.com/bangxiao0927/HSclubs/blob/main/docs/AGGREGATOR_BRIDGE.md);
the contract this repo depends on is restated in [`docs/BRIDGE_CONTRACT.md`](docs/BRIDGE_CONTRACT.md)
so this repo can be read on its own.

Consequences worth knowing before writing any code here:

- **Only outbound network access is required.** This runs on one machine, behind whatever NAT
  it happens to sit behind, and needs no inbound port, no public hostname, and no certificate
  for the pulling half.
- **Being offline is not a failure.** A missed poll is a later poll. Nothing queues up on the
  school's side waiting to be delivered.
- **A school is never blocked by this page.** If this repo is down, misconfigured, or abandoned,
  every school site keeps working exactly as before.

## Status

Phases 1-3 of [`docs/ROADMAP.md`](docs/ROADMAP.md): it reads every school on a schedule and
serves the page. Next is verification tooling (Phase 4).

## Running it

```bash
npm install
cp registry.example.json registry.json   # then edit: real URL, token, state

npm run poll -- mvhs   # one school, once
npm run poll:all       # every listed, verified school, once
npm run watch          # a pass now, then every HSCLUBS_POLL_INTERVAL_MS (1h default)
npm run serve          # the page on http://127.0.0.1:4180
```

`registry.json` and `data/` are gitignored. Everything is configurable by environment variable:
`HSCLUBS_REGISTRY`, `HSCLUBS_STORE`, `HSCLUBS_POLL_INTERVAL_MS`, `HSCLUBS_PORT`, `HSCLUBS_HOST`,
`HSCLUBS_PAGE_TITLE`. The server binds to localhost unless told otherwise: this is a private page
on a personal machine, and answering the whole network is not something to turn on by accident.

What a poll does: fetch that school's `/api/summary` with the stored `ETag`, and record the
result. An unchanged school answers `304` and nothing is rewritten. A school that is down keeps
its last good summary and gains a `lastError`, so the page can show a stale card with a reason
instead of an empty one.

The page is rendered from the store on each request -- no build step, no output file to keep in
sync, and never staler than what the poller wrote. Everything on it came from someone else's
server, so everything on it is escaped.

Typical operation is two processes: `npm run watch` and `npm run serve`.

```bash
npm test        # unit tests, plus a real captured response from a running school site
npm run typecheck
```

## Repository layout (planned)

| Path | Purpose |
| --- | --- |
| `src/` | The poller (registry, bounded fetch, store, schedule) and the page (render, serve). |
| `docs/` | The contract, the registry format, and the operating runbook. |
| `registry.example.json` | The shape of the school list. The real one is not in git. |

## What must never be committed here

This repository is public. The school registry as actually operated, any verification token, and
any per-school secret stay out of git -- see [`docs/REGISTRY.md`](docs/REGISTRY.md). Only the
example file is tracked.
