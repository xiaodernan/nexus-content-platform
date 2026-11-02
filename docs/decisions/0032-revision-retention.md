# 0032 — Retention is the owner's, and it must name the bound it keeps

- **Status:** Accepted (v581, `DELETE /tools/{id}/revisions?owner=&before=`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0024 (the history), 0028 (the pin), 0031 (`since`), and the receipt prune (v569)

## Context

Every accepted update appends a revision and nothing removes one. `since` (ADR 0031) made the history cheap to
READ, but not bounded to KEEP: a declaration updated ten thousand times holds ten thousand rows forever, and an
owner has no way to say "I do not need the first nine thousand". The absence was stated rather than implied — the
previous increment's bounds section named it as the next question, because pruning has a consequence no other
registry write has: a **pruned revision is a pin that can no longer be explained**.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Policy | Leave it unbounded | Every accepted update costs a row forever, and the only remedy an owner has is to delete the declaration — which takes the current contract with it |
| Policy | A silent cap at write time (keep the last K) | Silent loss. A consumer's pin would stop being matchable to a revision with nobody told; every number in this build that describes a window exists so that loss is visible |
| Policy | Automatic retention by age (delete older than 90 days) | Needs a scheduler AND a policy nobody stated, and it would fire without an owner in the room. A rule that deletes facts on a timer is a decision, not a default |
| Policy | **The owner names the bound, explicitly, when it wants to** | **Chosen** — the same shape the receipt prune already uses (v569), so the service has ONE story about deleting history: whoever owns it says where to cut, and the answer reports the cut |
| Shape | `before` INCLUSIVE (remove `<=` before) | "Keep everything from revision N" is the sentence an owner reads against the answer; an inclusive bound makes that sentence off by one |
| Shape | **`before` EXCLUSIVE (remove `<` before)** | **Chosen** — `before=2` removes revision 1 and keeps 2 and up, which is what "keep from 2" means |
| Safety | Allow a bound past the newest revision | That removes everything, leaving a declaration whose history explains nothing about the contract it serves — a state no other door creates |
| Safety | **Refuse a bound past the newest; keep at least the newest** | **Chosen** — the newest revision is the contract being served, and the history exists to explain it |
| Safety | Refuse a bound below 1 | There is no revision 0; `before=1` is legal and removes nothing (an honest 0), while `before=0` or less is a 400 |
| Idempotence | 409 on a second identical prune | "Already gone" is not a failure — the rule the removal door follows. The second answer is `pruned: 0` |
| Scope | Prune across every tool by an instant | That is a retention POLICY over an account's whole registry, not a statement about one declaration. It belongs with an account-level door this build does not have |
| Scope | **One declaration at a time, owner-gated** | **Chosen** — the bound is a fact about one history |
| Answer | `{pruned}` only | An owner cannot tell whether the bound did what it meant |
| Answer | **`{toolId, before, pruned, remaining}`** | **Chosen** — the same three numbers the receipt prune answers with: the bound applied, what went, what the log still holds |

## Choice

`DELETE /tools/{id}/revisions?owner=<holder>&before=<n>` removes every revision of that declaration with a number
STRICTLY below `n`, and answers `{toolId, before, pruned, remaining}`. The owner is required before anything is
read and the row's holder is checked before the bound is validated, the order every owner-gated write uses. A
missing `before` is a 400 ("a prune must name the revision it keeps"), a bound below 1 is a 400 ("a revision
number is 1 or more"), a bound past the newest revision is a 400 that names the newest, and an id that names
nothing is a 404. None of the refusals removes a row. Pruning the same bound twice answers `pruned: 0`. A
declaration with no recorded history answers `pruned: 0` rather than refusing a delete of nothing.

## Reason

- **The loss is real and it is named.** After a prune, a consumer holding a pin for revision 1 cannot be told
  which write produced it, because the row is gone. That is why the door cannot be a default, cannot be silent,
  and must answer with what it removed: the owner is the only party who can consent to that loss.
- **The removed set is fully described.** Revisions are a contiguous 1..N sequence and the bound is always a
  cut below one point, so "removed everything below `before`, N rows" names the lost range exactly — the answer
  does not need to enumerate rows it has just deleted.
- **The newest revision is the contract.** A history that keeps nothing cannot explain what is being served;
  refusing a bound past the newest is what stops the door from creating that state.
- **One vocabulary for deletion.** The service already had a prune that names its boundary and reports its cost
  (the receipt log). A second, differently-shaped one would make owners learn the same idea twice.

## Tradeoffs (stated, not implied)

- **A pruned pin is unexplainable.** The current contract's pin is unaffected (it is computed from the
  declaration row), but an old pin can only be answered "that revision is no longer held". The API does not
  pretend otherwise, and nothing records what the pruned revisions SAID.
- **The answer does not enumerate what went.** It names the bound and the count; the identity of each removed
  revision is gone with it.
- **No automatic retention.** Nothing prunes on a schedule; an owner that never prunes keeps everything. The
  table is bounded by the owner's attention, not by a rule.
- **No account-wide prune.** Pruning is per declaration; an account with a thousand tools prunes a thousand
  times.
- **Not an audit event.** Like every other registry write: a declaration's history is catalog state, not a trail
  fact. A prune does not appear in `audit_entry`.
- **A lowered bound cannot be undone.** There is no "restore" door; the rows are deleted, not archived.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **115/115** (74 service, 41 controller). v581
  contributes 8 service cases and 3 controller cases: the delete statement receiving exactly the bound; a bound
  naming the newest revision being allowed; a bound past it refused with nothing deleted; a missing bound; a
  non-positive bound; a stranger refused before the newest revision is even read (it is checked first); an
  unknown tool; and a declaration with no history answering 0. Controller: a missing owner and a missing bound
  each refused before the service is touched, and the answer carrying the bound, what went and what remains.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5c over HTTP with a tool declared for
  the section: three accepted writes make three revisions; six refusals (no owner 400, no bound 400, a bound of
  0 400, a stranger 403, a bound past the newest revision 400 naming it, an unknown id 404) leave all three rows
  in place per psql; the owner's prune of bound 2 answers `before/pruned/remaining = 2/1/2`, the history then
  starts AT revision 2 with `total=2`, psql reads `min(revision)=2`; the same bound again answers `0`; a pin held
  across the prune still answers 304, because removing old revisions does not touch the contract; and the
  section's tool is removed again, taking its remaining history with it so §6 still counts the same four rows.
- **Still not graded, stated:** no restore, no account-wide prune, no automatic retention, no record of what a
  pruned revision said.

## Date

2026-11-03