# 0026 — The MCP face: advertise the registry, refuse execution

- **Status:** Accepted (v576, `POST /mcp`, the unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (declare, never execute), ADR 0023 (details and the owner's update), ADR 0024 (the
  recorded history)

## Context

M10 names four things: API, MCP, tool registry, webhooks. By v574 three of them exist: the REST API, the
webhook rows this service acts on, and the registry that declares tools without executing them. The fourth
has never been built, and ADR 0022 said so in its own bounds:

> **No execution, no MCP wire face.** This slice registers tools; it does not advertise them over MCP, does
> not validate a call against the stored schema and does not run anything.

The missing half is **discovery**. A registry that only answers a paged REST catalog is usable by a human
with a browser and by a service that already knows the URL; an agent that speaks MCP asks the server what it
can do, and until now there was no answer. The question is what that answer should contain and what it must
refuse, because the obvious "full MCP server" would smuggle back the execution ADR 0022 removed.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Transport | A REST manifest (`GET /tools/manifest`) with an MCP-shaped body | No MCP client speaks it; it would be an advertisement nobody can consume |
| Transport | Streamable HTTP with sessions and SSE | Sessions, reconnects, server-initiated notifications: state this build does not have and cannot honestly keep |
| Transport | **JSON-RPC 2.0 over one `POST /mcp`, request/response only** | **Chosen** — the smallest transport an MCP client actually speaks |
| Methods | `tools/list` alone | A client calls `initialize` first; without it the list is unreachable |
| Methods | **`initialize`, `ping`, `tools/list`, and `notifications/*` accepted with no answer** | **Chosen** — the methods a discovery-only client needs |
| Execution | Implement `tools/call` | The registry has no URL, command or handler (ADR 0022); there is nothing to call |
| Execution | Omit `tools/call` silently | A client would read the absence as a bug; the boundary must be a sentence |
| Execution | **Refuse `tools/call` with `-32601` and a sentence that names the rule** | **Chosen** — execution is refused, not forgotten |
| Capability | Advertise resources/prompts/sampling | None of them exists; an advertised capability is a promise |
| Capability | **`tools.listChanged=false` only** | **Chosen** — the list is static and a client must ask again |
| Pagination | All declarations in one answer | The registry caps a window at 100; an unbounded MCP answer would be a second limit |
| Pagination | **`cursor` = decimal offset, `nextCursor` present only when more rows remain** | **Chosen** — the same cap, a cursor that stops |
| Errors | HTTP status per refusal | A JSON-RPC error is a protocol ANSWER, not an HTTP failure |
| Errors | **HTTP 200 with an `error` envelope; only a body that is not JSON fails at HTTP** | **Chosen** — Spring's 400 is the structural boundary, stated |
| Notifications | Answer 200 with an empty result | JSON-RPC forbids answering a notification |
| Notifications | **202 with no body** | **Chosen** — "accepted, nothing to say" |
| State | A session table, a cursor table, an `mcp_*` table | A read of the registry needs no memory; a table would be a lifetime to manage |
| State | **None** | **Chosen** — a restart answers the same questions |
| Auth | Any authentication | The catalog is already public; MCP does not become a second access model |
| Write path | A `tools/register` MCP method | Declaration stays on the REST door; MCP here is read-only |

## Choice

One door, four request shapes:

- **`POST /mcp`** takes one JSON-RPC 2.0 object (`content-type: application/json`) and answers one object.
  A batch, a wrong `jsonrpc`, a missing `method` or an id that is not a string/number/null is `-32600`.
  A body that is not JSON at all is Spring's HTTP 400 before the controller.
- **`initialize`** answers `protocolVersion: "2025-06-18"`,
  `capabilities: {tools: {listChanged: false}}`, `serverInfo: {name: "nexus-api", version: "0.1.0"}` and
  `instructions` that say in one sentence that the server advertises declarations and refuses execution.
- **`ping`** answers `{}`.
- **`tools/list`** maps the SAME declarations the REST catalog serves, name ascending, to
  `{name, description, inputSchema}` — description is the stored `summary`, inputSchema is the stored schema
  parsed back. It is paged at 100 (the registry's own cap); `nextCursor` is the decimal offset of the next
  page and is absent on the last page. A cursor that is not a decimal offset is `-32602`.
- **`tools/call`** is refused with `-32601`: "the registry DECLARES tools and this build does not execute
  them — there is no URL, command or handler to call". The refusal is the method's whole behavior.
- **`notifications/*`** (a request with no `id`) is accepted with HTTP 202 and no body; an ordinary method
  sent without an id is `-32600`.

Nothing is stored. There is no `mcp` table, no session, no cursor table and no audit entry: reading the
registry is not a fact in the world, and the face keeps no memory of having been read.

## Reason

- **Discovery is the half a declaration cannot supply by itself.** A tool's name and schema are useful only
  to a caller that can find them; `tools/list` is that finding, over the protocol the caller already speaks.
- **One catalog, not two.** The list is `ToolService.catalog` and the descriptors are the stored rows; there
  is no second table of advertised tools that could drift from what the REST doors serve.
- **The refusal is the feature.** `tools/call` is the one method that would turn a registry into an executor.
  Returning `-32601` with a sentence keeps the boundary visible to a client and to the next reader of the
  code, which silence or a stub would not.
- **A stateless read survives a restart.** The live proof restarts the JVM and asks the same questions; the
  answers come from the registry, not from a session that happened to still be open.
- **The protocol version is declared, not echoed.** A server that mirrors whatever version a client asks for
  is claiming an implementation it may not have; this build names the revision it speaks.
- **The write path stays on REST.** MCP clients can discover; they cannot declare, update, deprecate or
  remove. Those are owner acts with ownership checks (ADR 0022/0023), and duplicating them here would create
  a second authorization surface.

## Tradeoffs (stated, not implied)

- **No streaming and no server-initiated messages.** `POST /mcp` is one request and one answer: no SSE, no
  `GET /mcp`, no progress notifications, and `listChanged=false` because a declaration does not announce
  itself.
- **No execution, by design and by name.** `tools/call` is `-32601` for every name, including a registered
  one. There is no schema validation of arguments, no result, no cancellation and no progress.
- **No resources, prompts, sampling, logging or completions.** The only capability is `tools`, and its list
  is static.
- **The cursor is an offset, not a snapshot.** A declaration inserted between two pages can shift a later
  page; a reader that needs a consistent view asks again. The alternative (a snapshot cursor) would be state,
  and this face has none.
- **No `_meta`, annotations, `outputSchema` or titles.** An advertised tool is exactly the three fields the
  registry stores; the registry has no place for the others, and the face does not invent one.
- **The protocol revision is fixed at `2025-06-18`.** A client asking for another version is answered with
  this one; there is no negotiation table and no compatibility layer.
- **Malformed JSON is HTTP 400, not `-32700`.** The body never reaches JSON-RPC parsing; the bound is the
  framework's, and it is named here rather than papered over.
- **No filtering over MCP.** The REST catalog's optional `owner` narrowing is not exposed; `tools/list`
  always answers the whole (paged) registry.
- **No auth.** The same public rule as every registry read (ADR 0018: the owner is host-declared).
- **Not graded against a real MCP client SDK.** The proof speaks the wire format directly; interoperability
  with a named SDK is not claimed.

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **618/618 in 31 classes**, exit 0. v576
  contributes 20 cases: 11 service (initialize's protocol/capability/instruction; the descriptors and the
  absence of capability fields; the cursor reaching page two and stopping; four illegal cursors refused
  before any read; non-object params; `tools/call` refused with no registry read; an unknown method naming
  itself; ping's empty result; a notification accepted only when it is one; a cursor naming an empty page;
  an empty registry answering no cursor) and 9 controller (initialize's echoed id; tools/list with a string
  id; a refused call staying HTTP 200 with the error envelope; a notification answering 202 and no body; an
  ordinary method without an id refused; a batch refused before the service; a wrong version and a missing
  method refused; an illegal id answered with JSON null; an explicit null id treated as a request, not a
  notification).
- `docs/evidence/m10/mcp-face-proof.mjs` (`npm run verify:mcp`) — builds the service, starts it against a
  throwaway `pgvector/pgvector:pg16`, declares two tools over REST, then speaks MCP: §3 `initialize` names
  the protocol and the one capability, `ping` answers `{}`, a notification is 202 with no body; §4
  `tools/list` advertises both declarations name-ascending with exactly `name`/`description`/`inputSchema`,
  and the description/schema equal the REST catalog's; §5 101 declarations answer 100 + `nextCursor "100"`,
  then the last row with no cursor; §6 `tools/call` is `-32601`, an unknown method `-32601`, and a batch /
  wrong version / missing method / ordinary-method-as-notification are `-32600`, a malformed body is HTTP
  400, and `psql` reads zero `audit_entry`, zero `webhook_delivery` and zero tables named `mcp%`; §7 a
  second JVM answers the same pages and the same refusal; §8 tears down.
- **Still not graded, stated:** no real MCP client SDK, no SSE, no server-initiated notification, no
  `tools/call`, no argument validation, no auth, no resources/prompts/sampling, no protocol negotiation
  beyond naming the revision.

## Date

2026-11-02
