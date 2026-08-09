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

Scaffolding. The contract, the registry format and the verification rules are settled; no
application code has been written yet. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Repository layout (planned)

| Path | Purpose |
| --- | --- |
| `docs/` | The contract, the registry format, and the operating runbook. |
| `registry.example.json` | The shape of the school list. The real one is not in git. |

## What must never be committed here

This repository is public. The school registry as actually operated, any verification token, and
any per-school secret stay out of git -- see [`docs/REGISTRY.md`](docs/REGISTRY.md). Only the
example file is tracked.
