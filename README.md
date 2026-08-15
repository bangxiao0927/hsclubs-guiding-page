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

Phases 1-4 of [`docs/ROADMAP.md`](docs/ROADMAP.md): it reads every school on a schedule, serves
the page, and verifies that a summary URL belongs to the school it claims to be.

## Running it

```bash
npm install
cp registry.example.json registry.json   # then edit: real URL, token, state

npm run poll -- mvhs   # one school, once
npm run poll:all       # every listed, verified school, once
npm run watch          # a pass now, then every HSCLUBS_POLL_INTERVAL_MS (1h default)
npm run serve          # the page on http://127.0.0.1:4180

npm run verify:issue -- mvhs  # issue and print a one-time origin challenge token
npm run verify -- mvhs        # check one school's challenge + summary identity
npm run verify:all            # check every listed school once
npm run verify:watch          # check now, then every HSCLUBS_VERIFY_INTERVAL_MS (30d default)
```

The page itself is a React app in [`web/`](web), built by Vite:

```bash
npm run build      # install web/ and build it into web/dist
npm run web:dev    # Vite on :5173, proxying /api to a running `npm run serve`
npm run web:test   # the app's own tests
```

`registry.json` and `data/` are gitignored. Everything is configurable by environment variable:
`HSCLUBS_REGISTRY`, `HSCLUBS_STORE`, `HSCLUBS_POLL_INTERVAL_MS`, `HSCLUBS_PORT`, `HSCLUBS_HOST`,
`HSCLUBS_PAGE_TITLE`, `HSCLUBS_VERIFY_INTERVAL_MS`, `HSCLUBS_WEB_DIR`. The server binds to
localhost unless told otherwise: this is a private page on a personal machine, and answering the
whole network is not something to turn on by accident.

What a poll does: fetch that school's `/api/summary` with the stored `ETag`, and record the
result. An unchanged school answers `304` and nothing is rewritten. A school that is down keeps
its last good summary and gains a `lastError`, so the page can show a stale card with a reason
instead of an empty one.

`npm run serve` answers three things: `GET /api/schools` with what the poller last stored, the
built app out of `web/dist`, and -- when nothing has been built -- a server-rendered page instead.
That fallback is why the poller machine never has to keep a toolchain alive: a fresh checkout with
`npm install && npm run serve` is a working page, and `npm run build` is what upgrades it to the
app. Both read the store per request, so neither is ever staler than the last poll.

The app looks like a school site on purpose: the same palette and card language as the 1st repo's
frontend, light and dark, sharing its `theme` key so a visitor who chose dark over there arrives
here already dark. It opens on a full first screen -- what this is, and the figures that say
whether it is alive -- with the directories one scroll below, searchable by school or host,
sortable, filterable by category, and with a detail drawer for what a card has no room for. The
one link that leaves goes to the school's own origin: the origin verification proved control of.

Everything on the page came from someone else's server. React escapes what it renders, the
server-rendered fallback escapes by hand, and neither ever executes anything a school supplied.

Typical operation is two processes: `npm run watch` and `npm run serve`.

On the Windows machine this is operated from, both run as at-logon scheduled tasks
(`HSclubs guiding page - serve` / `- watch`) pointing at small launcher scripts outside the
repository, so a reboot brings the page back without anyone logging in and typing. The server
still binds to localhost only: this machine has a public address, and a page with no TLS and no
login has no business answering it. To read it from somewhere else, forward the port over SSH
rather than changing `HSCLUBS_HOST`:

```bash
ssh -N -L 4180:127.0.0.1:4180 you@that-machine   # then open http://127.0.0.1:4180
```

To put it on a hostname instead, keep `HSCLUBS_HOST` at localhost and let a reverse proxy be the
only thing that reaches it. On this machine that is Caddy (`C:\ProgramData\Caddy\Caddyfile`,
started at boot by the `Caddy (HSclubs guiding page)` task): it terminates TLS with a certificate
it obtains itself, requires basic auth, and proxies to `127.0.0.1:4180`. Only 80 and 443 are open
in the firewall; 4180 stays unreachable from outside, so there is no second door that skips the
password. The site block is commented out until an A record exists -- a hostname Caddy cannot
validate is a certificate it will retry forever.

The credential is not in this repository. Rotate it with
`caddy hash-password --plaintext <new>` and replace the hash in the Caddyfile.

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
