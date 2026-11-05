package dev.nexus.api.tools;

import dev.nexus.api.tools.ToolDtos.AttestRequest;
import dev.nexus.api.tools.ToolDtos.Attestation;
import dev.nexus.api.tools.ToolDtos.ContractDiff;
import dev.nexus.api.tools.ToolDtos.ContractSide;
import dev.nexus.api.tools.ToolDtos.SchemaDiff;
import dev.nexus.api.tools.ToolDtos.DeprecateRequest;
import dev.nexus.api.tools.ToolDtos.Deprecation;
import dev.nexus.api.tools.ToolDtos.DeprecationList;
import dev.nexus.api.tools.ToolDtos.DeprecatedTool;
import dev.nexus.api.tools.ToolDtos.OwnershipChain;
import dev.nexus.api.tools.ToolDtos.PinBatch;
import dev.nexus.api.tools.ToolDtos.PinMatch;
import dev.nexus.api.tools.ToolDtos.PinMatches;
import dev.nexus.api.tools.ToolDtos.PruneJournalAnswer;
import dev.nexus.api.tools.ToolDtos.PruneRevisionsAnswer;
import dev.nexus.api.tools.ToolDtos.ReplacementChainAnswer;
import dev.nexus.api.tools.ToolDtos.ReplacementChainStep;
import dev.nexus.api.tools.ToolDtos.RevisionAtPin;
import dev.nexus.api.tools.ToolDtos.OwnershipTransfer;
import dev.nexus.api.tools.ToolDtos.RegisterRequest;
import dev.nexus.api.tools.ToolDtos.TransferRequest;
import dev.nexus.api.tools.ToolDtos.Tool;
import dev.nexus.api.tools.ToolDtos.ToolBatch;
import dev.nexus.api.tools.ToolDtos.ToolChangeList;
import dev.nexus.api.tools.ToolDtos.ToolChangeView;
import dev.nexus.api.tools.ToolDtos.ToolList;
import dev.nexus.api.tools.ToolDtos.ToolRevisionList;
import dev.nexus.api.tools.ToolDtos.ToolRevisionView;
import dev.nexus.api.tools.ToolDtos.UpdateRequest;
import dev.nexus.api.tools.ToolDtos.WithdrawAttestationAnswer;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * M10 v571–v588 — the HTTP surface for the tool registry. Nineteen doors, and the differences between them are the
 * rules:
 *
 * <ul>
 *   <li>{@code POST /tools} — declare a tool. 201, and the answer is the row: its id, owner, name, summary,
 *       canonical schema and creation instant.
 *   <li>{@code GET /tools?owner=&q=&deprecated=&tested=&after=&limit=&offset=} — the catalog, name ascending.
 *       The optional owner narrows the window to one account's declarations; the optional {@code q} narrows it
 *       to declarations whose NAME or SUMMARY contains that text, case-insensitively and with LIKE wildcards
 *       treated literally; the optional {@code deprecated} answers only the declarations that carry a
 *       deprecation (true) or only those that do not (false); the optional {@code tested} does the same for an
 *       owner's attestation, with the bound that it names the CLAIM and not its currency (v589). All four
 *       compose, and the count is the whole (narrowed) number, so a window can say what it is hiding.
 *   <li>{@code GET /tools?after=} — a KEYSET page: the rows whose NAME sorts after the name the caller last
 *       saw. Offset paging is a position in a list writes can change, so a registration or a removal between
 *       two pages can repeat a row or skip one; a name cursor cannot. {@code after} is a VALUE, not an id - a
 *       name that holds nothing still bounds the window - and it is refused together with a non-zero offset,
 *       because two cursors over one window is how a page skips a row while looking correct (v613).
 *   <li>{@code GET /tools/changes?since=&limit=&offset=} — the registry's JOURNAL, oldest first from a cursor: one
 *       entry per accepted write (declared, updated, transferred, deprecated, undeprecated, removed). It is the
 *       only read that can name a declaration whose row is gone, and the only one that faces forward.
 *   <li>{@code DELETE /tools/changes?before=} — the journal's RETENTION door: remove only the prefix BELOW a
 *       named seq, answer the oldest entry still retained, and refuse a cursor below it with 410. A middle
 *       range is never deletable, because a forward cursor cannot describe the hole (v621).
 *   <li>{@code GET /tools/{id}} — one declaration by id. A public read, like the catalog; an id that names
 *       nothing is a 404 rather than an empty row. The answer carries the contract's PIN as a field and as a
 *       strong {@code ETag}, so an {@code If-None-Match} of the pin the caller holds is a 304 with no body.
 *   <li>{@code GET /tools/by-name/{name}} — one declaration by its GLOBAL name. The name is the key every
 *       agent shares, so it deserves a direct read rather than a paged catalog; a malformed name is a 400
 *       that names the rule, and a well-formed name that holds no row is a 404. Same pin, same conditional
 *       read as the read by id.
 *   <li>{@code GET /tools/{id}/revisions?since=&limit=&offset=} — the declaration's recorded history, newest first:
 *       what it SAID at each accepted write, with the whole count beside the window. The optional
 *       {@code since} asks only for what came AFTER a revision the caller already has, and narrows the count
 *       with it. A public read; an id that names nothing is a 404 rather than an empty history.
 *   <li>{@code GET /tools/{id}/at?pin=} — the declaration AS IT WAS at one pin: the recorded revision whose own
 *       bytes hash to the 64-hex pin the caller holds, with {@code current} saying whether that is still the
 *       contract served today. An absent or malformed pin is a 400; a well-formed pin this declaration never
 *       recorded (or retention removed) is a 404 under its own name, {@code unknown-pin}.
 *   <li>{@code GET /tools/pins?pin=&pin=…} — a MANIFEST of pins in ONE read: the declarations behind every
 *       pin the caller named, with the unrecorded pins NAMED rather than the whole request failing (v616).
 *   <li>{@code GET /tools/by-pin/{pin}} — the GLOBAL question a pin can be asked: every declaration whose
 *       recorded history carries those bytes, newest carrying revision per declaration, {@code current}
 *       derived. A pin names CONTENT, so identical declarations all answer (v615).
 *   <li>{@code GET /tools/{id}/diff?from=&to=} — what changed between two contracts of ONE declaration,
 *       named by the pins the caller holds: both sides' revision/summary/pin/instant, whether the sentence
 *       changed, and the SCHEMA paths that differ as RFC 6901 pointers. An absent {@code to} means the
 *       contract served now; a diff names WHERE, and {@code /tools/{id}/at} turns either pin back into the
 *       bytes (v614).
 *   <li>{@code PUT /tools/{id}?owner=} — REPLACE a declaration's summary and schema, for its owner only. The
 *       name, owner, id and creation instant cannot change: an update changes what a declaration SAYS, not
 *       which declaration it is.
 *   <li>{@code DELETE /tools/{id}?owner=} — remove a declaration, for its owner only. 200 either way: an id
 *       that names nothing is "already gone", not an error; another account's row is a 403.
 *   <li>{@code POST /tools/{id}/deprecation?owner=} — say a declaration is going away, for its owner only,
 *       with a message and an optional replacement NAME (a hint, not a reference). Every deprecation answer
 *       also carries the DERIVED replacement state: none, unresolved, live or deprecated.
 *   <li>{@code GET /tools/{id}/deprecation} — one declaration's deprecation. 404 {@code unknown-tool} when
 *       the id names nothing, and a DIFFERENT 404 {@code not-deprecated} when the tool is live.
 *   <li>{@code DELETE /tools/{id}/deprecation?owner=} — withdraw the deprecation, for its owner only.
 *       200 with {@code removed:false} when the tool was not deprecated.
 *   <li>{@code GET /tools/{id}/replacement-chain} — follow the warning's replacement hints to their END: every
 *       declaration reached, and one outcome — live, none, unresolved, cycle (named) or depth (v622).
 *   <li>{@code GET /tools/deprecations?owner=&replacementStatus=&limit=&offset=&before=} — every deprecated
 *       declaration, newest
 *       first, with the tool's name beside its deprecation so an agent can read the whole warning list in one
 *       request. {@code owner} narrows the window and the count; {@code before} is the last row of the previous
 *       page as {@code <epochMillis>:<toolId>}, because instants can tie (v617). The two compose (v618), and
 *       each row resolves its replacement hint in one batch so a migration list is actionable in one read.
 *       {@code replacementStatus} selects one or more of none, unresolved, live or deprecated as a
 *       comma-separated list (v623), narrowing the window and the count alongside the other two; the echoed
 *       value is canonical — blanks dropped, duplicates collapsed, first-seen order kept.
 *   <li>{@code DELETE /tools/{id}/revisions?owner=&before=} — the owner's RETENTION: remove the revisions strictly
 *       older than {@code before}, and answer the bound, what went and what remains. A bound past the newest
 *       revision is a 400, because a declaration whose history explains nothing is not a state this door creates.
 *   <li>{@code POST /tools/{id}/transfer?owner=} — HAND THE DECLARATION OVER, for its current owner only, to
 *       the account named in the body. Same id, same name, same history, same pin; the handover is recorded in
 *       the declaration's chain of holders instead of a revision, because nothing it says changed.
 *   <li>{@code GET /tools/{id}/ownership?limit=&offset=} — that chain, newest first, with the CURRENT holder
 *       named beside the window. A public read; an id that names nothing is a 404.
 * </ul>
 *
 * <p>There is no door that EXECUTES a tool and no door that records an invocation. A tool is declared here so
 * another agent can read the catalog; the registry does not call out, because a declaration has no endpoint
 * to call and this build does not pretend it does.
 */
