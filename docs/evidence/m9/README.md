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
## the ARTIFACT PAGE’s own history (M9 v280 — ADR 0016 amendment 280)

**The gap.** v272 put the trail in the Studio’s toolbar: every entry, newest first, for the author to read. But the toolbar answers "what happened to the publications" and the ARTIFACT PAGE answers "what is this" — and a reader who opens a publication had no way to ask "what happened to THIS one?". The trail’s whole value is that it outlives the row it witnessed (v272’s proof: the publication answers 404 and its entries remain), and the place where that matters most is the publication’s own page.
**Two new modules, both in the shape every lane here has.** `history.ts` is PURE: `historyRowsOf(entries, targetId)` filters the trail to ONE publication (exact match on the target, order preserved — the trail’s order is part of what it asserts) and `renderHistoryHtml(rows, carried)` renders the section. `auditServer.ts` is the server-side half: it reads the service’s `GET /audit` and answers with a REASON rather than a thrown error, because an artifact page that says "the history could not be read" is an honest page and one that throws into a route handler is a 500.
**A failed read does NOT take the page down.** The artifact page reads the publication and the trail independently, and a trail that could not be read leaves the artifact intact with no history section at all. An artifact that 500s because the TRAIL was unreachable would make the publication unreachable for a reason that has nothing to do with it — and an EMPTY history is not inserted, because a heading with nothing under it would read as "this publication has no history", which a failed read knows nothing about.
**The count of the WHOLE answer is stated beside the rows.** The trail is capped, so an old publication’s entries can be past the cap — and a reader must be able to tell "this publication has one entry" from "the answer was cut short before this publication’s entries appeared". The section says both numbers, and says the cap when the two disagree.
**The page says what "no history" does not mean.** A publication published before the trail existed has no entries at all, and the empty state says that — "no audit entries name this publication. That is not the same as ‘nothing happened’". A page that implied nothing happened would be making a claim the service never made.
**The styles travel with the section.** The artifact page’s shell belongs to the PREVIEW renderer; the history is a guest in it, and a guest that assumed it could restyle the host would be a guest that could break the drawing. The section carries its own scoped styles.
**Files.** `apps/studio/src/lib/history.ts` + `history.test.ts` (new — the pure filter and the section, 13 cases), `apps/studio/src/lib/auditServer.ts` + `auditServer.test.ts` (new — the server-side reader, 6 cases), `apps/studio/src/app/p/[projectId]/route.ts` (reads the trail server-side and injects the section).
Measured: `apps/studio` **951/951 (51 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**.
**Bounds (§60).** The trail records what **happened**, and a refused verb is not in it. The page shows only the entries that NAME this publication — an entry names one project id, and a row that named none belongs to no publication. The trail is capped, so an old publication’s entries can be past the cap; the page says so rather than presenting a partial history as complete. The service **verifies nothing** (ADR 0018), so the assurance beside an actor is the entry’s own statement of what the claim was worth. The service offers **no truncation**, and the trail grows forever.
## the trail’s FILTERS and its TALLY (M9 v281 — ADR 0016 amendment 281)

**The gap.** The trail panel (v272) showed every entry, newest first, in one list. That is the honest and complete thing to show — but a reader with a question ("what was taken down?", "how many times was this published?") had to read the whole list and count it themselves. A list that cannot be narrowed is a list that makes the reader do the work the system already did.
**The TALLY, counted from the rows the answer carried.** `trailSummaryOf(rows)` counts publishes, take-downs, and — importantly — an `other` bucket for any action this build does not know. A verb this build does not recognise is NEVER folded into a verb it does: if a `follow` ever arrived (it is in the client’s model, not in the service), a summary that said "3 published" when one was a follow would be a lie. The tally is over ALL the rows, not the filtered ones — the filter narrows the LIST, so a reader can always see what the filter is hiding.
**The FILTERS, in the trail’s own language.** `filterTrailRows(rows, action)` matches on the service’s word (`publish` / `unpublish`), NOT on the display verb ("published" / "took down"): the display verb is a rendering choice, and a filter that matched on it would break the day the wording changed. The panel carries three controls — All, Published, Taken down — and a filter that matches nothing says "no entries of that action" rather than falling back to the whole list.
**THREE numbers in the footer, because there are THREE questions.** What is SHOWN (the filter admits), what could be RENDERED (the reading half accepted), and what the SERVICE says it carried. The last two are the v272 drop-check, unchanged: renderable can never exceed the service’s count, and a smaller number is exactly the discrepancy the footer exists to expose. The first differs from the second whenever a filter is on — which is the filter working, not a discrepancy.
**The proof grades the filter, not just the list.** §9.6 in the real-browser harness: the panel states the tally; the take-down filter shows ONLY take-downs and FEWER rows than the whole trail; the publish filter shows ONLY publishes; and ‘All’ puts every row back — because a filter that could not be undone would be a trap.
**Files.** `apps/studio/src/lib/trail.ts` + `trail.test.ts` (the tally and the filter, +6 cases), `apps/studio/src/components/Toolbar.tsx` (the filter controls, the tally line, the three-number footer, and the `data-trail-action` attribute on each row), `tools/harness/studio-publish.mjs` (a new §9.6).
Measured: `apps/studio` **957/957 (51 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, doc gate **exit 0**.
**Bounds (§60).** The filters narrow the LIST; they do not re-ask the service. The trail the panel holds is the newest window the service returned, and a filter over a window cannot reach past it. The tally counts what the answer carried, not the whole trail — the service’s own count is stated beside it. The service **verifies nothing** (ADR 0018), so the assurance beside an actor is the entry’s own statement of what the claim was worth.
## the SOCIAL verbs join the AUDIT TRAIL (M9 v289 — ADR 0016 amendment 289)

**The gap.** The trail recorded what happened to the PUBLICATIONS — a publish, a take-down — and the three social actions (like, comment, follow) happened to publications too, without a word in the trail. A reader asking “what did people DO with this publication?” had to read the like bar and the comment thread separately, and neither of them was a record: a panel is a view of NOW, and the trail is a record of WHAT HAPPENED.
**The service writes, and the trail’s OWN rules hold for the social verbs.** (1) **Only a SUCCESSFUL mutation is recorded**: a refused like (no account) and a refused comment (blank body) write nothing, and the cases say so. (2) **A mutation that changed NOTHING is not recorded**: a SECOND like finds the row the first one wrote and changes nothing, so it writes nothing — the trail records what HAPPENED, not what was attempted, and a trail that recorded the second like would be recording an attempt. (3) **The write joins the caller’s transaction** (the default propagation, as in v271), so a rolled-back like leaves no entry claiming a like happened.
**The un-verbs are recorded too, and they are NOT folded into the verbs.** A like that is taken back is something that happened, exactly as a publication that is taken down is: the service writes `unlike` and `uncomment`, and the trail’s words are “took the like back” and “removed the comment”. Merging them into the verbs would lose one of the two facts, and a reader asking “did they take it back?” deserves an answer.
**A FOLLOW is NOT in the trail, and the reason is the trail’s own.** The trail’s target is what the event happened TO, and for a publication that is a project id — the panel links it to `/p/<target>`, and the artifact page’s HISTORY filters by it. A follow’s target is an ACCOUNT, and a target field that meant two things would break both readers. The follow is left out and said so, rather than squeezed in where it would lie.
**The client LEARNS the verbs.** The trail’s display words, its tally buckets (`liked`, `unliked`, `commented`, `uncommented`) and its FILTERS all grow with the service: a like has its own bucket rather than falling into “other”, because a tally that called a like “other” would be hiding the very thing the panel is for. And the tally says only the buckets that are NOT zero — a line that always carried every bucket would grow a dozen “0 took down”s and a reader would learn to skip it.
**Files.** `services/nexus-api/src/main/java/dev/nexus/api/social/LikeService.java` (records `like` and `unlike`), `.../social/CommentService.java` (records `comment` and `uncomment`), `.../social/LikeServiceTest.java` and `.../social/CommentServiceTest.java` (the trail’s rules for the social verbs, +5 cases), `apps/studio/src/lib/trail.ts` + `trail.test.ts` (the words, the buckets, the tally text, +4 cases), `apps/studio/src/components/Toolbar.tsx` (the tally line and the Liked / Commented filters), `tools/harness/studio-publish.mjs` (a new §13).
Measured: `apps/studio` **1019/1019 (55 files)**, `tsc -p apps/studio/tsconfig.json` **exit 0**, the service’s social package **48/48** (17 like + 19 comment + 12 follow), doc gate **exit 0**. The real-browser E2E **102/102** with the new §13 (the trail re-read and carrying the social verbs: the tally names them, the rows carry them, and the Liked filter narrows to them).
**Bounds (§60).** A follow is NOT in the trail (its target is an account, and the trail’s target is a publication). The trail records the SOCIAL verbs but not every verb the product has: a moderation action, a report, or a tip would each need a target and a rule before they could be written down, and the service does not invent rules it has no policy for. The trail is still capped and still append-only, and the service still offers **no truncation**. The assurance beside an actor is the entry’s own statement of what the claim was worth (ADR 0018), and nothing here makes it worth more.
