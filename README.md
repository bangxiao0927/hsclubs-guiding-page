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
localhost unless told otherwise. Public access, when wanted, belongs in a TLS reverse proxy --
not in a Node listener that also has access to the operated registry and store.

`HSCLUBS_IOS_APP_ID` (a production `TEAMID.bundleid`) makes this domain publish the iOS app's
Universal Link association at `/.well-known/apple-app-site-association`; unset, that path is 404
rather than a placeholder. The static fallback at `/mobile-auth/callback` is always served and
consumes nothing. See [`contracts/v1/README.md`](contracts/v1/README.md) and hsclubs-app#2.

A school that stops answering is reported once, not hourly. After `HSCLUBS_ALERT_AFTER` failed
polls in a row (3 by default) the pass prints `ALERT: ...` and, if `HSCLUBS_ALERT_WEBHOOK` is
set, posts one JSON body there; recovery is reported the same way. Alerts fire on transitions
only -- an operator who gets an hourly reminder of a problem they already know about learns to
filter the channel, which is how the alert that mattered gets missed. A webhook that is
unreachable is logged and dropped: losing a notification is a smaller failure than losing the
poller.

Every transition is also kept locally in `data/alerts.json`, whether or not a webhook is set,
and exposed with current poll health at `/status`. On the operated public deployment that route
and `/api/status` remain behind Basic Auth even though the directory and `/api/schools` are
public: error details and alert history are operator data. Webhooks are delivery, not storage: a
URL can be rotated or unavailable, while the status page still needs to explain what happened.
It shows a school as degraded on its first failed poll even though notifications wait for the
threshold -- displaying the truth and waking an operator are different decisions.

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
here already dark. It opens directly on a full-bleed orthographic globe -- no marketing panel or
bordered map card in front of it -- and the directories start below. They reveal as they enter the
viewport and are searchable by school or host, sortable, filterable by category, and backed by a
detail drawer for what a card has no room for. The one link that leaves goes to the school's own
origin: the origin verification proved control of.

The nine-dot launcher in the header is an app switcher: it keeps the current Guide distinct from
the independent school apps, names the host before a visitor leaves, and carries live/demo status
into the choice. Mobile adds the same switcher to a thumb-reachable bottom dock alongside Guide
and Browse. Category facets become one horizontally scrolling, snap-aligned rail on a narrow
screen rather than fourteen chips pushing the actual schools several screens down.

Coordinates come only from `location` in the registry -- confirmed by the operator, never guessed
from an absent address -- so a school without one is counted as awaiting a location instead of
being pinned arbitrarily. Choosing a pin animates a spherical rotation and zoom; the labels are
HTML above the SVG, so they stay legible and keyboard reachable. The basemap is a simplified land
outline vendored into the bundle, which means no tile server ever learns who is reading this page.

The globe is draggable anywhere on it -- including on a school label -- and it rotates *with* the
gesture: drag right and the surface travels right, as if the sphere were under your hand. A flick
keeps a little momentum and decays; the arrow keys rotate the same way for anyone not using a
pointer. `touch-action: none` means a phone spins the earth instead of scrolling the page, and a
drag that ends on a label is not also treated as tapping it. With two or more mapped schools it
also runs
a tour, starting on the first real school and rotating to the next every 5.2 seconds, with a
progress line showing when the camera will move next. Any drag, tap or keypress takes control
immediately -- a tween must never fight a finger -- and **Resume tour** hands it back. Demo
coordinates are illustrative; real-school coordinates are confirmed against the school's known
address before they enter the operated registry.

An entry with `"demo": true` is rendered with a **Demonstration** badge and an explanation in
its drawer. This matters because origin verification proves control of a host; it does not turn
fixture data into a real participating school. Demo entries exercise multi-school search,
filters, trends and alerting without pretending to be approved institutions.

Everything on the page came from someone else's server. React escapes what it renders, the
server-rendered fallback escapes by hand, and neither ever executes anything a school supplied.

Typical operation is two processes: `npm run watch` and `npm run serve`.

On the Windows machine this is operated from, both run as SYSTEM startup tasks
(`HSclubs guiding page - serve` / `- watch`) pointing at small launcher scripts outside the
repository, so a reboot brings the page back without anyone logging in. The server itself still
binds to localhost; Caddy is the only process that answers the public network.

```bash
https://clubs.bangxiao.net              # public directory
ssh -N -L 4180:127.0.0.1:4180 you@that-machine   # direct operator tunnel, if needed
```

Keep `HSCLUBS_HOST` at localhost and let the reverse proxy be the only thing that reaches it. On
this machine that is Caddy (`C:\ProgramData\Caddy\Caddyfile`, started at boot by the
`Caddy (HSclubs guiding page)` task): it terminates and renews TLS, rate-limits by source IP,
serves the directory publicly, protects only `/status` and `/api/status` with Basic Auth, and
proxies to `127.0.0.1:4180`. Only 80 and 443 are open in the firewall; 4180 stays unreachable
from outside, so there is no second door around the proxy policy. The credential is not in this
repository; rotate it with `caddy hash-password --plaintext <new>` and replace its hash in the
Caddyfile.

```bash
npm test        # unit tests, plus a real captured response from a running school site
npm run typecheck
npm run contracts:check   # the shared v1 schemas, fixtures and checksums
```

## Repository layout (planned)

| Path | Purpose |
| --- | --- |
| `src/` | The poller (registry, bounded fetch, store, schedule) and the page (render, serve). |
| `docs/` | The contract, the registry format, and the operating runbook. |
| `contracts/v1/` | The versioned wire this repo shares with the school template and the iOS app: schemas, fixtures, protocol vectors, checksums. |
| `registry.example.json` | The shape of the school list. The real one is not in git. |

## What must never be committed here

This repository is public. The school registry as actually operated, any verification token, and
any per-school secret stay out of git -- see [`docs/REGISTRY.md`](docs/REGISTRY.md). Only the
example file is tracked.
