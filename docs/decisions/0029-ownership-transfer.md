# 0029 — A declaration can be given away: ownership is its own append-only chain

- **Status:** Accepted (v579, `POST /tools/{id}/transfer` and `GET /tools/{id}/ownership`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the catalog), 0024 (history), 0025 (deprecation as its own resource), 0028 (the pin)

## Context

A declaration has an owner and every writing door checks it. The owner could not change. The registry's only
answer to "I am handing this tool to another account" was: declare it again under the new owner and remove the
old one — which mints a new id, starts the history at revision 1, invalidates every pin a consumer holds, and
deletes the record of who had been responsible until then. That is the same erasure the revision history and the
deprecation resource exist to prevent, one level up: not "the declaration's words were replaced" but "the whole
declaration was replaced to change a field".

This was a deliberate absence, not an oversight. It needed a decision about what a handover IS.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Door | Keep "declare again, remove the old" | The replacement row is a different declaration: new id, revision 1, new pins, every consumer's build broken, and no record of the previous holder |
| Door | **A transfer door on the existing declaration** | **Chosen** — the id, the name, the history and the pin all survive, because none of them describe the holder |
| Steps | **One step: the current owner names the new one** | **Chosen** — a two-step offer/accept needs an account system that can reach the target and prove it answered. This build has host-declared, unauthenticated account ids (ADR 0018), so an acceptance step would be theatre: there is no channel to ask through and no evidence to accept with |
| Steps | Offer, then accept | Right shape for a build with accounts and a notification channel; deferred to ADR 0018 rather than faked here |
| Record | Rewrite the owner column and say nothing | A column flip erases who was responsible before — the same "a replaced row cannot hold a history" problem ADR 0024 named |
| Record | A revision row | A revision number means "the contract changed". A handover changes not one word of what the declaration says, so writing a revision would make every consumer's "which contract version am I on" answer wrong, and would append a revision whose pin equals its predecessor's |
| Record | **An append-only `tool_ownership` chain: from, to, when** | **Chosen** — ownership is a fact ABOUT a declaration, exactly as deprecation is. One row per accepted handover, nothing ever updated, and the two together ("who held it" + "what it said, when") answer the provenance question |
| Request | Body carries `owner` and `to` | The caller could name a holder it does not control in the body and the check would compare it against itself |
| Request | **`owner` in the query (who holds it now), `to` in the body (who takes it)** | **Chosen** — the same split every other owner-gated write uses: the account is the door's credential, the payload is the change |
| Target | Any legal account id | **Chosen** — accounts are host-declared and this build cannot know whether one "exists". A target that has never declared a tool is a legitimate holder |
| Target | The same account as the current holder | Refused as a 400, not accepted as a no-op: a no-op handover row would put a holder change in the chain that never happened |
| Order | Validate the target, then the caller | A stranger would learn which accounts would be accepted. **The caller is checked against the row's current holder first**, the rule every owner-gated write already follows |
| Chain order | Oldest first | A reader almost always wants the current holder and the last change; the envelope names the current holder anyway, and the window's total says how far back it goes |
| Chain order | **Newest first, current holder in the envelope** | **Chosen** — the same order as the history and the deprecation list, so one paging rule covers all three |
| Removal | Keep the chain when the declaration is removed | A removed declaration has no current holder for a chain to explain — the same rule the revisions follow |
| Undo | A "reverse transfer" door | Transferring back IS the undo, and it leaves both facts on the record instead of erasing the mistake |

## Choice

`POST /tools/{id}/transfer?owner=<current holder>` with `{"to": "<account>"}` answers `200` with the WHOLE
declaration, now naming the new holder — same id, same name, same creation instant, same schema, and the same
`contractSha256`, so a consumer's pin still matches and an `If-None-Match` of it is still a 304. In the same
transaction one `tool_ownership` row is appended (`transfer` scoped to the tool, `from_owner`, `to_owner`,
`transferred_at`) and no revision is written. `GET /tools/{id}/ownership?limit=&offset=` answers that chain,
newest first, with the CURRENT holder and the whole count beside the window. Both are refused by name: a
stranger is a 403 `not-your-tool`, an unknown id a 404 `unknown-tool`, a missing `owner` a 400, a blank or
over-long `to` a 400, and a transfer to the current holder a 400 that says the account already holds it.

## Reason

- **The declaration is the thing being given away, not its contents.** Everything a consumer holds — id, name,
  schema, pin — is a property of the declaration and survives; only the account responsible changes.
- **A grant of authority must be visible afterwards.** Without the chain, the next reader would see a
  declaration that has always belonged to whoever holds it now. The chain is what makes "who was responsible
  when revision 2 was written" answerable: revisions carry instants, handovers carry instants.
- **A handover is not a revision, and saying so keeps two numbers honest.** `revision` counts contract changes;
  `transfer` counts holder changes. Merging them would make both numbers lie about the other.
- **One step is the honest scope.** The door records that two accounts named each other in a handover. It does
  not and cannot prove the receiving account agreed, because this build has no account system to ask (ADR 0018).

## Tradeoffs (stated, not implied)

- **No acceptance, no notification.** An owner can push a declaration onto an account that never asked for it.
  In a build with authenticated accounts that is a real hazard and the reason a two-step handover exists; here it
  is bounded by the fact that account ids are already unauthenticated strings.
- **Not an authorization boundary.** Anyone who can reach the service can already declare a tool under any
  account id. The handover door records intent between the two accounts named; it does not create authority.
- **Append-only, no correction.** A mistaken handover cannot be edited away; the answer is to transfer back,
  which leaves both rows. That is the intended reading of the chain, but it means a typo is permanent.
- **No "tools held by X" beyond the catalog filter.** `GET /tools?owner=` answers it, and a handover moves a row
  between owners there — but there is no separate ownership index and no reverse lookup of past holders.
- **The chain dies with the declaration.** Removing a tool still removes everything about it.
- **No audit entry.** Like every other registry write: a declaration is a catalog fact, not a trail event.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **97/97** (62 service, 35 controller). v579 contributes
  10 service cases and 5 controller cases: the handover writes one chain row and NO revision; the pin is
  unchanged by a change of holder; a stranger is refused and writes nothing; a self-transfer is a 400 and writes
  nothing; a blank target is a 400; a second handover appends `transfer` 2; an unknown tool cannot be
  transferred; the chain is a newest-first window with the whole count and a 404 for an unknown id; removal
  deletes the chain; and the controller refuses a missing owner before touching the service, answers the same
  declaration with its new owner, passes a missing body through so the rule names it, and reports the chain's
  current holder, window, cap and floor.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5b over HTTP: five refusals (stranger,
  missing owner, unknown id, self-transfer, empty target) with psql reading the same holder and zero chain rows;
  the owner's handover answering the same id, name, creation instant, schema and pin, with the pin held across
  it still a 304; the former owner's update, deprecation and removal each 403 with the row and its deprecation
  untouched; the chain naming the current holder and appending the way back as `transfer` 2, newest first, with
  its window reaching `transfer` 1 and `total=2`, the cap and floor reported and an unknown id a 404; and psql
  reading both handovers beside a history still at two revisions and an empty audit table. §6: the chain reads
  back field for field after a restart and `tool_ownership` has exactly five columns.
- **Still not graded, stated:** no acceptance step, no notification, no authorization, no reverse lookup of past
  holders, no correction of a mistaken handover.

## Date

2026-11-03