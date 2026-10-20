# M9 evidence — the ops line

M9 is NEXUS Ops: the observability the repository has owed since the ROADMAP's first line ("observability").
The service half of it landed in v271 — the audit trail — and the reading half in v272. What is graded here is
the **contract between the two**: the client's own model and the service's own wire, read from the source
files that define them.

## `audit-contract-proof.mjs` (M9 v273 — ADR 0016 amendment 273)

```
node docs/evidence/m9/audit-contract-proof.mjs
```

It needs **nothing but Node** — no Java, no Maven, no Docker, no database, no running service. That is not a
shortcut; it is the point. The claim being graded is a claim about **two source files**, so the two source
files ARE the fixture:

| § | what it proves |
| --- | --- |
| 1 | the service's wire record has **six fields, in order**, read out of the Java `record` — and the instant is a `long`, so epoch **milliseconds** |
| 2 | the client's model declares the **same six fields, in the same order, all required** |
| 3 | the two fields that are **nullable on the wire are nullable in the client** — `actorId` and `assurance` |
| 4 | the four fields that are **not** nullable on the wire are **not** nullable in the client — the fix widened two fields, not all six |
| 5 | the client's own type **accepts what the service really sends** — an anonymous entry (`actorId: null`, `assurance: null`), a named one, and a verb this build has never heard of — checked by the **TypeScript compiler itself**, over the **shipped** `ops.ts` |
| 6 | an anonymous entry belongs to **no account**: it lands in the reserved `__anonymous__` bucket, never in a real account's |

### Why it is worth a file

v271 built the service's door and shipped a client model beside it that **disagreed** with it on the two
fields that matter most: the service sends `null` for an anonymous action, and the client's `AuditEntry`
declared both non-null. The service refused to fake an actor to fit a type, and the client model's own
docstring had to admit it — "the one place the client's `ops.ts` type is wrong (`actorId` declared
non-null)". A type that is wrong in a comment is still wrong.

The proof reads the field list **out of the source** rather than restating it. A proof that compares a
hand-written list with a hand-written list proves only that two people typed the same thing; this one
parses the Java `record` and asks the TypeScript compiler what the interface means, so a change on either
side has to change the other.

### It has been shown to FAIL

A green proof nobody has seen go red is decoration. Three mutations were run against it, and each is caught
by a **different** section:

| mutation | caught by | the message |
| --- | --- | --- |
| `actorId: AccountId \| null` → `AccountId` | **§3** | `AuditEntry.actorId must accept null — the service sends null for an anonymous action, and a type that refuses null is a type the service has to lie to satisfy` |
| `assurance: Assurance \| null` → `Assurance` | **§3** | the same, for the assurance |
| the `string & Record<never, never>` arm removed from `AuditAction` | **§5** | `Type '"stake"' is not assignable to type 'AuditAction'` — the compiler, not a hand-written imitation of it |

§3 catches the narrowing of the two nullable fields; §5 catches a type that is closed to the verbs a
**separate deployable** may add. Neither would be caught by the other.
