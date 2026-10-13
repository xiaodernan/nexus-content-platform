# 0018 — Accounts, ownership and publication identity

- **Status:** Proposed (the account MODEL is landed and tested; the enforcement it depends on is not)
- **Date:** 2026-10-14
- **Milestone:** M7 (Community)

## Context

The Studio can publish a document to `services/nexus-api` and read it back (v194, v196), unpublish one
(v196), and remix a publication into a new project (v233). None of that names an author. Every
publication is therefore anonymous and every publication is anybody's to take down: `DELETE
/projects/{id}` checks nothing, and a remix records no lineage to its source. That is stated as an
open bound since v193 and repeated by v233.

M7's remaining surfaces — profiles, follow, likes, comments — all depend on the same missing fact: *who
is this*. The temptation is to build a sign-in form, and the risk is exactly the one §60 forbids: a
`signed in` badge that lets a UI **look** owned while the service enforces nothing.

Two facts constrain the decision:

1. `services/nexus-api` is a Java/Spring service in this repository (ADR 0011's system of record), and
   it is the only party that could ever verify an identity. A claim made in the browser is a claim.
2. There is no account store, no session store and no credential store anywhere in the tree, and
   building one is a security decision, not a UI feature.

## Options

| Option | What it is | Why not |
|--------|-----------|---------|
| **A. OAuth / OIDC via an external IdP** | The Studio redirects to a provider; the service verifies a token | Real authentication, and the only option that is actually secure. Not chosen **now**: it needs an IdP, a client registration, a redirect URI and a token store — and a half-wired one that never validates is worse than none, because it produces a badge |
| **B. Passwords in this service** | Accounts with hashed credentials, sessions, cookies | Deliberately refused. Credential storage is a security surface this repo is not ready to own, and ADR 0013's sandbox model is still Proposed |
| **C. A local, UNSIGNED identity that produces a CLAIM** | The Studio picks a handle, derives a stable id from it, and attaches a `kind: 'owner-claim'` to a publication. The service may later verify it | Chosen. It is honest about what it is, it is verifiable today, and it does not pretend to be authentication |
| **D. Nothing — leave publications anonymous** | Ship M7 without ownership | Rejected. It makes profiles/follow/likes impossible to build honestly, and it is the status quo the bound already describes |

## Decision

**C**, with the boundary drawn in the type system rather than in a comment.

1. **An identity is a handle plus a deterministic device-local id.** `apps/studio/src/lib/accounts.ts`
   is pure (no DOM, no fetch, no cryptography): `normalizeHandle` is the canonical rule, `AccountRegistry`
   is the roster, `createAccountId(handle, deviceSeed)` derives the id. There is no password, no token,
   no session and no signature in the module, and the suite asserts that by reading its own source.
2. **Every record carries `assurance: 'unsigned-local'`, and every claim carries
   `kind: 'owner-claim'`.** A consumer — human or service — reads what an identity is worth from the
   data. `isOwnerClaim` is the service-side shape check: a value that is not shaped like a claim is
   refused, not trusted.
3. **The Studio may ATTACH a claim; it may not ENFORCE one.** The client reserves no names, because a
   reserved list the client enforces and the service does not is a refusal nobody agreed to. Any UI
   that would imply the service agrees is out of scope until the service agrees.
4. **The service is where this becomes real.** A publication's owner field, an owner-checked
   `DELETE`, and a remix that records lineage are service-side changes (v235+, not this record). Until
   they land, the claim is carried and labelled, and nothing depends on it being true.

## Reason

- §60 is the deciding constraint: a claim labelled as a claim is true; a claim labelled as an identity
  is false the moment the service is the only thing that could make it true.
- Landing the model first means the later service change is a **verification** step on a shape that
  already exists, rather than a redesign of the publish contract.
- Determinism (ADR 0010) is preserved: the id is derived from a host-supplied device seed, so the same
  device names the same author twice and a test names a known one.

## Tradeoffs

- **Accepted:** a claim is forgeable by anyone who can call the API. That is stated, not hidden, and it
  is why `assurance` exists.
- **Accepted:** no reserved handles. A handle the client would like to protect (`admin`, `nexus`) is
  protected only when the service protects it.
- **Accepted:** the device seed is per-browser, so the same human on two devices gets two ids until the
  service merges them.
- **Rejected:** any `signedIn` flag, any session, any cookie. Those arrive with option A or B, and not
  before.

## Consequences

- `apps/studio/src/lib/accounts.ts` + `accounts.test.ts` land in v234 (pure core, 10 cases).
- ADR 0016 amendment 234 records the increment; `docs/DEVELOPMENT_PLAN.md` item 27 records the decision
  and the remaining service-side work.
- ADR 0011 is unchanged: `nexus-api` remains the system of record and the only place an identity can
  become verified. This record supersedes nothing.