@RestController
@RequestMapping("/")
public class ToolController {

    private final ToolService service;

    public ToolController(ToolService service) {
        this.service = service;
    }

    /** Declare a tool. 201 when the row was made. */
    @PostMapping("/tools")
    public ResponseEntity<Tool> register(@RequestBody RegisterRequest request) {
        ToolEntry row = service.register(
                request == null ? null : request.owner(),
                request == null ? null : request.name(),
                request == null ? null : request.summary(),
                request == null ? null : request.inputSchema());
        return ResponseEntity.status(201).body(toWire(row));
    }

    /**
     * v583 — the registry's JOURNAL, oldest first, from a cursor: everything that happened after {@code since}.
     *
     * <p>This is the only read here that can name a declaration WHOSE ROW IS GONE: a removal deletes every table
     * a reader could have asked, so the journal keeps the id, the name and the fact. It is also the only read
     * that faces FORWARD — a cursor-moving poller must not have new writes appear behind it.
     *
     * <p>{@code since} is 0 when absent, which is "from the beginning" rather than "no filter": the feed has no
     * two-state absence, because 0 is a real position before the first entry. A negative cursor is a 400.
     * After a retention prune, 0 reads the oldest entry still held; only a POSITIVE cursor below the retained
     * boundary is 410 (v621), because no poller can hold 0 - the journal's seqs start at 1.
     *
     * <p>v584 — two NARROWINGS for a watcher that does not want the whole registry: {@code kind} (one of the six
     * words, refused BY NAME when it is not) and {@code toolId} (one declaration's entries). Both narrow the page
     * AND the count. A {@code toolId} that names nothing is an EMPTY feed rather than a 404: the journal records
     * what was, so an id whose row is gone is exactly what it may still hold.
     */
    @GetMapping("/tools/changes")
    public ResponseEntity<ToolChangeList> changes(
            @RequestParam(name = "kind", required = false) String kind,
            @RequestParam(name = "toolId", required = false) String toolId,
            @RequestParam(name = "since", required = false) Long since,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        long cursor = since == null ? 0L : since;
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        String changeKind = ToolService.normalizeChangeKind(kind);
        String tool = ToolService.normalizeOwner(toolId);
        List<ToolChangeView> rows = service.journal(changeKind, tool, cursor, asked, from).stream()
                .map(this::toWire)
                .toList();
        return ResponseEntity.ok(new ToolChangeList(
                cursor,
                changeKind,
                tool,
                rows,
                service.journalCount(changeKind, tool, cursor),
                effective,
                from));
    }

