# 0067 — A pull request is a request for review, not a merge

- **Status:** Accepted (v868, `POST /patches/{patchId}/pull-requests`,
  `GET /patches/{patchId}/pull-requests`, `GET /pull-requests/{pullRequestId}`, the 25 unit cases and the
  live-PostgreSQL run)
- **Date:** 2026-11-22
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0018 (public reads, no accounts), ADR 0041 (the incident record), ADR 0042 (a patch is
  the bytes an author wrote), ADR 0016 amendments 547–548

## Context

The chain's first two words have landed: an incident can be opened, read and closed, and a patch can be
proposed against it with its bytes stored verbatim. The next sentence an operator says is **"review this"**
— and it has no home. The patch row says what the change is; it does not say that anyone has been asked to
look at it, by whom, or when the asking happened.

The design question is what that sentence IS in a service that owns no checkout. A pull request in a code
host is a promise: "these bytes apply to this tree, and merging will move the tree". This service cannot
make that promise — it has no tree, no merge base, no patcher and no deploy target. What it CAN record is
the request itself: this patch, this one-line purpose, who asked, and the instant the service recorded it.
Everything else the word "pull request" suggests — review comments, approvals, merge commits, CI checks —
is deliberately absent, and this ADR says so rather than implying it.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Storage | A `submitted` status on the patch row only | The status word says review started; it cannot say who asked, what they called the request, or when — and a second request after a future close would overwrite the first answer |
| Storage | **A new `patch_pull_request` table** | **Chosen** — the request is its own record, survives restarts, and psql can be asked what is open |
| The bytes | Copy the diff into the request row | Two answers to one question: the first read would be right and the second would drift; the patch row stays the only home and the request names it |
| The bytes | **`patchId` only, one hop to `GET /patches/{id}`** | **Chosen** — a copy that can disagree is worse than a hop that cannot |
| Status | A many-state machine (open, in-review, changes-requested, approved, merged, closed) | Every state needs a policy for who may enter it; the chain's fourth and fifth words will write approvals and deployments as their own records, and inventing their states early would lock in guesses |
| Status | **One word this slice writes: `open`** | **Chosen** — the smallest honest record; later words move it |
| Requests per patch | Any number may be open | Two open requests make "which one is being reviewed" a question with no answer |
| Requests per patch | **At most one open** | **Chosen** — the gate is a count in the request table, so the invariant lives with the table that owns it |
| The refusal | 400 `invalid-pull-request` | The request may be perfectly well formed; the STATE is what conflicts, and a 400 would send the caller hunting for a typo |
| The refusal | **409 `already-open`** | **Chosen** — names the conflict and points at the request already open |
| The parent | Read the patch lazily and answer an empty window | "This patch was never reviewed" and "there is no such patch" are different answers; an empty window erases the difference |
| The parent | **404 `unknown-patch` before any field is validated** | **Chosen** — a request with no patch is a question about nothing, not a malformed request |
| The chain's cursor | Leave the patch `proposed` while a request is open | Two records would disagree about whether review started |
| The chain's cursor | **Move the patch `proposed → submitted` in the same transaction** | **Chosen** — one transaction writes both, so the disagreement cannot be observed |
| A second request later | A different door for resubmission | A future close will free the count; the same door then works, and the entity's `submit()` is idempotent |

## Consequences

**What this buys.** The chain's third word is now a row: a patch, a title, an optional reason, an optional
opener, the instant the service wrote it, and the status `open`. A reader can see that review has started
from either table — the request exists, and the patch's own status says `submitted` — without a third
record to keep in sync. The listing is scoped to the patch and carries both counts; the window rule
(default 20, cap 100, floor 1, offset floored to the page that contains it) is **called** from
`IncidentService` rather than copied, so the caps cannot drift across three tables.

**What it does not buy.** Nothing is approved, rejected, merged or deployed. A request may never be closed
in this build — the fourth and fifth words are absent on purpose, and a door that looked like them and did
nothing would be worse than an absent one. The patch is not applied, parsed or validated here or anywhere
else (ADR 0042). There is no authentication (ADR 0018), so anyone who can reach the door may ask for a
review.

**The race this slice does not close.** The one-open gate is a `count` followed by an `insert`. Two
concurrent submissions can both read zero and both insert, because no database constraint enforces the
invariant. A partial unique index (`unique (patch_id) where status = 'open'`) is the honest hardening, and
it is deliberately not written here: Hibernate cannot express a partial index portably, and the slice that
adds request closing will know whether the invariant should survive a reopen. Recorded as a bound, not
claimed as a guarantee.

**Measured.** 25/25 unit cases (16 service + 9 controller) and the live proof
`docs/evidence/m9/pull-request-proof.mjs`: one incident, two patches, one request (201, exactly seven
fields, no diff), the patch read back `submitted`, a second request refused 409 with the patch unmoved, the
listing 1 of 1 with cap/skip 100/100 applied to `limit=1000&offset=150`, an unreviewed patch 0 of 0 and
still `proposed`, one request read back unchanged, an unknown patch 404 `unknown-patch`, a blank title and a
2001-character summary 400 naming the rule, an unknown request 404 `unknown-pull-request`, a STOP/START that
left the request and the status in place, and psql reading one open request, the submitted patch, ZERO
audit entries and ZERO deliveries.
