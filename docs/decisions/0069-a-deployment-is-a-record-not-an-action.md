# 0069 — A deployment is a record, not an action

- **Status:** Accepted (v870, `POST /pull-requests/{id}/deployments`, `POST /deployments/{id}/complete`,
  `GET /pull-requests/{id}/deployments`, `GET /deployments/{id}`, the 38 unit cases and the live-PostgreSQL
  run)
- **Date:** 2026-11-22
- **Milestone:** M9 (NEXUS Ops) — the chain's last word
- **Builds on:** ADR 0018 (public reads, no accounts), ADRs 0041, 0042, 0067, 0068, and ADR 0016
  amendments 547–548, 577–578

## Context

The chain now runs four words deep: incident, patch, review request, verdict. The last sentence an operator
says is **"deploy it"** — and this service owns no cluster, no registry, no host and no target environment.
The one thing it must never do is claim a deployment happened.

So the last word splits into the only two honest acts available:

1. a caller **requests** a deployment of an APPROVED review request — this service records the request;
2. later, a deployer **reports** what they observed (`succeeded` / `failed`), with their own name and
   account — this service records the report, and `reportedBy` says whose claim it is.

Everything else the word "deployment" suggests — artifacts, digests, rollouts, health checks, rollbacks —
is deliberately absent, and this ADR says so rather than implying it.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| What is recorded | A single "deployment" row written at request time | It would have to guess the outcome, or stay permanently true-looking; a request is not a result |
| What is recorded | **A request row, completed later by a report** | **Chosen** — two facts, two instants, two authors; nothing is invented |
| The outcome | The service declares success | It cannot observe a deployment it did not perform; that is the exact lie to avoid |
| The outcome | **The deployer reports `succeeded` / `failed`, named** | **Chosen** — the claim has an author beside it |
| The gate | Any review request may be deployed | An open request has no verdict; a rejected one has a verdict that says no |
| The gate | **Only `approved` — 409 `not-approved`** | **Chosen** — the state conflicts, the syntax did not |
| Environments | Free text | Nothing can filter on it, and it invites a typo'd target |
| Environments | **`staging` / `production`, matched exactly** | **Chosen** — the closed-vocabulary discipline of every other word here |
| Completion | Overwrite the row on each attempt | The history of attempts would be lost, and a retry cannot be told from the first try |
| Completion | **Once, via a conditional UPDATE; a retry is a NEW record** | **Chosen** — `status = 'requested'` lives inside the UPDATE, so two concurrent reports cannot both complete it; 0 moved rows is 409 `already-completed` |
| The cursor | Move the patch on any report | A failed attempt is a fact about an attempt, not about the patch |
| The cursor | **Move the patch to `deployed` only on a reported success** | **Chosen** — the approval stays true after a failure, and the retry is a new record |
| The parent | Store only `pullRequestId` | Completion must move the patch; a join whose parent could be walked away from is worse than one immutable value |
| The parent | **Store `patchId` beside it at request time** | **Chosen** — both values are immutable, so the second is a shortcut, not a duplicate that can drift |

## Consequences

**What this buys.** The chain is complete and every word is a row a reader can inspect: an incident with a
life, a patch that keeps its bytes, a review request, a verdict, and a deployment with a reported outcome and
its reporter. The patch's cursor now runs `proposed → submitted → approved → deployed`, moving backwards only
on a rejection, and a failed deployment leaves it approved. The completion gate is an atomic UPDATE, the same
discipline v869 established for verdicts.

**What it does not buy.** Nothing is deployed. No artifact, image, digest or host is recorded or checked; the
service never contacts `staging` or `production`. The outcome is the reporter's claim. There is no
authentication (ADR 0018), so anyone who can reach the door may request a deployment or report one. An
already-completed record cannot be amended — that is deliberate, and a correction is a new record.

**Measured.** 38/38 unit cases (24 deployment service + 11 deployment controller + 3 patch deploy) and the
live proof `docs/evidence/m9/deployment-proof.mjs`: the chain ran five words deep twice; a deployment 201
with exactly ten fields and three nulls; an open and a rejected request 409 `not-approved` storing nothing; a
reported success 200 with finish time/reporter/outcome moving the patch to `deployed`; a second report 409;
the listing 1 of 1 with cap/skip 100/100; a reported failure leaving the patch approved; an unknown request
404 `unknown-pull-request`, an unknown record 404 `unknown-deployment`, three malformed bodies 400
`invalid-deployment`; a STOP/START that kept both records and every status; psql reading 2 deployments, the
moved patch statuses, ZERO audit entries and ZERO deliveries.