    /**
     * v621 — the registry's JOURNAL RETENTION door: remove every entry strictly BELOW {@code before}.
     *
     * <p>The journal grows by one row per accepted write and had no prune. A cursor moving forward cannot
     * describe a hole in the middle of the feed, so the only shape this door accepts is a PREFIX: entries at
     * or above the bound stay, and the oldest one that stays is the boundary every later read names. A missing
     * or non-positive bound is a 400 that removes nothing; so is a bound above the newest entry, which would
     * leave a feed with no boundary to describe. A bound that removes nothing answers {@code pruned: 0}: the
     * "already gone is not a failure" rule the revision prune follows.
     */
    @DeleteMapping("/tools/changes")
    public ResponseEntity<?> pruneJournal(
            @RequestParam(name = "before", required = false) Long before) {
        if (before == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the before parameter is missing — a prune must name the entry it keeps"));
        }
        JournalPrune pruned = service.pruneJournal(before);
        return ResponseEntity.ok(new PruneJournalAnswer(
                pruned.before(), pruned.pruned(), pruned.oldest(), pruned.remaining()));
    }

    /**
     * v587 — several declarations by id in ONE request: the shape a caller has after reading the feed.
     *
     * <p>The ids travel as REPEATED {@code id} parameters rather than one comma-separated string, because an id is
     * an opaque string and a separator would invent an escaping rule the id space does not have. Blanks are
     * dropped, duplicates collapse, and the answer keeps the order the caller named — a batch answer is a list the
     * caller can zip with the list it sent.
     *
     * <p>An id that holds nothing is NOT a 404: this is a read of a list, not of one row. The answer says how many
     * distinct ids it looked for, how many it found, and names the ones it did not, so a caller can tell a gap in
     * its own list from an empty registry.
     */
    @GetMapping("/tools/batch")
    public ResponseEntity<ToolBatch> batch(
            @RequestParam(name = "id", required = false) List<String> ids) {
        List<String> wanted = ToolService.normalizeIds(ids);
        Map<String, ToolEntry> held = new java.util.HashMap<>();
        for (ToolEntry row : service.batch(wanted)) {
            held.put(row.getToolId(), row);
        }
        List<Tool> tools = wanted.stream()
                .filter(held::containsKey)
                .map(held::get)
                .map(this::toWire)
                .toList();
        List<String> missing = wanted.stream().filter(id -> !held.containsKey(id)).toList();
        return ResponseEntity.ok(new ToolBatch(wanted.size(), tools.size(), tools, missing));
    }
    /**
     * The catalog. A missing or blank {@code owner} is the WHOLE registry rather than a refusal: this is a
     * read of a public catalog, and there is no ownership to enforce on it.
     */
    @GetMapping("/tools")
    public ResponseEntity<ToolList> list(
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "deprecated", required = false) Boolean deprecated,
            @RequestParam(name = "tested", required = false) Boolean tested,
            @RequestParam(name = "after", required = false) String after,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        String filter = ToolService.normalizeOwner(owner);
        String search = ToolService.normalizeQuery(q);
        String key = ToolService.normalizeAfter(after);
        List<Tool> rows = service.catalog(owner, q, deprecated, tested, after, asked, from).stream()
                .map(this::toWire).toList();
        return ResponseEntity.ok(new ToolList(filter, search, deprecated, tested, key, rows,
                service.countOf(owner, q, deprecated, tested), effective, from));
    }

    /**
     * One declaration by id. A public read, like the catalog; an id that names nothing is a 404.
     *
     * <p>The answer carries the contract's PIN both as a field and as a strong {@code ETag}, so a caller that
     * already holds this contract can ask to be told only when it changes: an {@code If-None-Match} of the pin
     * it holds answers 304 with no body. Existence is settled FIRST — an unknown id is a 404 whether or not the
     * caller sent a tag, because 304 would claim the caller's copy is current when there is no copy.
     */
    @GetMapping("/tools/{toolId}")
    public ResponseEntity<Tool> read(
            @PathVariable String toolId,
            @RequestHeader(name = "If-None-Match", required = false) String ifNoneMatch) {
        return answer(service.get(toolId), ifNoneMatch);
    }

    /**
     * One declaration by its global NAME, the key every agent shares.
     *
     * <p>This mapping is more specific than {@code /tools/{id}} and therefore wins for the literal segment
     * {@code by-name}; an id can never be the string "by-name..." in practice, and the ordering is declared in
     * the live proof rather than assumed.
     */
    @GetMapping("/tools/by-name/{name}")
    public ResponseEntity<Tool> readByName(
            @PathVariable String name,
            @RequestHeader(name = "If-None-Match", required = false) String ifNoneMatch) {
        return answer(service.getByName(name), ifNoneMatch);
    }

    /**
     * Deprecate a declaration: say it is going away, and optionally name what replaces it.
     *
     * <p>The owner is REQUIRED before anything is read and checked before either field. The message is one
     * trimmed sentence; the replacement is a legal tool name that is not this tool, and it need not hold a
     * row because a successor may be declared later.
     */
    @PostMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<?> deprecate(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) DeprecateRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may deprecate a tool"));
        }
        ToolDeprecation row = service.deprecate(
                toolId,
                owner,
                request == null ? null : request.message(),
                request == null ? null : request.replacement());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * One declaration's deprecation. A tool that is live is a 404 NOT-DEPRECATED, and the handler below
     * answers it under that name rather than pretending the tool does not exist.
     */
    @GetMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<Deprecation> deprecation(@PathVariable String toolId) {
        return ResponseEntity.ok(toWire(service.deprecationOf(toolId)));
    }

    /**
     * v622 — follow this declaration's replacement hints to the END of the chain.
     *
     * <p>A single warning says only what the NEXT successor is; a consumer deciding whether to migrate needs
     * to know where the walk stops. The answer names every declaration it reached and one outcome:
     * {@code live} (a declaration with no warning), {@code none} (a warning with no successor), {@code
     * unresolved} (a hint nobody declared), {@code cycle} (a name already walked, also named in
     * {@code cycleTo}) or {@code depth} (the walk reached its bound). A tool with no warning is the existing
     * 404 not-deprecated, not an empty chain.
     */
    @GetMapping("/tools/{toolId}/replacement-chain")
    public ResponseEntity<ReplacementChainAnswer> replacementChain(@PathVariable String toolId) {
        ReplacementChain chain = service.replacementChain(toolId);
        return ResponseEntity.ok(new ReplacementChainAnswer(chain.toolId(), chain.name(), chain.outcome(),
                chain.cycleTo(),
                chain.steps().stream()
                        .map(step -> new ReplacementChainStep(step.toolId(), step.name(), step.deprecated(),
                                step.replacement(), step.replacementStatus()))
                        .toList()));
    }

    /**
     * Withdraw a deprecation. Owner required; 200 with {@code removed:false} when the tool was not deprecated,
     * the same "already gone is not an error" shape the removal door uses.
     */
    @DeleteMapping("/tools/{toolId}/deprecation")
    public ResponseEntity<Map<String, Object>> undeprecate(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may withdraw a deprecation"));
        }
        boolean removed = service.undeprecate(toolId, owner);
        return ResponseEntity.ok(Map.of("toolId", toolId, "removed", removed));
    }

    /**
     * v581 — the owner's RETENTION door: remove every revision STRICTLY older than {@code before}.
     *
     * <p>200 with {@link PruneRevisionsAnswer}: the bound applied, how many rows went and what the history still
     * holds. A missing owner, a missing bound, a non-positive bound and a bound past the newest revision are
     * 400s that remove nothing — a delete that cannot name its boundary has no business running, and one that
     * would leave a declaration with no record of itself has even less. Pruning the same bound twice answers
     * {@code pruned: 0}: already gone is not a failure.
     */
    @DeleteMapping("/tools/{toolId}/revisions")
    public ResponseEntity<?> pruneRevisions(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestParam(name = "before", required = false) Integer before) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — a prune belongs to the account that holds the tool"));
        }
        if (before == null) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the before parameter is missing — a prune must name the revision it keeps"));
        }
        int pruned = service.pruneRevisions(toolId, owner, before);
        return ResponseEntity.ok(
                new PruneRevisionsAnswer(toolId, before, pruned, service.revisionCount(toolId, null)));
    }

    /**
     * HAND THE DECLARATION OVER, for its current owner only.
     *
     * <p>Before this door a tool could not change hands: the registry's only answer was "declare it again under
     * the new account", which mints a new id, restarts the history at revision 1 and invalidates every pin a
     * consumer holds. The answer here is the SAME declaration with its new owner — same id, same name, same
     * schema, same pin — and the handover itself is recorded in the declaration's chain of holders.
     */
    @PostMapping("/tools/{toolId}/transfer")
    public ResponseEntity<?> transfer(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) TransferRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the current owner may transfer a tool"));
        }
        ToolEntry row = service.transfer(toolId, owner, request == null ? null : request.to());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * One declaration's chain of holders, newest first, with the current holder named beside the window.
     *
     * <p>A public read like the declaration itself; an id that names nothing is a 404 rather than an empty
     * chain, because "no such tool" and "a tool that never changed hands" are different facts.
     */
    @GetMapping("/tools/{toolId}/ownership")
    public ResponseEntity<OwnershipChain> ownership(
            @PathVariable String toolId,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        ToolEntry row = service.get(toolId);
        List<OwnershipTransfer> rows =
                service.ownershipHistory(toolId, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new OwnershipChain(
                toolId, row.getOwner(), rows, service.ownershipCount(toolId), effective, from));
    }

    /**
     * The public list of deprecated declarations, newest first, each carrying its tool's NAME. One request
     * answers "which tools are going away and what replaces them", which is the question a catalog reader has.
     */
    /**
     * v588 — record that a NAMED contract was tested, for the declaration's owner.
     *
     * <p>The pin is required, and it must be the one being served: a claim about an older contract answers 409
     * {@code stale-contract} with the pin that IS being served, so the caller re-reads and says it again. That
     * refusal is the point — it is what keeps every stored claim true about the bytes it names.
     *
     * <p>Re-attesting REPLACES the claim (pin, note, instant): an attestation is a current state, and the
     * revisions door already holds every contract a tool has served.
     */
    @PostMapping("/tools/{toolId}/attestation")
    public ResponseEntity<Attestation> attest(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody AttestRequest request) {
        ToolAttestation claim = service.attest(toolId, owner, request.contractSha256(), request.note());
        return ResponseEntity.ok(toWire(claim, service.get(toolId)));
    }

    /**
     * v588 — one declaration's attestation. Public, like the declaration it is about.
     *
     * <p>{@code stillCurrent} is recomputed on every read by comparing the pinned contract with the one being
     * served now, so an update makes a claim stale WITHOUT erasing it: the claim stays true about the contract it
     * names, and the answer says whether that is the contract a consumer would install today.
     */
    @GetMapping("/tools/{toolId}/attestation")
    public ResponseEntity<Attestation> attestation(@PathVariable String toolId) {
        ToolAttestation claim = service.attestationOf(toolId);
        return ResponseEntity.ok(toWire(claim, service.get(toolId)));
    }

    /** v588 — withdraw the claim, for its owner only. 200 either way: "nothing to withdraw" is not an error. */
    @DeleteMapping("/tools/{toolId}/attestation")
    public ResponseEntity<WithdrawAttestationAnswer> withdrawAttestation(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner) {
        return ResponseEntity.ok(new WithdrawAttestationAnswer(toolId, service.withdrawAttestation(toolId, owner)));
    }
    @GetMapping("/tools/deprecations")
    public ResponseEntity<DeprecationList> deprecations(
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset,
            @RequestParam(name = "before", required = false) String before,
            @RequestParam(name = "owner", required = false) String ownerId,
            @RequestParam(name = "replacementStatus", required = false) String replacementStatus) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        String owner = ToolService.normalizeOwner(ownerId);
        String status = ToolService.normalizeReplacementStatuses(replacementStatus);
        DeprecationCursor cursor = DeprecationCursor.parse(before);
        String key = cursor == null ? null : cursor.text();
        List<ToolDeprecation> rows = service.deprecationPage(owner, status, key, asked, from);
        Map<String, ToolEntry> tools = service.byIds(rows.stream().map(ToolDeprecation::getToolId).toList());
        Map<String, ToolService.ReplacementResolution> replacements = service.resolveReplacements(
                rows.stream().map(ToolDeprecation::getReplacementName).filter(name -> name != null).toList());
        List<DeprecatedTool> wire = rows.stream()
                .map(row -> {
                    ToolEntry tool = tools.get(row.getToolId());
                    ToolService.ReplacementResolution replacement = resolutionOf(row, replacements);
                    return new DeprecatedTool(
                            row.getToolId(),
                            tool == null ? null : tool.getName(),
                            row.getMessage(),
                            row.getReplacementName(),
                            replacement.status(),
                            replacement.toolId(),
                            row.getDeprecatedAt().toEpochMilli());
                })
                .toList();
        return ResponseEntity.ok(
                new DeprecationList(
                        owner, status, wire, service.deprecationCount(owner, status), effective, from, key));
    }

    /**
     * One declaration's recorded history, newest first. A public read, and a 404 when the id names nothing:
     * "no such tool" is not "a tool with no history".
     */
    @GetMapping("/tools/{toolId}/revisions")
    public ResponseEntity<ToolRevisionList> revisions(
            @PathVariable String toolId,
            @RequestParam(name = "since", required = false) Integer since,
            @RequestParam(name = "limit", required = false) Integer limit,
            @RequestParam(name = "offset", required = false) Integer offset) {
        int asked = limit == null ? ToolService.DEFAULT_LIST_LIMIT : limit;
        int effective = Math.min(Math.max(asked, 1), ToolService.MAX_LIST_LIMIT);
        int from = offset == null ? 0 : Math.max(offset, 0);
        List<ToolRevisionView> rows = service.history(toolId, since, asked, from).stream().map(this::toWire).toList();
        return ResponseEntity.ok(new ToolRevisionList(
                toolId, ToolService.requireSince(since), rows, service.revisionCount(toolId, since), effective, from));
    }

    /**
     * v590 — the declaration at ONE pin: the recorded revision whose own bytes hash to the pin the caller holds.
     *
     * <p>The pin is the caller's handle on a contract; the revision number is this service's bookkeeping. A
     * consumer that was told its pin went stale can fetch exactly the bytes it pinned, and {@code current} says
     * in the same answer whether those bytes are still what would be installed today.
     *
     * <p>Existence is settled before the pin is judged for shape, the same order the attestation door follows:
     * an unknown id is a 404 whether or not the pin is well formed, because 400 would blame the caller's
     * parameter for a missing row.
     */
    @GetMapping("/tools/{toolId}/at")
    public ResponseEntity<RevisionAtPin> atPin(
            @PathVariable String toolId,
            @RequestParam(name = "pin", required = false) String pin) {
        ToolRevision revision = service.atPin(toolId, pin);
        return ResponseEntity.ok(toWire(revision, service.get(toolId)));
    }
    /**
     * v614 — what changed between two contracts of one declaration, named by the pins the caller holds.
     *
     * <p>The question is the one a consumer with a stale pin actually asks ("what is different from the bytes
     * I have?"), so an absent {@code to} compares against the contract served now rather than being a required
     * parameter. The answer names the differing SCHEMA paths as RFC 6901 pointers and leaves the values to
     * {@code /tools/{id}/at}, which the two pins it echoes are enough to read.
     *
     * <p>Existence is settled before either pin, the same order the other pin doors follow: an unknown id is
     * 404 {@code unknown-tool} even when both pins are malformed.
     */
    /**
     * v615 — which declarations carry this pin, across the whole registry.
     *
     * <p>A pin hashes the summary and the canonical schema, so it names CONTENT rather than a row: two
     * declarations with the same bytes share a pin, and one declaration can carry the same pin twice. The
     * answer is therefore a LIST ordered by name, with each entry's {@code current} derived from the row it
     * serves today. Empty is 404 {@code unknown-pin}: the pin was never recorded here, or retention removed
     * every revision that carried it.
     *
     * <p>The pin is computed and never stored (ADR 0028), so this door scans the revision table. The cost is
     * stated in its ADR rather than hidden behind a derived column that every write would have to maintain.
     */
    /**
     * v616 — a manifest of pins in ONE read.
     *
     * <p>A lockfile is a list of questions, so one unrecorded pin must not turn the whole answer into a 404:
     * it is NAMED in {@code missing} while every other pin is answered. The scan is one pass for every pin
     * (the single-pin door would scan once per line), which is the reason this door exists at all.
     */
    @GetMapping("/tools/pins")
    public ResponseEntity<PinBatch> pins(
            @RequestParam(name = "pin", required = false) List<String> pins) {
        PinBatchLookup lookup = service.byPins(pins);
        return ResponseEntity.ok(new PinBatch(lookup.requested(), lookup.found(),
                lookup.matches().stream().map(ToolController::match).toList(), lookup.missing()));
    }

    @GetMapping("/tools/by-pin/{pin}")
    public ResponseEntity<PinMatches> byPin(@PathVariable String pin) {
        PinLookup lookup = service.byPin(pin);
        return ResponseEntity.ok(new PinMatches(lookup.pin(), lookup.matches().size(),
                lookup.matches().stream().map(ToolController::match).toList()));
    }

    @GetMapping("/tools/{toolId}/diff")
    public ResponseEntity<ContractDiff> diff(
            @PathVariable String toolId,
            @RequestParam(name = "from", required = false) String from,
            @RequestParam(name = "to", required = false) String to) {
        ContractComparison comparison = service.diff(toolId, from, to);
        return ResponseEntity.ok(new ContractDiff(
                comparison.toolId(),
                side(comparison.from()),
                side(comparison.to()),
                comparison.identical(),
                comparison.summaryChanged(),
                new SchemaDiff(comparison.schema().added(), comparison.schema().removed(),
                        comparison.schema().changed())));
    }
    /**
     * Replace a declaration's summary and schema, for its owner only.
     *
     * <p>The owner is REQUIRED before anything is read, and the name is not part of the body: an update
     * changes what a declaration SAYS, not which declaration it is. A missing owner is a 400 that touches
     * nothing; an unknown id is a 404; another account's row is a 403.
     */
    @PutMapping("/tools/{toolId}")
    public ResponseEntity<?> update(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner,
            @RequestBody(required = false) UpdateRequest request) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may update a tool"));
        }
        ToolEntry row = service.update(
                toolId,
                owner,
                request == null ? null : request.summary(),
                request == null ? null : request.inputSchema());
        return ResponseEntity.ok(toWire(row));
    }

    /**
     * Remove a declaration. The owner is REQUIRED: a registry whose removal door could be opened without an
     * account would let anybody delete anybody's row by naming an id.
     *
     * <p>200 with {@code removed: true} or {@code removed: false} — an id that names nothing is already gone,
     * not an error, the same rule the webhook removal follows. A row that belongs to another account is a 403
     * from the service.
     */
    @DeleteMapping("/tools/{toolId}")
    public ResponseEntity<Map<String, Object>> remove(
            @PathVariable String toolId,
            @RequestParam(name = "owner", required = false) String owner) {
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid-tool",
                    "message", "the owner parameter is missing — only the owner may remove a tool"));
        }
        boolean removed = service.remove(toolId, owner);
        return ResponseEntity.ok(Map.of("ok", true, "toolId", toolId, "removed", removed));
    }

    /**
     * The answer for a whole declaration, and the conditional read the pin makes possible.
     *
     * <p>A strong tag, not a weak one: the value is a digest of the exact contract served, so two answers that
     * carry the same tag are the same declaration to the byte. {@code *} matches any existing representation
     * (RFC 9110); anything else is compared with its {@code W/} prefix and surrounding quotes removed, because
     * a caller echoing a tag back must not have to know how this door formats it. Matching is otherwise a
     * plain string comparison, not a re-parse of every tag syntax — that bound is stated in ADR 0028.
     */
    private ResponseEntity<Tool> answer(ToolEntry row, String ifNoneMatch) {
        String pin = service.contractSha256(row);
        if (matchesPin(ifNoneMatch, pin)) {
            return ResponseEntity.status(304).eTag(pin).build();
        }
        return ResponseEntity.ok().eTag(pin).body(toWire(row, pin));
    }

    /** Whether an {@code If-None-Match} header names the pin this declaration currently serves. */
    static boolean matchesPin(String ifNoneMatch, String pin) {
        if (ifNoneMatch == null || pin == null) {
            return false;
        }
        for (String candidate : ifNoneMatch.split(",")) {
            String tag = candidate.trim();
            if (tag.isEmpty()) {
                continue;
            }
            if ("*".equals(tag)) {
                return true;
            }
            if (tag.startsWith("W/")) {
                tag = tag.substring(2).trim();
            }
            if (tag.length() >= 2 && tag.startsWith("\"") && tag.endsWith("\"")) {
                tag = tag.substring(1, tag.length() - 1);
            }
            if (tag.equals(pin)) {
                return true;
            }
        }
        return false;
    }

    private Attestation toWire(ToolAttestation claim, ToolEntry row) {
        return new Attestation(
                claim.getToolId(),
                claim.getContractSha256(),
                claim.getNote(),
                claim.getAttestedAt().toEpochMilli(),
                claim.getContractSha256().equals(service.contractSha256(row)));
    }
    private Tool toWire(ToolEntry row) {
        return toWire(row, service.contractSha256(row));
    }

    private Tool toWire(ToolEntry row, String pin) {
        return new Tool(
                row.getToolId(),
                row.getOwner(),
                row.getName(),
                row.getSummary(),
                service.schemaOf(row),
                pin,
                row.getCreatedAt().toEpochMilli());
    }

    private ToolRevisionView toWire(ToolRevision revision) {
        return new ToolRevisionView(
                revision.getRevision(),
                revision.getSummary(),
                service.schemaOf(revision),
                service.contractSha256(revision),
                revision.getRecordedAt().toEpochMilli());
    }

    private ToolChangeView toWire(ToolChange row) {
        return new ToolChangeView(
                row.getSeq(),
                row.getToolId(),
                row.getName(),
                row.getKind(),
                row.getRevision(),
                row.getChangedAt().toEpochMilli());
    }

    private OwnershipTransfer toWire(ToolOwnership row) {
        return new OwnershipTransfer(
                row.getTransfer(),
                row.getFromOwner(),
                row.getToOwner(),
                row.getTransferredAt().toEpochMilli());
    }

    private Deprecation toWire(ToolDeprecation row) {
        ToolService.ReplacementResolution replacement = service.resolveReplacement(row.getReplacementName());
        return new Deprecation(
                row.getToolId(),
                row.getMessage(),
                row.getReplacementName(),
                replacement.status(),
                replacement.toolId(),
                row.getDeprecatedAt().toEpochMilli());
    }

    /** A row's replacement verdict, from the page's batch map; an absent hint reads nothing. */
    private static ToolService.ReplacementResolution resolutionOf(
            ToolDeprecation row, Map<String, ToolService.ReplacementResolution> resolved) {
        if (row.getReplacementName() == null) {
            return ToolService.ReplacementResolution.NONE;
        }
        return resolved.getOrDefault(row.getReplacementName(), ToolService.ReplacementResolution.UNRESOLVED);
    }

    /** A rule the caller broke is a 400 that NAMES it. */
    @ExceptionHandler(InvalidTool.class)
    public ResponseEntity<Map<String, String>> invalid(InvalidTool e) {
        return ResponseEntity.badRequest().body(Map.of("error", "invalid-tool", "message", e.getMessage()));
    }

    /** A name already held is a 409: the request was legal, the registry already has the row. */
    @ExceptionHandler(ToolNameTaken.class)
    public ResponseEntity<Map<String, String>> taken(ToolNameTaken e) {
        return ResponseEntity.status(409).body(Map.of("error", "tool-name-taken", "message", e.getMessage()));
    }

    /** Somebody else's row is a 403: the request was well-formed, the account was not the owner. */
    @ExceptionHandler(NotYourTool.class)
    public ResponseEntity<Map<String, String>> notYours(NotYourTool e) {
        return ResponseEntity.status(403).body(Map.of("error", "not-your-tool", "message", e.getMessage()));
    }

    /** A tool that is live has no deprecation: 404 under its own name, distinct from an unknown id. */
    @ExceptionHandler(UnknownDeprecation.class)
    public ResponseEntity<Map<String, String>> notDeprecated(UnknownDeprecation e) {
        return ResponseEntity.status(404).body(Map.of("error", "not-deprecated", "message", e.getMessage()));
    }

    /** A claim about a contract that is no longer served is a 409: the request was legal, the world moved. */
    @ExceptionHandler(StaleContract.class)
    public ResponseEntity<Map<String, String>> stale(StaleContract e) {
        return ResponseEntity.status(409).body(Map.of("error", "stale-contract", "message", e.getMessage()));
    }

    /**
     * A cursor below the retained journal is a 410: the request was legal, retention moved the beginning of
     * the feed past the caller. The body names the oldest entry still here, not just the refusal.
     */
    @ExceptionHandler(JournalPruned.class)
    public ResponseEntity<Map<String, String>> pruned(JournalPruned e) {
        return ResponseEntity.status(410).body(Map.of("error", "journal-pruned", "message", e.getMessage()));
    }

    /** A pin this declaration never recorded is a 404 under its own name, distinct from an unknown id. */
    @ExceptionHandler(UnknownPin.class)
    public ResponseEntity<Map<String, String>> unknownPin(UnknownPin e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-pin", "message", e.getMessage()));
    }

    private static PinMatch match(PinLookup.Match match) {
        return new PinMatch(match.toolId(), match.name(), match.owner(), match.revision(), match.summary(),
                match.contractSha256(), match.recordedAt(), match.current());
    }

    private static ContractSide side(ContractComparison.Side side) {
        return new ContractSide(side.revision(), side.summary(), side.contractSha256(), side.recordedAt());
    }

    private RevisionAtPin toWire(ToolRevision revision, ToolEntry current) {
        String pin = service.contractSha256(revision);
        return new RevisionAtPin(revision.getToolId(), revision.getRevision(), revision.getSummary(),
                service.schemaOf(revision), pin, revision.getRecordedAt().toEpochMilli(),
                pin.equals(service.contractSha256(current)));
    }

    /** A declaration nobody has attested is a 404 under its own name, distinct from an unknown id. */
    @ExceptionHandler(UnknownAttestation.class)
    public ResponseEntity<Map<String, String>> notAttested(UnknownAttestation e) {
        return ResponseEntity.status(404).body(Map.of("error", "not-attested", "message", e.getMessage()));
    }
    /** An id that names nothing is a 404, not an empty row and not a 400. */
    @ExceptionHandler(UnknownTool.class)
    public ResponseEntity<Map<String, String>> unknown(UnknownTool e) {
        return ResponseEntity.status(404).body(Map.of("error", "unknown-tool", "message", e.getMessage()));
    }
}
