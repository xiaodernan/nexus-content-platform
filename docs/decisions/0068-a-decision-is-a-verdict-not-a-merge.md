# 0068 — A decision is a verdict, not a merge

- **Status:** Accepted (v869, `POST /pull-requests/{id}/decisions`,
  `GET /pull-requests/{id}/decisions`, `GET /decisions/{id}`, the 30 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-22
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0018 (public reads, no accounts), ADR 0041 (the incident), ADR 0042 (the patch),
  ADR 0067 (the review request), ADR 0016 amendments 547–548 and 577

## Context

Three words of the chain exist: an incident, a patch with its bytes, and an open review request. The
fourth sentence an operator says is **"approved"** — or **"no"**. Without it, a review request is a queue
nobody can drain, and the chain cannot reach the deployment word at all.

The design question is what a verdict IS in a service that owns no repository. It cannot be a merge: there
is no tree to merge into, and a claim that bytes apply would be a verdict this service cannot defend. It can
be a person's judgment, written down: which request, which of two words, why, who, when. That is the atom.

The second question is how a rejection behaves. A rejected patch is neither under review nor approved. It
must become a proposal again — otherwise its review is over but the record says it is still happening, and
the one-open gate would stay closed forever, making the patch un-resubmittable through the same doors.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Storage | Edit the request's status in place, no new table | Who decided, why, and when would be lost; a verdict deserves a row the same way the request did |
| Storage | **A `pull_request_decision` table** | **Chosen** — survives restarts, psql can be asked, and the reviewer's words are kept verbatim |
| Vocabulary | Free text verdict | Nothing can filter on it, and "LGTM" is not a status |
| Vocabulary | **`approved` / `rejected`, matched exactly, no case folding** | **Chosen** — the same discipline as every other closed vocabulary here; `Approved` is refused with the words named |
| The gate | A `count` of decisions followed by an insert | Exactly the race ADR 0067 recorded as a bound, and worse here: two verdicts would be two reviewers' words with no rule to pick one |
| The gate | **`update ... where id = ? and status = 'open'`, and the moved-row count is the answer** | **Chosen** — the predicate lives in the UPDATE, so two concurrent decisions cannot both win; 0 moved rows is 409 `already-decided` |
| A rejection | Leave the patch `submitted` | Describes a review that is no longer happening, and keeps the one-open gate closed forever |
| A rejection | **Return the patch to `proposed`** | **Chosen** — the proposal remains, the review is over, and the same doors accept a resubmission |
| An approval | Move the patch to `approved` | **Chosen** — only a deployment word may move it further |
| The transaction | Request status, patch status, decision row written separately | A reader could see two of the three disagree |
| The transaction | **All three in one `@Transactional`** | **Chosen** — no reader observes a state between them |
| Re-deciding | Let a second verdict overwrite the first | A changed mind is a NEW request, not an edit of the record someone acted on |

## Consequences

**What this buys.** The chain's fourth word is a durable row with six fields, and the chain's cursor now
moves through `proposed → submitted → approved` (or back to `proposed` on a rejection) with the record
written beside every move. The one-open gate from v868 is *resolved by construction* on the decision side:
`closeIfOpen` is a single conditional UPDATE, so the race the previous ADR documented is closed where it
matters most. The window rule is called from `IncidentService` again, not copied.

**What it does not buy.** Nothing is merged, applied or deployed. A decision does not check that the
patch's bytes fit any tree, does not run tests, and does not reserve a deployment. A reviewer cannot change
their mind on the same request: a different verdict is a different request, by design. There is no
authentication (ADR 0018), so anyone who can reach the door may decide. The chain's fifth word is absent on
purpose.

**Measured.** 30/30 unit cases (18 decision service + 9 decision controller + 3 patch approve/revise) and
the live proof `docs/evidence/m9/decision-proof.mjs`: one incident, two patches, two requests; an approval
201 with exactly six fields moved the request and the patch to `approved`; a second verdict 409
`already-decided` with the listing 1 of 1 and cap/skip 100/100 applied to a 150 skip; a rejection 201 moved
the request to `rejected` and the patch back to `proposed`, and a new request on that patch then answered 201;
an unknown request 404 `unknown-pull-request`; a blank, off-vocabulary and over-column verdict 400
`invalid-decision`; an unknown decision 404 `unknown-decision`; a STOP/START that kept both verdicts and
every status; psql reading 2 decisions, the moved statuses, ZERO audit entries and ZERO deliveries.
